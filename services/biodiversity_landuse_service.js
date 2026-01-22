const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract metric values by name with proper error handling
 */
async function getMetricsByNames(companyId, metricNames, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.metric_name": { $in: metricNames },
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate(
        "company",
        "name industry country esg_reporting_framework latest_esg_report_year",
      )
      .lean();

    // Extract and organize metrics
    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metricNames.includes(metric.metric_name)) {
          if (!metrics[metric.metric_name]) {
            metrics[metric.metric_name] = {
              name: metric.metric_name,
              category: metric.category,
              unit: metric.unit,
              description: metric.description || "",
              values: [],
            };
          }

          metric.values.forEach((value) => {
            if (years.length === 0 || years.includes(value.year)) {
              let numericValue = value.numeric_value;
              if (numericValue === undefined || numericValue === null) {
                if (typeof value.value === "string") {
                  const parsed = parseFloat(
                    value.value.replace(/[^0-9.-]+/g, ""),
                  );
                  numericValue = isNaN(parsed) ? 0 : parsed;
                } else if (typeof value.value === "number") {
                  numericValue = value.value;
                } else {
                  numericValue = 0;
                }
              }

              metrics[metric.metric_name].values.push({
                year: value.year,
                value: value.value,
                numeric_value: numericValue,
                source_notes: value.source_notes,
              });
            }
          });
        }
      });
    });

    // Sort values by year
    Object.keys(metrics).forEach((metricName) => {
      metrics[metricName].values.sort((a, b) => a.year - b.year);
    });

    return metrics;
  } catch (error) {
    throw new AppError(
      `Error fetching metrics: ${error.message}`,
      500,
      "METRICS_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to get unique years from metrics
 */
function getUniqueYearsFromMetrics(metrics, year = null) {
  if (year) return [year];

  const allYears = new Set();
  Object.values(metrics).forEach((metric) => {
    metric.values.forEach((value) => {
      allYears.add(value.year);
    });
  });

  return Array.from(allYears).sort();
}

/**
 * Helper function to calculate percentage change
 */
function calculatePercentageChange(initialValue, finalValue) {
  if (!initialValue || initialValue === 0) return 0;
  return ((finalValue - initialValue) / initialValue) * 100;
}

/**
 * Helper function to get metric value by year
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.values) return null;
  const value = metric.values.find((v) => v.year === year);
  return value ? value.numeric_value || parseFloat(value.value) || 0 : null;
}

/**
 * Helper function to calculate trends
 */
function calculateTrend(values, years) {
  if (!values || values.length < 2) return "stable";

  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);

  const firstValue = getMetricValueByYear(values, firstYear);
  const lastValue = getMetricValueByYear(values, lastYear);

  if (firstValue === null || lastValue === null) return "stable";

  const change = calculatePercentageChange(firstValue, lastValue);

  if (change > 5) return "improving";
  if (change < -5) return "declining";
  return "stable";
}

/**
 * Helper function to get comprehensive Carbon Emission Accounting data with monthly breakdown
 */
async function getComprehensiveCarbonEmissionData(
  companyId,
  startYear = null,
  endYear = null,
) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      status: { $in: ["draft", "under_review", "approved", "published"] },
    };

    const carbonData = await CarbonEmissionAccounting.findOne(query)
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) {
      console.log(
        `No comprehensive carbon data found for company: ${companyId}`,
      );
      return null;
    }

    // Filter yearly data for the specified range
    let filteredYearlyData = carbonData.yearly_data || [];
    if (startYear && endYear) {
      filteredYearlyData = filteredYearlyData.filter(
        (yd) => yd.year >= startYear && yd.year <= endYear,
      );
    }

    // Sort yearly data by year
    filteredYearlyData.sort((a, b) => a.year - b.year);

    // Enhance yearly data with monthly breakdowns
    const enhancedYearlyData = filteredYearlyData.map((yearData) => {
      const enhanced = { ...yearData };

      // Extract monthly sequestration data if available
      if (enhanced.sequestration?.monthly_data) {
        enhanced.monthly_breakdown = {
          ndvi_trends: enhanced.sequestration.monthly_data.map((month) => ({
            month: month.month,
            month_name: getMonthName(month.month),
            ndvi_max: month.ndvi_max || 0,
            ndvi_mean: month.ndvi_mean || 0,
            biomass_co2: month.biomass_co2_t || 0,
            soc_co2: month.soc_co2_t || 0,
            total_co2: (month.biomass_co2_t || 0) + (month.soc_co2_t || 0),
          })),
          annual_summary: enhanced.sequestration.annual_summary,
        };
      }

      // Extract monthly emission data if available
      if (enhanced.emissions?.monthly_breakdown) {
        enhanced.monthly_emissions = enhanced.emissions.monthly_breakdown;
      }

      return enhanced;
    });

    return {
      ...carbonData,
      yearly_data: enhancedYearlyData,
      comprehensive_summary:
        calculateCarbonComprehensiveSummary(enhancedYearlyData),
    };
  } catch (error) {
    console.error("Error fetching comprehensive carbon emission data:", error);
    return null;
  }
}

/**
 * Helper function to get month name
 */
function getMonthName(monthNumber) {
  const months = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return months[monthNumber - 1] || `Month ${monthNumber}`;
}

/**
 * Helper function to calculate carbon comprehensive summary
 */
function calculateCarbonComprehensiveSummary(yearlyData) {
  if (!yearlyData || yearlyData.length === 0) return null;

  const years = yearlyData.map((d) => d.year);

  // Calculate monthly averages if available
  let monthlyNDVIAvg = Array(12).fill(0);
  let monthlyCount = Array(12).fill(0);

  yearlyData.forEach((yearData) => {
    if (yearData.monthly_breakdown?.ndvi_trends) {
      yearData.monthly_breakdown.ndvi_trends.forEach((monthData, index) => {
        if (index < 12 && monthData.ndvi_max) {
          monthlyNDVIAvg[index] += monthData.ndvi_max;
          monthlyCount[index] += 1;
        }
      });
    }
  });

  // Calculate average NDVI per month
  const monthlyNDVITrends = monthlyNDVIAvg.map((sum, index) => ({
    month: index + 1,
    month_name: getMonthName(index + 1),
    avg_ndvi: monthlyCount[index] > 0 ? sum / monthlyCount[index] : 0,
    data_points: monthlyCount[index],
  }));

  return {
    period: {
      start_year: Math.min(...years),
      end_year: Math.max(...years),
      years_count: years.length,
    },
    ndvi_analysis: {
      monthly_trends: monthlyNDVITrends,
      overall_avg_ndvi:
        monthlyNDVITrends.reduce((sum, m) => sum + m.avg_ndvi, 0) / 12,
      best_month: monthlyNDVITrends.reduce((best, current) =>
        current.avg_ndvi > best.avg_ndvi ? current : best,
      ),
      worst_month: monthlyNDVITrends.reduce((worst, current) =>
        current.avg_ndvi < worst.avg_ndvi ? current : worst,
      ),
    },
  };
}

/**
 * Calculate comprehensive deforestation and land use change analysis
 */
