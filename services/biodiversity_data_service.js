// File: services/biodiversity_landuse_service.js
const BiodiversityLandUse = require("../models/biodiversity_and_landuse_model");
const FileParser = require("../utils/file_parsers"); // Updated to use FileParser
const mongoose = require("mongoose");

class BiodiversityLandUseService {
  /**
   * Recursively inject `userId` as `created_by` / `added_by` into all
   * nested subdocuments that require it.
   */
  _injectUserIds(obj, userId) {
    if (!obj || typeof obj !== "object") return;

    // Handle arrays (metrics, yearly_data, etc.)
    if (Array.isArray(obj)) {
      obj.forEach((item) => this._injectUserIds(item, userId));
      return;
    }

    // Handle metric object
    if (obj.category && obj.metric_name) {
      if (!obj.created_by) obj.created_by = userId;
    }

    // Handle yearly_data item
    if (obj.year && obj.hasOwnProperty("value")) {
      if (!obj.added_by) obj.added_by = userId;
    }

    // Handle single_value object
    if (obj.value && !obj.added_by) {
      obj.added_by = userId;
    }

    // Recursively process children
    if (obj.metrics) this._injectUserIds(obj.metrics, userId);
    if (obj.yearly_data) this._injectUserIds(obj.yearly_data, userId);
    if (obj.single_value) this._injectUserIds(obj.single_value, userId);
    if (obj.list_data) this._injectUserIds(obj.list_data, userId);
  }

  /**
   * Convert file extension to valid import_source enum.
   */
  _getImportSourceFromFileName(fileName) {
    const ext = fileName.split(".").pop().toLowerCase();
    switch (ext) {
      case "csv":
        return "csv";
      case "xlsx":
      case "xls":
        return "excel";
      case "json":
        return "manual"; // JSON files are treated as manual import
      default:
        return "manual"; // safe fallback
    }
  }

