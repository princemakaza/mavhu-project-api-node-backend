const HealthSafetyData = require("../models/health_safety_model");
const FileParser = require("../utils/file_parsers"); // Adjust path as needed
const mongoose = require("mongoose");

class HealthSafetyService {
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
      const record = new HealthSafetyData({
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

      const existingRecord = await HealthSafetyData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      const importBatchId = `${fileExtension}_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      if (existingRecord) {
        record = new HealthSafetyData({
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
        record = new HealthSafetyData({
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

      const existingRecord = await HealthSafetyData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      if (existingRecord) {
        record = new HealthSafetyData({
          ...dataToImport,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
        });
        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new HealthSafetyData(dataToImport);
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
      fileName.toLowerCase().includes("health") ||
      fileName.toLowerCase().includes("safety") ||
      fileName.toLowerCase().includes("lti")
    ) {
      return this.processHealthCSVData(parsedData, companyId, userId, metadata);
    } else {
      return this.processGenericData(parsedData, companyId, userId, metadata);
    }
  }

  /**
   * Process the specific health & safety CSV format (your provided file)
   */
  processHealthCSVData(parsedData, companyId, userId, metadata) {
    const metrics = [];
    const importSource = this._getImportSourceFromFileName(
      metadata.fileName || "",
    );

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

      // Helper to extract unit from value (if %)
      const getUnit = (str) => {
        if (str === undefined || str === null) return "";
        if (typeof str === "string" && str.includes("%")) return "%";
        return "";
      };

      // State to track which section we are in
      let section = null; // null, "lti", "health_services", "certifications", "training_hours"

      for (const row of rows) {
        const firstCol = Object.values(row)[0];
        if (!firstCol) continue;

        const firstColStr = String(firstCol).trim();

        // Detect section headers
        if (firstColStr === "Health & Safety Metrics") {
          section = "lti";
          continue;
        }
        if (firstColStr === "Health Services (2025)") {
          section = "health_services";
          continue;
        }
        if (firstColStr === "Certifications & Standards:") {
          section = "certifications";
          continue;
        }
        if (firstColStr === "Training Hours (2025):") {
          section = "training_hours";
          continue;
        }

        // Skip empty rows
        if (firstColStr === "" && Object.values(row).every((v) => !v)) continue;

        // Process based on section
        if (section === "lti") {
          // LTI Metrics: Year, Lost Time Injuries (LTIs), LTI Frequency Rate, Fatalities
          const year = row["Year"] || row[Object.keys(row)[0]];
          if (!year || year === "Year") continue;

          const yearStr = year.toString().trim();
          const ltiKey = "Lost Time Injuries (LTIs)";
          const freqKey = "LTI Frequency Rate";
          const fatalKey = "Fatalities";

          const ltiVal = row[ltiKey];
          if (ltiVal !== undefined && ltiVal !== "") {
            const numericValue = parseNumber(ltiVal);
            let metric = metrics.find(
              (m) =>
                m.category === "lti_metrics" &&
                m.subcategory === "lost_time_injuries",
            );
            if (!metric) {
              metric = {
                category: "lti_metrics",
                subcategory: "lost_time_injuries",
                metric_name: "Lost Time Injuries (LTIs)",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(ltiVal),
              numeric_value: numericValue,
              unit: "injuries",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }

          const freqVal = row[freqKey];
          if (freqVal !== undefined && freqVal !== "" && freqVal !== "N/A") {
            const numericValue = parseNumber(freqVal);
            let metric = metrics.find(
              (m) =>
                m.category === "lti_metrics" &&
                m.subcategory === "lti_frequency_rate",
            );
            if (!metric) {
              metric = {
                category: "lti_metrics",
                subcategory: "lti_frequency_rate",
                metric_name: "LTI Frequency Rate",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(freqVal),
              numeric_value: numericValue,
              unit: "rate",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }

          const fatalVal = row[fatalKey];
          if (fatalVal !== undefined && fatalVal !== "") {
            const numericValue = parseNumber(fatalVal);
            let metric = metrics.find(
              (m) =>
                m.category === "lti_metrics" && m.subcategory === "fatalities",
            );
            if (!metric) {
              metric = {
                category: "lti_metrics",
                subcategory: "fatalities",
                metric_name: "Fatalities",
                data_type: "yearly_series",
                yearly_data: [],
                created_by: userId,
              };
              metrics.push(metric);
            }
            metric.yearly_data.push({
              year: yearStr,
              value: String(fatalVal),
              numeric_value: numericValue,
              unit: "deaths",
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }
        } else if (section === "health_services") {
          // Health Services table: Metric, 2024, 2025
          const metricName = row["Metric"] || row[Object.keys(row)[0]];
          if (!metricName || metricName === "Metric") continue;

          const val2024 = row["2024"];
          const val2025 = row["2025"];

          // Determine subcategory and unit based on metricName
          let subcategory = "";
          let unit = "";
          let metricKey = "";
          if (metricName.includes("Malaria Cases")) {
            subcategory = "malaria_cases";
            unit = "cases";
            metricKey = "Malaria Cases";
          } else if (metricName.includes("HIV Prevalence")) {
            subcategory = "hiv_prevalence";
            unit = "%";
            metricKey = "HIV Prevalence";
          } else if (metricName.includes("New HIV Cases")) {
            subcategory = "new_hiv_cases";
            unit = "cases";
            metricKey = "New HIV Cases";
          } else if (metricName.includes("VCT Uptake")) {
            subcategory = "vct_uptake";
            unit = "%";
            metricKey = "VCT Uptake";
          } else if (metricName.includes("Hospital Beds")) {
            subcategory = "hospital_beds";
            unit = "beds";
            metricKey = "Hospital Beds";
          } else if (metricName.includes("Health Professionals")) {
            subcategory = "health_professionals";
            unit = "professionals";
            metricKey = "Health Professionals";
          } else if (metricName.includes("Doctors")) {
            subcategory = "doctors";
            unit = "doctors";
            metricKey = "Doctors";
          } else if (metricName.includes("Medical Support Staff")) {
            subcategory = "medical_support_staff";
            unit = "staff";
            metricKey = "Medical Support Staff";
          } else {
            continue; // skip unknown
          }

          // Create or find metric
          let metric = metrics.find(
            (m) =>
              m.category === "health_services" && m.subcategory === subcategory,
          );
          if (!metric) {
            metric = {
              category: "health_services",
              subcategory: subcategory,
              metric_name: metricKey,
              data_type: "yearly_series",
              yearly_data: [],
              created_by: userId,
            };
            metrics.push(metric);
          }

          // Add 2024 value
          if (val2024 !== undefined && val2024 !== "" && val2024 !== "N/A") {
            const numericValue = parseNumber(val2024);
            metric.yearly_data.push({
              year: "2024",
              value: String(val2024),
              numeric_value: numericValue,
              unit: unit,
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }

          // Add 2025 value
          if (val2025 !== undefined && val2025 !== "" && val2025 !== "N/A") {
            const numericValue = parseNumber(val2025);
            metric.yearly_data.push({
              year: "2025",
              value: String(val2025),
              numeric_value: numericValue,
              unit: unit,
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            });
          }
        } else if (section === "certifications") {
          // Certifications & Standards: bullet points
          if (firstColStr.startsWith("•") || firstColStr.startsWith("-")) {
            let certMetric = metrics.find(
              (m) =>
                m.category === "certifications" &&
                m.metric_name === "Certifications & Standards",
            );
            if (!certMetric) {
              certMetric = {
                category: "certifications",
                metric_name: "Certifications & Standards",
                data_type: "list",
                list_data: [],
                created_by: userId,
              };
              metrics.push(certMetric);
            }
            certMetric.list_data.push({
              item: firstColStr,
              details: "",
              source: metadata.originalSource || metadata.fileName,
              added_at: new Date(),
            });
          }
        } else if (section === "training_hours") {
          // Training Hours (2025): bullet points
          if (firstColStr.startsWith("•") || firstColStr.startsWith("-")) {
            let trainingMetric = metrics.find(
              (m) =>
                m.category === "training_hours" &&
                m.metric_name === "Training Hours (2025)",
            );
            if (!trainingMetric) {
              trainingMetric = {
                category: "training_hours",
                metric_name: "Training Hours (2025)",
                data_type: "list",
                list_data: [],
                created_by: userId,
              };
              metrics.push(trainingMetric);
            }
            trainingMetric.list_data.push({
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
      return await HealthSafetyData.find(query)
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
      return await HealthSafetyData.findOne(query)
        .populate("created_by", "name email")
        .populate("last_updated_by", "name email");
    } catch (error) {
      throw new Error(`Failed to get record by ID: ${error.message}`);
    }
  }

  async getMetricsByCategory(companyId, category) {
    try {
      const record = await HealthSafetyData.findOne({
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
      const record = await HealthSafetyData.findOne({
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
        let record = await HealthSafetyData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (!record) {
          record = new HealthSafetyData({
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
      const record = await HealthSafetyData.findOne({
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
      const record = await HealthSafetyData.findOne({
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
      const record = await HealthSafetyData.findOne({
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
      const record = await HealthSafetyData.findOne({
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
      return await HealthSafetyData.find({ company: companyId })
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
          await HealthSafetyData.findById(versionId).session(session);
        if (
          !versionToRestore ||
          versionToRestore.company.toString() !== companyId
        ) {
          throw new Error("Version not found or belongs to different company");
        }

        const currentActive = await HealthSafetyData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (currentActive) {
          currentActive.is_active = false;
          await currentActive.save({ session });
        }

        const restoredRecord = new HealthSafetyData({
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

module.exports = new HealthSafetyService();