function calculateDeforestationAnalysis(metrics, carbonData, years) {
  const currentYear = Math.max(...years);
  const previousYear =
    currentYear > Math.min(...years) ? currentYear - 1 : null;

  // Extract key land use metrics
  const forestArea = metrics["Land Use - Forest Area (ha)"];
  const agriculturalArea = metrics["Land Use - Agricultural Area (ha)"];
  const protectedArea = metrics["Land Use - Protected Area (ha)"];
  const totalArea = metrics["Land Use - Total Area (ha)"];

  const currentForest = getMetricValueByYear(forestArea, currentYear) || 0;
  const previousForest = previousYear
    ? getMetricValueByYear(forestArea, previousYear) || 0
    : 0;
  const currentAgri = getMetricValueByYear(agriculturalArea, currentYear) || 0;
  const previousAgri = previousYear
    ? getMetricValueByYear(agriculturalArea, previousYear) || 0
    : 0;
  const currentProtected =
    getMetricValueByYear(protectedArea, currentYear) || 0;
  const currentTotal = getMetricValueByYear(totalArea, currentYear) || 1;

  // Calculate changes
  const forestChange =
    previousForest > 0
      ? ((currentForest - previousForest) / previousForest) * 100
      : 0;
  const agriChange =
    previousAgri > 0 ? ((currentAgri - previousAgri) / previousAgri) * 100 : 0;

  // Analyze NDVI trends for deforestation detection
  const ndviAnalysis = analyzeNDVITrendsForDeforestation(carbonData, years);

  // Calculate risk scores
  let riskScore = 0;
  const riskFactors = [];

  if (forestChange < -5) {
    riskScore += 40;
    riskFactors.push({
      factor: "forest_area_decline",
      severity:
        forestChange < -15 ? "high" : forestChange < -10 ? "medium" : "low",
      change: forestChange.toFixed(1) + "%",
    });
  }

  if (ndviAnalysis.detected_trends?.length > 0) {
    riskScore += ndviAnalysis.detected_trends.length * 20;
    riskFactors.push({
      factor: "ndvi_anomalies",
      severity: "medium",
      count: ndviAnalysis.detected_trends.length,
    });
  }

  // Check for agricultural expansion into forest areas
  if (agriChange > 10 && forestChange < 0) {
    riskScore += 30;
    riskFactors.push({
      factor: "agricultural_expansion",
      severity: "high",
      message: "Agricultural expansion coincides with forest loss",
    });
  }

  // Calculate yearly risk
  const yearlyRisk = years.map((year) => ({
    year,
    forest_area: getMetricValueByYear(forestArea, year) || 0,
    agricultural_area: getMetricValueByYear(agriculturalArea, year) || 0,
    ndvi_score: calculateYearlyNDVISCore(carbonData, year),
    risk_score: calculateYearlyRiskScore(year, metrics, carbonData),
  }));

  return {
    risk_score: Math.min(100, riskScore),
    risk_level: riskScore > 60 ? "high" : riskScore > 30 ? "medium" : "low",
    forest_coverage: {
      current: currentForest,
      previous: previousForest,
      change_percent: forestChange.toFixed(1),
      coverage_percent: ((currentForest / currentTotal) * 100).toFixed(1),
    },
    agricultural_expansion: {
      current: currentAgri,
      previous: previousAgri,
      change_percent: agriChange.toFixed(1),
      expansion_rate: agriChange > 0 ? "expanding" : "stable",
    },
    protected_area_coverage:
      ((currentProtected / currentTotal) * 100).toFixed(1) + "%",
    ndvi_analysis: ndviAnalysis,
    risk_factors: riskFactors,
    yearly_risk: yearlyRisk,
    deforestation_alerts: ndviAnalysis.detected_trends || [],
    compliance_status: riskScore > 50 ? "requires_investigation" : "compliant",
  };
}

/**
 * Analyze NDVI trends for deforestation detection
 */
function analyzeNDVITrendsForDeforestation(carbonData, years) {
  if (
    !carbonData ||
    !carbonData.yearly_data ||
    carbonData.yearly_data.length === 0
  ) {
    return {
      detected_trends: [],
      overall_ndvi_trend: "insufficient_data",
      deforestation_risk: "unknown",
    };
  }

  const yearlySummaries = [];
  const detectedTrends = [];

  carbonData.yearly_data.forEach((yearData) => {
    if (yearData.monthly_breakdown?.ndvi_trends) {
      const monthlyData = yearData.monthly_breakdown.ndvi_trends;
      const annualNDVI =
        monthlyData.reduce((sum, month) => sum + (month.ndvi_max || 0), 0) /
        monthlyData.length;

      yearlySummaries.push({
        year: yearData.year,
        avg_ndvi: annualNDVI,
        max_ndvi: Math.max(...monthlyData.map((m) => m.ndvi_max || 0)),
        min_ndvi: Math.min(...monthlyData.map((m) => m.ndvi_max || 0)),
        seasonal_variation: calculateSeasonalVariation(monthlyData),
        biomass_co2_total:
          yearData.sequestration?.annual_summary?.total_biomass_co2_t || 0,
        soc_co2_total:
          yearData.sequestration?.annual_summary?.total_soc_co2_t || 0,
      });

      // Detect deforestation alerts
      if (yearlySummaries.length > 1) {
        const prevYear = yearlySummaries[yearlySummaries.length - 2];
        const ndviChange =
          ((annualNDVI - prevYear.avg_ndvi) / prevYear.avg_ndvi) * 100;

        if (ndviChange < -15) {
          detectedTrends.push({
            year: yearData.year,
            type: "deforestation_alert",
            severity:
              ndviChange < -30 ? "high" : ndviChange < -20 ? "medium" : "low",
            ndvi_change_percent: ndviChange.toFixed(1),
            confidence: "medium",
            recommended_action: "Conduct ground verification",
          });
        }

        // Detect persistent decline
        if (yearlySummaries.length >= 3) {
          const recentYears = yearlySummaries.slice(-3);
          const totalDecline =
            ((recentYears[2].avg_ndvi - recentYears[0].avg_ndvi) /
              recentYears[0].avg_ndvi) *
            100;

          if (totalDecline < -25) {
            detectedTrends.push({
              year: yearData.year,
              type: "persistent_decline",
              severity: "high",
              total_decline_percent: totalDecline.toFixed(1),
              confidence: "high",
              recommended_action: "Immediate conservation measures required",
            });
          }
        }
      }
    }
  });

  // Calculate overall trend
  const overallTrend = calculateOverallNDVITrend(yearlySummaries);

  return {
    yearly_summaries: yearlySummaries,
    detected_trends: detectedTrends,
    overall_ndvi_trend: overallTrend,
    deforestation_risk: detectedTrends.length > 0 ? "present" : "none_detected",
    data_quality: yearlySummaries.length >= 2 ? "good" : "limited",
  };
}

/**
 * Calculate seasonal variation in NDVI
 */
function calculateSeasonalVariation(monthlyData) {
  if (!monthlyData || monthlyData.length < 6) return 0;

  const ndviValues = monthlyData.map((m) => m.ndvi_max || 0);
  const max = Math.max(...ndviValues);
  const min = Math.min(...ndviValues);

  return max > 0 ? ((max - min) / max) * 100 : 0;
}

/**
 * Calculate overall NDVI trend
 */
function calculateOverallNDVITrend(yearlySummaries) {
  if (!yearlySummaries || yearlySummaries.length < 2)
    return "insufficient_data";

  const first = yearlySummaries[0].avg_ndvi;
  const last = yearlySummaries[yearlySummaries.length - 1].avg_ndvi;
  const change = ((last - first) / first) * 100;

  if (change > 10) return "significant_improvement";
  if (change > 5) return "improving";
  if (change < -10) return "significant_decline";
  if (change < -5) return "declining";
  return "stable";
}

/**
 * Calculate yearly NDVI score
 */
function calculateYearlyNDVISCore(carbonData, year) {
  if (!carbonData || !carbonData.yearly_data) return 50;

  const yearData = carbonData.yearly_data.find((y) => y.year === year);
  if (!yearData || !yearData.monthly_breakdown?.ndvi_trends) return 50;

  const avgNDVI =
    yearData.monthly_breakdown.ndvi_trends.reduce(
      (sum, m) => sum + (m.ndvi_max || 0),
      0,
    ) / 12;
  return Math.min(100, Math.max(0, avgNDVI * 100));
}

/**
 * Calculate yearly risk score
 */
function calculateYearlyRiskScore(year, metrics, carbonData) {
  let score = 0;

  const forestArea = metrics["Land Use - Forest Area (ha)"];
  const forest = getMetricValueByYear(forestArea, year) || 0;
  const prevForest = getMetricValueByYear(forestArea, year - 1) || 0;

  if (prevForest > 0 && forest < prevForest) {
    const decline = ((prevForest - forest) / prevForest) * 100;
    score += Math.min(40, decline * 2);
  }

  // Check NDVI
  const ndviScore = calculateYearlyNDVISCore(carbonData, year);
  if (ndviScore < 40) score += 30;
  else if (ndviScore < 60) score += 15;

  return Math.min(100, score);
}

/**
 * Calculate comprehensive biodiversity assessment
 */
