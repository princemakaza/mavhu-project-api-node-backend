// File: routes/biodiversity_landuse_router.js
const express = require("express");
const router = express.Router();

const biodiversityLandUseController = require("../controllers/biodiversity_data_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");
const upload = require("../middlewares/uploadMiddleware"); // Assumed multer config for file uploads

/**
 * @swagger
 * tags:
 *   - name: Biodiversity & Land Use
 *     description: Biodiversity inventory, land use, restoration, and conservation data management
 *
 * components:
 *   schemas:
 *     YearlyValue:
 *       type: object
 *       required: [year, value]
 *       properties:
 *         year:
 *           type: string
 *           example: "FY24"
 *         value:
 *           type: mixed
 *           example: 12500
 *         numeric_value:
 *           type: number
 *           example: 12500
 *         unit:
 *           type: string
 *           example: "ha"
 *         source:
 *           type: string
 *           example: "CSV Import"
 *         notes:
 *           type: string
 *
 *     SingleValue:
 *       type: object
 *       required: [value]
 *       properties:
 *         value:
 *           type: mixed
 *           example: 450
 *         numeric_value:
 *           type: number
 *           example: 450
 *         unit:
 *           type: string
 *           example: "ha"
 *         source:
 *           type: string
 *         notes:
 *           type: string
 *
 *     ListItem:
 *       type: object
 *       properties:
 *         item:
 *           type: string
 *           example: "Mammal species identified"
 *         count:
 *           type: integer
 *           example: 34
 *         details:
 *           type: string
 *         source:
 *           type: string
 *
 *     BiodiversityMetric:
 *       type: object
 *       required: [metric_name, category, data_type]
 *       properties:
 *         _id:
 *           type: string
 *         category:
 *           type: string
 *           enum: [agricultural_land, conservation_protected_habitat, land_tenure, restoration_deforestation, fuelwood_substitution, biodiversity_flora, biodiversity_fauna, human_wildlife_conflict, summary]
 *           example: "agricultural_land"
 *         subcategory:
 *           type: string
 *           example: "cane"
 *         metric_name:
 *           type: string
 *           example: "Area Under Cane"
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
 *             $ref: '#/components/schemas/ListItem'
 *         is_active:
 *           type: boolean
 *           default: true
 *         created_by:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *
 *     BiodiversityRecord:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *         company:
 *           type: string
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/BiodiversityMetric'
 *         version:
 *           type: integer
 *           example: 1
 *         previous_version:
 *           type: string
 *         is_active:
 *           type: boolean
 *           default: true
 *         import_source:
 *           type: string
 *           enum: [csv, excel, json, file, manual]
 *         source_file_name:
 *           type: string
 *         import_batch_id:
 *           type: string
 *         import_date:
 *           type: string
 *           format: date-time
 *         data_period_start:
 *           type: string
 *           example: "FY22"
 *         data_period_end:
 *           type: string
 *           example: "FY25"
 *         original_source:
 *           type: string
 *         verification_status:
 *           type: string
 *           enum: [unverified, pending, verified, audited]
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
 *           enum: [not_validated, validated, failed_validation]
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
 *     ImportMetadata:
 *       type: object
 *       properties:
 *         data_period_start:
 *           type: string
 *         data_period_end:
 *           type: string
 *         original_source:
 *           type: string
 *         source:
 *           type: string
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
 *             $ref: '#/components/schemas/ListItem'
 *         is_active:
 *           type: boolean
 *
 *     BulkUpdateRequest:
 *       type: object
 *       required: [metrics]
 *       properties:
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/UpsertMetricRequest'
 *
 *     VerificationRequest:
 *       type: object
 *       required: [status]
 *       properties:
 *         status:
 *           type: string
 *           enum: [unverified, pending, verified, audited]
 *         notes:
 *           type: string
 */

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/import-file:
 *   post:
 *     tags: [Biodiversity & Land Use]
 *     summary: Import biodiversity/land use data from file (CSV/Excel/JSON)
 *     description: Upload a file containing biodiversity metrics (area, restoration, species, etc.) and import into the system
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
 *                 example: "FY22"
 *               data_period_end:
 *                 type: string
 *                 example: "FY25"
 *               original_source:
 *                 type: string
 *                 example: "Annual Sustainability Report 2025"
 *               source:
 *                 type: string
 *                 example: "CSV Import"
 *     responses:
 *       201:
 *         description: File imported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     record_id:
 *                       type: string
 *                     version:
 *                       type: integer
 *                     import_date:
 *                       type: string
 *                     import_source:
 *                       type: string
 *                     metrics_count:
 *                       type: integer
 *                     summary_stats:
 *                       type: object
 *       400:
 *         description: No file provided or unsupported file type
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/company/:companyId/import-file",
  authenticate,
  upload.single("file"), // Assumes multer middleware configured to handle single file
  biodiversityLandUseController.importFile,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/import-json:
 *   post:
 *     tags: [Biodiversity & Land Use]
 *     summary: Import biodiversity data from JSON payload (manual or API)
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
 *                 description: JSON object conforming to BiodiversityRecord structure (must contain metrics array)
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
  biodiversityLandUseController.importJSON,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/records:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Get all biodiversity records for a company (active by default)
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
 *         description: List of biodiversity records
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BiodiversityRecord'
 */
