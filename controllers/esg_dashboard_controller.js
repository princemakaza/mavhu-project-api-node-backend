const esgDashboardService = require("../services/esg_dashboard_service");
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");
const SoilHealthCarbonQualityData = require("../services/soil_health_carbon_quality_service");
const CropYieldRiskData = require("../services/crop_yield_forecast_service");
const GHGEmissionsData = require("../services/GHGEmissions_service");
const BiodiversityLanduseData = require("../services/biodiversity_landuse_service");
const IrrigationWaterRiskData = require("../services/irrigation_water_service");
const FarmComplianceData = require("../services/farm_compliance_service");



/**
 * 1. Soil Health & Carbon Quality API
 * GET /api/v1/esg-dashboard/soil-health-carbon/:companyId
 */
const getSoilHealthCarbonQuality = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await SoilHealthCarbonQualityData.getSoilHealthCarbonQualityData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Soil health and carbon quality data retrieved successfully",
    api: "Soil Health & Carbon Quality API",
    data,
  });
});

/**
 * 2. Crop Yield Forecast & Risk API
 * GET /api/v1/esg-dashboard/crop-yield-forecast/:companyId
 */
const getCropYieldForecast = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await CropYieldRiskData.getCropYieldForecastData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Crop yield forecast and risk data retrieved successfully",
    api: "Crop Yield Forecast & Risk API",
    data,
  });
});

/**
 * 3. GHG Emissions (Scopes 1, 2, 3) API
 * GET /api/v1/esg-dashboard/ghg-emissions/:companyId
 */
const getGHGEmissions = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await GHGEmissionsData.getGHGEmissionsData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "GHG emissions data retrieved successfully",
    api: "GHG Emissions API",
    data,
  });
});

/**
 * 4. Biodiversity & Land Use Integrity API
 * GET /api/v1/esg-dashboard/biodiversity-landuse/:companyId
 */
const getBiodiversityLandUse = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await BiodiversityLanduseData.getBiodiversityLandUseData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Biodiversity and land use data retrieved successfully",
    api: "Biodiversity & Land Use Integrity API",
    data,
  });
});

/**
 * 5. Irrigation Efficiency & Water Risk API
 * GET /api/v1/esg-dashboard/irrigation-water/:companyId
 */
const getIrrigationWaterRisk = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await IrrigationWaterRiskData.getIrrigationWaterRiskData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Irrigation efficiency and water risk data retrieved successfully",
    api: "Irrigation Efficiency & Water Risk API",
    data,
  });
});

/**
 * 6. Farm Management Compliance (Training + Scope 3) API
 * GET /api/v1/esg-dashboard/farm-compliance/:companyId
 */
const getFarmCompliance = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await FarmComplianceData.getFarmComplianceData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Farm management compliance data retrieved successfully",
    api: "Farm Management Compliance API",
    data,
  });
});

/**
 * 7. Energy Consumption & Renewables API
 * GET /api/v1/esg-dashboard/energy-renewables/:companyId
 */
const getEnergyRenewables = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getEnergyRenewablesData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Energy consumption and renewables data retrieved successfully",
    api: "Energy Consumption & Renewables API",
    data,
  });
});

/**
 * 8. Waste Management API
 * GET /api/v1/esg-dashboard/waste-management/:companyId
 */
const getWasteManagement = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getWasteManagementData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Waste management data retrieved successfully",
    api: "Waste Management API",
    data,
  });
});

/**
 * 9. Workforce & Diversity API
 * GET /api/v1/esg-dashboard/workforce-diversity/:companyId
 */
const getWorkforceDiversity = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getWorkforceDiversityData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Workforce and diversity data retrieved successfully",
    api: "Workforce & Diversity API",
    data,
  });
});

/**
 * 10. Health & Safety API
 * GET /api/v1/esg-dashboard/health-safety/:companyId
 */
const getHealthSafety = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getHealthSafetyData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Health and safety data retrieved successfully",
    api: "Health & Safety API",
    data,
  });
});

/**
 * 11. Governance & Board Metrics API
 * GET /api/v1/esg-dashboard/governance-board/:companyId
 */
const getGovernanceBoard = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getGovernanceBoardData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Governance and board metrics data retrieved successfully",
    api: "Governance & Board Metrics API",
    data,
  });
});

/**
 * 12. Community Engagement API
 * GET /api/v1/esg-dashboard/community-engagement/:companyId
 */
const getCommunityEngagement = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getCommunityEngagementData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Community engagement data retrieved successfully",
    api: "Community Engagement API",
    data,
  });
});

/**
 * 13. Overall ESG Score API
 * GET /api/v1/esg-dashboard/overall-esg/:companyId
 */
const getOverallESGScore = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const data = await esgDashboardService.getOverallESGScoreData(
    companyId,
    year ? parseInt(year) : null
  );

  res.status(200).json({
    message: "Overall ESG score data retrieved successfully",
    api: "Overall ESG Score API",
    data,
  });
});

/**
 * Get all ESG dashboard APIs data at once
 * GET /api/v1/esg-dashboard/all/:companyId
 */
const getAllESGDashboardData = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  const { year } = req.query;

  const [
    soilHealth,
    cropYield,
    ghgEmissions,
    biodiversity,
    irrigation,
    farmCompliance,
    energy,
    waste,
    workforce,
    healthSafety,
    governance,
    community,
    overallESG,
  ] = await Promise.all([
    esgDashboardService.getSoilHealthCarbonQualityData(companyId, year),
    esgDashboardService.getCropYieldForecastData(companyId, year),
    esgDashboardService.getGHGEmissionsData(companyId, year),
    esgDashboardService.getBiodiversityLandUseData(companyId, year),
    IrrigationWaterRiskData.getIrrigationWaterRiskData(companyId, year),
    esgDashboardService.getFarmComplianceData(companyId, year),
    esgDashboardService.getEnergyRenewablesData(companyId, year),
    esgDashboardService.getWasteManagementData(companyId, year),
    esgDashboardService.getWorkforceDiversityData(companyId, year),
    esgDashboardService.getHealthSafetyData(companyId, year),
    esgDashboardService.getGovernanceBoardData(companyId, year),
    esgDashboardService.getCommunityEngagementData(companyId, year),
    esgDashboardService.getOverallESGScoreData(companyId, year),
  ]);

  res.status(200).json({
    message: "All ESG dashboard data retrieved successfully",
    data: {
      soilHealthCarbonQuality: soilHealth,
      cropYieldForecast: cropYield,
      ghgEmissions,
      biodiversityLandUse: biodiversity,
      irrigationWaterRisk: irrigation,
      farmManagementCompliance: farmCompliance,
      energyConsumptionRenewables: energy,
      wasteManagement: waste,
      workforceDiversity: workforce,
      healthSafety,
      governanceBoardMetrics: governance,
      communityEngagement: community,
      overallESGScore: overallESG,
    },
  });
});

module.exports = {
  getSoilHealthCarbonQuality,
  getCropYieldForecast,
  getGHGEmissions,
  getBiodiversityLandUse,
  getIrrigationWaterRisk,
  getFarmCompliance,
  getEnergyRenewables,
  getWasteManagement,
  getWorkforceDiversity,
  getHealthSafety,
  getGovernanceBoard,
  getCommunityEngagement,
  getOverallESGScore,
  getAllESGDashboardData,
};