function calculateBiodiversityAssessment(
  metrics,
  carbonData,
  years,
  companyIndustry,
) {
  const currentYear = Math.max(...years);

  // Extract environmental metrics
  const waterUsage =
    getMetricValueByYear(
      metrics["Water Usage - Irrigation Water Usage (million ML)"],
      currentYear,
    ) || 0;

  const hazardousWaste =
    getMetricValueByYear(
      metrics[
        "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
      ],
      currentYear,
    ) || 0;

  const incidents =
    getMetricValueByYear(
      metrics[
        "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
      ],
      currentYear,
    ) || 0;

  const endangeredSpecies =
    getMetricValueByYear(
      metrics["Biodiversity - Endangered Species Count"],
      currentYear,
    ) || 0;

  const habitatRestoration =
    getMetricValueByYear(
      metrics["Biodiversity - Habitat Restoration Area (ha)"],
      currentYear,
    ) || 0;

  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;

  // Extract social metrics related to biodiversity
  const communityPrograms =
    getMetricValueByYear(
      metrics["Social - Community Engagement Programs (count)"],
      currentYear,
    ) || 0;

  const localEmployment =
    getMetricValueByYear(
      metrics["Social - Local Employment Rate (%)"],
      currentYear,
    ) || 0;

  const landRightsComplaints =
    getMetricValueByYear(
      metrics["Social - Land Rights Complaints (count)"],
      currentYear,
    ) || 0;

  // Extract governance metrics
  const landUsePolicy =
    getMetricValueByYear(
      metrics["Governance - Land Use Policy (yes/no)"],
      currentYear,
    ) || 0;

  const biodiversityPolicy =
    getMetricValueByYear(
      metrics["Governance - Biodiversity Policy (yes/no)"],
      currentYear,
    ) || 0;

  const envComplianceAudits =
    getMetricValueByYear(
      metrics["Governance - Environmental Compliance Audits (count)"],
      currentYear,
    ) || 0;

  // Calculate NDVI-based scores
  let ndviScore = 50;
  let habitatIntegrity = "moderate";

  if (carbonData && carbonData.yearly_data) {
    const currentYearData = carbonData.yearly_data.find(
      (yd) => yd.year === currentYear,
    );
    if (currentYearData?.monthly_breakdown?.ndvi_trends) {
      const avgNDVI =
        currentYearData.monthly_breakdown.ndvi_trends.reduce(
          (sum, m) => sum + (m.ndvi_max || 0),
          0,
        ) / currentYearData.monthly_breakdown.ndvi_trends.length;

      ndviScore = Math.min(100, Math.max(0, avgNDVI * 100));

      const biomass =
        currentYearData.sequestration?.annual_summary?.total_biomass_co2_t || 0;
      habitatIntegrity =
        biomass > 1000 && avgNDVI > 0.6
          ? "high"
          : biomass > 500 && avgNDVI > 0.4
            ? "moderate"
            : "low";
    }
  }

  // Calculate biodiversity score components
  const environmentalComponent = calculateEnvironmentalComponent(
    waterUsage,
    hazardousWaste,
    incidents,
    ndviScore,
  );
  const socialComponent = calculateSocialComponent(
    communityPrograms,
    localEmployment,
    landRightsComplaints,
  );
  const governanceComponent = calculateGovernanceComponent(
    landUsePolicy,
    biodiversityPolicy,
    envComplianceAudits,
  );
  const conservationComponent = calculateConservationComponent(
    endangeredSpecies,
    habitatRestoration,
    totalArea,
  );

  // Overall biodiversity score (weighted)
  const overallScore =
    environmentalComponent * 0.4 +
    socialComponent * 0.2 +
    governanceComponent * 0.2 +
    conservationComponent * 0.2;

  return {
    overall_score: Math.max(0, Math.min(100, overallScore)),
    rating: getBiodiversityRating(overallScore),
    components: {
      environmental: {
        score: environmentalComponent,
        weight: 40,
        factors: [
          "water_quality",
          "waste_management",
          "incident_prevention",
          "vegetation_health",
        ],
      },
      social: {
        score: socialComponent,
        weight: 20,
        factors: ["community_engagement", "local_employment", "land_rights"],
      },
      governance: {
        score: governanceComponent,
        weight: 20,
        factors: [
          "land_use_policy",
          "biodiversity_policy",
          "compliance_audits",
        ],
      },
      conservation: {
        score: conservationComponent,
        weight: 20,
        factors: ["endangered_species", "habitat_restoration"],
      },
    },
    detailed_assessment: {
      ndvi_analysis: {
        score: ndviScore,
        trend: calculateTrendFromCarbonData(carbonData, years, "ndvi"),
      },
      habitat_integrity: habitatIntegrity,
      species_diversity: calculateSpeciesDiversityProxy(
        waterUsage,
        hazardousWaste,
        ndviScore,
      ),
      fragmentation_risk: calculateFragmentationRisk(metrics, years),
      water_impact: getImpactLevel(waterUsage, [150, 200]),
      waste_impact: getImpactLevel(hazardousWaste, [20, 50]),
      incident_impact: getImpactLevel(incidents, [5, 10]),
      social_engagement: getEngagementLevel(communityPrograms, localEmployment),
      governance_strength: getGovernanceStrength(
        landUsePolicy,
        biodiversityPolicy,
        envComplianceAudits,
      ),
    },
  };
}

/**
 * Calculate environmental component of biodiversity score
 */
function calculateEnvironmentalComponent(
  waterUsage,
  hazardousWaste,
  incidents,
  ndviScore,
) {
  const waterPenalty = waterUsage > 200 ? 30 : waterUsage > 150 ? 15 : 0;
  const wastePenalty = hazardousWaste > 50 ? 25 : hazardousWaste > 20 ? 12 : 0;
  const incidentPenalty = incidents > 10 ? 20 : incidents > 5 ? 10 : 0;

  return Math.max(
    0,
    ndviScore * 1.5 - waterPenalty - wastePenalty - incidentPenalty,
  );
}

/**
 * Calculate social component of biodiversity score
 */
function calculateSocialComponent(
  communityPrograms,
  localEmployment,
  landRightsComplaints,
) {
  let score = 0;

  // Community programs (max 30 points)
  score += Math.min(30, communityPrograms * 3);

  // Local employment (max 40 points)
  score += Math.min(40, localEmployment * 0.4);

  // Land rights complaints penalty (max -30 points)
  score -= Math.min(30, landRightsComplaints * 10);

  return Math.max(0, score);
}

/**
 * Calculate governance component of biodiversity score
 */
function calculateGovernanceComponent(
  landUsePolicy,
  biodiversityPolicy,
  envComplianceAudits,
) {
  let score = 0;

  // Policies in place (30 points each)
  score += landUsePolicy ? 30 : 0;
  score += biodiversityPolicy ? 30 : 0;

  // Compliance audits (max 40 points)
  score += Math.min(40, envComplianceAudits * 8);

  return Math.min(100, score);
}

/**
 * Calculate conservation component of biodiversity score
 */
function calculateConservationComponent(
  endangeredSpecies,
  habitatRestoration,
  totalArea,
) {
  let score = 50; // Base score

  // Endangered species protection
  if (endangeredSpecies > 0) {
    score -= Math.min(40, endangeredSpecies * 8);
  }

  // Habitat restoration bonus
  const restorationPercent = (habitatRestoration / totalArea) * 100;
  score += Math.min(30, restorationPercent * 3);

  return Math.max(0, Math.min(100, score));
}

/**
 * Get biodiversity rating
 */
function getBiodiversityRating(score) {
  if (score >= 80) return "Excellent";
  if (score >= 65) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 35) return "Poor";
  return "Critical";
}

/**
 * Get impact level
 */
function getImpactLevel(value, thresholds) {
  if (value > thresholds[1]) return "High";
  if (value > thresholds[0]) return "Medium";
  return "Low";
}

/**
 * Get engagement level
 */
function getEngagementLevel(programs, employment) {
  if (programs >= 3 && employment >= 70) return "Strong";
  if (programs >= 1 && employment >= 50) return "Moderate";
  return "Weak";
}

/**
 * Get governance strength
 */
function getGovernanceStrength(landUsePolicy, biodiversityPolicy, audits) {
  if (landUsePolicy && biodiversityPolicy && audits >= 2) return "Strong";
  if ((landUsePolicy || biodiversityPolicy) && audits >= 1) return "Moderate";
  return "Weak";
}

/**
 * Calculate trend from carbon data
 */
function calculateTrendFromCarbonData(carbonData, years, metric) {
  if (
    !carbonData ||
    !carbonData.yearly_data ||
    carbonData.yearly_data.length < 2
  ) {
    return "insufficient_data";
  }

  const sortedData = [...carbonData.yearly_data].sort(
    (a, b) => a.year - b.year,
  );
  const firstYear = sortedData[0];
  const lastYear = sortedData[sortedData.length - 1];

  let firstValue, lastValue;

  if (metric === "ndvi") {
    firstValue = calculateYearlyNDVISCore(carbonData, firstYear.year);
    lastValue = calculateYearlyNDVISCore(carbonData, lastYear.year);
  } else if (metric === "biomass") {
    firstValue =
      firstYear.sequestration?.annual_summary?.total_biomass_co2_t || 0;
    lastValue =
      lastYear.sequestration?.annual_summary?.total_biomass_co2_t || 0;
  }

  if (!firstValue || firstValue === 0) return "stable";

  const change = ((lastValue - firstValue) / firstValue) * 100;

  if (change > 10) return "improving";
  if (change < -10) return "declining";
  return "stable";
}

/**
 * Calculate species diversity proxy
 */
function calculateSpeciesDiversityProxy(waterUsage, hazardousWaste, ndviScore) {
  const baseScore = ndviScore;
  const waterPenalty = waterUsage > 180 ? 15 : waterUsage > 150 ? 8 : 0;
  const wastePenalty = hazardousWaste > 40 ? 20 : hazardousWaste > 20 ? 10 : 0;

  const finalScore = baseScore - waterPenalty - wastePenalty;

  return {
    score: Math.max(0, finalScore),
    category:
      finalScore > 70
        ? "high_diversity"
        : finalScore > 40
          ? "moderate_diversity"
          : "low_diversity",
    indicators: ["vegetation_health", "water_quality", "waste_management"],
    confidence: finalScore > 0 ? "medium" : "low",
  };
}

/**
 * Calculate fragmentation risk
 */
