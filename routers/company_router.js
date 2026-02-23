const express = require("express");
const router = express.Router();

const companyController = require("../controllers/company_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");

// ===================== PUBLIC & MEMBER ROUTES =====================

/**
 * @swagger
 * /api/v1/companies/register:
 *   post:
 *     tags: [Companies]
 *     summary: Public register a company (no auth) and return a token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name]
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Mavhu Logistics"
 *               registrationNumber:
 *                 type: string
 *                 example: "REG-12345"
 *               email:
 *                 type: string
 *                 example: "info@mavhu.com"
 *               phone:
 *                 type: string
 *                 example: "+263771234567"
 *               address:
 *                 type: string
 *                 example: "Harare, Zimbabwe"
 *               website:
 *                 type: string
 *                 example: "https://mavhu.com"
 *               country:
 *                 type: string
 *                 example: "Zimbabwe"
 *               industry:
 *                 type: string
 *                 example: "Transport"
 *               description:
 *                 type: string
 *                 example: "A logistics company."
 *               purpose:
 *                 type: string
 *                 example: "Environmental monitoring"
 *               scope:
 *                 type: string
 *                 example: "Regional operations"
 *               data_source:
 *                 type: array
 *                 items:
 *                   type: string
 *                 example: ["Satellite Imagery", "Ground Sensors"]
 *               area_of_interest_metadata:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "Southern Africa Region"
 *                   area_covered:
 *                     type: string
 *                     example: "Zimbabwe, Zambia, and Mozambique border regions"
 *                   coordinates:
 *                     type: array
 *                     items:
 *                       type: object
 *                       required: [lat, lon]
 *                       properties:
 *                         lat:
 *                           type: number
 *                           example: -17.0
 *                         lon:
 *                           type: number
 *                           example: 31.0
 *                     example: [
 *                       { lat: -17.0, lon: 31.0 },
 *                       { lat: -17.5, lon: 32.5 },
 *                       { lat: -18.0, lon: 30.5 }
 *                     ]
 *               data_range:
 *                 type: string
 *                 example: "2000-2025"
 *               data_processing_workflow:
 *                 type: string
 *                 example: "Raw data → Cleaning → Analysis → Visualization → Reporting"
 *               analytical_layer_metadata:
 *                 type: string
 *                 example: "Layers include: land_use, vegetation_index, water_bodies"
 *               esg_reporting_framework:
 *                 type: array
 *                 items:
 *                   type: string
 *                   enum: ["GRI", "SASB", "TCFD", "UNSDG", "CDP", "custom", "none"]
 *                 example: ["GRI", "TCFD"]
 *               esg_contact_person:
 *                 type: object
 *                 properties:
 *                   name:
 *                     type: string
 *                     example: "Jane Doe"
 *                   email:
 *                     type: string
 *                     example: "jane.doe@company.com"
 *                   phone:
 *                     type: string
 *                     example: "+263772345678"
 *               latest_esg_report_year:
 *                 type: integer
 *                 example: 2025
 *               esg_data_status:
 *                 type: string
 *                 enum: ["not_collected", "partial", "complete", "verified"]
 *                 example: "not_collected"
 *               has_esg_linked_pay:
 *                 type: boolean
 *                 example: false
 *     responses:
 *       201:
 *         description: Company registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 token:
 *                   type: string
 *                 company:
 *                   $ref: '#/components/schemas/Company'
 *       400:
 *         description: Bad request
 */
router.post("/register", companyController.registerCompanyPublic);

/**
 * @swagger
 * /api/v1/companies/me:
 *   get:
 *     tags: [Companies]
 *     summary: Get my company (member token only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Company
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company:
 *                   $ref: '#/components/schemas/Company'
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Member not linked to a company
 */
router.get("/me", authenticate, companyController.getMyCompany);

/**
 * @swagger
 * /api/v1/companies/me:
 *   patch:
 *     tags: [Companies]
 *     summary: Update my company (member token only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompanyUpdateRequest'
 *     responses:
 *       200:
 *         description: Updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (owner cannot use this)
 */
router.patch("/me", authenticate, companyController.updateMyCompany);

// ===================== DATA MANAGEMENT ROUTES =====================

