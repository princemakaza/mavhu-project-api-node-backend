// File: routes/carbonEmission.routes.js
const express = require("express");
const router = express.Router();
const carbonEmissionController = require("../controllers/carbon_emission_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");
const upload = require("../middlewares/uploadMiddleware");

/**
 * @swagger
 * tags:
 *   name: Carbon Emission Accounting
 *   description: Carbon emission and sequestration tracking and management
 */

/**
 * @swagger
 * components:
 *   schemas:
 *     CarbonEmissionCreateRequest:
 *       type: object
 *       required:
 *         - company
 *       properties:
 *         company:
 *           type: string
 *           description: Reference to Company document
 *         emission_references:
 *           type: object
 *           properties:
 *             methodology_statement:
 *               type: string
 *             emission_factors:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/EmissionReference'
 *             global_warming_potentials:
 *               type: object
 *               properties:
 *                 n2o_gwp:
 *                   type: number
 *                 ch4_gwp:
 *                   type: number
 *                 source:
 *                   type: string
 *             conversion_factors:
 *               type: object
 *               properties:
 *                 n2o_n_to_n2o:
 *                   type: number
 *                 carbon_to_co2:
 *                   type: number
 *                 carbon_fraction:
 *                   type: number
 *         framework:
 *           type: object
 *           properties:
 *             sequestration_methodology:
 *               type: string
 *             emission_methodology:
 *               type: string
 *             data_sources:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                   type:
 *                     type: string
 *                     enum: [satellite, ground_measurement, model, database]
 *                   description:
 *                     type: string
 *             calculation_approach:
 *               type: string
 *
 *     CarbonEmissionUpdateRequest:
 *       type: object
 *       properties:
 *         emission_references:
 *           type: object
 *         framework:
 *           type: object
 *         data_management:
 *           type: object
 *         status:
 *           type: string
 *           enum: [draft, under_review, approved, published, archived]
 *
 *     CarbonEmissionVerificationRequest:
 *       type: object
 *       properties:
 *         status:
 *           type: string
 *           enum: [draft, under_review, approved, published, archived]
 *         validation_status:
 *           type: string
 *           enum: [not_validated, validating, validated, errors]
 *         verification_notes:
 *           type: string
 *
 *     YearlyDataRequest:
 *       type: object
 *       required:
 *         - year
 *         - data
 *       properties:
 *         year:
 *           type: integer
 *         data:
 *           $ref: '#/components/schemas/YearlyCarbonData'
 *
 *     Scope1Request:
 *       type: object
 *       required:
 *         - sources
 *       properties:
 *         sources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Scope1Emission'
 *         total_tco2e_per_ha:
 *           type: number
 *         total_tco2e:
 *           type: number
 *
 *     Scope2Request:
 *       type: object
 *       required:
 *         - sources
 *       properties:
 *         sources:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Scope2Emission'
 *         total_tco2e_per_ha:
 *           type: number
 *         total_tco2e:
 *           type: number
 *
 *     Scope3Request:
 *       type: object
 *       required:
 *         - categories
 *       properties:
 *         categories:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/Scope3Emission'
 *         total_tco2e_per_ha:
 *           type: number
 *         total_tco2e:
 *           type: number
 *
 *     CarbonEmission:
 *       type: object
 *       required:
 *         - company
 *         - created_by
 *       properties:
 *         _id:
 *           type: string
 *           description: Auto-generated MongoDB ID
 *         company:
 *           type: string
 *           description: Reference to Company document
 *         emission_references:
 *           type: object
 *         yearly_data:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/YearlyCarbonData'
 *         summary:
 *           type: object
 *           properties:
 *             total_reporting_area_ha:
 *               type: number
 *             average_sequestration_tco2_per_year:
 *               type: number
 *             average_emissions_tco2e_per_year:
 *               type: number
 *             net_carbon_balance_tco2e:
 *               type: number
 *             carbon_intensity_tco2e_per_ha:
 *               type: number
 *             baseline_year:
 *               type: number
 *             current_year:
 *               type: number
 *         framework:
 *           type: object
 *         data_management:
 *           type: object
 *         status:
 *           type: string
 *           enum: [draft, under_review, approved, published, archived]
 *         is_active:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         created_by:
 *           type: string
 *         last_updated_at:
 *           type: string
 *           format: date-time
 *         last_updated_by:
 *           type: string
 *
 *     EmissionReference:
 *       type: object
 *       properties:
 *         source:
 *           type: string
 *         activity_data:
 *           type: string
 *         default_ef_start:
 *           type: string
 *         notes_source:
 *           type: string
 *         emission_factor_code:
 *           type: string
 *         emission_factor_value:
 *           type: number
 *         emission_factor_unit:
 *           type: string
 *         gwp_value:
 *           type: number
 *         gwp_source:
 *           type: string
 *         conversion_factor:
 *           type: number
 *         is_active:
 *           type: boolean
 *
 *     YearlyCarbonData:
 *       type: object
 *       required:
 *         - year
 *       properties:
 *         year:
 *           type: number
 *         sequestration:
 *           type: object
 *           properties:
 *             reporting_area_ha:
 *               type: number
 *             soc_area_ha:
 *               type: number
 *             monthly_data:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SequestrationMonthly'
 *             methodologies:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/SequestrationMethodology'
 *             annual_summary:
 *               type: object
 *               properties:
 *                 total_biomass_co2_t:
 *                   type: number
 *                 total_soc_co2_t:
 *                   type: number
 *                 net_co2_stock_t:
 *                   type: number
 *                 net_co2_change_t:
 *                   type: number
 *                 sequestration_total_tco2:
 *                   type: number
 *         emissions:
 *           type: object
 *           properties:
 *             scope1:
 *               type: object
 *               properties:
 *                 sources:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Scope1Emission'
 *                 total_tco2e_per_ha:
 *                   type: number
 *                 total_tco2e:
 *                   type: number
 *             scope2:
 *               type: object
 *               properties:
 *                 sources:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Scope2Emission'
 *                 total_tco2e_per_ha:
 *                   type: number
 *                 total_tco2e:
 *                   type: number
 *             scope3:
 *               type: object
 *               properties:
 *                 categories:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Scope3Emission'
 *                 total_tco2e_per_ha:
 *                   type: number
 *                 total_tco2e:
 *                   type: number
 *             total_scope_emission_tco2e_per_ha:
 *               type: number
 *             total_scope_emission_tco2e:
 *               type: number
 *             net_total_emission_tco2e:
 *               type: number
 *         data_quality:
 *           type: object
 *           properties:
 *             completeness_score:
 *               type: number
 *               minimum: 0
 *               maximum: 100
 *             verification_status:
 *               type: string
 *               enum: [unverified, pending, verified, audited]
 *             verified_by:
 *               type: string
 *             verified_at:
 *               type: string
 *               format: date-time
 *             verification_notes:
 *               type: string
 *
 *     SequestrationMonthly:
 *       type: object
 *       properties:
 *         month:
 *           type: string
 *         month_number:
 *           type: number
 *         year:
 *           type: number
 *         ndvi_max:
 *           type: number
 *         agb_t_per_ha:
 *           type: number
 *         bgb_t_per_ha:
 *           type: number
 *         biomass_c_t_per_ha:
 *           type: number
 *         biomass_co2_t_per_ha:
 *           type: number
 *         biomass_co2_total_t:
 *           type: number
 *         delta_biomass_co2_t:
 *           type: number
 *         soc_tc_per_ha:
 *           type: number
 *         soc_co2_t_per_ha:
 *           type: number
 *         soc_co2_total_t:
 *           type: number
 *         delta_soc_co2_t:
 *           type: number
 *         net_co2_stock_t:
 *           type: number
 *         net_co2_change_t:
 *           type: number
 *         meaning:
 *           type: string
 *         reporting_area_ha:
 *           type: number
 *         soc_area_ha:
 *           type: number
 *         is_baseline:
 *           type: boolean
 *
 *     SequestrationMethodology:
 *       type: object
 *       properties:
 *         component:
 *           type: string
 *         method_applied:
 *           type: string
 *         standard_source:
 *           type: string
 *         purpose:
 *           type: string
 *         parameters:
 *           type: object
 *
 *     Scope1Emission:
 *       type: object
 *       properties:
 *         source:
 *           type: string
 *         parameter:
 *           type: string
 *         unit:
 *           type: string
 *         annual_per_ha:
 *           type: number
 *         emission_factor:
 *           type: string
 *         ef_number:
 *           type: number
 *         gwp:
 *           type: number
 *         tco2e_per_ha_per_year:
 *           type: number
 *         methodological_justification:
 *           type: string
 *         reference:
 *           type: string
 *         calculation_notes:
 *           type: string
 *         is_active:
 *           type: boolean
 *
 *     Scope2Emission:
 *       type: object
 *       properties:
 *         source:
 *           type: string
 *         parameter:
 *           type: string
 *         unit:
 *           type: string
 *         annual_activity_per_ha:
 *           type: number
 *         emission_factor:
 *           type: string
 *         ef_number:
 *           type: number
 *         tco2e_per_ha_per_year:
 *           type: number
 *         methodological_justification:
 *           type: string
 *         reference:
 *           type: string
 *         calculation_notes:
 *           type: string
 *         is_active:
 *           type: boolean
 *
 *     Scope3Emission:
 *       type: object
 *       properties:
 *         category:
 *           type: string
 *         parameter:
 *           type: string
 *         unit:
 *           type: string
 *         annual_activity_per_ha:
 *           type: number
 *         emission_factor:
 *           type: string
 *         ef_number:
 *           type: number
 *         tco2e_per_ha_per_year:
 *           type: number
 *         methodological_justification:
 *           type: string
 *         reference:
 *           type: string
 *         calculation_notes:
 *           type: string
 *         is_active:
 *           type: boolean
 *
 *     UploadResponse:
 *       type: object
 *       properties:
 *         success:
 *           type: boolean
 *         message:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             batchId:
 *               type: string
 *             fileName:
 *               type: string
 *             fileType:
 *               type: string
 *             recordsProcessed:
 *               type: number
 *             carbonEmissionId:
 *               type: string
 *             year:
 *               type: string
 *
 *     StatsResponse:
 *       type: object
 *       properties:
 *         totalRecords:
 *           type: number
 *         totalCompanies:
 *           type: number
 *         statusCounts:
 *           type: object
 *           additionalProperties:
 *             type: number
 *         averageYearsCovered:
 *           type: number
 *
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * @swagger
 * /api/v1/carbon-emission/upload:
 *   post:
 *     tags: [Carbon Emission Accounting]
 *     summary: Upload carbon emission data file (CSV/Excel/JSON)
 *     description: Upload a file containing carbon emission and sequestration data for processing and import
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
 *                 description: Carbon emission data file (CSV, Excel, or JSON)
 *               companyId:
 *                 type: string
 *                 example: "665a8c7be4f1c23b04d12345"
 *                 description: ID of the company this data belongs to
 *               year:
 *                 type: integer
 *                 example: 2024
 *                 description: Year for the data (if not specified in file)
 *               importNotes:
 *                 type: string
 *                 example: "Uploaded from sustainability report 2025"
 *     responses:
 *       201:
 *         description: File uploaded and processed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/UploadResponse'
 *       400:
 *         description: No file uploaded or invalid request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post(
  "/upload",
  authenticate,
  carbonEmissionController.uploadCarbonEmissionFile,
);

/**
 * @swagger
 * /api/v1/carbon-emission:
 *   post:
 *     tags: [Carbon Emission Accounting]
 *     summary: Create new carbon emission accounting record (manual entry)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CarbonEmissionCreateRequest'
 *     responses:
 *       201:
 *         description: Carbon emission accounting record created successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Validation error or bad request
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Carbon emission accounting already exists for this company
 *       500:
 *         description: Internal server error
 */