function calculateFragmentationRisk(metrics, years) {
  const currentYear = Math.max(...years);

  const waterUsage =
    getMetricValueByYear(
      metrics["Water Usage - Irrigation Water Usage (million ML)"],
      currentYear,
    ) || 0;

  const incidents =
    getMetricValueByYear(
      metrics[
        "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
      ],
      currentYear,
    ) || 0;

  const forestArea =
    getMetricValueByYear(metrics["Land Use - Forest Area (ha)"], currentYear) ||
    0;

  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;

  let riskScore = 0;
  const factors = [];

  if (waterUsage > 180) {
    riskScore += 40;
    factors.push("high_water_extraction");
  }

  if (incidents > 8) {
    riskScore += 30;
    factors.push("environmental_incidents");
  }

  if (forestArea / totalArea < 0.3) {
    riskScore += 30;
    factors.push("low_forest_coverage");
  }

  return {
    risk_score: Math.min(100, riskScore),
    level: riskScore > 50 ? "high" : riskScore > 30 ? "medium" : "low",
    contributing_factors: factors,
    mitigation_needed: riskScore > 40,
  };
}

/**
 * Generate comprehensive graphs for biodiversity and land use
 */
function generateBiodiversityGraphs(
  metrics,
  carbonData,
  years,
  deforestationAnalysis,
  biodiversityAssessment,
) {
  const graphs = {};
  const currentYear = Math.max(...years);

  // 1. Biodiversity Score Trend
  if (years.length >= 2) {
    graphs.biodiversity_trend = {
      type: "line",
      title: "Biodiversity Score Trend",
      description: "Historical trend of overall biodiversity score",
      labels: years,
      datasets: [
        {
          label: "Biodiversity Score",
          data: years.map((year) => {
            // Simplified calculation for trend line
            const water =
              getMetricValueByYear(
                metrics["Water Usage - Irrigation Water Usage (million ML)"],
                year,
              ) || 0;
            const waste =
              getMetricValueByYear(
                metrics[
                  "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
                ],
                year,
              ) || 0;
            const incidents =
              getMetricValueByYear(
                metrics[
                  "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
                ],
                year,
              ) || 0;

            return Math.max(
              0,
              100 -
                (water > 200 ? 20 : water > 150 ? 10 : 0) -
                (waste > 50 ? 30 : waste > 20 ? 15 : 0) -
                (incidents > 10 ? 25 : incidents > 5 ? 12 : 0),
            );
          }),
          borderColor: "#27ae60",
          backgroundColor: "rgba(39, 174, 96, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // 2. Land Use Composition (Current Year)
  const forestArea =
    getMetricValueByYear(metrics["Land Use - Forest Area (ha)"], currentYear) ||
    0;
  const agriArea =
    getMetricValueByYear(
      metrics["Land Use - Agricultural Area (ha)"],
      currentYear,
    ) || 0;
  const protectedArea =
    getMetricValueByYear(
      metrics["Land Use - Protected Area (ha)"],
      currentYear,
    ) || 0;
  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;
  const otherArea = totalArea - forestArea - agriArea - protectedArea;

  graphs.land_use_composition = {
    type: "doughnut",
    title: "Land Use Composition",
    description: "Distribution of land area by use type",
    labels: [
      "Forest Area",
      "Agricultural Area",
      "Protected Area",
      "Other Area",
    ],
    datasets: [
      {
        data: [forestArea, agriArea, protectedArea, Math.max(0, otherArea)],
        backgroundColor: ["#27ae60", "#f39c12", "#3498db", "#95a5a6"],
        borderWidth: 2,
      },
    ],
  };

  // 3. NDVI Monthly Trend (Current Year)
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData?.monthly_breakdown?.ndvi_trends) {
      graphs.ndvi_monthly_trend = {
        type: "line",
        title: `Monthly NDVI Trend - ${currentYear}`,
        description: "Normalized Difference Vegetation Index monthly variation",
        labels: yearData.monthly_breakdown.ndvi_trends.map((m) => m.month_name),
        datasets: [
          {
            label: "NDVI Max",
            data: yearData.monthly_breakdown.ndvi_trends.map(
              (m) => m.ndvi_max || 0,
            ),
            borderColor: "#27ae60",
            backgroundColor: "rgba(39, 174, 96, 0.1)",
            fill: true,
          },
          {
            label: "NDVI Mean",
            data: yearData.monthly_breakdown.ndvi_trends.map(
              (m) => m.ndvi_mean || 0,
            ),
            borderColor: "#2ecc71",
            borderDash: [5, 5],
            fill: false,
          },
        ],
      };
    }
  }

  // 4. Deforestation Risk Timeline
  if (
    deforestationAnalysis?.yearly_risk &&
    deforestationAnalysis.yearly_risk.length >= 2
  ) {
    graphs.deforestation_risk_timeline = {
      type: "line",
      title: "Deforestation Risk Assessment",
      description: "Historical trend of deforestation risk score",
      labels: deforestationAnalysis.yearly_risk.map((r) => r.year),
      datasets: [
        {
          label: "Risk Score",
          data: deforestationAnalysis.yearly_risk.map((r) => r.risk_score),
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "High Risk Threshold",
          data: deforestationAnalysis.yearly_risk.map(() => 60),
          borderColor: "#c0392b",
          borderDash: [10, 5],
          fill: false,
        },
        {
          label: "Medium Risk Threshold",
          data: deforestationAnalysis.yearly_risk.map(() => 30),
          borderColor: "#f39c12",
          borderDash: [5, 5],
          fill: false,
        },
      ],
    };
  }

  // 5. Environmental Impact Correlation
  if (years.length >= 3) {
    graphs.environmental_correlation = {
      type: "scatter",
      title: "Environmental Impact Correlation",
      description: "Relationship between water usage, waste, and incidents",
      datasets: years.map((year) => ({
        label: year.toString(),
        data: [
          {
            x:
              getMetricValueByYear(
                metrics["Water Usage - Irrigation Water Usage (million ML)"],
                year,
              ) || 0,
            y:
              getMetricValueByYear(
                metrics[
                  "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
                ],
                year,
              ) || 0,
            r:
              (getMetricValueByYear(
                metrics[
                  "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
                ],
                year,
              ) || 0) * 3,
          },
        ],
        backgroundColor: year === currentYear ? "#e74c3c" : "#3498db",
      })),
    };
  }

  // 6. Biodiversity Component Breakdown
  if (biodiversityAssessment?.components) {
    graphs.biodiversity_components = {
      type: "radar",
      title: "Biodiversity Component Analysis",
      description: "Breakdown of biodiversity score by component",
      labels: Object.keys(biodiversityAssessment.components).map(
        (key) => key.charAt(0).toUpperCase() + key.slice(1),
      ),
      datasets: [
        {
          label: "Current Score",
          data: Object.values(biodiversityAssessment.components).map(
            (c) => c.score,
          ),
          backgroundColor: "rgba(39, 174, 96, 0.2)",
          borderColor: "#27ae60",
          borderWidth: 2,
        },
        {
          label: "Target Score",
          data: Object.values(biodiversityAssessment.components).map(() => 80),
          backgroundColor: "rgba(52, 152, 219, 0.2)",
          borderColor: "#3498db",
          borderWidth: 2,
          borderDash: [5, 5],
        },
      ],
    };
  }

  // 7. Forest Area Change Over Time
  if (years.length >= 2) {
    const forestAreaMetric = metrics["Land Use - Forest Area (ha)"];
    if (forestAreaMetric) {
      graphs.forest_area_trend = {
        type: "bar",
        title: "Forest Area Trend",
        description: "Historical changes in forest coverage",
        labels: years,
        datasets: [
          {
            label: "Forest Area (ha)",
            data: years.map(
              (year) => getMetricValueByYear(forestAreaMetric, year) || 0,
            ),
            backgroundColor: "#27ae60",
          },
          {
            label: "Linear Trend",
            data: years.map(() => {
              const values = years.map(
                (y) => getMetricValueByYear(forestAreaMetric, y) || 0,
              );
              const first = values[0];
              const last = values[values.length - 1];
              const step = (last - first) / (values.length - 1);
              return first + step * years.indexOf(years[0]);
            }),
            type: "line",
            borderColor: "#2c3e50",
            borderWidth: 2,
            fill: false,
          },
        ],
      };
    }
  }

  // 8. Carbon Sequestration vs Emissions
  if (
    carbonData &&
    carbonData.yearly_data &&
    carbonData.yearly_data.length >= 2
  ) {
    const sortedData = [...carbonData.yearly_data].sort(
      (a, b) => a.year - b.year,
    );
    graphs.carbon_balance_trend = {
      type: "bar",
      title: "Carbon Balance Trend",
      description: "Comparison of carbon sequestration and emissions",
      labels: sortedData.map((d) => d.year),
      datasets: [
        {
          label: "Carbon Sequestration (tCO₂)",
          data: sortedData.map(
            (d) =>
              d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
          ),
          backgroundColor: "#27ae60",
        },
        {
          label: "GHG Emissions (tCO₂e)",
          data: sortedData.map(
            (d) => d.emissions?.total_scope_emission_tco2e || 0,
          ),
          backgroundColor: "#e74c3c",
        },
        {
          label: "Net Balance",
          data: sortedData.map(
            (d) =>
              (d.sequestration?.annual_summary?.sequestration_total_tco2 || 0) -
              (d.emissions?.total_scope_emission_tco2e || 0),
          ),
          type: "line",
          borderColor: "#3498db",
          borderWidth: 3,
          fill: false,
          tension: 0.4,
        },
      ],
    };
  }

  // 9. Monthly Carbon Sequestration Breakdown
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData?.monthly_breakdown?.ndvi_trends) {
      graphs.monthly_carbon_sequestration = {
        type: "bar",
        title: `Monthly Carbon Sequestration - ${currentYear}`,
        description: "Monthly breakdown of biomass and soil organic carbon",
        labels: yearData.monthly_breakdown.ndvi_trends.map((m) => m.month_name),
        datasets: [
          {
            label: "Biomass CO₂ (t)",
            data: yearData.monthly_breakdown.ndvi_trends.map(
              (m) => m.biomass_co2,
            ),
            backgroundColor: "#f39c12",
          },
          {
            label: "Soil Organic Carbon CO₂ (t)",
            data: yearData.monthly_breakdown.ndvi_trends.map((m) => m.soc_co2),
            backgroundColor: "#8e44ad",
          },
        ],
      };
    }
  }

  // 10. Environmental Incidents Timeline
  const incidentsMetric =
    metrics[
      "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
    ];
  if (incidentsMetric && years.length >= 2) {
    graphs.environmental_incidents_timeline = {
      type: "line",
      title: "Environmental Incidents Trend",
      description: "Historical trend of environmental incidents",
      labels: years,
      datasets: [
        {
          label: "Incidents Count",
          data: years.map(
            (year) => getMetricValueByYear(incidentsMetric, year) || 0,
          ),
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Moving Average (3 years)",
          data: years.map((year, index) => {
            const window = years.slice(Math.max(0, index - 1), index + 2);
            const avg =
              window.reduce(
                (sum, y) =>
                  sum + (getMetricValueByYear(incidentsMetric, y) || 0),
                0,
              ) / window.length;
            return avg;
          }),
          borderColor: "#2c3e50",
          borderWidth: 2,
          borderDash: [5, 5],
          fill: false,
        },
      ],
    };
  }

  return graphs;
}

