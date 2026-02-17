const express = require("express");
const router = express.Router();

const communityController = require("../controllers/community_engagement_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");
const upload = require("../middlewares/uploadMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Community Engagement
 *     description: Management of community development initiatives, social welfare programs, and environmental efforts
 *
 * components:
 *   schemas:
 *     CommunityMetric:
 *       type: object
 *       required: [metric_name, category, data_type]
 *       properties:
 *         _id:
 *           type: string
 *         category:
 *           type: string
 *           enum: [community_initiatives, social_welfare, environmental_efforts, forecast, risk]
 *           example: "community_initiatives"
 *         subcategory:
 *           type: string
 *           example: "healthcare"
 *         metric_name:
 *           type: string
 *           example: "Community Development Initiatives"
 *         data_type:
 *           type: string
 *           enum: [yearly_series, single_value, list, summary]
 *           example: "list"
 *         list_data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               initiative:
 *                 type: string
 *               description:
 *                 type: string
 *               beneficiaries:
 *                 type: string
 *               item:
 *                 type: string
 *               details:
 *                 type: string
 *         single_value:
 *           type: object
 *           properties:
 *             value:
 *               type: mixed
 *             numeric_value:
 *               type: number
 *             unit:
 *               type: string
 *             source:
 *               type: string
 *         is_active:
 *           type: boolean
 *           default: true
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     CommunityRecord:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         company:
 *           type: string
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/CommunityMetric'
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
 *         list_data:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               initiative:
 *                 type: string
 *               description:
 *                 type: string
 *               beneficiaries:
 *                 type: string
 *               item:
 *                 type: string
 *               details:
 *                 type: string
 *         single_value:
 *           type: object
 *           properties:
 *             value:
 *               type: mixed
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
 * /api/v1/community/company/{companyId}/import-file:
 *   post:
 *     tags: [Community Engagement]
 *     summary: Import community engagement data from file (CSV/Excel/JSON)
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
 *                 example: "2025"
 *               data_period_end:
 *                 type: string
 *                 example: "2025"
 *               original_source:
 *                 type: string
 *                 example: "Community Engagement Report 2025"
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
  communityController.importFile,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/import-json:
 *   post:
 *     tags: [Community Engagement]
 *     summary: Import community engagement data from JSON payload
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
 *                 description: JSON object conforming to CommunityRecord structure (must contain metrics array)
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
  communityController.importJSON,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/records:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Get all community engagement records for a company (active by default)
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
 *         description: List of community engagement records
 */
router.get(
  "/company/:companyId/records",
  authenticate,
  communityController.getCompanyRecords,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/records/{recordId}:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Get a specific community engagement record by ID
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
  communityController.getRecordById,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/category/{category}:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Get metrics by category (e.g., community_initiatives, social_welfare)
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
 *           enum: [community_initiatives, social_welfare, environmental_efforts, forecast, risk]
 *         description: Metric category
 *       - in: query
 *         name: subcategory
 *         schema:
 *           type: string
 *         description: Optional subcategory filter (e.g., 'healthcare')
 *     responses:
 *       200:
 *         description: List of metrics in the category
 *       404:
 *         description: No metrics found for category
 */
router.get(
  "/company/:companyId/category/:category",
  authenticate,
  communityController.getMetricsByCategory,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/metric/{metricName}/timeseries:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Get time series data for a specific metric (if applicable)
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
 *         description: Exact metric name (e.g., "Community Development Initiatives")
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Optional category to disambiguate metric names
 *     responses:
 *       200:
 *         description: Time series data points (may be empty for list metrics)
 *       404:
 *         description: No time series data found
 */
router.get(
  "/company/:companyId/metric/:metricName/timeseries",
  authenticate,
  communityController.getTimeSeriesData,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/metrics:
 *   post:
 *     tags: [Community Engagement]
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
  communityController.upsertMetric,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/metrics/bulk:
 *   post:
 *     tags: [Community Engagement]
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
  communityController.bulkUpdateMetrics,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/metrics/{metricId}:
 *   delete:
 *     tags: [Community Engagement]
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
  communityController.deleteMetric,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/summary:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Get summary statistics for the company's community engagement data
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
 *         description: No community engagement data found
 */
router.get(
  "/company/:companyId/summary",
  authenticate,
  communityController.getSummaryStats,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/validate:
 *   post:
 *     tags: [Community Engagement]
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
  communityController.validateData,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/verification:
 *   patch:
 *     tags: [Community Engagement]
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
  communityController.updateVerificationStatus,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/versions:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Get all historical versions of community engagement data for a company
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
  communityController.getDataVersions,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/versions/{versionId}/restore:
 *   post:
 *     tags: [Community Engagement]
 *     summary: Restore a previous version of community engagement data
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
  communityController.restoreVersion,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/records:
 *   post:
 *     tags: [Community Engagement]
 *     summary: Manually create a new community engagement record (full replacement)
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
 *                   $ref: '#/components/schemas/CommunityMetric'
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
  communityController.createRecord,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/export:
 *   get:
 *     tags: [Community Engagement]
 *     summary: Export community engagement data as CSV file
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
 *         description: No community engagement data found
 */
router.get(
  "/company/:companyId/export",
  authenticate,
  communityController.exportCSV,
);

/**
 * @swagger
 * /api/v1/community/company/{companyId}/data-type/{dataType}:
 *   get:
 *     tags: [Community Engagement]
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
  communityController.getMetricsByDataType,
);

module.exports = router;
