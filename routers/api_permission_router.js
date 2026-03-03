const express = require("express");
const router = express.Router();

const permissionsController = require("../controllers/api_permission_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");

// ===================== PERMISSIONS ROUTES =====================

/**
 * @swagger
 * tags:
 *   name: ApiPermissions
 *   description: Company API permissions management
 */

/**
 * @swagger
 * /api/v1/permissions/company/{companyId}:
 *   post:
 *     tags: [ApiPermissions]
 *     summary: Create permissions for a company (owner only)
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               soilHealthCarbon:
 *                 type: boolean
 *                 example: true
 *               cropYieldForecastRisk:
 *                 type: boolean
 *                 example: false
 *               ghgEmissions:
 *                 type: boolean
 *                 example: true
 *               biodiversityLandUse:
 *                 type: boolean
 *                 example: false
 *               irrigationWater:
 *                 type: boolean
 *                 example: true
 *               farmManagementCompliance:
 *                 type: boolean
 *                 example: false
 *               energyConsumptionRenewables:
 *                 type: boolean
 *                 example: true
 *               wasteManagement:
 *                 type: boolean
 *                 example: false
 *               workforceDiversity:
 *                 type: boolean
 *                 example: true
 *               healthSafety:
 *                 type: boolean
 *                 example: false
 *               governanceBoardMetrics:
 *                 type: boolean
 *                 example: true
 *               communityEngagement:
 *                 type: boolean
 *                 example: false
 *               overallESGScore:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       201:
 *         description: Permissions created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 permissions:
 *                   $ref: '#/components/schemas/ApiPermissions'
 *       400:
 *         description: Already exists or validation error
 *       403:
 *         description: Forbidden (not owner)
 *       404:
 *         description: Company not found
 */
router.post(
  "/company/:companyId",
  authenticate,
  requireOwner,
  permissionsController.createPermissions,
);

/**
 * @swagger
 * /api/v1/permissions/company/{companyId}:
 *   get:
 *     tags: [ApiPermissions]
 *     summary: Get permissions for a company (owner or member of that company)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the company
 *     responses:
 *       200:
 *         description: Permissions retrieved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 permissions:
 *                   $ref: '#/components/schemas/ApiPermissions'
 *       403:
 *         description: Forbidden (not your company)
 *       404:
 *         description: Permissions not found
 */
router.get(
  "/company/:companyId",
  authenticate,
  permissionsController.getPermissions,
);

/**
 * @swagger
 * /api/v1/permissions/company/{companyId}:
 *   patch:
 *     tags: [ApiPermissions]
 *     summary: Update permissions for a company (owner only)
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               soilHealthCarbon:
 *                 type: boolean
 *                 example: true
 *               cropYieldForecastRisk:
 *                 type: boolean
 *                 example: false
 *               ghgEmissions:
 *                 type: boolean
 *                 example: true
 *               biodiversityLandUse:
 *                 type: boolean
 *                 example: false
 *               irrigationWater:
 *                 type: boolean
 *                 example: true
 *               farmManagementCompliance:
 *                 type: boolean
 *                 example: false
 *               energyConsumptionRenewables:
 *                 type: boolean
 *                 example: true
 *               wasteManagement:
 *                 type: boolean
 *                 example: false
 *               workforceDiversity:
 *                 type: boolean
 *                 example: true
 *               healthSafety:
 *                 type: boolean
 *                 example: false
 *               governanceBoardMetrics:
 *                 type: boolean
 *                 example: true
 *               communityEngagement:
 *                 type: boolean
 *                 example: false
 *               overallESGScore:
 *                 type: boolean
 *                 example: true
 *     responses:
 *       200:
 *         description: Permissions updated
 *       403:
 *         description: Forbidden (not owner)
 *       404:
 *         description: Permissions not found
 */
router.patch(
  "/company/:companyId",
  authenticate,
  requireOwner,
  permissionsController.updatePermissions,
);

/**
 * @swagger
 * /api/v1/permissions/company/{companyId}:
 *   delete:
 *     tags: [ApiPermissions]
 *     summary: Delete permissions for a company (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID of the company
 *     responses:
 *       200:
 *         description: Permissions deleted
 *       403:
 *         description: Forbidden (not owner)
 *       404:
 *         description: Permissions not found
 */
router.delete(
  "/company/:companyId",
  authenticate,
  requireOwner,
  permissionsController.deletePermissions,
);

/**
 * @swagger
 * /api/v1/permissions/admin:
 *   get:
 *     tags: [ApiPermissions]
 *     summary: List all permissions (owner only) with pagination and search
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Items per page
 *       - in: query
 *         name: q
 *         schema:
 *           type: string
 *         description: Search term for company name
 *     responses:
 *       200:
 *         description: Paginated list of permissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 items:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/ApiPermissions'
 *                 total:
 *                   type: integer
 *                 page:
 *                   type: integer
 *                 limit:
 *                   type: integer
 *                 totalPages:
 *                   type: integer
 *       403:
 *         description: Forbidden (not owner)
 */
router.get(
  "/admin",
  authenticate,
  requireOwner,
  permissionsController.listAllPermissions,
);

// ===================== SWAGGER COMPONENTS =====================

/**
 * @swagger
 * components:
 *   schemas:
 *     ApiPermissions:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           example: "665a8c7be4f1c23b04d67890"
 *         company:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             name:
 *               type: string
 *             registrationNumber:
 *               type: string
 *             email:
 *               type: string
 *         soilHealthCarbon:
 *           type: boolean
 *           example: false
 *         cropYieldForecastRisk:
 *           type: boolean
 *           example: false
 *         ghgEmissions:
 *           type: boolean
 *           example: false
 *         biodiversityLandUse:
 *           type: boolean
 *           example: false
 *         irrigationWater:
 *           type: boolean
 *           example: false
 *         farmManagementCompliance:
 *           type: boolean
 *           example: false
 *         energyConsumptionRenewables:
 *           type: boolean
 *           example: false
 *         wasteManagement:
 *           type: boolean
 *           example: false
 *         workforceDiversity:
 *           type: boolean
 *           example: false
 *         healthSafety:
 *           type: boolean
 *           example: false
 *         governanceBoardMetrics:
 *           type: boolean
 *           example: false
 *         communityEngagement:
 *           type: boolean
 *           example: false
 *         overallESGScore:
 *           type: boolean
 *           example: false
 *         createdBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             full_name:
 *               type: string
 *             email:
 *               type: string
 *         updatedBy:
 *           type: object
 *           properties:
 *             _id:
 *               type: string
 *             full_name:
 *               type: string
 *             email:
 *               type: string
 *         createdAt:
 *           type: string
 *           format: date-time
 *         updatedAt:
 *           type: string
 *           format: date-time
 */

module.exports = router;