/**
 * Calculate key biodiversity statistics
 */
function calculateKeyBiodiversityStats(
  metrics,
  carbonData,
  years,
  deforestationAnalysis,
  biodiversityAssessment,
) {
  const currentYear = Math.max(...years);

  const waterUsage =
    getMetricValueByYear(
      metrics["Water Usage - Irrigation Water Usage (million ML)"],
      currentYear,
    ) || 0;

  const hazardousWaste =
    getMetricValueByYear(
      metrics[
        "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
      ],
      currentYear,
    ) || 0;

  const incidents =
    getMetricValueByYear(
      metrics[
        "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
      ],
      currentYear,
    ) || 0;

  const forestArea =
    getMetricValueByYear(metrics["Land Use - Forest Area (ha)"], currentYear) ||
    0;
  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;
  const protectedArea =
    getMetricValueByYear(
      metrics["Land Use - Protected Area (ha)"],
      currentYear,
    ) || 0;
  const endangeredSpecies =
    getMetricValueByYear(
      metrics["Biodiversity - Endangered Species Count"],
      currentYear,
    ) || 0;
  const habitatRestoration =
    getMetricValueByYear(
      metrics["Biodiversity - Habitat Restoration Area (ha)"],
      currentYear,
    ) || 0;

  return {
    total_metrics_analyzed: Object.keys(metrics).length,
    years_covered: years.length,
    current_year: currentYear,

    environmental_metrics: {
      total_water_usage: `${waterUsage.toFixed(1)} million ML`,
      total_hazardous_waste: `${hazardousWaste.toFixed(0)} tons`,
      total_incidents: incidents,
      forest_coverage_percent: `${((forestArea / totalArea) * 100).toFixed(1)}%`,
      protected_area_percent: `${((protectedArea / totalArea) * 100).toFixed(1)}%`,
    },

    biodiversity_metrics: {
      overall_score: biodiversityAssessment?.overall_score?.toFixed(1) || "N/A",
      ndvi_score: calculateYearlyNDVISCore(carbonData, currentYear).toFixed(1),
      endangered_species_count: endangeredSpecies,
      habitat_restoration_area: `${habitatRestoration.toFixed(1)} ha`,
      restoration_progress: `${((habitatRestoration / totalArea) * 100).toFixed(1)}% of total area`,
    },

    risk_metrics: {
      deforestation_risk_score: deforestationAnalysis?.risk_score || 0,
      deforestation_alerts_count:
        deforestationAnalysis?.deforestation_alerts?.length || 0,
      fragmentation_risk: deforestationAnalysis?.fragmentation_risk || "low",
      compliance_status: deforestationAnalysis?.compliance_status || "unknown",
    },

    carbon_metrics: {
      total_sequestration:
        carbonData?.comprehensive_summary?.total_sequestration || 0,
      total_emissions: carbonData?.comprehensive_summary?.total_emissions || 0,
      net_carbon_balance: carbonData?.comprehensive_summary?.net_balance || 0,
      ndvi_trend:
        carbonData?.comprehensive_summary?.ndvi_analysis?.overall_trend ||
        "unknown",
    },

    social_governance_metrics: {
      community_programs:
        getMetricValueByYear(
          metrics["Social - Community Engagement Programs (count)"],
          currentYear,
        ) || 0,
      land_use_policy: getMetricValueByYear(
        metrics["Governance - Land Use Policy (yes/no)"],
        currentYear,
      )
        ? "Yes"
        : "No",
      biodiversity_policy: getMetricValueByYear(
        metrics["Governance - Biodiversity Policy (yes/no)"],
        currentYear,
      )
        ? "Yes"
        : "No",
    },
  };
}

/**
 * Generate conservation recommendations
 */
function generateConservationRecommendations(
  metrics,
  carbonData,
  deforestationAnalysis,
  biodiversityAssessment,
  companyIndustry,
  years,
) {
  const currentYear = Math.max(...years);
  const recommendations = [];

  const waterUsage =
    getMetricValueByYear(
      metrics["Water Usage - Irrigation Water Usage (million ML)"],
      currentYear,
    ) || 0;

  const hazardousWaste =
    getMetricValueByYear(
      metrics[
        "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
      ],
      currentYear,
    ) || 0;

  const incidents =
    getMetricValueByYear(
      metrics[
        "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
      ],
      currentYear,
    ) || 0;

  const forestArea =
    getMetricValueByYear(metrics["Land Use - Forest Area (ha)"], currentYear) ||
    0;
  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;
  const protectedArea =
    getMetricValueByYear(
      metrics["Land Use - Protected Area (ha)"],
      currentYear,
    ) || 0;

  // Water management recommendations
  if (waterUsage > 180) {
    recommendations.push({
      category: "water_management",
      priority: "high",
      recommendation:
        "Implement water recycling system and rainwater harvesting",
      impact: "Reduce irrigation water usage by 20-30%",
      timeframe: "6-12 months",
      cost_estimate: "Medium",
      compliance_benefit: "Aligns with SDG 6: Clean Water and Sanitation",
    });
  }

  // Deforestation risk recommendations
  if (deforestationAnalysis?.risk_level === "high") {
    recommendations.push({
      category: "deforestation_prevention",
      priority: "high",
      recommendation:
        "Implement forest monitoring system and ground verification of alerts",
      impact: "Prevent unauthorized land clearing and improve compliance",
      timeframe: "3-6 months",
      cost_estimate: "Low",
      compliance_benefit:
        "Essential for HVE compliance and zero-deforestation commitments",
    });
  }

  // Biodiversity enhancement
  if (biodiversityAssessment?.overall_score < 60) {
    recommendations.push({
      category: "biodiversity_enhancement",
      priority: "medium",
      recommendation:
        "Develop and implement biodiversity action plan with habitat corridors",
      impact: "Improve biodiversity score by 20-30%",
      timeframe: "12-24 months",
      cost_estimate: "Medium",
      compliance_benefit: "Supports GRI 304: Biodiversity and SASB standards",
    });
  }

  // Protected area expansion
  if (protectedArea / totalArea < 0.1) {
    recommendations.push({
      category: "conservation_area",
      priority: "medium",
      recommendation:
        "Increase protected area to at least 10% of total land holdings",
      impact: "Enhance habitat connectivity and species protection",
      timeframe: "12-18 months",
      cost_estimate: "Medium",
      compliance_benefit: "Aligns with Aichi Biodiversity Target 11 and SDG 15",
    });
  }

  // Waste management
  if (hazardousWaste > 30) {
    recommendations.push({
      category: "waste_management",
      priority: "high",
      recommendation:
        "Improve hazardous waste treatment facilities and implement waste reduction program",
      impact: "Reduce hazardous waste by 40-50%",
      timeframe: "6-12 months",
      cost_estimate: "Medium",
      compliance_benefit: "Essential for environmental compliance and GRI 306",
    });
  }

  // Incident prevention
  if (incidents > 5) {
    recommendations.push({
      category: "incident_prevention",
      priority: "medium",
      recommendation:
        "Implement environmental incident prevention training and monitoring system",
      impact: "Reduce environmental incidents by 50%",
      timeframe: "3-6 months",
      cost_estimate: "Low",
      compliance_benefit:
        "Improves environmental compliance and reduces regulatory risk",
    });
  }

  // Carbon sequestration enhancement
  if (carbonData && carbonData.comprehensive_summary?.net_balance < 0) {
    recommendations.push({
      category: "carbon_sequestration",
      priority: "medium",
      recommendation:
        "Implement agroforestry and soil carbon enhancement practices",
      impact: "Increase carbon sequestration by 20-30%",
      timeframe: "12-24 months",
      cost_estimate: "Medium",
      compliance_benefit:
        "Supports carbon neutrality goals and TCFD recommendations",
    });
  }

  // Community engagement
  const communityPrograms =
    getMetricValueByYear(
      metrics["Social - Community Engagement Programs (count)"],
      currentYear,
    ) || 0;

  if (communityPrograms < 2) {
    recommendations.push({
      category: "community_engagement",
      priority: "low",
      recommendation: "Establish community biodiversity monitoring program",
      impact:
        "Enhance social license to operate and local knowledge integration",
      timeframe: "6-12 months",
      cost_estimate: "Low",
      compliance_benefit:
        "Aligns with social sustainability goals and stakeholder expectations",
    });
  }

  return recommendations;
}

