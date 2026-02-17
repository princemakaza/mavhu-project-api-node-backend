const WasteManagementData = require("../models/waste_management_model");
const FileParser = require("../utils/file_parsers"); // Adjust path as needed
const mongoose = require("mongoose");

class WasteManagementService {
  /**
   * Recursively inject `userId` as `created_by` / `added_by` into all nested subdocuments.
   */
  _injectUserIds(obj, userId) {
    if (!obj || typeof obj !== "object") return;

    if (Array.isArray(obj)) {
      obj.forEach((item) => this._injectUserIds(item, userId));
      return;
    }

    // Metric object
    if (obj.category && obj.metric_name) {
      if (!obj.created_by) obj.created_by = userId;
    }

    // Yearly_data item
    if (obj.year && obj.hasOwnProperty("value")) {
      if (!obj.added_by) obj.added_by = userId;
    }

    // Single_value object
    if (obj.value && !obj.added_by) {
      obj.added_by = userId;
    }

    // Recurse into children
    if (obj.metrics) this._injectUserIds(obj.metrics, userId);
    if (obj.yearly_data) this._injectUserIds(obj.yearly_data, userId);
    if (obj.single_value) this._injectUserIds(obj.single_value, userId);
    if (obj.list_data) this._injectUserIds(obj.list_data, userId);
  }

  _getImportSourceFromFileName(fileName) {
    const ext = fileName.split(".").pop().toLowerCase();
    switch (ext) {
      case "csv":
        return "csv";
      case "xlsx":
      case "xls":
        return "excel";
      case "json":
        return "manual";
      default:
        return "manual";
    }
  }

  // ==================== CORE METHODS ====================

  async createRecord(data, userId) {
    try {
      const record = new WasteManagementData({
        ...data,
        created_by: userId,
        last_updated_by: userId,
        version: 1,
      });
      await record.save();
      return record;
    } catch (error) {
      throw new Error(`Failed to create record: ${error.message}`);
    }
  }

  /**
   * Import data from file (CSV, Excel, JSON)
   */
  async importFromFile(fileBuffer, fileName, companyId, userId, metadata = {}) {
    try {
      const fileExtension = fileName.split(".").pop().toLowerCase();
      let parsedData;

      switch (fileExtension) {
        case "csv":
          parsedData = await FileParser.parseCSV(fileBuffer, fileName);
          break;
        case "xlsx":
        case "xls":
          parsedData = await FileParser.parseExcel(fileBuffer, fileName);
          break;
        case "json":
          parsedData = await FileParser.parseJSON(fileBuffer, fileName);
          break;
        default:
          throw new Error(`Unsupported file type: ${fileExtension}`);
      }

      const transformedData = this.transformParsedDataToSchema(
        parsedData,
        companyId,
        userId,
        { ...metadata, fileName },
      );

      const existingRecord = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      const importBatchId = `${fileExtension}_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      if (existingRecord) {
        record = new WasteManagementData({
          ...transformedData,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
          import_batch_id: importBatchId,
          created_by: userId,
          last_updated_by: userId,
        });
        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new WasteManagementData({
          ...transformedData,
          import_batch_id: importBatchId,
          created_by: userId,
          last_updated_by: userId,
        });
      }

      await record.save();
      return record;
    } catch (error) {
      throw new Error(`File import failed: ${error.message}`);
    }
  }

  /**
   * Import data from JSON payload (manual / API)
   */
  async importFromJSON(jsonData, companyId, userId, metadata = {}) {
    try {
      if (!jsonData.metrics || !Array.isArray(jsonData.metrics)) {
        throw new Error("Invalid JSON structure: missing metrics array");
      }

      const dataToImport = JSON.parse(JSON.stringify(jsonData));
      this._injectUserIds(dataToImport, userId);

      dataToImport.company = companyId;
      dataToImport.import_source = "manual";
      dataToImport.import_date = new Date();
      dataToImport.created_by = userId;
      dataToImport.last_updated_by = userId;
      dataToImport.source_file_name = metadata.fileName || "manual_import.json";
      dataToImport.import_batch_id = `manual_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      const existingRecord = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      if (existingRecord) {
        record = new WasteManagementData({
          ...dataToImport,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
        });
        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new WasteManagementData(dataToImport);
      }

      await record.save();
      return record;
    } catch (error) {
      throw new Error(`JSON import failed: ${error.message}`);
    }
  }

