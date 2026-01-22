// File: services/carbonEmissionService.js
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const Company = require("../models/company_model");
const { parseCSV, parseExcel, parseJSON } = require("../utils/file_parsers");
const { v4: uuidv4 } = require("uuid");
const mongoose = require("mongoose");

class CarbonEmissionService {
  constructor() {
    this.CarbonEmissionAccounting = CarbonEmissionAccounting;
    this.Company = Company;
  }

  /**
   * Create new carbon emission accounting record
   */
  async createCarbonEmission(data, userId) {
    try {
      // Validate company exists
      const company = await this.Company.findById(data.company);
      if (!company) {
        throw new Error("Company not found");
      }

      // Check if carbon emission accounting already exists for this company
      const existingRecord = await this.CarbonEmissionAccounting.findOne({
        company: data.company,
        is_active: true,
      });

      if (existingRecord) {
        throw new Error(
          "Carbon emission accounting already exists for this company. Use update instead."
        );
      }

      // Create new record - don't call calculateSummary here, let the model handle it
      const carbonRecord = new this.CarbonEmissionAccounting({
        ...data,
        created_by: userId,
        last_updated_by: userId,
        status: "draft",
      });

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "createCarbonEmission");
    }
  }

  /**
   * Get carbon emission accounting by ID
   */
  async getCarbonEmissionById(id, populate = []) {
    try {
      const query = this.CarbonEmissionAccounting.findById(id)
        .where("is_active")
        .equals(true);

      if (populate.length > 0) {
        populate.forEach((field) => query.populate(field));
      }

      const carbonRecord = await query;
      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "getCarbonEmissionById");
    }
  }

  /**
   * Get carbon emission accounting by company ID
   */
  async getCarbonEmissionByCompany(companyId, populate = []) {
    try {
      const query = this.CarbonEmissionAccounting.findOne({
        company: companyId,
        is_active: true,
      });

      if (populate.length > 0) {
        populate.forEach((field) => query.populate(field));
      }

      const carbonRecord = await query;
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "getCarbonEmissionByCompany");
    }
  }

  /**
   * Update carbon emission accounting
   */
  async updateCarbonEmission(id, updateData, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(id)
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      // Update fields
      Object.keys(updateData).forEach((key) => {
        if (key !== "_id" && key !== "company") {
          carbonRecord[key] = updateData[key];
        }
      });

      carbonRecord.last_updated_by = userId;
      carbonRecord.last_updated_at = new Date();

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "updateCarbonEmission");
    }
  }

  /**
   * Add yearly data (sequestration and emissions)
   */
  async addYearlyData(carbonEmissionId, yearlyData, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(
        carbonEmissionId
      )
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      // Check if year already exists
      const existingYearIndex = carbonRecord.yearly_data.findIndex(
        (data) => data.year === yearlyData.year
      );

      if (existingYearIndex >= 0) {
        throw new Error(
          `Year ${yearlyData.year} already exists. Use update instead.`
        );
      }

      // Add imported_at timestamp
      yearlyData.imported_at = new Date();

      // Add yearly data
      carbonRecord.yearly_data.push(yearlyData);

      // Sort yearly data by year
      carbonRecord.yearly_data.sort((a, b) => a.year - b.year);

      carbonRecord.last_updated_by = userId;
      carbonRecord.last_updated_at = new Date();

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "addYearlyData");
    }
  }

  /**
   * Update yearly data
   */
  async updateYearlyData(carbonEmissionId, year, updateData, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(
        carbonEmissionId
      )
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      const yearIndex = carbonRecord.yearly_data.findIndex(
        (data) => data.year === year
      );
      if (yearIndex === -1) {
        throw new Error(`Year ${year} not found`);
      }

      // Update the yearly data
      Object.keys(updateData).forEach((key) => {
        carbonRecord.yearly_data[yearIndex][key] = updateData[key];
      });

      carbonRecord.yearly_data[yearIndex].last_updated_at = new Date();

      carbonRecord.last_updated_by = userId;
      carbonRecord.last_updated_at = new Date();

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "updateYearlyData");
    }
  }

  /**
   * Add or update scope 1 emissions for a specific year
   */
  async addScope1Emissions(carbonEmissionId, year, scope1Data, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(
        carbonEmissionId
      )
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      const yearData = carbonRecord.yearly_data.find(
        (data) => data.year === year
      );
      if (!yearData) {
        throw new Error(`Year ${year} not found. Add yearly data first.`);
      }

      // Replace scope1 data
      yearData.emissions.scope1 = scope1Data;

      carbonRecord.last_updated_by = userId;
      carbonRecord.last_updated_at = new Date();

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "addScope1Emissions");
    }
  }

  /**
   * Add or update scope 2 emissions for a specific year
   */
  async addScope2Emissions(carbonEmissionId, year, scope2Data, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(
        carbonEmissionId
      )
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      const yearData = carbonRecord.yearly_data.find(
        (data) => data.year === year
      );
      if (!yearData) {
        throw new Error(`Year ${year} not found. Add yearly data first.`);
      }

      // Replace scope2 data
      yearData.emissions.scope2 = scope2Data;

      carbonRecord.last_updated_by = userId;
      carbonRecord.last_updated_at = new Date();

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "addScope2Emissions");
    }
  }

  /**
   * Add or update scope 3 emissions for a specific year
   */
  async addScope3Emissions(carbonEmissionId, year, scope3Data, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(
        carbonEmissionId
      )
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      const yearData = carbonRecord.yearly_data.find(
        (data) => data.year === year
      );
      if (!yearData) {
        throw new Error(`Year ${year} not found. Add yearly data first.`);
      }

      // Replace scope3 data
      yearData.emissions.scope3 = scope3Data;

      carbonRecord.last_updated_by = userId;
      carbonRecord.last_updated_at = new Date();

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "addScope3Emissions");
    }
  }

  /**
   * Upload and process carbon emission file (CSV/Excel/JSON)
   */
  async uploadCarbonEmissionFile(
    file,
    fileType,
    companyId,
    year,
    userId,
    importNotes = ""
  ) {
    try {
      let parsedData;
      const batchId = uuidv4();

      // Parse file based on type
      switch (fileType.toLowerCase()) {
        case "csv":
          parsedData = await parseCSV(file.buffer, file.originalname);
          break;
        case "excel":
        case "xlsx":
        case "xls":
          parsedData = await parseExcel(file.buffer, file.originalname);
          break;
        case "json":
          parsedData = await parseJSON(file.buffer, file.originalname);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileType}`);
      }

      // Get or create carbon emission record
      let carbonRecord = await this.getCarbonEmissionByCompany(companyId);

      if (!carbonRecord) {
        // Create new carbon emission record
        carbonRecord = await this.createCarbonEmission(
          {
            company: companyId,
            yearly_data: [],
            emission_references: {},
            summary: {},
            framework: {},
            data_management: {
              import_history: [],
              validation_status: "not_validated",
            },
          },
          userId
        );
      }

      // Add import history
      carbonRecord.data_management.import_history.push({
        file_name: file.originalname,
        file_type: fileType,
        import_date: new Date(),
        records_added: parsedData.records ? parsedData.records.length : 1,
        records_updated: 0,
        imported_by: userId,
        batch_id: batchId,
        notes: importNotes,
      });

      // Process the parsed data based on content
      const processedData = await this.processParsedData(
        parsedData,
        year,
        file.originalname
      );

      if (processedData.type === "yearly") {
        // Add or update yearly data
        await this.addYearlyData(carbonRecord._id, processedData.data, userId);
      } else if (processedData.type === "scope1") {
        // Add scope 1 emissions
        await this.addScope1Emissions(
          carbonRecord._id,
          year,
          processedData.data,
          userId
        );
      } else if (processedData.type === "scope2") {
        // Add scope 2 emissions
        await this.addScope2Emissions(
          carbonRecord._id,
          year,
          processedData.data,
          userId
        );
      } else if (processedData.type === "scope3") {
        // Add scope 3 emissions
        await this.addScope3Emissions(
          carbonRecord._id,
          year,
          processedData.data,
          userId
        );
      } else if (processedData.type === "reference") {
        // Update emission references
        carbonRecord.emission_references = {
          ...carbonRecord.emission_references,
          ...processedData.data,
        };
        await carbonRecord.save();
      }

      return {
        success: true,
        batchId,
        fileName: file.originalname,
        fileType,
        recordsProcessed: processedData.recordsProcessed || 1,
        carbonEmissionId: carbonRecord._id,
        year: year || "N/A",
        message: "File uploaded and processed successfully",
      };
    } catch (error) {
      throw this.handleServiceError(error, "uploadCarbonEmissionFile");
    }
  }

  /**
   * Process parsed data and determine its type
   */
  async processParsedData(parsedData, year, fileName) {
    try {
      // Determine data type based on content
      if (
        fileName.includes("sequestration") ||
        fileName.includes("Sequestration")
      ) {
        return {
          type: "yearly",
          data: this.processSequestrationData(parsedData, year),
          recordsProcessed: parsedData.monthly_data
            ? parsedData.monthly_data.length
            : 1,
        };
      } else if (fileName.includes("scope") || fileName.includes("Scope")) {
        if (fileName.includes("scope1") || fileName.includes("Scope 1")) {
          return {
            type: "scope1",
            data: this.processScope1Data(parsedData),
            recordsProcessed: parsedData.sources
              ? parsedData.sources.length
              : 1,
          };
        } else if (
          fileName.includes("scope2") ||
          fileName.includes("Scope 2")
        ) {
          return {
            type: "scope2",
            data: this.processScope2Data(parsedData),
            recordsProcessed: parsedData.sources
              ? parsedData.sources.length
              : 1,
          };
        } else if (
          fileName.includes("scope3") ||
          fileName.includes("Scope 3")
        ) {
          return {
            type: "scope3",
            data: this.processScope3Data(parsedData),
            recordsProcessed: parsedData.categories
              ? parsedData.categories.length
              : 1,
          };
        }
      } else if (
        fileName.includes("reference") ||
        fileName.includes("Reference")
      ) {
        return {
          type: "reference",
          data: this.processReferenceData(parsedData),
          recordsProcessed: parsedData.emission_factors
            ? parsedData.emission_factors.length
            : 1,
        };
      }

      // Default: assume yearly data
      return {
        type: "yearly",
        data: this.processSequestrationData(parsedData, year),
        recordsProcessed: 1,
      };
    } catch (error) {
      throw new Error(`Failed to process parsed data: ${error.message}`);
    }
  }

  /**
   * Process sequestration data from parsed file
   */
  processSequestrationData(data, year) {
    const yearlyData = {
      year: year || new Date().getFullYear(),
      sequestration: {
        monthly_data: data.monthly_data || [],
        methodologies: data.methodologies || [],
        annual_summary: data.annual_summary || {},
      },
      emissions: {
        scope1: { sources: [], total_tco2e_per_ha: 0, total_tco2e: 0 },
        scope2: { sources: [], total_tco2e_per_ha: 0, total_tco2e: 0 },
        scope3: { categories: [], total_tco2e_per_ha: 0, total_tco2e: 0 },
        total_scope_emission_tco2e_per_ha: 0,
        total_scope_emission_tco2e: 0,
        net_total_emission_tco2e: 0,
      },
      source_file: data.source_file || "uploaded_file",
    };

    return yearlyData;
  }

  /**
   * Process scope 1 data from parsed file
   */
  processScope1Data(data) {
    return {
      sources: data.sources || [],
      total_tco2e_per_ha: data.total_tco2e_per_ha || 0,
      total_tco2e: data.total_tco2e || 0,
    };
  }

  /**
   * Process scope 2 data from parsed file
   */
  processScope2Data(data) {
    return {
      sources: data.sources || [],
      total_tco2e_per_ha: data.total_tco2e_per_ha || 0,
      total_tco2e: data.total_tco2e || 0,
    };
  }

  /**
   * Process scope 3 data from parsed file
   */
  processScope3Data(data) {
    return {
      categories: data.categories || [],
      total_tco2e_per_ha: data.total_tco2e_per_ha || 0,
      total_tco2e: data.total_tco2e || 0,
    };
  }

  /**
   * Process reference data from parsed file
   */
  processReferenceData(data) {
    return {
      methodology_statement: data.methodology_statement || "",
      emission_factors: data.emission_factors || [],
      global_warming_potentials: data.global_warming_potentials || {},
      conversion_factors: data.conversion_factors || {},
    };
  }

  /**
   * Delete carbon emission accounting (soft delete)
   */
  async deleteCarbonEmission(id, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(id)
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      carbonRecord.is_active = false;
      carbonRecord.deleted_at = new Date();
      carbonRecord.deleted_by = userId;
      carbonRecord.status = "archived";

      await carbonRecord.save();
      return {
        message: "Carbon emission accounting record deleted successfully",
      };
    } catch (error) {
      throw this.handleServiceError(error, "deleteCarbonEmission");
    }
  }

  /**
   * Verify carbon emission data
   */
  async verifyCarbonEmission(id, verificationData, userId) {
    try {
      const carbonRecord = await this.CarbonEmissionAccounting.findById(id)
        .where("is_active")
        .equals(true);

      if (!carbonRecord) {
        throw new Error("Carbon emission accounting record not found");
      }

      // Update verification status
      carbonRecord.status = verificationData.status || "under_review";

      // Update data management
      carbonRecord.data_management.validation_status =
        verificationData.validation_status || "validating";

      if (verificationData.verified_by) {
        carbonRecord.data_management.verified_by = userId;
        carbonRecord.data_management.verified_at = new Date();
      }

      await carbonRecord.save();
      return carbonRecord;
    } catch (error) {
      throw this.handleServiceError(error, "verifyCarbonEmission");
    }
  }

  /**
   * Get carbon emission statistics
   */
  async getCarbonEmissionStats(companyId = null) {
    try {
      const matchStage = { is_active: true };
      if (companyId) {
        matchStage.company = new mongoose.Types.ObjectId(companyId);
      }

      const stats = await this.CarbonEmissionAccounting.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalCompanies: { $addToSet: "$company" },
            statusCounts: {
              $push: "$status",
            },
            averageYearsCovered: {
              $avg: {
                $size: "$yearly_data",
              },
            },
          },
        },
        {
          $project: {
            totalRecords: 1,
            totalCompanies: { $size: "$totalCompanies" },
            statusCounts: {
              $arrayToObject: {
                $map: {
                  input: { $setUnion: "$statusCounts" },
                  as: "status",
                  in: {
                    k: "$$status",
                    v: {
                      $size: {
                        $filter: {
                          input: "$statusCounts",
                          as: "s",
                          cond: { $eq: ["$$s", "$$status"] },
                        },
                      },
                    },
                  },
                },
              },
            },
            averageYearsCovered: { $round: ["$averageYearsCovered", 2] },
          },
        },
      ]);

      return (
        stats[0] || {
          totalRecords: 0,
          totalCompanies: 0,
          statusCounts: {},
          averageYearsCovered: 0,
        }
      );
    } catch (error) {
      throw this.handleServiceError(error, "getCarbonEmissionStats");
    }
  }

  /**
   * Handle service errors consistently
   */
  handleServiceError(error, methodName) {
    console.error(`CarbonEmissionService.${methodName} error:`, error);

    // Handle specific error types
    if (error.name === "ValidationError") {
      return new Error(
        `Validation failed: ${Object.values(error.errors)
          .map((e) => e.message)
          .join(", ")}`
      );
    }

    if (error.name === "CastError") {
      return new Error(`Invalid ID format: ${error.value}`);
    }

    if (error.code === 11000) {
      return new Error("Duplicate entry found");
    }

    // Return the original error if it's already a proper Error object
    if (error instanceof Error) {
      return error;
    }

    return new Error(
      `Carbon emission service error: ${error.message || error}`
    );
  }
}

module.exports = new CarbonEmissionService();