/**
 * Calculate standards compliance
 */
function calculateStandardsCompliance(
  metrics,
  carbonData,
  biodiversityAssessment,
  deforestationAnalysis,
  companyIndustry,
) {
  const compliance = {
    hve: {
      applicable:
        companyIndustry.includes("Agriculture") ||
        companyIndustry.includes("Sugar"),
      requirements: [
        "Zero deforestation commitment",
        "No conversion of high conservation value areas",
        "Sustainable water management",
        "Biodiversity conservation",
      ],
      current_status:
        deforestationAnalysis?.compliance_status === "compliant"
          ? "Compliant"
          : "Requires Improvement",
      verification_required: true,
      notes:
        deforestationAnalysis?.deforestation_alerts?.length > 0
          ? "Potential deforestation detected - requires investigation"
          : "No deforestation reported based on NDVI analysis",
    },

    sasb: {
      applicable: true,
      standards: [
        "SASB Agricultural Products: Land Use & Biodiversity",
        "SASB Agricultural Products: Water Management",
        "SASB Agricultural Products: Waste Management",
      ],
      compliance_level:
        biodiversityAssessment?.overall_score >= 60 ? "High" : "Medium",
      metrics_coverage: ["Water Usage", "Land Use", "Biodiversity", "Waste"],
      gap_analysis:
        biodiversityAssessment?.overall_score < 60
          ? "Need to improve biodiversity metrics and reporting"
          : "Good coverage of SASB metrics",
    },

    tcfd: {
      applicable: true,
      climate_risk_assessment:
        deforestationAnalysis?.risk_level !== "none"
          ? "Required"
          : "Not required",
      scenario_analysis: "Recommended for deforestation risks",
      physical_risks: [
        "Drought impact on water availability",
        "Temperature changes affecting crop yields",
        "Extreme weather events",
      ],
      transition_risks: [
        "Deforestation regulations",
        "Carbon pricing impacts",
        "Supply chain sustainability requirements",
      ],
      reporting_status: carbonData ? "Comprehensive" : "Basic",
    },

    gri: {
      standards: [
        "GRI 304: Biodiversity",
        "GRI 303: Water",
        "GRI 306: Waste",
        "GRI 413: Local Communities",
      ],
      disclosure_level:
        Object.keys(metrics).length > 10 ? "Comprehensive" : "Limited",
      verification_status: "Self-declared",
      improvement_areas:
        biodiversityAssessment?.overall_score < 60
          ? ["Biodiversity impact assessment", "Habitat restoration reporting"]
          : ["Continuous improvement"],
    },

    unsdg: {
      goals: [
        {
          goal: "SDG 6: Clean Water",
          alignment:
            biodiversityAssessment?.detailed_assessment?.water_impact === "Low"
              ? "Strong"
              : "Needs Improvement",
        },
        {
          goal: "SDG 13: Climate Action",
          alignment: carbonData ? "Strong" : "Needs Improvement",
        },
        {
          goal: "SDG 15: Life on Land",
          alignment:
            deforestationAnalysis?.risk_level === "low"
              ? "Strong"
              : "Needs Improvement",
        },
        {
          goal: "SDG 12: Responsible Consumption",
          alignment:
            biodiversityAssessment?.detailed_assessment?.waste_impact === "Low"
              ? "Strong"
              : "Needs Improvement",
        },
      ],
      overall_alignment:
        biodiversityAssessment?.overall_score >= 60 ? "Good" : "Moderate",
      contribution_areas: [
        "Sustainable land management",
        "Biodiversity conservation",
        "Water efficiency",
        "Waste reduction",
      ],
    },

    iso: {
      standards: [
        "ISO 14001: Environmental Management",
        "ISO 14064: Greenhouse Gas Accounting",
      ],
      certification_status: carbonData
        ? "Partially Implemented"
        : "Not Implemented",
      gap_analysis: carbonData
        ? "GHG accounting in place, needs formal certification"
        : "Requires full EMS implementation",
    },
  };

  return compliance;
}

/**
 * Main Biodiversity & Land Use Integrity API
 */