  // ==================== TRANSFORM & PROCESS ====================

  transformParsedDataToSchema(parsedData, companyId, userId, metadata) {
    const fileName = metadata.fileName || "";
    if (
      fileName.toLowerCase().includes("waste") ||
      fileName.toLowerCase().includes("management") ||
      fileName.toLowerCase().includes("effluent")
    ) {
      return this.processWasteCSVData(parsedData, companyId, userId, metadata);
    } else {
      return this.processGenericData(parsedData, companyId, userId, metadata);
    }
  }

  /**
   * Process the specific waste management CSV format (your provided file)
   */
  processWasteCSVData(parsedData, companyId, userId, metadata) {
    const metrics = [];
    const importSource = this._getImportSourceFromFileName(
      metadata.fileName || "",
    );

    if (parsedData.raw_data && Array.isArray(parsedData.raw_data)) {
      const rows = parsedData.raw_data;

      // Helper to parse number with commas
      const parseNumber = (str) => {
        if (str === undefined || str === null) return null;
        if (typeof str === "number") return str;
        return parseFloat(String(str).replace(/,/g, ""));
      };

      // State to track which section we are in
      let section = null; // null, "waste", "effluent", "packaging", "measures"

      for (const row of rows) {
        const firstCol = Object.values(row)[0];
        if (!firstCol) continue;

        const firstColStr = String(firstCol).trim();

        // Detect section headers
        if (firstColStr === "Effluent Management") {
          section = "effluent";
          continue;
        }
        if (firstColStr === "Packaging Material (tons)") {
          section = "packaging";
          continue;
        }
        if (firstColStr === "Waste Management Measures:") {
          section = "measures";
          continue;
        }

        // Skip empty rows or rows with only commas (they appear as empty strings)
        if (firstColStr === "" && Object.values(row).every((v) => !v)) continue;

        // Process based on section
        if (!section) {
          // First section: waste generation (until we hit empty row)
          // Check if this is a data row (Year column present)
          const year = row["Year"] || row[Object.keys(row)[0]];
          if (!year || year === "Year") continue; // skip header row

          const yearStr = year.toString().trim();
          // Columns: Recyclable Waste (tons), Boiler Ash (tons), General Waste (tons)
          const wasteTypes = [
            {
              key: "Recyclable Waste (tons)",
              category: "waste_generation",
              sub: "recyclable",
              metric: "Recyclable Waste",
              unit: "tons",
            },
            {
              key: "Boiler Ash (tons)",
              category: "waste_generation",
              sub: "boiler_ash",
              metric: "Boiler Ash",
              unit: "tons",
            },
            {
              key: "General Waste (tons)",
              category: "waste_generation",
              sub: "general",
              metric: "General Waste",
              unit: "tons",
            },
          ];

          for (const wt of wasteTypes) {
            const rawValue = row[wt.key];
            if (rawValue !== undefined && rawValue !== "") {
              const numericValue = parseNumber(rawValue);
              let metric = metrics.find(
                (m) => m.category === wt.category && m.subcategory === wt.sub,
              );
              if (!metric) {
                metric = {
                  category: wt.category,
                  subcategory: wt.sub,
                  metric_name: wt.metric,
                  data_type: "yearly_series",
                  yearly_data: [],
                  created_by: userId,
                };
                metrics.push(metric);
              }
              metric.yearly_data.push({
                year: yearStr,
                value: String(rawValue),
                numeric_value: numericValue,
                unit: wt.unit,
                source:
                  metadata.originalSource || metadata.fileName || "CSV Import",
                added_by: userId,
              });
            }
          }
        } else if (section === "effluent") {
          // Effluent Management section
          const year = row["Year"] || row[Object.keys(row)[0]];
          if (!year || year === "Year") continue;

          const yearStr = year.toString().trim();
          const effluentKey = "Effluent Discharged (thousand ML)";
          const waterKey = "Water Treatment (million ML)";

          const effluentVal = row[effluentKey];
          if (effluentVal !== undefined && effluentVal !== "") {
            const numericValue = parseNumber(effluentVal);
            let metric = metrics.find(
              (m) =>
                m.category === "effluent_management" &&
                m.subcategory === "effluent_discharged",
            );
            if (!metric) {
              metric = {
                category: "effluent_management",
                subcategory: "effluent_discharged",
                metric_name: "Effluent Discharged",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(effluentVal),
              numeric_value: numericValue,
              unit: "thousand ML",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }

          const waterVal = row[waterKey];
          if (waterVal !== undefined && waterVal !== "") {
            const numericValue = parseNumber(waterVal);
            let metric = metrics.find(
              (m) =>
                m.category === "effluent_management" &&
                m.subcategory === "water_treatment",
            );
            if (!metric) {
              metric = {
                category: "effluent_management",
                subcategory: "water_treatment",
                metric_name: "Water Treatment",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(waterVal),
              numeric_value: numericValue,
              unit: "million ML",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }
        } else if (section === "packaging") {
          // Packaging Material section
          const year = row["Year"] || row[Object.keys(row)[0]];
          if (!year || year === "Year") continue;

          const yearStr = year.toString().trim();
          const linersKey = "Liners (50kg bags)";
          const tonneBagsKey = "1-Tonne Bags";
          const packagingKey = "Packaging Material";

          const linersVal = row[linersKey];
          if (linersVal !== undefined && linersVal !== "") {
            const numericValue = parseNumber(linersVal);
            let metric = metrics.find(
              (m) =>
                m.category === "packaging_consumption" &&
                m.subcategory === "liners",
            );
            if (!metric) {
              metric = {
                category: "packaging_consumption",
                subcategory: "liners",
                metric_name: "Liners (50kg bags)",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(linersVal),
              numeric_value: numericValue,
              unit: "bags",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }

          const tonneVal = row[tonneBagsKey];
          if (tonneVal !== undefined && tonneVal !== "") {
            const numericValue = parseNumber(tonneVal);
            let metric = metrics.find(
              (m) =>
                m.category === "packaging_consumption" &&
                m.subcategory === "tonne_bags",
            );
            if (!metric) {
              metric = {
                category: "packaging_consumption",
                subcategory: "tonne_bags",
                metric_name: "1-Tonne Bags",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(tonneVal),
              numeric_value: numericValue,
              unit: "bags",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }

          const packagingVal = row[packagingKey];
          if (packagingVal !== undefined && packagingVal !== "") {
            const numericValue = parseNumber(packagingVal);
            let metric = metrics.find(
              (m) =>
                m.category === "packaging_consumption" &&
                m.subcategory === "packaging_material",
            );
            if (!metric) {
              metric = {
                category: "packaging_consumption",
                subcategory: "packaging_material",
                metric_name: "Packaging Material",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(packagingVal),
              numeric_value: numericValue,
              unit: "tons",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }
        } else if (section === "measures") {
          // Waste Management Measures: bullet points
          // Each row might contain a bullet point in the first column
          if (firstColStr.startsWith("•") || firstColStr.startsWith("-")) {
            // Create a list metric for measures
            let measuresMetric = metrics.find(
              (m) =>
                m.category === "waste_management_initiatives" &&
                m.metric_name === "Waste Management Measures",
            );
            if (!measuresMetric) {
              measuresMetric = {
                category: "waste_management_initiatives",
                metric_name: "Waste Management Measures",
                data_type: "list",
                list_data: [],
                created_by: userId,
              };
              metrics.push(measuresMetric);
            }
            measuresMetric.list_data.push({
              item: firstColStr,
              details: "",
              source: metadata.originalSource || metadata.fileName,
              added_at: new Date(),
            });
          }
        }
      }
    }

    // Extract data period from years
    const yearsSet = new Set();
    metrics.forEach((metric) => {
      if (metric.yearly_data) {
        metric.yearly_data.forEach((d) => {
          const match = String(d.year).match(/\b(20\d{2})\b/);
          if (match) yearsSet.add(parseInt(match[1]));
        });
      }
    });
    const yearsArray = Array.from(yearsSet).sort();
    const dataPeriodStart = yearsArray.length ? yearsArray[0].toString() : null;
    const dataPeriodEnd = yearsArray.length
      ? yearsArray[yearsArray.length - 1].toString()
      : null;

    return {
      company: companyId,
      metrics,
      import_source: importSource,
      source_file_name: metadata.fileName,
      data_period_start: dataPeriodStart,
      data_period_end: dataPeriodEnd,
      original_source: metadata.originalSource || metadata.fileName,
      verification_status: "unverified",
      validation_status: "not_validated",
      created_by: userId,
      last_updated_by: userId,
    };
  }

  processGenericData(parsedData, companyId, userId, metadata) {
    return {
      company: companyId,
      metrics: [],
      import_source: this._getImportSourceFromFileName(metadata.fileName || ""),
      source_file_name: metadata.fileName,
      data_period_start: metadata.dataPeriodStart,
      data_period_end: metadata.dataPeriodEnd,
      original_source: metadata.originalSource || metadata.fileName,
      verification_status: "unverified",
      validation_status: "not_validated",
      created_by: userId,
      last_updated_by: userId,
    };
  }

  // ==================== COMPANY RECORDS ====================

  async getCompanyRecords(companyId, includeInactive = false) {
    try {
      const query = { company: companyId };
      if (!includeInactive) query.is_active = true;
      return await WasteManagementData.find(query)
        .populate("created_by", "name email")
        .populate("last_updated_by", "name email")
        .sort({ version: -1 });
    } catch (error) {
      throw new Error(`Failed to get company records: ${error.message}`);
    }
  }

  async getRecordById(recordId, companyId) {
    try {
      const query = { _id: recordId, company: companyId };
      return await WasteManagementData.findOne(query)
        .populate("created_by", "name email")
        .populate("last_updated_by", "name email");
    } catch (error) {
      throw new Error(`Failed to get record by ID: ${error.message}`);
    }
  }

  async getMetricsByCategory(companyId, category) {
    try {
      const record = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });
      if (!record) return [];
      return record.metrics.filter(
        (m) => m.category === category && m.is_active !== false,
      );
    } catch (error) {
      throw new Error(`Failed to get metrics by category: ${error.message}`);
    }
  }

  async getTimeSeriesData(companyId, metricName, category = null) {
    try {
      const record = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });
      if (!record) return [];

      const metric = record.metrics.find(
        (m) =>
          m.metric_name === metricName &&
          (category ? m.category === category : true) &&
          m.is_active !== false,
      );
      return metric && metric.yearly_data ? metric.yearly_data : [];
    } catch (error) {
      throw new Error(`Failed to get time series data: ${error.message}`);
    }
  }

  // ==================== UPSERT WITH NESTED USER ID ====================

  async upsertMetric(companyId, metricData, userId) {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        let record = await WasteManagementData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (!record) {
          record = new WasteManagementData({
            company: companyId,
            metrics: [],
            created_by: userId,
            last_updated_by: userId,
          });
        }

        const existingIndex = record.metrics.findIndex(
          (m) =>
            m.metric_name === metricData.metric_name &&
            m.category === metricData.category,
        );

        const now = new Date();
        this._injectUserIds(metricData, userId);

        if (existingIndex >= 0) {
          const existingMetric = record.metrics[existingIndex];
          record.metrics[existingIndex] = {
            ...existingMetric.toObject(),
            ...metricData,
            created_by: existingMetric.created_by,
            last_updated_by: userId,
            updated_at: now,
          };
        } else {
          record.metrics.push({
            ...metricData,
            created_by: userId,
            created_at: now,
            is_active: true,
          });
        }

        record.last_updated_by = userId;
        record.last_updated_at = now;
        await record.save({ session });
        await session.commitTransaction();
        return record;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      throw new Error(`Failed to upsert metric: ${error.message}`);
    }
  }

  async deleteMetric(companyId, metricId, userId) {
    try {
      const record = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
        "metrics._id": metricId,
      });

      if (!record) throw new Error("Metric not found");

      const metricIndex = record.metrics.findIndex(
        (m) => m._id.toString() === metricId,
      );
      if (metricIndex === -1) throw new Error("Metric not found");

      record.metrics[metricIndex].is_active = false;
      record.last_updated_by = userId;
      record.last_updated_at = new Date();

      await record.save();
      return record;
    } catch (error) {
      throw new Error(`Failed to delete metric: ${error.message}`);
    }
  }

  // ==================== SUMMARY & VALIDATION ====================

  async getSummaryStats(companyId) {
    try {
      const record = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) return null;

      return {
        summary_stats: record.summary_stats,
        data_period_start: record.data_period_start,
        data_period_end: record.data_period_end,
        last_updated: record.last_updated_at,
      };
    } catch (error) {
      throw new Error(`Failed to get summary stats: ${error.message}`);
    }
  }

  async validateData(companyId) {
    try {
      const record = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) throw new Error("No active record found for validation");

      const validationErrors = [];
      let dataQualityScore = 100;
      let hasCriticalErrors = false;

      record.metrics.forEach((metric) => {
        if (metric.is_active === false) return;

        if (!metric.metric_name) {
          validationErrors.push({
            metric_name: "Unknown",
            error_message: "Missing metric name",
            field: "metric_name",
            severity: "error",
          });
          dataQualityScore -= 5;
        }

        switch (metric.data_type) {
          case "yearly_series":
            if (!metric.yearly_data || metric.yearly_data.length === 0) {
              validationErrors.push({
                metric_name: metric.metric_name,
                error_message: "Yearly series data is empty",
                field: "yearly_data",
                severity: "warning",
              });
              dataQualityScore -= 3;
            }
            break;
          case "single_value":
            if (!metric.single_value || !metric.single_value.value) {
              validationErrors.push({
                metric_name: metric.metric_name,
                error_message: "Single value is missing",
                field: "single_value",
                severity: "error",
              });
              dataQualityScore -= 5;
              hasCriticalErrors = true;
            }
            break;
        }
      });

      record.validation_status = hasCriticalErrors
        ? "failed_validation"
        : "validated";
      record.validation_errors = validationErrors;
      record.data_quality_score = Math.max(0, dataQualityScore);
      record.validation_notes = `Auto-validated on ${new Date().toISOString()}`;

      await record.save();

      return {
        validation_status: record.validation_status,
        data_quality_score: record.data_quality_score,
        error_count: validationErrors.length,
        errors: validationErrors,
        has_critical_errors: hasCriticalErrors,
      };
    } catch (error) {
      throw new Error(`Validation failed: ${error.message}`);
    }
  }

  async updateVerificationStatus(companyId, status, userId, notes = "") {
    try {
      const record = await WasteManagementData.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) throw new Error("Record not found");

      record.verification_status = status;
      record.verified_by = userId;
      record.verified_at = new Date();
      record.verification_notes = notes;
      record.last_updated_by = userId;
      record.last_updated_at = new Date();

      await record.save();
      return record;
    } catch (error) {
      throw new Error(`Failed to update verification status: ${error.message}`);
    }
  }

