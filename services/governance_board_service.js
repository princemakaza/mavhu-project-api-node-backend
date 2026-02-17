const GovernanceBoardData = require("../models/governance_board_model");
const FileParser = require("../utils/file_parsers"); // Adjust path as needed
const mongoose = require("mongoose");

class GovernanceBoardService {
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
      const record = new GovernanceBoardData({
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

      const existingRecord = await GovernanceBoardData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;
      const importBatchId = `${fileExtension}_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      if (existingRecord) {
        record = new GovernanceBoardData({
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
        record = new GovernanceBoardData({
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

      // Deep clone
      const dataToImport = JSON.parse(JSON.stringify(jsonData));

      // Inject user IDs
      this._injectUserIds(dataToImport, userId);

      // 🔥 SIMPLIFIED NORMALIZATION FUNCTION
      const normalizeListData = (metrics = []) => {
        return metrics.map((metric) => {
          // Only process list type metrics
          if (metric.data_type !== "list" || !metric.list_data) {
            return metric;
          }

          let listData = metric.list_data;

          // Handle stringified JSON
          if (typeof listData === "string") {
            try {
              listData = JSON.parse(listData);
            } catch {
              listData = [{ item: listData, source: "CSV Import" }];
            }
          }

          // Ensure it's an array
          if (!Array.isArray(listData)) {
            listData = [listData];
          }

          // Flatten any nested arrays
          listData = listData.flat(Infinity);

          // ✅ Ensure each item has a source field (add if missing)
          metric.list_data = listData.map((entry) => {
            if (typeof entry === "string") {
              return { item: entry, source: "CSV Import" };
            }

            if (typeof entry === "object" && entry !== null) {
              // Add source if not present, otherwise keep as-is
              return {
                ...entry,
                source: entry.source || "CSV Import",
              };
            }

            // Fallback for other types
            return { item: String(entry), source: "CSV Import" };
          });

          return metric;
        });
      };

      // Apply normalization
      dataToImport.metrics = normalizeListData(dataToImport.metrics);

      // 🔥 Metadata
      dataToImport.company = companyId;
      dataToImport.import_source = "manual";
      dataToImport.import_date = new Date();
      dataToImport.created_by = userId;
      dataToImport.last_updated_by = userId;
      dataToImport.source_file_name = metadata.fileName || "manual_import.json";

      dataToImport.import_batch_id = `manual_import_${Date.now()}_${Math.random()
        .toString(36)
        .substr(2, 9)}`;

      // Versioning
      const existingRecord = await GovernanceBoardData.findOne({
        company: companyId,
        is_active: true,
      });

      let record;

      if (existingRecord) {
        record = new GovernanceBoardData({
          ...dataToImport,
          previous_version: existingRecord._id,
          version: existingRecord.version + 1,
        });

        existingRecord.is_active = false;
        await existingRecord.save();
      } else {
        record = new GovernanceBoardData(dataToImport);
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
      fileName.toLowerCase().includes("governance") ||
      fileName.toLowerCase().includes("board")
    ) {
      return this.processGovernanceCSVData(
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
   * Process the specific governance & board CSV format (your provided file)
   */
  processGovernanceCSVData(parsedData, companyId, userId, metadata) {
    const metrics = [];
    const importSource = this._getImportSourceFromFileName(
      metadata.fileName || "",
    );

    if (parsedData.raw_data && Array.isArray(parsedData.raw_data)) {
      const rows = parsedData.raw_data;

      // Helper to clean strings
      const clean = (str) =>
        str !== undefined && str !== null ? String(str).trim() : "";

      // State to track which section we are in
      let section = null; // null, "board_composition", "director_fees", "governance_framework", "governance_policies"

      for (const row of rows) {
        const firstCol = Object.values(row)[0];
        if (!firstCol) continue;

        const firstColStr = clean(firstCol);

        // Detect section headers
        if (firstColStr === "Board of Directors Composition") {
          section = "board_composition";
          continue;
        }
        if (firstColStr === "Director Fees (2025)") {
          section = "director_fees";
          continue;
        }
        if (firstColStr === "Governance Framework:") {
          section = "governance_framework";
          continue;
        }
        if (firstColStr === "Key Governance Policies:") {
          section = "governance_policies";
          continue;
        }

        // Skip empty rows or rows with only commas (they appear as empty strings)
        if (firstColStr === "" && Object.values(row).every((v) => !v)) continue;

        // Process based on section
        if (section === "board_composition") {
          // Board composition table: Name, Role, Type, Tenure, Appointed, Key Skills
          // Skip header row (Name, Role, ...)
          if (firstColStr === "Name") continue;

          const name = firstColStr;
          const role = clean(row["Role"]);
          const type = clean(row["Type"]);
          const tenure = clean(row["Tenure"]);
          const appointed = clean(row["Appointed"]);
          const keySkills = clean(row["Key Skills"]);

          // Create or find board composition metric
          let boardMetric = metrics.find(
            (m) =>
              m.category === "board_composition" &&
              m.metric_name === "Board of Directors",
          );
          if (!boardMetric) {
            boardMetric = {
              category: "board_composition",
              metric_name: "Board of Directors",
              data_type: "list",
              list_data: [],
              created_by: userId,
            };
            metrics.push(boardMetric);
          }

          boardMetric.list_data.push({
            name,
            role,
            type,
            tenure,
            appointed,
            key_skills: keySkills,
            source: metadata.originalSource || metadata.fileName,
            added_at: new Date(),
          });
        } else if (section === "director_fees") {
          // Director Fees table: Fee Type, Non-Executive Directors, Chairman
          // Skip header row (Fee Type, Non-Executive Directors, Chairman)
          if (firstColStr === "Fee Type") continue;

          const feeType = firstColStr;
          const nonExec = clean(row["Non-Executive Directors"]);
          const chairman = clean(row["Chairman"]);

          // Create or find fees metric
          let feesMetric = metrics.find(
            (m) =>
              m.category === "director_fees" &&
              m.metric_name === "Director Fees (2025)",
          );
          if (!feesMetric) {
            feesMetric = {
              category: "director_fees",
              metric_name: "Director Fees (2025)",
              data_type: "list",
              list_data: [],
              created_by: userId,
            };
            metrics.push(feesMetric);
          }

          feesMetric.list_data.push({
            item: feeType,
            details: `Non-Executive: ${nonExec}, Chairman: ${chairman}`,
            source: metadata.originalSource || metadata.fileName,
            added_at: new Date(),
          });

          // Also store as summary_stats if needed (optional)
        } else if (section === "governance_framework") {
          // Governance Framework bullet points
          if (firstColStr.startsWith("•") || firstColStr.startsWith("-")) {
            let frameworkMetric = metrics.find(
              (m) =>
                m.category === "governance_framework" &&
                m.metric_name === "Governance Framework",
            );
            if (!frameworkMetric) {
              frameworkMetric = {
                category: "governance_framework",
                metric_name: "Governance Framework",
                data_type: "list",
                list_data: [],
                created_by: userId,
              };
              metrics.push(frameworkMetric);
            }
            frameworkMetric.list_data.push({
              item: firstColStr,
              source: metadata.originalSource || metadata.fileName,
              added_at: new Date(),
            });
          }
        } else if (section === "governance_policies") {
          // Key Governance Policies bullet points
          if (firstColStr.startsWith("•") || firstColStr.startsWith("-")) {
            let policyMetric = metrics.find(
              (m) =>
                m.category === "governance_policies" &&
                m.metric_name === "Key Governance Policies",
            );
            if (!policyMetric) {
              policyMetric = {
                category: "governance_policies",
                metric_name: "Key Governance Policies",
                data_type: "list",
                list_data: [],
                created_by: userId,
              };
              metrics.push(policyMetric);
            }
            policyMetric.list_data.push({
              item: firstColStr,
              source: metadata.originalSource || metadata.fileName,
              added_at: new Date(),
            });
          }
        }
      }

      // Optionally, extract external auditors from policies list
      // The last policy line is "• External Auditors: Ernst & Young"
      // We could create a separate single_value for external auditors.
      const policiesMetric = metrics.find(
        (m) =>
          m.category === "governance_policies" &&
          m.metric_name === "Key Governance Policies",
      );
      if (policiesMetric) {
        const auditorItem = policiesMetric.list_data.find((item) =>
          item.item.includes("External Auditors"),
        );
        if (auditorItem) {
          // Create a separate metric for external auditors
          metrics.push({
            category: "governance_policies",
            subcategory: "external_auditors",
            metric_name: "External Auditors",
            data_type: "single_value",
            single_value: {
              value: auditorItem.item
                .replace("• External Auditors:", "")
                .trim(),
              source: metadata.originalSource || metadata.fileName,
              added_by: userId,
            },
            created_by: userId,
          });
        }
      }
    }

    // No yearly data, so data_period_start/end can be set to null or based on file name
    const dataPeriodStart = null;
    const dataPeriodEnd = null;

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
      return await GovernanceBoardData.find(query)
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
      return await GovernanceBoardData.findOne(query)
        .populate("created_by", "name email")
        .populate("last_updated_by", "name email");
    } catch (error) {
      throw new Error(`Failed to get record by ID: ${error.message}`);
    }
  }

  async getMetricsByCategory(companyId, category) {
    try {
      const record = await GovernanceBoardData.findOne({
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
      const record = await GovernanceBoardData.findOne({
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
        let record = await GovernanceBoardData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (!record) {
          record = new GovernanceBoardData({
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
      const record = await GovernanceBoardData.findOne({
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
      const record = await GovernanceBoardData.findOne({
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
      const record = await GovernanceBoardData.findOne({
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
      const record = await GovernanceBoardData.findOne({
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
      return await GovernanceBoardData.find({ company: companyId })
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
          await GovernanceBoardData.findById(versionId).session(session);
        if (
          !versionToRestore ||
          versionToRestore.company.toString() !== companyId
        ) {
          throw new Error("Version not found or belongs to different company");
        }

        const currentActive = await GovernanceBoardData.findOne({
          company: companyId,
          is_active: true,
        }).session(session);

        if (currentActive) {
          currentActive.is_active = false;
          await currentActive.save({ session });
        }

        const restoredRecord = new GovernanceBoardData({
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

module.exports = new GovernanceBoardService();