async function getBiodiversityLandUseData(
  companyId,
  year = null,
  startYear = null,
  endYear = null,
) {
  try {
    // Get company with all fields (removed population of non-existent fields)
    const company = await Company.findById(companyId).lean();

    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // Determine year range
    let targetYears = [];
    if (year) {
      targetYears = [year];
    } else if (startYear && endYear) {
      targetYears = Array.from(
        { length: endYear - startYear + 1 },
        (_, i) => startYear + i,
      );
    } else {
      // Default to last 5 years
      const currentYear = new Date().getFullYear();
      targetYears = Array.from({ length: 5 }, (_, i) => currentYear - 4 + i);
    }

    // Comprehensive list of metrics for biodiversity and land use analysis
    const metricNames = [
      // Environmental Metrics
      "Water Usage - Irrigation Water Usage (million ML)",
      "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
      "Environment Incidents - Waste streams produced - Hazardous waste (tons)",
      "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)",
      "Land Use - Total Area (ha)",
      "Land Use - Agricultural Area (ha)",
      "Land Use - Forest Area (ha)",
      "Land Use - Protected Area (ha)",
      "Biodiversity - Endangered Species Count",
      "Biodiversity - Habitat Restoration Area (ha)",
      "Water Management - Water Withdrawal (million ML)",
      "Water Management - Water Consumption (million ML)",
      "Soil Quality - Erosion Rate (tons/ha/year)",
      "Soil Quality - Organic Matter Content (%)",
      "Carbon Emissions (Total GHG, tCO2e)",
      "GHG Scope 1 (tCO2e)",
      "GHG Scope 2 (tCO2e)",
      "GHG Scope 3 (tCO2e)",

      // Social Metrics related to land use
      "Social - Community Engagement Programs (count)",
      "Social - Local Employment Rate (%)",
      "Social - Land Rights Complaints (count)",
      "Social - Resettlement Programs (count)",
      "Social - Indigenous Peoples Engagement (yes/no)",
      "Social - Community Development Investment (US$)",
      "Social - Health and Safety Incidents (count)",
      "Social - Training Hours per Employee",

      // Governance Metrics related to land use
      "Governance - Land Use Policy (yes/no)",
      "Governance - Biodiversity Policy (yes/no)",
      "Governance - Environmental Compliance Audits (count)",
      "Governance - Board Oversight of Environmental Issues (yes/no)",
      "Governance - Stakeholder Engagement on Land Use (yes/no)",
      "Governance - ESG Reporting Quality (rating)",
      "Governance - Risk Management Framework (yes/no)",
    ];

    // Get all metrics
    const metrics = await getMetricsByNames(
      companyId,
      metricNames,
      targetYears,
    );
    const years = getUniqueYearsFromMetrics(metrics, year);

    if (years.length === 0) {
      throw new AppError("No land use data available", 404, "NO_LAND_USE_DATA");
    }

    const currentYear = Math.max(...years);
    const baselineYear = Math.min(...years);

    // Get comprehensive carbon emission data with monthly breakdowns
    const carbonData = await getComprehensiveCarbonEmissionData(
      companyId,
      baselineYear,
      currentYear,
    );

    // Calculate deforestation analysis
    const deforestationAnalysis = calculateDeforestationAnalysis(
      metrics,
      carbonData,
      years,
    );

    // Calculate biodiversity assessment
    const biodiversityAssessment = calculateBiodiversityAssessment(
      metrics,
      carbonData,
      years,
      company.industry,
    );

    // Generate comprehensive graphs
    const graphs = generateBiodiversityGraphs(
      metrics,
      carbonData,
      years,
      deforestationAnalysis,
      biodiversityAssessment,
    );

    // Calculate key statistics
    const keyStats = calculateKeyBiodiversityStats(
      metrics,
      carbonData,
      years,
      deforestationAnalysis,
      biodiversityAssessment,
    );

    // Generate conservation recommendations
    const recommendations = generateConservationRecommendations(
      metrics,
      carbonData,
      deforestationAnalysis,
      biodiversityAssessment,
      company.industry,
      years,
    );

    // Calculate standards compliance
    const standardsCompliance = calculateStandardsCompliance(
      metrics,
      carbonData,
      biodiversityAssessment,
      deforestationAnalysis,
      company.industry,
    );

    // Prepare carbon emission accounting data
    const carbonEmissionAccounting = carbonData
      ? {
          framework: carbonData.framework,
          methodology: carbonData.emission_references?.methodology_statement,
          summary: carbonData.comprehensive_summary,
          ndvi_analysis: carbonData.comprehensive_summary?.ndvi_analysis,
          yearly_data: carbonData.yearly_data.map((yearData) => ({
            year: yearData.year,
            sequestration: {
              total_tco2:
                yearData.sequestration?.annual_summary
                  ?.sequestration_total_tco2 || 0,
              biomass_co2:
                yearData.sequestration?.annual_summary?.total_biomass_co2_t ||
                0,
              soc_co2:
                yearData.sequestration?.annual_summary?.total_soc_co2_t || 0,
              monthly_data: yearData.monthly_breakdown?.ndvi_trends || [],
            },
            emissions: {
              total_tco2e: yearData.emissions?.total_scope_emission_tco2e || 0,
              scope1_tco2e: yearData.emissions?.scope1?.total_tco2e || 0,
              scope2_tco2e: yearData.emissions?.scope2?.total_tco2e || 0,
              scope3_tco2e: yearData.emissions?.scope3?.total_tco2e || 0,
              net_balance: yearData.emissions?.net_total_emission_tco2e || 0,
            },
            land_area: {
              total_ha: yearData.sequestration?.reporting_area_ha || 0,
              soc_area_ha: yearData.sequestration?.soc_area_ha || 0,
            },
          })),
        }
      : null;

    const data = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "biodiversity_land_use",
        company_id: companyId,
        period_requested: year ? `${year}` : `${startYear}-${endYear}`,
        data_sources: carbonData
          ? [
              "ESGData",
              "CarbonEmissionAccounting",
              "RemoteSensing",
              "FieldSurveys",
            ]
          : ["ESGData", "FieldSurveys"],
        calculation_methods: [
          "NDVI Analysis for Vegetation Health",
          "Deforestation Risk Assessment Algorithm",
          "Biodiversity Scoring Model",
          "Land Use Change Detection",
          "Carbon Sequestration Estimation",
        ],
        compliance_frameworks: [
          "HVE (High Value Ecosystem) Standards",
          "TCFD Recommendations",
          "GRI 304: Biodiversity",
          "SASB Agricultural Standards",
          "UN Sustainable Development Goals",
        ],
      },

      company: {
        id: company._id,
        name: company.name,
        registrationNumber: company.registrationNumber,
        email: company.email,
        phone: company.phone,
        address: company.address,
        website: company.website,
        country: company.country,
        industry: company.industry,
        description: company.description,
        purpose: company.purpose,
        scope: company.scope,
        data_source: company.data_source,
        area_of_interest_metadata: company.area_of_interest_metadata,
        data_range: company.data_range,
        data_processing_workflow: company.data_processing_workflow,
        analytical_layer_metadata: company.analytical_layer_metadata,
        esg_reporting_framework: company.esg_reporting_framework,
        esg_contact_person: company.esg_contact_person,
        latest_esg_report_year: company.latest_esg_report_year,
        esg_data_status: company.esg_data_status,
        has_esg_linked_pay: company.has_esg_linked_pay,
        created_at: company.created_at,
        updated_at: company.updated_at,
      },

      reporting_period: {
        current_year: currentYear,
        baseline_year: baselineYear,
        analysis_years: years,
        period_covered: `${Math.min(...years)}-${Math.max(...years)}`,
        data_completeness: `${Object.keys(metrics).length}/${metricNames.length} metrics`,
        carbon_data_available: !!carbonData,
        monthly_data_available:
          carbonData?.yearly_data?.some((y) => y.monthly_breakdown) || false,
      },

      // Biodiversity Assessment
      biodiversity_assessment: biodiversityAssessment,

      // Deforestation & Land Use Analysis
      deforestation_analysis: deforestationAnalysis,

      // Land Use Metrics
      land_use_metrics: {
        current_year: {
          total_area:
            getMetricValueByYear(
              metrics["Land Use - Total Area (ha)"],
              currentYear,
            ) || 0,
          forest_area:
            getMetricValueByYear(
              metrics["Land Use - Forest Area (ha)"],
              currentYear,
            ) || 0,
          agricultural_area:
            getMetricValueByYear(
              metrics["Land Use - Agricultural Area (ha)"],
              currentYear,
            ) || 0,
          protected_area:
            getMetricValueByYear(
              metrics["Land Use - Protected Area (ha)"],
              currentYear,
            ) || 0,
          forest_coverage_percent:
            keyStats.environmental_metrics.forest_coverage_percent,
          protected_area_percent:
            keyStats.environmental_metrics.protected_area_percent,
        },
        trends: {
          forest_area_trend: calculateTrend(
            metrics["Land Use - Forest Area (ha)"],
            years,
          ),
          agricultural_area_trend: calculateTrend(
            metrics["Land Use - Agricultural Area (ha)"],
            years,
          ),
          total_area_trend: calculateTrend(
            metrics["Land Use - Total Area (ha)"],
            years,
          ),
        },
        change_analysis: calculateLandUseChange(metrics, years),
      },

      // Environmental Impact Metrics
      environmental_impact: {
        water_management: {
          current_usage: keyStats.environmental_metrics.total_water_usage,
          trend: calculateTrend(
            metrics["Water Usage - Irrigation Water Usage (million ML)"],
            years,
          ),
          efficiency: calculateWaterEfficiency(
            metrics,
            carbonData,
            currentYear,
          ),
          risk_level: biodiversityAssessment.detailed_assessment.water_impact,
        },
        waste_management: {
          hazardous_waste: keyStats.environmental_metrics.total_hazardous_waste,
          recycled_waste:
            getMetricValueByYear(
              metrics[
                "Waste Management - Recycled waste (excl. Boiler Ash) (tons)"
              ],
              currentYear,
            ) || 0,
          trend: calculateTrend(
            metrics[
              "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
            ],
            years,
          ),
          risk_level: biodiversityAssessment.detailed_assessment.waste_impact,
        },
        incident_management: {
          total_incidents: keyStats.environmental_metrics.total_incidents,
          trend: calculateTrend(
            metrics[
              "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
            ],
            years,
          ),
          risk_level:
            biodiversityAssessment.detailed_assessment.incident_impact,
        },
        soil_health: {
          erosion_rate:
            getMetricValueByYear(
              metrics["Soil Quality - Erosion Rate (tons/ha/year)"],
              currentYear,
            ) || 0,
          organic_matter:
            getMetricValueByYear(
              metrics["Soil Quality - Organic Matter Content (%)"],
              currentYear,
            ) || 0,
          trend: calculateTrend(
            metrics["Soil Quality - Organic Matter Content (%)"],
            years,
          ),
        },
      },

      // Social & Governance Metrics
      social_governance: {
        community_engagement: {
          programs_count: keyStats.social_governance_metrics.community_programs,
          local_employment:
            getMetricValueByYear(
              metrics["Social - Local Employment Rate (%)"],
              currentYear,
            ) || 0,
          land_rights_complaints:
            getMetricValueByYear(
              metrics["Social - Land Rights Complaints (count)"],
              currentYear,
            ) || 0,
          engagement_level:
            biodiversityAssessment.detailed_assessment.social_engagement,
        },
        governance_strength: {
          land_use_policy: keyStats.social_governance_metrics.land_use_policy,
          biodiversity_policy:
            keyStats.social_governance_metrics.biodiversity_policy,
          compliance_audits:
            getMetricValueByYear(
              metrics["Governance - Environmental Compliance Audits (count)"],
              currentYear,
            ) || 0,
          strength_level:
            biodiversityAssessment.detailed_assessment.governance_strength,
        },
      },

      // Carbon Emission Accounting
      carbon_emission_accounting: carbonEmissionAccounting,

      // ESG Metrics Data
      esg_metrics: {
        environmental: Object.values(metrics).filter(
          (m) => m.category === "environmental",
        ),
        social: Object.values(metrics).filter((m) => m.category === "social"),
        governance: Object.values(metrics).filter(
          (m) => m.category === "governance",
        ),
        summary: {
          total_metrics: Object.keys(metrics).length,
          environmental_metrics: Object.values(metrics).filter(
            (m) => m.category === "environmental",
          ).length,
          social_metrics: Object.values(metrics).filter(
            (m) => m.category === "social",
          ).length,
          governance_metrics: Object.values(metrics).filter(
            (m) => m.category === "governance",
          ).length,
          data_coverage_years: years.length,
        },
      },

      // Graphs and Visualizations
      graphs: graphs,

      // Key Statistics
      key_statistics: keyStats,

      // Conservation & Enhancement
      conservation_metrics: {
        habitat_restoration_potential: calculateHabitatRestorationPotential(
          metrics,
          currentYear,
        ),
        carbon_sequestration_potential: carbonData
          ? (
              carbonData.comprehensive_summary?.total_sequestration * 0.3
            ).toFixed(0) + " tCO₂ additional"
          : "Requires carbon assessment",
        water_conservation_potential:
          (
            getMetricValueByYear(
              metrics["Water Usage - Irrigation Water Usage (million ML)"],
              currentYear,
            ) * 0.15
          ).toFixed(1) + " million ML",
        biodiversity_enhancement_target:
          (100 - biodiversityAssessment.overall_score).toFixed(1) +
          " points improvement needed",
        deforestation_prevention:
          deforestationAnalysis.risk_level === "high"
            ? "Urgent action required"
            : "Maintain current monitoring",
      },

      // Standards Compliance
      standards_compliance: standardsCompliance,

      // HVE Compliance Notes
      hve_compliance: {
        deforestation_status:
          deforestationAnalysis.deforestation_alerts.length > 0
            ? "Potential deforestation detected - requires investigation"
            : "No deforestation reported",
        compliance_status:
          deforestationAnalysis.compliance_status === "compliant"
            ? "Compliant"
            : "Requires improvement",
        verification_requirements: [
          "Ground verification of NDVI alerts",
          "Independent audit of land use changes",
          "Stakeholder consultation on land management",
        ],
        last_assessment_date: new Date().toISOString().split("T")[0],
        next_assessment_due: new Date(
          new Date().setFullYear(new Date().getFullYear() + 1),
        )
          .toISOString()
          .split("T")[0],
      },

      // Recommendations
      recommendations: recommendations,

      // Summary and Outlook
      summary: {
        overall_assessment: getOverallAssessment(
          biodiversityAssessment,
          deforestationAnalysis,
        ),
        key_strengths: [
          biodiversityAssessment.overall_score >= 70
            ? "Strong biodiversity performance"
            : null,
          deforestationAnalysis.risk_level === "low"
            ? "Low deforestation risk"
            : null,
          carbonData ? "Comprehensive carbon accounting" : null,
          Object.keys(metrics).length > 15 ? "Good ESG data coverage" : null,
        ].filter(Boolean),
        critical_areas: [
          biodiversityAssessment.overall_score < 60
            ? "Biodiversity enhancement needed"
            : null,
          deforestationAnalysis.risk_level === "high"
            ? "High deforestation risk"
            : null,
          biodiversityAssessment.detailed_assessment.water_impact === "High"
            ? "Water management improvement"
            : null,
          biodiversityAssessment.detailed_assessment.waste_impact === "High"
            ? "Waste reduction needed"
            : null,
        ].filter(Boolean),
        next_steps: [
          "Implement high-priority recommendations",
          "Enhance monitoring and verification systems",
          "Strengthen stakeholder engagement",
          "Set science-based targets for biodiversity",
        ],
        outlook:
          biodiversityAssessment.overall_score >= 70 &&
          deforestationAnalysis.risk_level === "low"
            ? "Positive - Strong environmental stewardship"
            : biodiversityAssessment.overall_score >= 50 &&
                deforestationAnalysis.risk_level === "medium"
              ? "Moderate - Improvement opportunities identified"
              : "Concerning - Significant improvements needed",
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve biodiversity and land use data",
      500,
      "BIODIVERSITY_LAND_USE_API_ERROR",
      { details: error.message },
    );
  }
}

