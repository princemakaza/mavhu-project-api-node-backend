const express = require("express");
const router = express.Router();

const esgDataController = require("../controllers/esg_data_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");

/**
 * @swagger
 * tags:
 *   - name: ESG Data
 *     description: ESG (Environmental, Social, Governance) data management
 *
 * components:
 *   schemas:
 *     MetricValue:
 *       type: object
 *       required: [year, value]
 *       properties:
 *         year:
 *           type: integer
 *           example: 2024
 *         value:
 *           type: mixed
 *           example: 50000
 *         numeric_value:
 *           type: number
 *           example: 50000
 *         source_notes:
 *           type: string
 *           example: "HVE Integrated Report 2025; p.43"
 *
 *     ESGItem:
 *       type: object
 *       required: [category, metric_name, values]
 *       properties:
 *         category:
 *           type: string
 *           enum: [environmental, social, governance]
 *           example: environmental
 *         metric_name:
 *           type: string
 *           example: "Carbon Emissions (Total GHG, tCO2e)"
 *         unit:
 *           type: string
 *           example: "tCO2e"
 *         description:
 *           type: string
 *           example: "Total greenhouse gas emissions"
 *         values:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/MetricValue'
 *
 *     ESGDataCreateRequest:
 *       type: object
 *       required: [company, metrics]
 *       properties:
 *         company:
 *           type: string
 *           example: "665a8c7be4f1c23b04d12345"
 *         reporting_period_start:
 *           type: integer
 *           example: 2022
 *         reporting_period_end:
 *           type: integer
 *           example: 2025
 *         data_source:
 *           type: string
 *           example: "HVE Integrated Report 2025"
 *         source_file_name:
 *           type: string
 *           example: "ESG_Metrics_Hippo_Valley_Tongaat_2022-2025.xlsx"
 *         source_file_type:
 *           type: string
 *           enum: [csv, excel, json, manual, api]
 *           example: excel
 *         import_notes:
 *           type: string
 *           example: "Imported from annual sustainability report"
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ESGItem'
 *
 *     ESGDataBulkRequest:
 *       type: object
 *       required: [data]
 *       properties:
 *         data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ESGDataCreateRequest'
 *         fileName:
 *           type: string
 *           example: "esg_bulk_import.json"
 *         fileType:
 *           type: string
 *           enum: [csv, excel, json]
 *           example: json
 *         importNotes:
 *           type: string
 *           example: "Bulk import from sustainability reports"
 *
 *     ESGDataUpdateRequest:
 *       type: object
 *       properties:
 *         reporting_period_start:
 *           type: integer
 *           example: 2022
 *         reporting_period_end:
 *           type: integer
 *           example: 2025
 *         data_source:
 *           type: string
 *           example: "Updated report 2025"
 *         metrics:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ESGItem'
 *
 *     ESGDataVerificationRequest:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [unverified, pending, verified, audited]
 *           example: verified
 *         data_quality_score:
 *           type: number
 *           minimum: 0
 *           maximum: 100
 *           example: 85
 *         notes:
 *           type: string
 *           example: "Data verified by sustainability team"
 */

/**
 * @swagger
 * /api/v1/esg-data/upload:
 *   post:
 *     tags: [ESG Data]
 *     summary: Upload ESG data file (CSV/Excel/JSON)
 *     description: Upload a file containing ESG metrics data for processing and import
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - file
 *               - companyId
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: ESG data file (CSV, Excel, or JSON)
 *               companyId:
 *                 type: string
 *                 example: "665a8c7be4f1c23b04d12345"
 *                 description: ID of the company this data belongs to
 *               importNotes:
 *                 type: string
 *                 example: "Uploaded from sustainability report 2025"
 *     responses:
 *       201:
 *         description: File uploaded and processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 fileName:
 *                   type: string
 *                 fileType:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 batchId:
 *                   type: string
 *                 success:
 *                   type: boolean
 *       400:
 *         description: Invalid file or missing required fields
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: File processing error
 */
router.post("/upload", authenticate, esgDataController.uploadESGDataFile);

/**
 * @swagger
 * /api/v1/esg-data/company/{companyId}/year/{year}/category/{category}:
 *   get:
 *     tags: [ESG Data]
 *     summary: Get ESG data by company, year, and category
 *     description: Retrieve ESG data filtered by company ID, specific year, and category (environmental, social, or governance)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the company
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           minimum: 2000
 *           maximum: 2100
 *         description: Year to filter data by (e.g., 2024)
 *       - in: path
 *         name: category
 *         required: true
 *         schema:
 *           type: string
 *           enum: [environmental, social, governance]
 *         description: ESG category to filter by
 *     responses:
 *       200:
 *         description: ESG data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 count:
 *                   type: integer
 *                 filter:
 *                   type: object
 *                   properties:
 *                     company:
 *                       type: string
 *                     year:
 *                       type: integer
 *                     category:
 *                       type: string
 *                 versions:
 *                   type: object
 *                   properties:
 *                     api_version:
 *                       type: string
 *                     calculation_version:
 *                       type: string
 *                     gee_adapter_version:
 *                       type: string
 *                 esgData:
 *                   type: array
 *                   items:
 *                     type: object
 *       400:
 *         description: Invalid parameters
 *       404:
 *         description: Company not found or no data available
 */
