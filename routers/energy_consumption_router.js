const express = require("express");
const router = express.Router();

const energyController = require("../controllers/energy_consumption_data_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");
const upload = require("../middlewares/uploadMiddleware");

/**
 * @swagger
 * tags:
 *   - name: Energy Consumption & Renewables
 *     description: Management of energy usage, generation, and renewable infrastructure data
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
 *           example: 96360
 *         numeric_value:
 *           type: number
 *           example: 96360
 *         unit:
 *           type: string
 *           example: "kWh"
 *         source:
 *           type: string
 *         notes:
 *           type: string
 *
 *     EnergyMetric:
 *       type: object
 *       required: [metric_name, category, data_type]
 *       properties:
 *         _id:
 *           type: string
 *         category:
 *           type: string
 *           enum: [bagasse_usage, coal_consumption, electricity_generated, electricity_purchased, electricity_exported, solar_power_usage, fuel_consumption, solar_infrastructure, year_over_year_change, forecast, risk]
 *           example: "bagasse_usage"
 *         subcategory:
 *           type: string
 *           example: "inside_company_diesel"
 *         metric_name:
 *           type: string
 *           example: "Bagasse Usage"
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
 *         is_active:
 *           type: boolean
 *           default: true
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     EnergyRecord:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         company:
 *           type: string
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/EnergyMetric'
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
 * /api/v1/energy/company/{companyId}/import-file:
 *   post:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Import energy data from file (CSV/Excel/JSON)
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
 *                 example: "Energy Consumption Report 2025"
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
  energyController.importFile,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/import-json:
 *   post:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Import energy data from JSON payload
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
 *                 description: JSON object conforming to EnergyRecord structure (must contain metrics array)
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
  energyController.importJSON,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/records:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Get all energy records for a company (active by default)
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
 *         description: List of energy records
 */
router.get(
  "/company/:companyId/records",
  authenticate,
  energyController.getCompanyRecords,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/records/{recordId}:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Get a specific energy record by ID
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
  energyController.getRecordById,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/category/{category}:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Get metrics by category (e.g., bagasse_usage, fuel_consumption)
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
 *           enum: [bagasse_usage, coal_consumption, electricity_generated, electricity_purchased, electricity_exported, solar_power_usage, fuel_consumption, solar_infrastructure, year_over_year_change, forecast, risk]
 *         description: Metric category
 *       - in: query
 *         name: subcategory
 *         schema:
 *           type: string
 *         description: Optional subcategory filter (e.g., 'inside_company_diesel')
 *     responses:
 *       200:
 *         description: List of metrics in the category
 *       404:
 *         description: No metrics found for category
 */
router.get(
  "/company/:companyId/category/:category",
  authenticate,
  energyController.getMetricsByCategory,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/metric/{metricName}/timeseries:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Get time series data for a specific metric
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
 *         description: Exact metric name (e.g., "Bagasse Usage")
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
  energyController.getTimeSeriesData,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/metrics:
 *   post:
 *     tags: [Energy Consumption & Renewables]
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
  energyController.upsertMetric,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/metrics/bulk:
 *   post:
 *     tags: [Energy Consumption & Renewables]
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
  energyController.bulkUpdateMetrics,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/metrics/{metricId}:
 *   delete:
 *     tags: [Energy Consumption & Renewables]
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
  energyController.deleteMetric,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/summary:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Get summary statistics for the company's energy data
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
 *         description: No energy data found
 */
router.get(
  "/company/:companyId/summary",
  authenticate,
  energyController.getSummaryStats,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/validate:
 *   post:
 *     tags: [Energy Consumption & Renewables]
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
  energyController.validateData,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/verification:
 *   patch:
 *     tags: [Energy Consumption & Renewables]
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
  energyController.updateVerificationStatus,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/versions:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Get all historical versions of energy data for a company
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
  energyController.getDataVersions,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/versions/{versionId}/restore:
 *   post:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Restore a previous version of energy data
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
  energyController.restoreVersion,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/records:
 *   post:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Manually create a new energy record (full replacement)
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
 *                   $ref: '#/components/schemas/EnergyMetric'
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
  energyController.createRecord,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/export:
 *   get:
 *     tags: [Energy Consumption & Renewables]
 *     summary: Export energy data as CSV file
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
 *         description: No energy data found
 */
router.get(
  "/company/:companyId/export",
  authenticate,
  energyController.exportCSV,
);

/**
 * @swagger
 * /api/v1/energy/company/{companyId}/data-type/{dataType}:
 *   get:
 *     tags: [Energy Consumption & Renewables]
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
  energyController.getMetricsByDataType,
);

module.exports = router;