/**
 * @swagger
 * /api/v1/companies/location/search:
 *   get:
 *     tags: [Company Data]
 *     summary: Find companies near a location
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: longitude
 *         required: true
 *         schema:
 *           type: number
 *           example: 31.0
 *       - in: query
 *         name: latitude
 *         required: true
 *         schema:
 *           type: number
 *           example: -17.0
 *       - in: query
 *         name: radius
 *         schema:
 *           type: number
 *           example: 10000
 *     responses:
 *       200:
 *         description: Companies found
 *       400:
 *         description: Missing or invalid coordinates
 */
router.get(
  "/location/search",
  authenticate,
  companyController.getCompaniesByLocation,
);

/**
 * @swagger
 * /api/v1/companies/data/year/{year}:
 *   get:
 *     tags: [Company Data]
 *     summary: Get companies with data for a specific year
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2023
 *     responses:
 *       200:
 *         description: Companies with data for the year
 *       400:
 *         description: Invalid year
 */
router.get(
  "/data/year/:year",
  authenticate,
  companyController.getCompaniesWithDataForYear,
);

/**
 * @swagger
 * /api/v1/companies/data/range:
 *   get:
 *     tags: [Company Data]
 *     summary: Get companies with data overlapping a year range
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startYear
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2020
 *       - in: query
 *         name: endYear
 *         required: true
 *         schema:
 *           type: integer
 *           example: 2023
 *     responses:
 *       200:
 *         description: Companies with overlapping data range
 *       400:
 *         description: Invalid year range
 */
router.get(
  "/data/range",
  authenticate,
  companyController.getCompaniesByDataRange,
);

/**
 * @swagger
 * /api/v1/companies/{id}/esg-summary:
 *   get:
 *     tags: [Companies]
 *     summary: Get ESG summary for a company
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
 *         description: ESG summary retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 summary:
 *                   type: object
 *       404:
 *         description: Company not found
 */
router.get(
  "/:id/esg-summary",
  authenticate,
  companyController.getCompanyESGSummary,
);

// ===================== OWNER / ADMIN ROUTES =====================

/**
 * @swagger
 * /api/v1/companies/admin/register:
 *   post:
 *     tags: [Companies Admin]
 *     summary: Owner registers a company (owner only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CompanyRegisterRequest'
 *     responses:
 *       201:
 *         description: Company registered by owner
 *       403:
 *         description: Owner only
 */
router.post(
  "/admin/register",
  authenticate,
  requireOwner,
  companyController.registerCompanyByOwner,
);

/**
 * @swagger
 * /api/v1/companies/admin:
 *   get:
 *     tags: [Companies Admin]
 *     summary: List companies (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           example: 1
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           example: 20
 *     responses:
 *       200:
 *         description: List
 *       403:
 *         description: Owner only
 */
router.get(
  "/admin",
  authenticate,
  companyController.adminListCompanies,
);

/**
 * @swagger
 * /api/v1/companies/admin/{id}:
 *   get:
 *     tags: [Companies Admin]
 *     summary: Get company by id (owner only)
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
 *         description: Company
 *       404:
 *         description: Not found
 */
router.get(
  "/admin/:id",
  authenticate,
  requireOwner,
  companyController.adminGetCompanyById,
);

