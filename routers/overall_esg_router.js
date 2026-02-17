const express = require("express");
const router = express.Router();

const esgController = require("../controllers/overall_esg_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");
const upload = require("../middlewares/uploadMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Overall ESG Score
 *     description: Aggregated Environmental, Social, and Governance metrics and highlights
 *
 * components:
 *   schemas:
 *     YearlyValue:
 *       type: object
 *       required: [year, value]
 *       properties:
 *         year:
 *           type: string
 *           example: "2023"
 *         value:
 *           type: mixed
 *           example: 14161
 *         numeric_value:
 *           type: number
 *           example: 14161
 *         unit:
 *           type: string
 *           example: "tons"
 *         source:
 *           type: string
 *           example: "CSV Import"
 *         notes:
 *           type: string
 *
 *     SingleValue:
 *       type: object
 *       properties:
 *         value:
 *           type: mixed
 *           example: "Independent Chairman"
 *         numeric_value:
 *           type: number
 *           example: null
 *         unit:
 *           type: string
 *           example: ""
 *         source:
 *           type: string
 *         notes:
 *           type: string
 *
 *     OverallESGMetric:
 *       type: object
 *       required: [metric_name, category, data_type]
 *       properties:
 *         _id:
 *           type: string
 *         category:
 *           type: string
 *           enum: [environmental, social, governance, highlights, forecast, risk]
 *           example: "environmental"
 *         subcategory:
 *           type: string
 *           example: "bagasse_usage"
 *         metric_name:
 *           type: string
 *           example: "Bagasse Usage (tons)"
 *         data_type:
 *           type: string
 *           enum: [yearly_series, single_value, list, summary]
 *           example: "yearly_series"
 *         yearly_data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/YearlyValue'
 *         single_value:
 *           $ref: '#/components/schemas/SingleValue'
 *         list_data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               item:
 *                 type: string
 *               details:
 *                 type: string
 *         is_active:
 *           type: boolean
 *           default: true
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     OverallESGRecord:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         company:
 *           type: string
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/OverallESGMetric'
 *         version:
 *           type: integer
 *           example: 1
 *         is_active:
 *           type: boolean
 *           default: true
 *         import_source:
 *           type: string
 *           enum: [csv, excel, manual, api, pdf_extraction]
 *         source_file_name:
 *           type: string
 *         import_batch_id:
 *           type: string
 *         import_date:
 *           type: string
 *           format: date-time
 *         data_period_start:
 *           type: string
 *           example: "2022"
 *         data_period_end:
 *           type: string
 *           example: "2025"
 *         original_source:
 *           type: string
 *         verification_status:
 *           type: string
 *           enum: [unverified, pending_review, verified, audited, disputed]
 *           default: unverified
 *         verified_by:
 *           type: string
 *         verified_at:
 *           type: string
 *           format: date-time
 *         verification_notes:
 *           type: string
 *         validation_status:
 *           type: string
 *           enum: [not_validated, validating, validated, failed_validation]
 *         data_quality_score:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *         summary_stats:
 *           type: object
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         last_updated_by:
 *           type: string
 *         last_updated_at:
 *           type: string
 *           format: date-time
 *
 *     UpsertMetricRequest:
 *       type: object
 *       required: [metric_name, category, data_type]
 *       properties:
 *         metric_name:
 *           type: string
 *         category:
 *           type: string
 *         subcategory:
 *           type: string
 *         data_type:
 *           type: string
 *           enum: [yearly_series, single_value, list, summary]
 *         yearly_data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/YearlyValue'
 *         single_value:
 *           $ref: '#/components/schemas/SingleValue'
 *         list_data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               item:
 *                 type: string
 *               details:
 *                 type: string
 *         is_active:
 *           type: boolean
 *
 *     VerificationRequest:
 *       type: object
 *       required: [status]
 *       properties:
 *         status:
 *           type: string
 *           enum: [unverified, pending_review, verified, audited, disputed]
 *         notes:
 *           type: string
 */

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/import-file:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Import overall ESG data from file (CSV/Excel/JSON)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the company
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Data file (CSV, Excel, or JSON)
 *               data_period_start:
 *                 type: string
 *                 example: "2022"
 *               data_period_end:
 *                 type: string
 *                 example: "2025"
 *               original_source:
 *                 type: string
 *                 example: "Overall ESG Report 2025"
 *               source:
 *                 type: string
 *                 example: "File Import"
 *     responses:
 *       201:
 *         description: File imported successfully
 *       400:
 *         description: No file provided or unsupported file type
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/company/:companyId/import-file",
  authenticate,
  upload.single("file"),
  esgController.importFile,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/import-json:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Import overall ESG data from JSON payload
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [data]
 *             properties:
 *               data:
 *                 type: object
 *                 description: JSON object conforming to OverallESGRecord structure (must contain metrics array)
 *               file_name:
 *                 type: string
 *                 example: "manual_import.json"
 *               original_source:
 *                 type: string
 *                 example: "Manual JSON Import"
 *     responses:
 *       201:
 *         description: JSON data imported successfully
 *       400:
 *         description: Invalid JSON structure
 */
router.post(
  "/company/:companyId/import-json",
  authenticate,
  esgController.importJSON,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/records:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get all overall ESG records for a company (active by default)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: include_inactive
 *         schema:
 *           type: string
 *           enum: [true, false]
 *         description: Set to 'true' to include inactive records (historical versions)
 *     responses:
 *       200:
 *         description: List of overall ESG records
 */
router.get(
  "/company/:companyId/records",
  authenticate,
  esgController.getCompanyRecords,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/records/{recordId}:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get a specific overall ESG record by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: recordId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Record found
 *       404:
 *         description: Record not found
 */
router.get(
  "/company/:companyId/records/:recordId",
  authenticate,
  esgController.getRecordById,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/category/{category}:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get metrics by category (environmental, social, governance, highlights)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [environmental, social, governance, highlights, forecast, risk]
 *         description: Metric category
 *       - in: query
 *         name: subcategory
 *         schema:
 *           type: string
 *         description: Optional subcategory filter (e.g., 'bagasse_usage', 'female_employees')
 *     responses:
 *       200:
 *         description: List of metrics in the category
 *       404:
 *         description: No metrics found for category
 */
router.get(
  "/company/:companyId/category/:category",
  authenticate,
  esgController.getMetricsByCategory,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/metric/{metricName}/timeseries:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get time series data for a specific metric (for environmental/social)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: metricName
 *         required: true
 *         schema:
 *           type: string
 *         description: Exact metric name (e.g., "Bagasse Usage (tons)")
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Optional category to disambiguate metric names
 *     responses:
 *       200:
 *         description: Time series data points
 *       404:
 *         description: No time series data found
 */
router.get(
  "/company/:companyId/metric/:metricName/timeseries",
  authenticate,
  esgController.getTimeSeriesData,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/metrics:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Create or update a single metric (upsert)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpsertMetricRequest'
 *     responses:
 *       200:
 *         description: Metric upserted successfully
 */
router.post(
  "/company/:companyId/metrics",
  authenticate,
  esgController.upsertMetric,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/metrics/bulk:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Bulk upsert multiple metrics
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [metrics]
 *             properties:
 *               metrics:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/UpsertMetricRequest'
 *     responses:
 *       200:
 *         description: Bulk update results
 */
router.post(
  "/company/:companyId/metrics/bulk",
  authenticate,
  esgController.bulkUpdateMetrics,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/metrics/{metricId}:
 *   delete:
 *     tags: [Overall ESG Score]
 *     summary: Soft delete a specific metric
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: metricId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Metric deleted successfully
 *       404:
 *         description: Metric not found
 */
router.delete(
  "/company/:companyId/metrics/:metricId",
  authenticate,
  esgController.deleteMetric,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/summary:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get summary statistics for the company's overall ESG data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Summary statistics
 *       404:
 *         description: No overall ESG data found
 */
router.get(
  "/company/:companyId/summary",
  authenticate,
  esgController.getSummaryStats,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/validate:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Run data validation on the active record
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Validation completed
 */
router.post(
  "/company/:companyId/validate",
  authenticate,
  esgController.validateData,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/verification:
 *   patch:
 *     tags: [Overall ESG Score]
 *     summary: Update verification status of the active record
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/VerificationRequest'
 *     responses:
 *       200:
 *         description: Verification status updated
 *       404:
 *         description: Record not found
 */
router.patch(
  "/company/:companyId/verification",
  authenticate,
  requireOwner,
  esgController.updateVerificationStatus,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/versions:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get all historical versions of overall ESG data for a company
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: List of versions
 */
router.get(
  "/company/:companyId/versions",
  authenticate,
  esgController.getDataVersions,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/versions/{versionId}/restore:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Restore a previous version of overall ESG data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: versionId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the version to restore
 *     responses:
 *       200:
 *         description: Version restored successfully
 *       404:
 *         description: Version not found or belongs to different company
 */
router.post(
  "/company/:companyId/versions/:versionId/restore",
  authenticate,
  requireOwner,
  esgController.restoreVersion,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/records:
 *   post:
 *     tags: [Overall ESG Score]
 *     summary: Manually create a new overall ESG record (full replacement)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [metrics]
 *             properties:
 *               metrics:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/OverallESGMetric'
 *               version:
 *                 type: integer
 *               import_source:
 *                 type: string
 *               data_period_start:
 *                 type: string
 *               data_period_end:
 *                 type: string
 *               original_source:
 *                 type: string
 *     responses:
 *       201:
 *         description: Record created successfully
 */
router.post(
  "/company/:companyId/records",
  authenticate,
  esgController.createRecord,
);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/export:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Export overall ESG data as CSV file
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No overall ESG data found
 */
router.get("/company/:companyId/export", authenticate, esgController.exportCSV);

/**
 * @swagger
 * /api/v1/esg/company/{companyId}/data-type/{dataType}:
 *   get:
 *     tags: [Overall ESG Score]
 *     summary: Get metrics filtered by data type (yearly_series, single_value, list, summary)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: dataType
 *         required: true
 *         schema:
 *           type: string
 *           enum: [yearly_series, single_value, list, summary]
 *         description: Data type to filter
 *     responses:
 *       200:
 *         description: Metrics of the specified data type
 *       404:
 *         description: No data found
 */
router.get(
  "/company/:companyId/data-type/:dataType",
  authenticate,
  esgController.getMetricsByDataType,
);

module.exports = router;
