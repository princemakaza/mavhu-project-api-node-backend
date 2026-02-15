const IrrigationEfficiencyData = require("../models/irrigation_eff_model");
const FileParser = require("../utils/file_parsers"); // Adjust path as needed
const mongoose = require("mongoose");

class IrrigationEfficiencyService {
  /**
   * Recursively inject `userId` as `created_by` / `added_by` into all
   * nested subdocuments that require it.
   */
  _injectUserIds(obj, userId) {
    if (!obj || typeof obj !== "object") return;

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

    // Handle list_data item
    if (obj.item && !obj.added_by) {
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
        return "manual";
      default:
        return "manual";
    }
  }

  // ==================== CORE METHODS ====================
  async createRecord(data, userId) {
    try {
      const record = new IrrigationEfficiencyData({
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

      const existingRecord = await IrrigationEfficiencyData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      const importBatchId = `${fileExtension}_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      if (existingRecord) {
        record = new IrrigationEfficiencyData({
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
        record = new IrrigationEfficiencyData({
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

      const existingRecord = await IrrigationEfficiencyData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      if (existingRecord) {
        record = new IrrigationEfficiencyData({
          ...dataToImport,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
        });
        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new IrrigationEfficiencyData(dataToImport);
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
    // Assume any file imported through this service is irrigation-related.
    // If you have multiple formats, you can inspect fileName or content.
    return this.processIrrigationCSVData(parsedData, companyId, userId, metadata);
  }

  /**
   * Process irrigation‑specific CSV format (like the provided example)
   */
  processIrrigationCSVData(parsedData, companyId, userId, metadata) {
    const metrics = [];
    const importSource = this._getImportSourceFromFileName(metadata.fileName || "");

    if (parsedData.raw_data && Array.isArray(parsedData.raw_data)) {
      const rows = parsedData.raw_data;
      let inWaterSourcesSection = false;

      // Helper to parse number (remove commas)
      const parseNumber = (str) => {
        if (str === undefined || str === null) return null;
        if (typeof str === "number") return str;
        return parseFloat(String(str).replace(/,/g, ""));
      };

      // Helper to extract unit from column header
      const extractUnit = (header) => {
        const match = header.match(/\(([^)]+)\)/);
        return match ? match[1] : "";
      };

      // Map column headers to category and metric_name
      const columnMapping = {
        "Total Irrigation Water (million ML)": {
          category: "irrigation_water",
          metric_name: "Total Irrigation Water (million ML)",
        },
        "Water per Hectare (ML/ha)": {
          category: "water_per_hectare",
          metric_name: "Water per Hectare (ML/ha)",
        },
        "Effluent Discharged (thousand ML)": {
          category: "effluent_discharged",
          metric_name: "Effluent Discharged (thousand ML)",
        },
        "Water Treatment for Chiredzi (million ML)": {
          category: "water_treatment",
          metric_name: "Water Treatment for Chiredzi (million ML)",
        },
      };

      // First pass: collect yearly data
      for (const row of rows) {
        const firstCol = Object.values(row)[0];
        if (!firstCol) continue;

        // Check for water sources section start
        if (typeof firstCol === "string" && firstCol.includes("Water Sources:")) {
          inWaterSourcesSection = true;
          continue;
        }

        if (!inWaterSourcesSection) {
          // Expect a row with year and data
          const year = row["Year"] || row[Object.keys(row)[0]];
          if (!year || year === "Year") continue; // skip header

          const yearStr = String(year).trim();
          // Ensure it's a 4-digit year
          if (!/^\d{4}$/.test(yearStr)) continue;

          // For each defined metric column, extract value
          for (const [header, mapping] of Object.entries(columnMapping)) {
            let value = row[header];
            if (value !== undefined && value !== "") {
              const numericValue = parseNumber(value);
              const unit = extractUnit(header);

              // Find or create metric
              let metric = metrics.find(
                (m) => m.category === mapping.category && m.metric_name === mapping.metric_name
              );
              if (!metric) {
                metric = {
                  category: mapping.category,
                  subcategory: "total",
                  metric_name: mapping.metric_name,
                  data_type: "yearly_series",
                  yearly_data: [],
                  created_by: userId,
                };
                metrics.push(metric);
              }

              metric.yearly_data.push({
                year: yearStr,
                value: String(value),
                numeric_value: numericValue,
                unit,
                source: metadata.originalSource || metadata.fileName || "CSV Import",
                added_by: userId,
              });
            }
          }
        } else {
          // Process water sources list
          // Row format may be bullet points like "• Runde River"
          const sourceText = Object.values(row)[0];
          if (sourceText && typeof sourceText === "string") {
            // Remove bullet character if present
            const cleanSource = sourceText.replace(/^[•\-*]\s*/, "").trim();
            if (cleanSource && !cleanSource.includes("Water Sources:")) {
              // Find or create water_sources metric
              let waterSourcesMetric = metrics.find(
                (m) => m.category === "water_sources"
              );
              if (!waterSourcesMetric) {
                waterSourcesMetric = {
                  category: "water_sources",
                  metric_name: "Water Sources",
                  data_type: "list",
                  list_data: [],
                  created_by: userId,
                };
                metrics.push(waterSourcesMetric);
              }

              waterSourcesMetric.list_data.push({
                item: cleanSource,
                source: metadata.originalSource || metadata.fileName || "CSV Import",
                added_at: new Date(),
              });
            }
          }
        }
      }
    }

    // Extract data period from years present in yearly_data
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

    // Optionally compute summary_stats
    const summaryStats = this._computeSummaryStats(metrics);

    return {
      company: companyId,
      metrics,
      summary_stats: summaryStats,
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

  /**
   * Compute basic summary statistics from metrics
   */
  _computeSummaryStats(metrics) {
    const stats = {
      total_irrigation_water: 0,
      avg_water_per_hectare: 0,
      total_effluent_discharged: 0,
      avg_water_treatment: 0,
      water_sources_count: 0,
      last_updated: new Date(),
    };

    metrics.forEach((metric) => {
      if (metric.category === "irrigation_water" && metric.yearly_data) {
        const values = metric.yearly_data.map(d => d.numeric_value).filter(v => v != null);
        if (values.length) {
          stats.total_irrigation_water = values.reduce((a, b) => a + b, 0);
        }
      }
      if (metric.category === "water_per_hectare" && metric.yearly_data) {
        const values = metric.yearly_data.map(d => d.numeric_value).filter(v => v != null);
        if (values.length) {
          stats.avg_water_per_hectare = values.reduce((a, b) => a + b, 0) / values.length;
        }
      }
      if (metric.category === "effluent_discharged" && metric.yearly_data) {
        const values = metric.yearly_data.map(d => d.numeric_value).filter(v => v != null);
        if (values.length) {
          stats.total_effluent_discharged = values.reduce((a, b) => a + b, 0);
        }
      }
      if (metric.category === "water_treatment" && metric.yearly_data) {
        const values = metric.yearly_data.map(d => d.numeric_value).filter(v => v != null);
        if (values.length) {
          stats.avg_water_treatment = values.reduce((a, b) => a + b, 0) / values.length;
        }
      }
      if (metric.category === "water_sources" && metric.list_data) {
        stats.water_sources_count = metric.list_data.length;
      }
    });

    return stats;
  }

  // ==================== COMPANY RECORDS ====================
  async getCompanyRecords(companyId, includeInactive = false) {
    try {
      const query = { company: companyId };
      if (!includeInactive) query.is_active = true;
      return await IrrigationEfficiencyData.find(query)
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
      return await IrrigationEfficiencyData.findOne(query)
        .populate("created_by", "name email")
        .populate("last_updated_by", "name email");
    } catch (error) {
      throw new Error(`Failed to get record by ID: ${error.message}`);
    }
  }

  async getMetricsByCategory(companyId, category) {
    try {
      const record = await IrrigationEfficiencyData.findOne({
        company: companyId,
        is_active: true,
      });
      if (!record) return [];
      return record.metrics.filter(
        (m) => m.category === category && m.is_active !== false
      );
    } catch (error) {
      throw new Error(`Failed to get metrics by category: ${error.message}`);
    }
  }

  async getTimeSeriesData(companyId, metricName, category = null) {
    try {
      const record = await IrrigationEfficiencyData.findOne({
        company: companyId,
        is_active: true,
      });
      if (!record) return [];

      const metric = record.metrics.find(
        (m) =>
          m.metric_name === metricName &&
          (category ? m.category === category : true) &&
          m.is_active !== false
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
        let record = await IrrigationEfficiencyData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (!record) {
          record = new IrrigationEfficiencyData({
            company: companyId,
            metrics: [],
            created_by: userId,
            last_updated_by: userId,
          });
        }

        const existingIndex = record.metrics.findIndex(
          (m) =>
            m.metric_name === metricData.metric_name &&
            m.category === metricData.category
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
      const record = await IrrigationEfficiencyData.findOne({
        company: companyId,
        is_active: true,
        "metrics._id": metricId,
      });

      if (!record) {
        throw new Error("Metric not found");
      }

      const metricIndex = record.metrics.findIndex(
        (m) => m._id.toString() === metricId
      );
      if (metricIndex === -1) {
        throw new Error("Metric not found");
      }

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
      const record = await IrrigationEfficiencyData.findOne({
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
      const record = await IrrigationEfficiencyData.findOne({
        company: companyId,
        is_active: true,
      });

      if (!record) {
        throw new Error("No active record found for validation");
      }

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
          case "list":
            if (!metric.list_data || metric.list_data.length === 0) {
              validationErrors.push({
                metric_name: metric.metric_name,
                error_message: "List data is empty",
                field: "list_data",
                severity: "warning",
              });
              dataQualityScore -= 2;
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
      const record = await IrrigationEfficiencyData.findOne({
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

  // ==================== VERSIONING ====================
  async getDataVersions(companyId) {
    try {
      return await IrrigationEfficiencyData.find({ company: companyId })
        .select(
          "version created_at created_by verification_status data_period_start data_period_end summary_stats"
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
        const versionToRestore = await IrrigationEfficiencyData.findById(
          versionId
        ).session(session);
        if (
          !versionToRestore ||
          versionToRestore.company.toString() !== companyId
        ) {
          throw new Error("Version not found or belongs to different company");
        }

        const currentActive = await IrrigationEfficiencyData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (currentActive) {
          currentActive.is_active = false;
          await currentActive.save({ session });
        }

        const restoredRecord = new IrrigationEfficiencyData({
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

module.exports = new IrrigationEfficiencyService();