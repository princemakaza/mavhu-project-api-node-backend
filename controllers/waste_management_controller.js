const wasteService = require("../services/waste_management_data_service");
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");

function requireFields(body, fields = []) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === "",
  );
  if (missing.length) {
    throw new AppError("Missing required fields", 400, "MISSING_FIELDS", {
      missing,
    });
  }
}

class WasteManagementController {
  /**
   * Import data from file (CSV, Excel, JSON)
   */
  importFile = asyncHandler(async (req, res) => {
    if (!req.file) {
      throw new AppError("No file provided", 400, "NO_FILE_PROVIDED");
    }

    const { companyId } = req.params;
    const userId = req.user._id;

    const metadata = {
      fileName: req.file.originalname,
      size: req.file.size,
      dataPeriodStart: req.body.data_period_start,
      dataPeriodEnd: req.body.data_period_end,
      originalSource: req.body.original_source,
      source: req.body.source || "File Import",
    };

    const record = await wasteService.importFromFile(
      req.file.buffer,
      req.file.originalname,
      companyId,
      userId,
      metadata,
    );

    res.status(201).json({
      success: true,
      message: "File data imported successfully",
      data: {
        record_id: record._id,
        version: record.version,
        import_date: record.import_date,
        import_source: record.import_source,
        metrics_count: record.metrics.length,
        summary_stats: record.summary_stats,
      },
    });
  });

  /**
   * Import data from JSON payload (not file)
   */
  importJSON = asyncHandler(async (req, res) => {
    requireFields(req.body, ["data"]);

    if (!Array.isArray(req.body.data) && typeof req.body.data !== "object") {
      throw new AppError(
        "Invalid data format. Must be array or object",
        400,
        "INVALID_DATA_FORMAT",
      );
    }

    const { companyId } = req.params;
    const userId = req.user._id;

    const metadata = {
      fileName: req.body.file_name || "manual_import.json",
      originalSource: req.body.original_source || "Manual JSON Import",
    };

    const record = await wasteService.importFromJSON(
      req.body.data,
      companyId,
      userId,
      metadata,
    );

    res.status(201).json({
      success: true,
      message: "JSON data imported successfully",
      data: {
        record_id: record._id,
        version: record.version,
        import_date: record.import_date,
        import_source: record.import_source,
        metrics_count: record.metrics.length,
      },
    });
  });

  /**
   * Get all waste management records for a company
   */
  getCompanyRecords = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { include_inactive } = req.query;

    const records = await wasteService.getCompanyRecords(
      companyId,
      include_inactive === "true",
    );