/**
 * @swagger
 * /api/v1/companies/admin/{id}:
 *   patch:
 *     tags: [Companies Admin]
 *     summary: Update company by id (owner only)
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
 *             $ref: '#/components/schemas/CompanyUpdateRequest'
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
router.patch(
  "/admin/:id",
  authenticate,
  requireOwner,
  companyController.adminUpdateCompanyById,
);

/**
 * @swagger
 * /api/v1/companies/admin/{id}:
 *   delete:
 *     tags: [Companies Admin]
 *     summary: Delete company by id (owner only)
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
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete(
  "/admin/:id",
  authenticate,
  requireOwner,
  companyController.adminDeleteCompanyById,
);

// ===================== SWAGGER COMPONENTS =====================

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Company:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "665a8c7be4f1c23b04d12345"
 *         name:
 *           type: string
 *           example: "Mavhu Logistics"
 *         registrationNumber:
 *           type: string
 *           nullable: true
 *           example: "REG-12345"
 *         email:
 *           type: string
 *           nullable: true
 *           example: "info@mavhu.com"
 *         phone:
 *           type: string
 *           nullable: true
 *           example: "+263771234567"
 *         address:
 *           type: string
 *           nullable: true
 *           example: "123 Samora Machel Ave, Harare"
 *         website:
 *           type: string
 *           nullable: true
 *           example: "https://mavhu.com"
 *         country:
 *           type: string
 *           nullable: true
 *           example: "Zimbabwe"
 *         industry:
 *           type: string
 *           nullable: true
 *           example: "Transport & Logistics"
 *         description:
 *           type: string
 *           nullable: true
 *           example: "A logistics and delivery company."
 *         purpose:
 *           type: string
 *           nullable: true
 *           example: "Environmental monitoring and sustainability reporting"
 *         scope:
 *           type: string
 *           nullable: true
 *           example: "Regional operations across Southern Africa"
 *         data_source:
 *           type: array
 *           items:
 *             type: string
 *           nullable: true
 *           example: ["Satellite Imagery", "Ground Sensors", "Government Databases"]
 *         area_of_interest_metadata:
 *           type: object
 *           nullable: true
 *           properties:
 *             name:
 *               type: string
 *               example: "Southern Africa Region"
 *             area_covered:
 *               type: string
 *               example: "Zimbabwe, Zambia, and Mozambique border regions"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: object
 *                 required: [lat, lon]
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: -17.0
 *                   lon:
 *                     type: number
 *                     example: 31.0
 *               example: [
 *                 { lat: -17.0, lon: 31.0 },
 *                 { lat: -17.5, lon: 32.5 },
 *                 { lat: -18.0, lon: 30.5 }
 *               ]
 *         data_range:
 *           type: string
 *           nullable: true
 *           example: "2000-2025"
 *         data_processing_workflow:
 *           type: string
 *           nullable: true
 *           example: "Raw data → Cleaning → Analysis → Visualization → Reporting"
 *         analytical_layer_metadata:
 *           type: string
 *           nullable: true
 *           example: "Layers include: land_use, vegetation_index, water_bodies"
 *         esg_reporting_framework:
 *           type: array
 *           items:
 *             type: string
 *             enum: ["GRI", "SASB", "TCFD", "UNSDG", "CDP", "custom", "none"]
 *           nullable: true
 *           example: ["GRI", "TCFD"]
 *         esg_contact_person:
 *           type: object
 *           nullable: true
 *           properties:
 *             name:
 *               type: string
 *               example: "Jane Doe"
 *             email:
 *               type: string
 *               example: "jane.doe@company.com"
 *             phone:
 *               type: string
 *               example: "+263772345678"
 *         latest_esg_report_year:
 *           type: integer
 *           nullable: true
 *           example: 2025
 *         esg_data_status:
 *           type: string
 *           enum: ["not_collected", "partial", "complete", "verified"]
 *           default: "not_collected"
 *           example: "partial"
 *         has_esg_linked_pay:
 *           type: boolean
 *           default: false
 *           example: false
 *         created_at:
 *           type: string
 *           format: date-time
 *           example: "2025-02-10T08:00:00Z"
 *         updated_at:
 *           type: string
 *           format: date-time
 *           example: "2025-02-12T14:30:00Z"
 *
 *     CompanyRegisterRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name:
 *           type: string
 *           example: "Mavhu Logistics"
 *         registrationNumber:
 *           type: string
 *           example: "REG-12345"
 *         email:
 *           type: string
 *           example: "info@mavhu.com"
 *         phone:
 *           type: string
 *           example: "+263771234567"
 *         address:
 *           type: string
 *           example: "Harare, Zimbabwe"
 *         website:
 *           type: string
 *           example: "https://mavhu.com"
 *         country:
 *           type: string
 *           example: "Zimbabwe"
 *         industry:
 *           type: string
 *           example: "Transport"
 *         description:
 *           type: string
 *           example: "A logistics company."
 *         purpose:
 *           type: string
 *           example: "Environmental monitoring"
 *         scope:
 *           type: string
 *           example: "Regional operations"
 *         data_source:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Satellite Imagery", "Ground Sensors"]
 *         area_of_interest_metadata:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: "Southern Africa Region"
 *             area_covered:
 *               type: string
 *               example: "Zimbabwe, Zambia, and Mozambique border regions"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: object
 *                 required: [lat, lon]
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: -17.0
 *                   lon:
 *                     type: number
 *                     example: 31.0
 *               example: [
 *                 { lat: -17.0, lon: 31.0 },
 *                 { lat: -17.5, lon: 32.5 },
 *                 { lat: -18.0, lon: 30.5 }
 *               ]
 *         data_range:
 *           type: string
 *           example: "2000-2025"
 *         data_processing_workflow:
 *           type: string
 *           example: "Raw data → Cleaning → Analysis → Visualization → Reporting"
 *         analytical_layer_metadata:
 *           type: string
 *           example: "Layers include: land_use, vegetation_index, water_bodies"
 *         esg_reporting_framework:
 *           type: array
 *           items:
 *             type: string
 *             enum: ["GRI", "SASB", "TCFD", "UNSDG", "CDP", "custom", "none"]
 *           example: ["GRI", "TCFD"]
 *         esg_contact_person:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: "Jane Doe"
 *             email:
 *               type: string
 *               example: "jane.doe@company.com"
 *             phone:
 *               type: string
 *               example: "+263772345678"
 *         latest_esg_report_year:
 *           type: integer
 *           example: 2025
 *         esg_data_status:
 *           type: string
 *           enum: ["not_collected", "partial", "complete", "verified"]
 *           example: "not_collected"
 *         has_esg_linked_pay:
 *           type: boolean
 *           example: false
 *
 *     CompanyUpdateRequest:
 *       type: object
 *       properties:
 *         name:
 *           type: string
 *           example: "Mavhu Logistics (Pvt) Ltd"
 *         registrationNumber:
 *           type: string
 *           example: "REG-99999"
 *         email:
 *           type: string
 *           example: "support@mavhu.com"
 *         phone:
 *           type: string
 *           example: "+263771000000"
 *         address:
 *           type: string
 *           example: "Bulawayo, Zimbabwe"
 *         website:
 *           type: string
 *           example: "https://mavhu.com"
 *         country:
 *           type: string
 *           example: "Zimbabwe"
 *         industry:
 *           type: string
 *           example: "Transport"
 *         description:
 *           type: string
 *           example: "Updated description"
 *         purpose:
 *           type: string
 *           example: "Environmental monitoring"
 *         scope:
 *           type: string
 *           example: "Regional operations"
 *         data_source:
 *           type: array
 *           items:
 *             type: string
 *           example: ["Satellite Imagery", "Ground Sensors"]
 *         area_of_interest_metadata:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: "Southern Africa Region"
 *             area_covered:
 *               type: string
 *               example: "Zimbabwe, Zambia, and Mozambique border regions"
 *             coordinates:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                     example: -17.0
 *                   lon:
 *                     type: number
 *                     example: 31.0
 *               example: [
 *                 { lat: -17.0, lon: 31.0 },
 *                 { lat: -17.5, lon: 32.5 },
 *                 { lat: -18.0, lon: 30.5 }
 *               ]
 *         data_range:
 *           type: string
 *           example: "2000-2025"
 *         data_processing_workflow:
 *           type: string
 *           example: "Raw data → Cleaning → Analysis → Visualization → Reporting"
 *         analytical_layer_metadata:
 *           type: string
 *           example: "Layers include: land_use, vegetation_index, water_bodies"
 *         esg_reporting_framework:
 *           type: array
 *           items:
 *             type: string
 *             enum: ["GRI", "SASB", "TCFD", "UNSDG", "CDP", "custom", "none"]
 *           example: ["GRI", "TCFD"]
 *         esg_contact_person:
 *           type: object
 *           properties:
 *             name:
 *               type: string
 *               example: "Jane Doe"
 *             email:
 *               type: string
 *               example: "jane.doe@company.com"
 *             phone:
 *               type: string
 *               example: "+263772345678"
 *         latest_esg_report_year:
 *           type: integer
 *           example: 2025
 *         esg_data_status:
 *           type: string
 *           enum: ["not_collected", "partial", "complete", "verified"]
 *           example: "partial"
 *         has_esg_linked_pay:
 *           type: boolean
 *           example: false
 */

module.exports = router;