router.get(
  "/company/:companyId/records",
  authenticate,
  biodiversityLandUseController.getCompanyRecords,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/records/{recordId}:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Get a specific biodiversity record by ID
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/BiodiversityRecord'
 *       404:
 *         description: Record not found
 */
router.get(
  "/company/:companyId/records/:recordId",
  authenticate,
  biodiversityLandUseController.getRecordById,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/category/{category}:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Get metrics by category (e.g., agricultural_land, biodiversity_fauna)
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
 *         description: Metric category (from predefined enum)
 *       - in: query
 *         name: subcategory
 *         schema:
 *           type: string
 *         description: Optional subcategory filter (e.g., 'cane', 'orchards')
 *     responses:
 *       200:
 *         description: List of metrics in the category
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 category:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BiodiversityMetric'
 *       404:
 *         description: No metrics found for category
 */
router.get(
  "/company/:companyId/category/:category",
  authenticate,
  biodiversityLandUseController.getMetricsByCategory,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/metric/{metricName}/timeseries:
 *   get:
 *     tags: [Biodiversity & Land Use]
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
 *         description: Exact metric name (e.g., "Area Under Cane")
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *         description: Optional category to disambiguate metric names
 *     responses:
 *       200:
 *         description: Time series data points
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 metric_name:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/YearlyValue'
 *       404:
 *         description: No time series data found
 */
router.get(
  "/company/:companyId/metric/:metricName/timeseries",
  authenticate,
  biodiversityLandUseController.getTimeSeriesData,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/metrics:
 *   post:
 *     tags: [Biodiversity & Land Use]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BiodiversityRecord'
 */
router.post(
  "/company/:companyId/metrics",
  authenticate,
  biodiversityLandUseController.upsertMetric,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/metrics/bulk:
 *   post:
 *     tags: [Biodiversity & Land Use]
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
 *             $ref: '#/components/schemas/BulkUpdateRequest'
 *     responses:
 *       200:
 *         description: Bulk update results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       metric_name:
 *                         type: string
 *                       success:
 *                         type: boolean
 *                       record_id:
 *                         type: string
 *                       error:
 *                         type: string
 */
router.post(
  "/company/:companyId/metrics/bulk",
  authenticate,
  biodiversityLandUseController.bulkUpdateMetrics,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/metrics/{metricId}:
 *   delete:
 *     tags: [Biodiversity & Land Use]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     record_id:
 *                       type: string
 *                     metric_id:
 *                       type: string
 *       404:
 *         description: Metric not found
 */
router.delete(
  "/company/:companyId/metrics/:metricId",
  authenticate,
  biodiversityLandUseController.deleteMetric,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/summary:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Get summary statistics for the company's biodiversity data
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary_stats:
 *                       type: object
 *                     data_period_start:
 *                       type: string
 *                     data_period_end:
 *                       type: string
 *                     last_updated:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: No biodiversity data found
 */
router.get(
  "/company/:companyId/summary",
  authenticate,
  biodiversityLandUseController.getSummaryStats,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/validate:
 *   post:
 *     tags: [Biodiversity & Land Use]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     validation_status:
 *                       type: string
 *                     data_quality_score:
 *                       type: number
 *                     error_count:
 *                       type: integer
 *                     errors:
 *                       type: array
 *                     has_critical_errors:
 *                       type: boolean
 */
router.post(
  "/company/:companyId/validate",
  authenticate,
  biodiversityLandUseController.validateData,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/verification:
 *   patch:
 *     tags: [Biodiversity & Land Use]
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     record_id:
 *                       type: string
 *                     verification_status:
 *                       type: string
 *                     verified_by:
 *                       type: string
 *                     verified_at:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Record not found
 */
router.patch(
  "/company/:companyId/verification",
  authenticate,
  requireOwner, // Verification should be restricted to owner/verifier role
  biodiversityLandUseController.updateVerificationStatus,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/versions:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Get all historical versions of biodiversity data for a company
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       _id:
 *                         type: string
 *                       version:
 *                         type: integer
 *                       created_at:
 *                         type: string
 *                       created_by:
 *                         type: object
 *                       verification_status:
 *                         type: string
 *                       data_period_start:
 *                         type: string
 *                       data_period_end:
 *                         type: string
 */
router.get(
  "/company/:companyId/versions",
  authenticate,
  biodiversityLandUseController.getDataVersions,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/versions/{versionId}/restore:
 *   post:
 *     tags: [Biodiversity & Land Use]
 *     summary: Restore a previous version of biodiversity data
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     new_record_id:
 *                       type: string
 *                     version:
 *                       type: integer
 *                     restored_from:
 *                       type: string
 *                     restore_date:
 *                       type: string
 *                       format: date-time
 *       404:
 *         description: Version not found or belongs to different company
 */
router.post(
  "/company/:companyId/versions/:versionId/restore",
  authenticate,
  requireOwner, // Restoring a version is an administrative action
  biodiversityLandUseController.restoreVersion,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/records:
 *   post:
 *     tags: [Biodiversity & Land Use]
 *     summary: Manually create a new biodiversity record (full replacement)
 *     description: Create a new record with full metrics array. Typically used for manual entry.
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
 *             required: [metrics, version]
 *             properties:
 *               metrics:
 *                 type: array
 *                 items:
 *                   $ref: '#/components/schemas/BiodiversityMetric'
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   $ref: '#/components/schemas/BiodiversityRecord'
 */
router.post(
  "/company/:companyId/records",
  authenticate,
  biodiversityLandUseController.createRecord,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/export:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Export biodiversity data as CSV file
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, json, excel]
 *           default: csv
 *         description: Export format (only CSV is currently implemented in controller)
 *     responses:
 *       200:
 *         description: CSV file download
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *       404:
 *         description: No biodiversity data found
 */
router.get(
  "/company/:companyId/export",
  authenticate,
  biodiversityLandUseController.exportCSV,
);

/**
 * @swagger
 * /api/v1/biodiversity-landuse/company/{companyId}/data-type/{dataType}:
 *   get:
 *     tags: [Biodiversity & Land Use]
 *     summary: Get metrics filtered by data type (yearly_series, single_value, list)
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data_type:
 *                   type: string
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/BiodiversityMetric'
 *       404:
 *         description: No data found
 */
router.get(
  "/company/:companyId/data-type/:dataType",
  authenticate,
  biodiversityLandUseController.getMetricsByDataType,
);

module.exports = router;