router.get(
  "/company/:companyId/year/:year/category/:category",
  authenticate,
  esgDataController.getESGDataByCompanyYearAndCategory,
);

/**
 * @swagger
 * /api/v1/esg-data:
 *   post:
 *     tags: [ESG Data]
 *     summary: Create new ESG data (manual entry)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ESGDataCreateRequest'
 *     responses:
 *       201:
 *         description: ESG data created successfully
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post("/", authenticate, esgDataController.createESGData);

/**
 * @swagger
 * /api/v1/esg-data/bulk:
 *   post:
 *     tags: [ESG Data]
 *     summary: Create bulk ESG data from file (CSV/Excel/JSON)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ESGDataBulkRequest'
 *     responses:
 *       201:
 *         description: ESG data imported successfully
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Unauthorized
 */
router.post("/bulk", authenticate, esgDataController.createBulkESGData);

/**
 * @swagger
 * /api/v1/esg-data/validate-import:
 *   post:
 *     tags: [ESG Data]
 *     summary: Validate import data without saving
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               data:
 *                 type: array
 *                 items: {}
 *               fileType:
 *                 type: string
 *     responses:
 *       200:
 *         description: Validation completed
 *       400:
 *         description: Invalid data
 */
router.post(
  "/validate-import",
  authenticate,
  esgDataController.validateImportData,
);

/**
 * @swagger
 * /api/v1/esg-data/{id}:
 *   get:
 *     tags: [ESG Data]
 *     summary: Get ESG data by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: ESG data retrieved
 *       404:
 *         description: ESG data not found
 */
router.get("/:id", authenticate, esgDataController.getESGDataById);

/**
 * @swagger
 * /api/v1/esg-data/company/{companyId}:
 *   get:
 *     tags: [ESG Data]
 *     summary: Get all ESG data for a company
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
 *         description: ESG data retrieved
 *       404:
 *         description: Company not found
 */
router.get(
  "/company/:companyId",
  authenticate,
  esgDataController.getESGDataByCompany,
);

/**
 * @swagger
 * /api/v1/esg-data/company/{companyId}/year/{year}:
 *   get:
 *     tags: [ESG Data]
 *     summary: Get ESG data for a company by specific year
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: ESG data retrieved
 *       400:
 *         description: Invalid year
 */
router.get(
  "/company/:companyId/year/:year",
  authenticate,
  esgDataController.getESGDataByCompanyAndYear,
);

/**
 * @swagger
 * /api/v1/esg-data/company/{companyId}/category/{category}:
 *   get:
 *     tags: [ESG Data]
 *     summary: Get ESG data for a company by category
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
 *           enum: [environmental, social, governance]
 *     responses:
 *       200:
 *         description: ESG data retrieved
 *       400:
 *         description: Invalid category
 */
router.get(
  "/company/:companyId/category/:category",
  authenticate,
  esgDataController.getESGDataByCompanyAndCategory,
);

/**
 * @swagger
 * /api/v1/esg-data/{id}:
 *   patch:
 *     tags: [ESG Data]
 *     summary: Update ESG data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ESGDataUpdateRequest'
 *     responses:
 *       200:
 *         description: ESG data updated
 *       404:
 *         description: ESG data not found
 */
router.patch("/:id", authenticate, esgDataController.updateESGData);

/**
 * @swagger
 * /api/v1/esg-data/{id}/verify:
 *   patch:
 *     tags: [ESG Data]
 *     summary: Verify ESG data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ESGDataVerificationRequest'
 *     responses:
 *       200:
 *         description: ESG data verified
 *       404:
 *         description: ESG data not found
 */
router.patch(
  "/:id/verify",
  authenticate,
  requireOwner,
  esgDataController.verifyESGData,
);

/**
 * @swagger
 * /api/v1/esg-data/{id}:
 *   delete:
 *     tags: [ESG Data]
 *     summary: Delete ESG data (soft delete)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: ESG data deleted
 *       404:
 *         description: ESG data not found
 */
router.delete("/:id", authenticate, esgDataController.deleteESGData);

/**
 * @swagger
 * /api/v1/esg-data/stats:
 *   get:
 *     tags: [ESG Data]
 *     summary: Get ESG data statistics
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved
 */
router.get(
  "/stats",
  authenticate,
  requireOwner,
  esgDataController.getESGDataStats,
);

module.exports = router;
