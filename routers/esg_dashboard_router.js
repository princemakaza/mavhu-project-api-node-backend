const express = require("express");
const router = express.Router();

const esgDashboardController = require("../controllers/esg_dashboard_controller");
const { authenticate } = require("../middlewares/auth");

/**
 * @swagger
 * tags:
 *   - name: ESG Dashboard APIs
 *     description: Comprehensive ESG Dashboard APIs for environmental, social, and governance metrics visualization
 *
 * components:
 *   schemas:
 *     ESGGraph:
 *       type: object
 *       properties:
 *         type:
 *           type: string
 *           enum: [line, bar, pie, scatter]
 *           example: line
 *         title:
 *           type: string
 *           example: "Carbon Emissions Trend"
 *         labels:
 *           type: array
 *           items:
 *             type: string
 *         datasets:
 *           type: array
 *           items:
 *             type: object
 *     ESGDashboardResponse:
 *       type: object
 *       properties:
 *         message:
 *           type: string
 *         api:
 *           type: string
 *         data:
 *           type: object
 *           properties:
 *             company:
 *               type: string
 *             year:
 *               type: string
 *             metrics:
 *               type: object
 *             graphs:
 *               type: object
 */

/**
 * @swagger
 * /api/v1/esg-dashboard/soil-health-carbon/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Soil Health & Carbon Quality API
 *     description: Quantifies soil organic carbon, soil health trends, and carbon permanence to support sequestration claims
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Soil health and carbon quality data retrieved
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ESGDashboardResponse'
 *       404:
 *         description: Company not found
 */
router.get(
  "/soil-health-carbon/:companyId",
  authenticate,
  esgDashboardController.getSoilHealthCarbonQuality
);

/**
 * @swagger
 * /api/v1/esg-dashboard/crop-yield-forecast/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Crop Yield Forecast & Risk API
 *     description: Predicts crop yields and identifies production risks across seasons
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Crop yield forecast data retrieved
 */
router.get(
  "/crop-yield-forecast/:companyId",
  authenticate,
  esgDashboardController.getCropYieldForecast
);

/**
 * @swagger
 * /api/v1/esg-dashboard/ghg-emissions/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: GHG Emissions (Scopes 1, 2, 3) API
 *     description: Calculates farm-level and value-chain emissions aligned with GHG Protocol
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: GHG emissions data retrieved
 */
router.get(
  "/ghg-emissions/:companyId",
  authenticate,
  esgDashboardController.getGHGEmissions
);

/**
 * @swagger
 * /api/v1/esg-dashboard/biodiversity-landuse/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Biodiversity & Land Use Integrity API
 *     description: Detects deforestation, land-use change, and biodiversity risk
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Biodiversity and land use data retrieved
 */
router.get(
  "/biodiversity-landuse/:companyId",
  authenticate,
  esgDashboardController.getBiodiversityLandUse
);

/**
 * @swagger
 * /api/v1/esg-dashboard/irrigation-water/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Irrigation Efficiency & Water Risk API
 *     description: Measures water-use efficiency and exposure to water stress
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Irrigation efficiency data retrieved
 */
router.get(
  "/irrigation-water/:companyId",
  authenticate,
  esgDashboardController.getIrrigationWaterRisk
);

/**
 * @swagger
 * /api/v1/esg-dashboard/farm-compliance/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Farm Management Compliance (Training + Scope 3) API
 *     description: Tracks adoption of best practices, farmer training, and Scope 3 engagement
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Farm compliance data retrieved
 */
router.get(
  "/farm-compliance/:companyId",
  authenticate,
  esgDashboardController.getFarmCompliance
);

/**
 * @swagger
 * /api/v1/esg-dashboard/energy-renewables/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Energy Consumption & Renewables API
 *     description: Monitors on-farm energy use and renewable adoption
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Energy consumption data retrieved
 */
router.get(
  "/energy-renewables/:companyId",
  authenticate,
  esgDashboardController.getEnergyRenewables
);

/**
 * @swagger
 * /api/v1/esg-dashboard/waste-management/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Waste Management API
 *     description: Tracks agricultural waste handling and circularity practices
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Waste management data retrieved
 */
router.get(
  "/waste-management/:companyId",
  authenticate,
  esgDashboardController.getWasteManagement
);

/**
 * @swagger
 * /api/v1/esg-dashboard/workforce-diversity/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Workforce & Diversity API
 *     description: Monitors workforce composition, diversity, and inclusion metrics
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Workforce diversity data retrieved
 */
router.get(
  "/workforce-diversity/:companyId",
  authenticate,
  esgDashboardController.getWorkforceDiversity
);

/**
 * @swagger
 * /api/v1/esg-dashboard/health-safety/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Health & Safety API
 *     description: Tracks workplace safety metrics and health indicators
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Health and safety data retrieved
 */
router.get(
  "/health-safety/:companyId",
  authenticate,
  esgDashboardController.getHealthSafety
);

/**
 * @swagger
 * /api/v1/esg-dashboard/governance-board/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Governance & Board Metrics API
 *     description: Monitors board composition, governance practices, and compliance
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Governance and board metrics data retrieved
 */
router.get(
  "/governance-board/:companyId",
  authenticate,
  esgDashboardController.getGovernanceBoard
);

/**
 * @swagger
 * /api/v1/esg-dashboard/community-engagement/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Community Engagement API
 *     description: Tracks community investment, engagement, and social impact
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Community engagement data retrieved
 */
router.get(
  "/community-engagement/:companyId",
  authenticate,
  esgDashboardController.getCommunityEngagement
);

/**
 * @swagger
 * /api/v1/esg-dashboard/overall-esg/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Overall ESG Score API
 *     description: Aggregates all ESG metrics into a decision-ready score
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: Overall ESG score data retrieved
 */
router.get(
  "/overall-esg/:companyId",
  authenticate,
  esgDashboardController.getOverallESGScore
);

/**
 * @swagger
 * /api/v1/esg-dashboard/all/{companyId}:
 *   get:
 *     tags: [ESG Dashboard APIs]
 *     summary: Get all ESG dashboard data at once
 *     description: Retrieves data from all 13 ESG dashboard APIs in a single call
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: companyId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: year
 *         schema:
 *           type: integer
 *           example: 2024
 *     responses:
 *       200:
 *         description: All ESG dashboard data retrieved
 */
router.get(
  "/all/:companyId",
  authenticate,
  esgDashboardController.getAllESGDashboardData
);

module.exports = router;