    res.status(200).json({
      success: true,
      count: records.length,
      data: records,
    });
  });

  /**
   * Get specific record by ID
   */
  getRecordById = asyncHandler(async (req, res) => {
    const { companyId, recordId } = req.params;

    const record = await wasteService.getRecordById(recordId, companyId);

    if (!record) {
      throw new AppError("Record not found", 404, "RECORD_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  });

  /**
   * Get metrics by category (e.g., waste_generation, effluent_management)
   */
  getMetricsByCategory = asyncHandler(async (req, res) => {
    const { companyId, category } = req.params;
    const { subcategory } = req.query;

    let metrics = await wasteService.getMetricsByCategory(companyId, category);

    if (!metrics || metrics.length === 0) {
      throw new AppError(
        "No metrics found for category",
        404,
        "NO_METRICS_FOUND",
      );
    }

    if (subcategory) {
      metrics = metrics.filter((metric) => metric.subcategory === subcategory);
    }

    res.status(200).json({
      success: true,
      count: metrics.length,
      category,
      data: metrics,
    });
  });

  /**
   * Get time series data for a metric
   */
  getTimeSeriesData = asyncHandler(async (req, res) => {
    const { companyId, metricName } = req.params;
    const { category } = req.query;

    const timeSeriesData = await wasteService.getTimeSeriesData(
      companyId,
      metricName,
      category,
    );

    if (!timeSeriesData || timeSeriesData.length === 0) {
      throw new AppError(
        "No time series data found",
        404,
        "NO_TIME_SERIES_DATA",
      );
    }

    res.status(200).json({
      success: true,
      metric_name: metricName,
      count: timeSeriesData.length,
      data: timeSeriesData,
    });
  });

  /**
   * Create or update a single metric (upsert)
   */
  upsertMetric = asyncHandler(async (req, res) => {
    requireFields(req.body, ["metric_name", "category", "data_type"]);

    const { companyId } = req.params;
    const userId = req.user._id;
    const metricData = req.body;

    const record = await wasteService.upsertMetric(
      companyId,
      metricData,
      userId,
    );

    res.status(200).json({
      success: true,
      message: "Metric updated successfully",
      data: record,
    });
  });

  /**
   * Soft delete a metric
   */
  deleteMetric = asyncHandler(async (req, res) => {
    const { companyId, metricId } = req.params;
    const userId = req.user._id;

    const record = await wasteService.deleteMetric(companyId, metricId, userId);

    res.status(200).json({
      success: true,
      message: "Metric deleted successfully",
      data: {
        record_id: record._id,
        metric_id: metricId,
      },
    });
  });

  /**
   * Get summary statistics
   */
  getSummaryStats = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    const summary = await wasteService.getSummaryStats(companyId);

    if (!summary) {
      throw new AppError(
        "No waste management data found for this company",
        404,
        "NO_DATA_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      data: summary,
    });
  });

  /**
   * Validate data
   */
  validateData = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    const validationResult = await wasteService.validateData(companyId);

    res.status(200).json({
      success: true,
      message: "Data validation completed",
      data: validationResult,
    });
  });

  /**
   * Update verification status
   */
  updateVerificationStatus = asyncHandler(async (req, res) => {
    requireFields(req.body, ["status"]);

    const { companyId } = req.params;
    const { status, notes } = req.body;
    const userId = req.user._id;

    const record = await wasteService.updateVerificationStatus(
      companyId,
      status,
      userId,
      notes,
    );

    if (!record) {
      throw new AppError("Record not found", 404, "RECORD_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      message: `Verification status updated to ${status}`,
      data: {
        record_id: record._id,
        verification_status: record.verification_status,
        verified_by: record.verified_by,
        verified_at: record.verified_at,
      },
    });
  });

  /**
   * Get data versions
   */
  getDataVersions = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    const versions = await wasteService.getDataVersions(companyId);

    res.status(200).json({
      success: true,
      count: versions.length,
      data: versions,
    });
  });

  /**
   * Restore previous version
   */
  restoreVersion = asyncHandler(async (req, res) => {
    const { companyId, versionId } = req.params;
    const userId = req.user._id;

    const restoredRecord = await wasteService.restoreVersion(
      companyId,
      versionId,
      userId,
    );

    if (!restoredRecord) {
      throw new AppError(
        "Version not found or belongs to different company",
        404,
        "VERSION_NOT_FOUND",
      );
    }

    res.status(200).json({
      success: true,
      message: "Version restored successfully",
      data: {
        new_record_id: restoredRecord._id,
        version: restoredRecord.version,
        restored_from: versionId,
        restore_date: restoredRecord.created_at,
      },
    });
  });

  /**
   * Create new record manually (full replacement)
   */
  createRecord = asyncHandler(async (req, res) => {
    requireFields(req.body, ["metrics"]);

    const { companyId } = req.params;
    const userId = req.user._id;

    const recordData = {
      ...req.body,
      company: companyId,
    };

    const record = await wasteService.createRecord(recordData, userId);

    res.status(201).json({
      success: true,
      message: "Waste management record created successfully",
      data: record,
    });
  });

  /**
   * Export data as CSV
   */
  exportCSV = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    const record = await wasteService.getRecordById(null, companyId);

    if (!record) {
      throw new AppError(
        "No waste management data found for this company",
        404,
        "NO_DATA_FOUND",
      );
    }

    const csvData = this.convertToCSV(record);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=waste-management-${companyId}-${
        new Date().toISOString().split("T")[0]
      }.csv`,
    );

    res.status(200).send(csvData);
  });

  /**
   * Convert record data to CSV format
   */
  convertToCSV(record) {
    const headers = [
      "Category",
      "Metric Name",
      "Year",
      "Value",
      "Unit",
      "Source",
      "Verification Status",
    ];
    const rows = [];

    record.metrics.forEach((metric) => {
      if (metric.data_type === "yearly_series" && metric.yearly_data) {
        metric.yearly_data.forEach((data) => {
          rows.push([
            metric.category,
            metric.metric_name,
            data.year,
            data.value,
            data.unit || "",
            data.source || "",
            record.verification_status,
          ]);
        });
      } else if (metric.data_type === "single_value" && metric.single_value) {
        rows.push([
          metric.category,
          metric.metric_name,
          "N/A",
          metric.single_value.value,
          metric.single_value.unit || "",
          metric.single_value.source || "",
          record.verification_status,
        ]);
      } else if (metric.data_type === "list" && metric.list_data) {
        metric.list_data.forEach((item, idx) => {
          rows.push([
            metric.category,
            metric.metric_name,
            "N/A",
            item.item,
            "",
            item.source || "",
            record.verification_status,
          ]);
        });
      }
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csvContent;
  }

  /**
   * Get metrics by data type (yearly_series, single_value, list, summary)
   */
  getMetricsByDataType = asyncHandler(async (req, res) => {
    const { companyId, dataType } = req.params;

    const record = await wasteService.getRecordById(null, companyId);

    if (!record) {
      throw new AppError(
        "No waste management data found for this company",
        404,
        "NO_DATA_FOUND",
      );
    }

    const metrics = record.metrics.filter(
      (metric) => metric.data_type === dataType && metric.is_active !== false,
    );

    res.status(200).json({
      success: true,
      count: metrics.length,
      data_type: dataType,
      data: metrics,
    });
  });

  /**
   * Bulk update metrics
   */
  bulkUpdateMetrics = asyncHandler(async (req, res) => {
    requireFields(req.body, ["metrics"]);

    const { companyId } = req.params;
    const userId = req.user._id;
    const { metrics } = req.body;

    if (!Array.isArray(metrics) || metrics.length === 0) {
      throw new AppError(
        "Metrics array is required and cannot be empty",
        400,
        "INVALID_METRICS_ARRAY",
      );
    }

    const results = [];
    for (const metricData of metrics) {
      try {
        const record = await wasteService.upsertMetric(
          companyId,
          metricData,
          userId,
        );
        results.push({
          metric_name: metricData.metric_name,
          success: true,
          record_id: record._id,
        });
      } catch (error) {
        results.push({
          metric_name: metricData.metric_name,
          success: false,
          error: error.message,
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    res.status(200).json({
      success: true,
      message: `Bulk update completed: ${successful} successful, ${failed} failed`,
      data: results,
    });
  });
}

module.exports = new WasteManagementController();
