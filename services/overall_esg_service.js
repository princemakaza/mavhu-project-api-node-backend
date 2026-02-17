const OverallESGData = require("../models/overall_esg_model");
const FileParser = require("../utils/file_parsers"); // Adjust path as needed
const mongoose = require("mongoose");

class OverallESGService {
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
      case "csv": return "csv";
      case "xlsx":
      case "xls": return "excel";
      case "json": return "manual";
      default: return "manual";
    }
  }

  // ==================== CORE METHODS ====================

  async createRecord(data, userId) {
    try {
      const record = new OverallESGData({
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
        { ...metadata, fileName }
      );

      const existingRecord = await OverallESGData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      const importBatchId = `${fileExtension}_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      if (existingRecord) {
        record = new OverallESGData({
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
        record = new OverallESGData({
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

      const existingRecord = await OverallESGData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      if (existingRecord) {
        record = new OverallESGData({
          ...dataToImport,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
        });
        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new OverallESGData(dataToImport);
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
      fileName.toLowerCase().includes("esg") ||
      fileName.toLowerCase().includes("overall")
    ) {
      return this.processOverallESGCSVData(parsedData, companyId, userId, metadata);
    } else {
      return this.processGenericData(parsedData, companyId, userId, metadata);
    }
  }

  /**
   * Process the specific overall ESG CSV format (your provided file)
   */
  processOverallESGCSVData(parsedData, companyId, userId, metadata) {
    const metrics = [];
    const importSource = this._getImportSourceFromFileName(metadata.fileName || "");

    if (parsedData.raw_data && Array.isArray(parsedData.raw_data)) {
      const rows = parsedData.raw_data;

      // Helper to parse number with commas and % signs
      const parseNumber = (str) => {
        if (str === undefined || str === null) return null;
        if (typeof str === "number") return str;
        let cleaned = String(str).replace(/,/g, "");
        if (cleaned.endsWith("%")) {
          cleaned = cleaned.slice(0, -1);
        }
        if (cleaned === "N/A" || cleaned === "") return null;
        return parseFloat(cleaned);
      };

      // Helper to get unit based on metric name
      const getUnit = (metricName) => {
        if (metricName.includes("(tons)")) return "tons";
        if (metricName.includes("(MWH)")) return "MWH";
        if (metricName.includes("(kWh)")) return "kWh";
        if (metricName.includes("(hectares)")) return "hectares";
        if (metricName.includes("Employees")) return "employees";
        if (metricName.includes("LTIs")) return "injuries";
        if (metricName.includes("Fatalities")) return "deaths";
        if (metricName.includes("%")) return "%";
        if (metricName.includes("hours")) return "hours";
        return "";
      };

      // State to track which section we are in
      let section = null; // null, "environmental", "social", "governance", "highlights"
      let currentCategory = null;

      for (const row of rows) {
        const firstCol = Object.values(row)[0];
        if (!firstCol) continue;

        const firstColStr = String(firstCol).trim();

        // Detect section headers
        if (firstColStr.includes("ENVIRONMENTAL (E) METRICS")) {
          section = "environmental";
          continue;
        }
        if (firstColStr.includes("SOCIAL (S) METRICS")) {
          section = "social";
          continue;
        }
        if (firstColStr.includes("GOVERNANCE (G) METRICS")) {
          section = "governance";
          continue;
        }
        if (firstColStr.includes("KEY ESG HIGHLIGHTS")) {
          section = "highlights";
          continue;
        }

        // Skip empty rows or rows with only commas
        if (firstColStr === "" && Object.values(row).every(v => !v)) continue;

        // Process based on section
        if (section === "environmental" || section === "social") {
          // These sections have a header row: Metric,2022,2023,2024,2025
          // Skip the header row (Metric)
          if (firstColStr === "Metric") continue;

          const metricName = firstColStr;
          const years = ["2022", "2023", "2024", "2025"];
          const category = section === "environmental" ? "environmental" : "social";

          // Determine subcategory based on metricName (optional)
          let subcategory = "";
          if (metricName.includes("Bagasse")) subcategory = "bagasse_usage";
          else if (metricName.includes("Coal")) subcategory = "coal_consumption";
          else if (metricName.includes("Electricity")) subcategory = "electricity_generated";
          else if (metricName.includes("Solar")) subcategory = "solar_power_usage";
          else if (metricName.includes("Recyclable")) subcategory = "recyclable_waste";
          else if (metricName.includes("Game Reserve")) subcategory = "game_reserve_area";
          else if (metricName.includes("Female Employees")) subcategory = "female_employees";
          else if (metricName.includes("Lost Time Injuries")) subcategory = "lti";
          else if (metricName.includes("Fatalities")) subcategory = "fatalities";
          else if (metricName.includes("Female Representation")) subcategory = "female_representation_new_hires";
          else if (metricName.includes("Training Hours (Female")) subcategory = "training_hours_female";
          else if (metricName.includes("Training Hours (Male")) subcategory = "training_hours_male";

          const unit = getUnit(metricName);
          const yearlyData = [];

          for (const year of years) {
            let val = row[year];
            if (val !== undefined && val !== "" && val !== "N/A") {
              const numericValue = parseNumber(val);
              yearlyData.push({
                year,
                value: String(val),
                numeric_value: numericValue,
                unit,
                source: metadata.originalSource || metadata.fileName,
                added_by: userId
              });
            }
          }

          if (yearlyData.length > 0) {
            metrics.push({
              category,
              subcategory,
              metric_name: metricName,
              data_type: "yearly_series",
              yearly_data: yearlyData,
              created_by: userId
            });
          }
        } else if (section === "governance") {
          // Governance section has rows: Metric, Status/Value
          // Skip header row if present
          if (firstColStr === "Metric") continue;

          const metricName = firstColStr;
          const statusValue = row["Status/Value"] || row[Object.keys(row)[1]];

          if (statusValue !== undefined && statusValue !== "") {
            metrics.push({
              category: "governance",
              metric_name: metricName,
              data_type: "single_value",
              single_value: {
                value: statusValue,
                source: metadata.originalSource || metadata.fileName,
                added_by: userId
              },
              created_by: userId
            });
          }
        } else if (section === "highlights") {
          // Highlights are bullet points starting with "✓"
          if (firstColStr.startsWith("✓") || firstColStr.startsWith("-") || firstColStr.startsWith("•")) {
            let highlightsMetric = metrics.find(m => m.category === "highlights" && m.metric_name === "ESG Highlights 2025");
            if (!highlightsMetric) {
              highlightsMetric = {
                category: "highlights",
                metric_name: "ESG Highlights 2025",
                data_type: "list",
                list_data: [],
                created_by: userId
              };
              metrics.push(highlightsMetric);
            }
            highlightsMetric.list_data.push({
              item: firstColStr,
              source: metadata.originalSource || metadata.fileName,
              added_at: new Date()
            });
          }
        }
      }
    }

    // Extract data period from years present in environmental/social metrics
    const yearsSet = new Set();
    metrics.forEach(metric => {
      if (metric.yearly_data) {
        metric.yearly_data.forEach(d => {
          const match = String(d.year).match(/\b(20\d{2})\b/);
          if (match) yearsSet.add(parseInt(match[1]));
        });
      }
    });
    const yearsArray = Array.from(yearsSet).sort();
    const dataPeriodStart = yearsArray.length ? yearsArray[0].toString() : null;
    const dataPeriodEnd = yearsArray.length ? yearsArray[yearsArray.length - 1].toString() : null;

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
      return await OverallESGData.find(query)
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
      return await OverallESGData.findOne(query)
        .populate("created_by", "name email")
        .populate("last_updated_by", "name email");
    } catch (error) {
      throw new Error(`Failed to get record by ID: ${error.message}`);
    }
  }

  async getMetricsByCategory(companyId, category) {
    try {
      const record = await OverallESGData.findOne({
        company: companyId,
        is_active: true,
      });
      if (!record) return [];
      return record.metrics.filter(m => m.category === category && m.is_active !== false);
    } catch (error) {
      throw new Error(`Failed to get metrics by category: ${error.message}`);
    }
  }

  async getTimeSeriesData(companyId, metricName, category = null) {
    try {
      const record = await OverallESGData.findOne({
        company: companyId,
        is_active: true,
      });
      if (!record) return [];

      const metric = record.metrics.find(
        m => m.metric_name === metricName &&
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
        let record = await OverallESGData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (!record) {
          record = new OverallESGData({
            company: companyId,
            metrics: [],
            created_by: userId,
            last_updated_by: userId,
          });
        }

        const existingIndex = record.metrics.findIndex(
          m => m.metric_name === metricData.metric_name &&
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
      const record = await OverallESGData.findOne({
        company: companyId,
        is_active: true,
        "metrics._id": metricId,
      });

      if (!record) throw new Error("Metric not found");

      const metricIndex = record.metrics.findIndex(m => m._id.toString() === metricId);
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
      const record = await OverallESGData.findOne({
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
      const record = await OverallESGData.findOne({
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

      record.validation_status = hasCriticalErrors ? "failed_validation" : "validated";
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
      const record = await OverallESGData.findOne({
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
      return await OverallESGData.find({ company: companyId })
        .select("version created_at created_by verification_status data_period_start data_period_end summary_stats")
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
        const versionToRestore = await OverallESGData.findById(versionId).session(session);
        if (!versionToRestore || versionToRestore.company.toString() !== companyId) {
          throw new Error("Version not found or belongs to different company");
        }

        const currentActive = await OverallESGData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (currentActive) {
          currentActive.is_active = false;
          await currentActive.save({ session });
        }

        const restoredRecord = new OverallESGData({
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

module.exports = new OverallESGService();