  // ==================== CORE METHODS ====================
  async createRecord(data, userId) {
    try {
      const record = new BiodiversityLandUse({
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

      const existingRecord = await BiodiversityLandUse.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      const importBatchId = `${fileExtension}_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      if (existingRecord) {
        record = new BiodiversityLandUse({
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
        record = new BiodiversityLandUse({
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
      // Validate structure
      if (!jsonData.metrics || !Array.isArray(jsonData.metrics)) {
        throw new Error("Invalid JSON structure: missing metrics array");
      }

      // Deep clone the incoming data to avoid mutation
      const dataToImport = JSON.parse(JSON.stringify(jsonData));

      // 1. Inject userId into all nested subdocuments
      this._injectUserIds(dataToImport, userId);

      // 2. Set company and import metadata
      dataToImport.company = companyId;
      dataToImport.import_source = "manual"; // ✅ valid enum
      dataToImport.import_date = new Date();
      dataToImport.created_by = userId;
      dataToImport.last_updated_by = userId;
      dataToImport.source_file_name = metadata.fileName || "manual_import.json";
      dataToImport.import_batch_id = `manual_import_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const existingRecord = await BiodiversityLandUse.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      if (existingRecord) {
        record = new BiodiversityLandUse({
          ...dataToImport,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
        });
        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new BiodiversityLandUse(dataToImport);
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
    if (fileName.includes("biodiversity") || fileName.includes("land_use")) {
      return this.processBiodiversityCSVData(
        parsedData,
        companyId,
        userId,
        metadata,
      );
    } else if (fileName.includes("sequestration")) {
      return this.processSequestrationData(
        parsedData,
        companyId,
        userId,
        metadata,
      );
    } else {
      return this.processGenericData(parsedData, companyId, userId, metadata);
    }
  }

  /**
   * Process biodiversity/land use CSV – already mostly correct, but we fix:
   * - Ensure import_source uses valid enum
   * - Add created_by for summary metrics
   */
  processBiodiversityCSVData(parsedData, companyId, userId, metadata) {
    const metrics = [];

    // Determine valid import_source
    const importSource = this._getImportSourceFromFileName(
      metadata.fileName || "",
    );

    if (parsedData.raw_data && Array.isArray(parsedData.raw_data)) {
      const data = parsedData.raw_data;
      let currentSection = "";

      for (const row of data) {
        const firstColumn = Object.keys(row)[0];
        const value = row[firstColumn];

        // Section headers
        if (value && typeof value === "string") {
          if (value.includes("LAND USE – AGRICULTURAL LAND")) {
            currentSection = "agricultural_land";
            continue;
          } else if (
            value.includes("LAND USE – CONSERVATION / PROTECTED HABITAT")
          ) {
            currentSection = "conservation_protected_habitat";
            continue;
          } else if (value.includes("LAND TENURE / SURVEYED AREA")) {
            currentSection = "land_tenure";
            continue;
          } else if (
            value.includes("RESTORATION / DEFORESTATION AVOIDANCE MEASURES")
          ) {
            currentSection = "restoration_deforestation";
            continue;
          } else if (value.includes("FUELWOOD SUBSTITUTION")) {
            currentSection = "fuelwood_substitution";
            continue;
          } else if (value.includes("BIODIVERSITY INVENTORY / SPECIES DATA")) {
            currentSection = "biodiversity_inventory";
            continue;
          } else if (value.includes("HUMAN–WILDLIFE CONFLICT CONTROLS")) {
            currentSection = "human_wildlife_conflict";
            continue;
          } else if (value.includes("DATA SUMMARY")) {
            currentSection = "summary";
            continue;
          }
        }

        switch (currentSection) {
          case "agricultural_land":
            if (row.Year && row["Cane (ha)"]) {
              let metric = metrics.find(
                (m) =>
                  m.metric_name === "Area Under Cane" &&
                  m.category === "agricultural_land",
              );
              const yearlyData = {
                year: row.Year,
                value: row["Cane (ha)"],
                numeric_value: this.parseNumberWithCommas(row["Cane (ha)"]),
                unit: "ha",
                source: row.Source || metadata.source || "CSV Import",
                added_by: userId, // ✅ required
              };
              if (metric) metric.yearly_data.push(yearlyData);
              else {
                metrics.push({
                  category: "agricultural_land",
                  metric_name: "Area Under Cane",
                  subcategory: "cane",
                  data_type: "yearly_series",
                  yearly_data: [yearlyData],
                  created_by: userId, // ✅ required
                });
              }
              // Fruit orchards (similar fix – already has added_by)
              if (row["Fruit Orchards (ha)"]) {
                // ... (keep existing logic, it already sets added_by/created_by)
              }
            }
            break;

          // ... other sections remain the same, they already set added_by/created_by
          // but we must add created_by for summary metrics (see below)

          case "summary":
            if (row["Key Metric"] && row["Latest Value"]) {
              metrics.push({
                category: "summary",
                metric_name: row["Key Metric"],
                data_type: "summary",
                summary_value: {
                  key_metric: row["Key Metric"],
                  latest_value: row["Latest Value"],
                  trend: row["Trend/Notes"] || "",
                  notes: "",
                  as_of_date: new Date(),
                },
                created_by: userId, // ✅ was missing
              });
            }
            break;
        }
      }
    }

    // Calculate data period from years
    const years = [];
    metrics.forEach((metric) => {
      if (metric.yearly_data) {
        metric.yearly_data.forEach((d) => {
          const match = String(d.year).match(/(\d{4})/);
          if (match) years.push(parseInt(match[1]));
        });
      }
    });

    const dataPeriodStart = years.length
      ? `FY${Math.min(...years)
          .toString()
          .slice(-2)}`
      : null;
    const dataPeriodEnd = years.length
      ? `FY${Math.max(...years)
          .toString()
          .slice(-2)}`
      : null;

    return {
      company: companyId,
      metrics,
      import_source: importSource, // ✅ always valid
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

  // ... (processSequestrationData, processGenericData, parseNumberWithCommas remain as-is)
  // ... (getCompanyRecords, getRecordById, etc. remain unchanged)

  // ==================== UPSERT WITH NESTED USER ID ====================
  async upsertMetric(companyId, metricData, userId) {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();
      try {
        let record = await BiodiversityLandUse.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (!record) {
          record = new BiodiversityLandUse({
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
        // Inject userId into nested yearly_data / single_value of the incoming metricData
        this._injectUserIds(metricData, userId);

        if (existingIndex >= 0) {
          // Update existing metric – preserve original created_by, update rest
          const existingMetric = record.metrics[existingIndex];
          record.metrics[existingIndex] = {
            ...existingMetric.toObject(),
            ...metricData,
            created_by: existingMetric.created_by, // keep original
            last_updated_by: userId,
            updated_at: now,
          };
        } else {
          // New metric
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

  /**
   * Delete a metric (soft delete)
   */
  async deleteMetric(companyId, metricId, userId) {
    try {
      const record = await BiodiversityLandUse.findOne({
        company: companyId,
        is_active: true,
        "metrics._id": metricId,
      });

      if (!record) {
        throw new Error("Metric not found");
      }

      const metricIndex = record.metrics.findIndex(
        (m) => m._id.toString() === metricId,
      );
      if (metricIndex === -1) {
        throw new Error("Metric not found");
      }

      // Soft delete
      record.metrics[metricIndex].is_active = false;
      record.last_updated_by = userId;
      record.last_updated_at = new Date();

      await record.save();
      return record;
    } catch (error) {
      throw new Error(`Failed to delete metric: ${error.message}`);
    }
  }

  /**
   * Get summary statistics
   */
  async getSummaryStats(companyId) {
    try {
      const record = await BiodiversityLandUse.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) {
        return null;
      }

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

  /**
   * Validate data for a company
   */
  async validateData(companyId) {
    try {
      const record = await BiodiversityLandUse.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) {
        throw new Error("No active record found for validation");
      }

      const validationErrors = [];
      let dataQualityScore = 100;
      let hasCriticalErrors = false;

      // Validate metrics
      record.metrics.forEach((metric) => {
        if (!metric.is_active) return;

        // Check required fields
        if (!metric.metric_name) {
          validationErrors.push({
            metric_name: "Unknown",
            error_message: "Missing metric name",
            field: "metric_name",
            severity: "error",
          });
          dataQualityScore -= 5;
        }

        // Validate based on data type
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

      // Update validation status
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

  /**
   * Update verification status
   */
  async updateVerificationStatus(companyId, status, userId, notes = "") {
    try {
      const record = await BiodiversityLandUse.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) {
        throw new Error("Record not found");
      }

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

  /**
   * Get data history/versions
   */
  async getDataVersions(companyId) {
    try {
      return await BiodiversityLandUse.find({
        company: companyId,
      })
        .select(
          "version created_at created_by verification_status data_period_start data_period_end summary_stats",
        )
        .populate("created_by", "name email")
        .sort({ version: -1 });
    } catch (error) {
      throw new Error(`Failed to fetch versions: ${error.message}`);
    }
  }

  /**
   * Restore previous version
   */
  async restoreVersion(companyId, versionId, userId) {
    try {
      const session = await mongoose.startSession();
      session.startTransaction();

      try {
        // Get version to restore
        const versionToRestore =
          await BiodiversityLandUse.findById(versionId).session(session);
        if (
          !versionToRestore ||
          versionToRestore.company.toString() !== companyId
        ) {
          throw new Error("Version not found or belongs to different company");
        }

        // Deactivate current active record
        const currentActive = await BiodiversityLandUse.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (currentActive) {
          currentActive.is_active = false;
          await currentActive.save({ session });
        }

        // Create new record from old version
        const restoredRecord = new BiodiversityLandUse({
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

module.exports = new BiodiversityLandUseService();