/**
 * Helper function to calculate water efficiency
 */
function calculateWaterEfficiency(metrics, carbonData, currentYear) {
  const waterUsage =
    getMetricValueByYear(
      metrics["Water Usage - Irrigation Water Usage (million ML)"],
      currentYear,
    ) || 0;

  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;

  const efficiency = waterUsage > 0 ? totalArea / waterUsage : 0;

  return {
    water_per_ha: waterUsage / totalArea,
    efficiency_score: Math.min(
      100,
      Math.max(0, 100 - (waterUsage / totalArea) * 1000),
    ),
    rating:
      efficiency > 100
        ? "Efficient"
        : efficiency > 50
          ? "Moderate"
          : "Inefficient",
  };
}

/**
 * Helper function to calculate habitat restoration potential
 */
function calculateHabitatRestorationPotential(metrics, currentYear) {
  const totalArea =
    getMetricValueByYear(metrics["Land Use - Total Area (ha)"], currentYear) ||
    1;
  const currentRestoration =
    getMetricValueByYear(
      metrics["Biodiversity - Habitat Restoration Area (ha)"],
      currentYear,
    ) || 0;

  const potential = totalArea * 0.1 - currentRestoration; // 10% target

  return {
    current_restoration: currentRestoration,
    restoration_target: totalArea * 0.1,
    remaining_potential: Math.max(0, potential),
    percent_of_target:
      ((currentRestoration / (totalArea * 0.1)) * 100).toFixed(1) + "%",
  };
}

/**
 * Helper function to calculate land use change
 */
function calculateLandUseChange(metrics, years) {
  if (years.length < 2) {
    return {
      change_detected: false,
      message: "Insufficient data for change analysis",
    };
  }

  const startYear = Math.min(...years);
  const endYear = Math.max(...years);

  const forestStart =
    getMetricValueByYear(metrics["Land Use - Forest Area (ha)"], startYear) ||
    0;
  const forestEnd =
    getMetricValueByYear(metrics["Land Use - Forest Area (ha)"], endYear) || 0;

  const agriStart =
    getMetricValueByYear(
      metrics["Land Use - Agricultural Area (ha)"],
      startYear,
    ) || 0;
  const agriEnd =
    getMetricValueByYear(
      metrics["Land Use - Agricultural Area (ha)"],
      endYear,
    ) || 0;

  const forestChange =
    forestStart > 0 ? ((forestEnd - forestStart) / forestStart) * 100 : 0;
  const agriChange =
    agriStart > 0 ? ((agriEnd - agriStart) / agriStart) * 100 : 0;

  const analysis = {
    period: `${startYear}-${endYear}`,
    forest_area: {
      start: forestStart,
      end: forestEnd,
      change: forestChange,
      trend:
        forestChange < -5
          ? "Declining"
          : forestChange > 5
            ? "Increasing"
            : "Stable",
    },
    agricultural_area: {
      start: agriStart,
      end: agriEnd,
      change: agriChange,
      trend:
        agriChange > 10
          ? "Expanding"
          : agriChange < -10
            ? "Contracting"
            : "Stable",
    },
    change_detected: Math.abs(forestChange) > 5 || Math.abs(agriChange) > 10,
    primary_driver:
      forestChange < -5 && agriChange > 10
        ? "Agricultural expansion"
        : "Other factors",
    implications:
      forestChange < -5
        ? "Potential deforestation or land degradation"
        : "Stable land use patterns",
  };

  return analysis;
}

/**
 * Helper function to get overall assessment
 */
function getOverallAssessment(biodiversityAssessment, deforestationAnalysis) {
  if (
    biodiversityAssessment.overall_score >= 70 &&
    deforestationAnalysis.risk_level === "low"
  ) {
    return "Excellent - Strong environmental stewardship with minimal risks";
  } else if (
    biodiversityAssessment.overall_score >= 60 &&
    deforestationAnalysis.risk_level === "medium"
  ) {
    return "Good - Solid performance with some improvement opportunities";
  } else if (
    biodiversityAssessment.overall_score >= 50 &&
    deforestationAnalysis.risk_level === "medium"
  ) {
    return "Fair - Moderate performance, significant improvements needed";
  } else {
    return "Poor - Substantial improvements required in biodiversity and land management";
  }
}

module.exports = {
  getBiodiversityLandUseData,
};
