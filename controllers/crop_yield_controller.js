const cropYieldService = require("../services/crop_yield_service");
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

class CropYieldController {
  /**
   * Import data from file (CSV, Excel, or JSON file)
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

    const record = await cropYieldService.importFromFile(
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

    const record = await cropYieldService.importFromJSON(
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
   * Get all crop yield records for a company
   */
  getCompanyRecords = asyncHandler(async (req, res) => {
    const { companyId } = req.params;
    const { include_inactive } = req.query;

    const records = await cropYieldService.getCompanyRecords(
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

    const record = await cropYieldService.getRecordById(recordId, companyId);

    if (!record) {
      throw new AppError("Record not found", 404, "RECORD_NOT_FOUND");
    }

    res.status(200).json({
      success: true,
      data: record,
    });
  });

  /**
   * Get metrics by category
   */
  getMetricsByCategory = asyncHandler(async (req, res) => {
    const { companyId, category } = req.params;
    const { subcategory } = req.query;

    let metrics = await cropYieldService.getMetricsByCategory(
      companyId,
      category,
    );

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

    const timeSeriesData = await cropYieldService.getTimeSeriesData(
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
   * Create or update a metric
   */
  upsertMetric = asyncHandler(async (req, res) => {
    requireFields(req.body, ["metric_name", "category", "data_type"]);

    const { companyId } = req.params;
    const userId = req.user._id;
    const metricData = req.body;

    const record = await cropYieldService.upsertMetric(
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
   * Delete a metric (soft delete)
   */
  deleteMetric = asyncHandler(async (req, res) => {
    const { companyId, metricId } = req.params;
    const userId = req.user._id;

    const record = await cropYieldService.deleteMetric(
      companyId,
      metricId,
      userId,
    );

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

    const summary = await cropYieldService.getSummaryStats(companyId);

    if (!summary) {
      throw new AppError(
        "No crop yield data found for this company",
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

    const validationResult = await cropYieldService.validateData(companyId);

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

    const record = await cropYieldService.updateVerificationStatus(
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

    const versions = await cropYieldService.getDataVersions(companyId);

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

    const restoredRecord = await cropYieldService.restoreVersion(
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
   * Create new crop yield record manually
   */
  createRecord = asyncHandler(async (req, res) => {
    requireFields(req.body, ["metrics"]);

    const { companyId } = req.params;
    const userId = req.user._id;

    const recordData = {
      ...req.body,
      company: companyId,
    };

    const record = await cropYieldService.createRecord(recordData, userId);

    res.status(201).json({
      success: true,
      message: "Crop yield record created successfully",
      data: record,
    });
  });

  /**
   * Export crop yield data as CSV
   */
  exportCSV = asyncHandler(async (req, res) => {
    const { companyId } = req.params;

    const record = await cropYieldService.getRecordById(null, companyId);

    if (!record) {
      throw new AppError(
        "No crop yield data found for this company",
        404,
        "NO_DATA_FOUND",
      );
    }

    const csvData = this.convertToCSV(record);

    res.setHeader("Content-Type", "text/csv");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=crop-yield-${companyId}-${
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
      }
    });

    const csvContent = [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");

    return csvContent;
  }

  /**
   * Get metrics by data type
   */
  getMetricsByDataType = asyncHandler(async (req, res) => {
    const { companyId, dataType } = req.params;

    const record = await cropYieldService.getRecordById(null, companyId);

    if (!record) {
      throw new AppError(
        "No crop yield data found for this company",
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
        const record = await cropYieldService.upsertMetric(
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

module.exports = new CropYieldController();