  // ==================== VERSIONING ====================

  async getDataVersions(companyId) {
    try {
      return await WasteManagementData.find({ company: companyId })
        .select(
          "version created_at created_by verification_status data_period_start data_period_end summary_stats",
        )
        .populate("created_by", "name email")
        .sort({ version: -1 });
    } catch (error) {
      throw new Error(`Failed to fetch versions: ${error.message}`);
    }
  }

  async restoreVersion(companyId, versionId, userId) {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        const versionToRestore =
          await WasteManagementData.findById(versionId).session(session);
        if (
          !versionToRestore ||
          versionToRestore.company.toString() !== companyId
        ) {
          throw new Error("Version not found or belongs to different company");
        }

        const currentActive = await WasteManagementData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (currentActive) {
          currentActive.is_active = false;
          await currentActive.save({ session });
        }

        const restoredRecord = new WasteManagementData({
          ...versionToRestore.toObject(),
          _id: new mongoose.Types.ObjectId(),
          previous_version: currentActive ? currentActive._id : null,
          version: currentActive ? currentActive.version + 1 : 1,
          created_by: userId,
          created_at: new Date(),
          last_updated_by: userId,
          last_updated_at: new Date(),
          restored_from: versionId,
          restore_notes: `Restored from version ${versionToRestore.version} on ${new Date().toISOString()}`,
        });

        await restoredRecord.save({ session });
        await session.commitTransaction();
        return restoredRecord;
      } catch (error) {
        await session.abortTransaction();
        throw error;
      } finally {
        session.endSession();
      }
    } catch (error) {
      throw new Error(`Failed to restore version: ${error.message}`);
    }
  }
}

module.exports = new WasteManagementService();