router.post("/", authenticate, carbonEmissionController.createCarbonEmission);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}:
 *   get:
 *     tags: [Carbon Emission Accounting]
 *     summary: Get carbon emission accounting by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *       - in: query
 *         name: populate
 *         schema:
 *           type: string
 *         description: Comma-separated fields to populate (e.g., "company,created_by")
 *     responses:
 *       200:
 *         description: Carbon emission accounting record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id",
  authenticate,
  carbonEmissionController.getCarbonEmissionById,
);

/**
 * @swagger
 * /api/v1/carbon-emission/company/{companyId}:
 *   get:
 *     tags: [Carbon Emission Accounting]
 *     summary: Get carbon emission accounting by company ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *       - in: query
 *         name: populate
 *         schema:
 *           type: string
 *         description: Comma-separated fields to populate
 *     responses:
 *       200:
 *         description: Carbon emission accounting record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting not found for this company
 *       500:
 *         description: Internal server error
 */
router.get(
  "/company/:companyId",
  authenticate,
  carbonEmissionController.getCarbonEmissionByCompany,
);

/**
 * @swagger
 * /api/v1/carbon-emission/company/{companyId}/year/{year}:
 *   get:
 *     tags: [Carbon Emission Accounting]
 *     summary: Get carbon emission data by company and year
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: Company ID
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year (e.g., 2023)
 *     responses:
 *       200:
 *         description: Carbon emission data for specified year retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/YearlyCarbonData'
 *       400:
 *         description: Invalid year provided
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission data not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/company/:companyId/year/:year",
  authenticate,
  carbonEmissionController.getCarbonEmissionByCompanyAndYear,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}/yearly:
 *   post:
 *     tags: [Carbon Emission Accounting]
 *     summary: Add yearly carbon emission data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/YearlyDataRequest'
 *     responses:
 *       201:
 *         description: Yearly data added successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Year and data are required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record not found
 *       409:
 *         description: Year already exists
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/yearly",
  authenticate,
  carbonEmissionController.addYearlyData,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}/yearly/{year}:
 *   patch:
 *     tags: [Carbon Emission Accounting]
 *     summary: Update yearly carbon emission data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year to update
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             description: Update data for the yearly record
 *     responses:
 *       200:
 *         description: Yearly data updated successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Update data is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record or year not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/:id/yearly/:year",
  authenticate,
  carbonEmissionController.updateYearlyData,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}/year/{year}/scope1:
 *   post:
 *     tags: [Carbon Emission Accounting]
 *     summary: Add or update scope 1 emissions for a specific year
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year for the emissions data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Scope1Request'
 *     responses:
 *       201:
 *         description: Scope 1 emissions added successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Scope 1 emissions data with sources is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record or year not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/year/:year/scope1",
  authenticate,
  carbonEmissionController.addScope1Emissions,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}/year/{year}/scope2:
 *   post:
 *     tags: [Carbon Emission Accounting]
 *     summary: Add or update scope 2 emissions for a specific year
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year for the emissions data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Scope2Request'
 *     responses:
 *       201:
 *         description: Scope 2 emissions added successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Scope 2 emissions data with sources is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record or year not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/year/:year/scope2",
  authenticate,
  carbonEmissionController.addScope2Emissions,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}/year/{year}/scope3:
 *   post:
 *     tags: [Carbon Emission Accounting]
 *     summary: Add or update scope 3 emissions for a specific year
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *         description: Year for the emissions data
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Scope3Request'
 *     responses:
 *       201:
 *         description: Scope 3 emissions added successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Scope 3 emissions data with categories is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record or year not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/year/:year/scope3",
  authenticate,
  carbonEmissionController.addScope3Emissions,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}:
 *   patch:
 *     tags: [Carbon Emission Accounting]
 *     summary: Update carbon emission accounting record
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CarbonEmissionUpdateRequest'
 *     responses:
 *       200:
 *         description: Carbon emission accounting updated successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       400:
 *         description: Update data is required
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/:id",
  authenticate,
  carbonEmissionController.updateCarbonEmission,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}/verify:
 *   patch:
 *     tags: [Carbon Emission Accounting]
 *     summary: Verify carbon emission data
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CarbonEmissionVerificationRequest'
 *     responses:
 *       200:
 *         description: Carbon emission data verified successfully
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
 *                   $ref: '#/components/schemas/CarbonEmission'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record not found
 *       500:
 *         description: Internal server error
 */
router.patch(
  "/:id/verify",
  authenticate,
  requireOwner,
  carbonEmissionController.verifyCarbonEmission,
);

/**
 * @swagger
 * /api/v1/carbon-emission/{id}:
 *   delete:
 *     tags: [Carbon Emission Accounting]
 *     summary: Delete carbon emission accounting record (soft delete)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Carbon emission accounting ID
 *     responses:
 *       200:
 *         description: Carbon emission accounting record deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Carbon emission accounting record not found
 *       500:
 *         description: Internal server error
 */
router.delete(
  "/:id",
  authenticate,
  carbonEmissionController.deleteCarbonEmission,
);

/**
 * @swagger
 * /api/v1/carbon-emission/stats:
 *   get:
 *     tags: [Carbon Emission Accounting]
 *     summary: Get carbon emission statistics
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         schema:
 *           type: string
 *         description: Filter statistics by company ID (optional)
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/StatsResponse'
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get(
  "/stats",
  authenticate,
  requireOwner,
  carbonEmissionController.getCarbonEmissionStats,
);

module.exports = router;
