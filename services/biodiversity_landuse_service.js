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
 * Calculate deforestation and land use change analysis based on actual data
 */
function calculateDeforestationAnalysis(metrics, carbonData, years) {
  const currentYear = Math.max(...years);
  const previousYear = years.length > 1 ? currentYear - 1 : null;

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

  // Calculate coverage percentages
  const forestCoveragePercent = (currentForest / currentTotal) * 100;
  const protectedAreaPercent = (currentProtected / currentTotal) * 100;

  return {
    forest_coverage: {
      current: currentForest,
      previous: previousForest,
      change_percent: forestChange,
      coverage_percent: forestCoveragePercent,
    },
    agricultural_expansion: {
      current: currentAgri,
      previous: previousAgri,
      change_percent: agriChange,
    },
    protected_area_coverage: {
      area: currentProtected,
      percentage: protectedAreaPercent,
    },
  };
}

/**
 * Calculate comprehensive biodiversity assessment based on actual data
 */
function calculateBiodiversityAssessment(metrics, carbonData, years) {
  const currentYear = Math.max(...years);

  // Extract environmental metrics that exist in the database
  const environmentalMetrics = {};
  const socialMetrics = {};
  const governanceMetrics = {};

  // Extract actual metric values
  Object.keys(metrics).forEach((metricName) => {
    const metric = metrics[metricName];
    const value = getMetricValueByYear(metric, currentYear);

    if (metric.category === "environmental") {
      environmentalMetrics[metricName] = value;
    } else if (metric.category === "social") {
      socialMetrics[metricName] = value;
    } else if (metric.category === "governance") {
      governanceMetrics[metricName] = value;
    }
  });

  return {
    environmental_metrics: environmentalMetrics,
    social_metrics: socialMetrics,
    governance_metrics: governanceMetrics,
    current_year: currentYear,
  };
}

/**
 * Generate comprehensive graphs for biodiversity and land use based on actual data
 */
function generateBiodiversityGraphs(metrics, carbonData, years) {
  const graphs = {};
  const currentYear = Math.max(...years);

  // 1. Land Use Composition (Current Year) - only if we have the data
  const forestArea = metrics["Land Use - Forest Area (ha)"];
  const agriArea = metrics["Land Use - Agricultural Area (ha)"];
  const protectedArea = metrics["Land Use - Protected Area (ha)"];
  const totalArea = metrics["Land Use - Total Area (ha)"];

  if (forestArea && agriArea && protectedArea && totalArea) {
    const forestValue = getMetricValueByYear(forestArea, currentYear) || 0;
    const agriValue = getMetricValueByYear(agriArea, currentYear) || 0;
    const protectedValue =
      getMetricValueByYear(protectedArea, currentYear) || 0;
    const totalValue = getMetricValueByYear(totalArea, currentYear) || 1;
    const otherValue = Math.max(
      0,
      totalValue - forestValue - agriValue - protectedValue,
    );

    if (totalValue > 0) {
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
            data: [forestValue, agriValue, protectedValue, otherValue],
            backgroundColor: ["#27ae60", "#f39c12", "#3498db", "#95a5a6"],
            borderWidth: 2,
          },
        ],
      };
    }
  }

  // 2. NDVI Monthly Trend (for all available years from carbon data)
  if (carbonData && carbonData.yearly_data) {
    const ndviGraphs = {};

    carbonData.yearly_data.forEach((yearData) => {
      if (yearData.monthly_breakdown?.ndvi_trends) {
        ndviGraphs[yearData.year] = {
          type: "line",
          title: `Monthly NDVI Trend - ${yearData.year}`,
          description:
            "Normalized Difference Vegetation Index monthly variation",
          labels: yearData.monthly_breakdown.ndvi_trends.map(
            (m) => m.month_name,
          ),
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
    });

    if (Object.keys(ndviGraphs).length > 0) {
      graphs.ndvi_monthly_trends = ndviGraphs;
    }
  }

  // 3. Forest Area Trend Over Time - only if we have multiple years of data
  if (forestArea && forestArea.values && forestArea.values.length >= 2) {
    const forestYears = forestArea.values.map((v) => v.year);
    const forestValues = forestArea.values.map(
      (v) => v.numeric_value || parseFloat(v.value) || 0,
    );

    graphs.forest_area_trend = {
      type: "line",
      title: "Forest Area Trend",
      description: "Historical changes in forest coverage",
      labels: forestYears,
      datasets: [
        {
          label: "Forest Area (ha)",
          data: forestValues,
          borderColor: "#27ae60",
          backgroundColor: "rgba(39, 174, 96, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // 4. Carbon Sequestration vs Emissions - if carbon data is available
  if (
    carbonData &&
    carbonData.yearly_data &&
    carbonData.yearly_data.length >= 2
  ) {
    const sortedData = [...carbonData.yearly_data].sort(
      (a, b) => a.year - b.year,
    );

    const sequestrationData = sortedData.map(
      (d) => d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
    );
    const emissionsData = sortedData.map(
      (d) => d.emissions?.total_scope_emission_tco2e || 0,
    );

    // Only include if we have actual data
    if (
      sequestrationData.some((v) => v > 0) ||
      emissionsData.some((v) => v > 0)
    ) {
      graphs.carbon_balance_trend = {
        type: "bar",
        title: "Carbon Balance Trend",
        description: "Comparison of carbon sequestration and emissions",
        labels: sortedData.map((d) => d.year),
        datasets: [
          {
            label: "Carbon Sequestration (tCO₂)",
            data: sequestrationData,
            backgroundColor: "#27ae60",
          },
          {
            label: "GHG Emissions (tCO₂e)",
            data: emissionsData,
            backgroundColor: "#e74c3c",
          },
        ],
      };
    }
  }

  // 5. Monthly Carbon Sequestration Breakdown - if carbon data is available
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData?.monthly_breakdown?.ndvi_trends) {
      const biomassData = yearData.monthly_breakdown.ndvi_trends.map(
        (m) => m.biomass_co2,
      );
      const socData = yearData.monthly_breakdown.ndvi_trends.map(
        (m) => m.soc_co2,
      );

      if (biomassData.some((v) => v > 0) || socData.some((v) => v > 0)) {
        graphs.monthly_carbon_sequestration = {
          type: "bar",
          title: `Monthly Carbon Sequestration - ${currentYear}`,
          description: "Monthly breakdown of biomass and soil organic carbon",
          labels: yearData.monthly_breakdown.ndvi_trends.map(
            (m) => m.month_name,
          ),
          datasets: [
            {
              label: "Biomass CO₂ (t)",
              data: biomassData,
              backgroundColor: "#f39c12",
            },
            {
              label: "Soil Organic Carbon CO₂ (t)",
              data: socData,
              backgroundColor: "#8e44ad",
            },
          ],
        };
      }
    }
  }

  // 6. Environmental Incidents Timeline - only if we have the data
  const incidentsMetric =
    metrics[
      "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
    ];

  if (
    incidentsMetric &&
    incidentsMetric.values &&
    incidentsMetric.values.length >= 2
  ) {
    const incidentYears = incidentsMetric.values.map((v) => v.year);
    const incidentValues = incidentsMetric.values.map(
      (v) => v.numeric_value || parseFloat(v.value) || 0,
    );

    graphs.environmental_incidents_timeline = {
      type: "line",
      title: "Environmental Incidents Trend",
      description: "Historical trend of environmental incidents",
      labels: incidentYears,
      datasets: [
        {
          label: "Incidents Count",
          data: incidentValues,
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // 7. Water Usage Trend - if we have the data
  const waterUsageMetric =
    metrics["Water Usage - Irrigation Water Usage (million ML)"];
  if (
    waterUsageMetric &&
    waterUsageMetric.values &&
    waterUsageMetric.values.length >= 2
  ) {
    const waterYears = waterUsageMetric.values.map((v) => v.year);
    const waterValues = waterUsageMetric.values.map(
      (v) => v.numeric_value || parseFloat(v.value) || 0,
    );

    graphs.water_usage_trend = {
      type: "line",
      title: "Water Usage Trend",
      description: "Historical trend of irrigation water usage",
      labels: waterYears,
      datasets: [
        {
          label: "Water Usage (million ML)",
          data: waterValues,
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  return graphs;
}

/**
 * Calculate key biodiversity statistics from actual data
 */
function calculateKeyBiodiversityStats(metrics, carbonData, years) {
  const currentYear = Math.max(...years);

  const stats = {
    total_metrics_analyzed: Object.keys(metrics).length,
    years_covered: years.length,
    current_year: currentYear,
    environmental_metrics: {},
    biodiversity_metrics: {},
    social_governance_metrics: {},
  };

  // Extract actual environmental metrics
  const waterUsage = getMetricValueByYear(
    metrics["Water Usage - Irrigation Water Usage (million ML)"],
    currentYear,
  );
  if (waterUsage !== null) {
    stats.environmental_metrics.total_water_usage = waterUsage;
  }

  const hazardousWaste = getMetricValueByYear(
    metrics[
      "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
    ],
    currentYear,
  );
  if (hazardousWaste !== null) {
    stats.environmental_metrics.total_hazardous_waste = hazardousWaste;
  }

  const incidents = getMetricValueByYear(
    metrics[
      "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
    ],
    currentYear,
  );
  if (incidents !== null) {
    stats.environmental_metrics.total_incidents = incidents;
  }

  const forestArea = getMetricValueByYear(
    metrics["Land Use - Forest Area (ha)"],
    currentYear,
  );
  const totalArea = getMetricValueByYear(
    metrics["Land Use - Total Area (ha)"],
    currentYear,
  );
  if (forestArea !== null && totalArea !== null && totalArea > 0) {
    stats.environmental_metrics.forest_coverage_percent =
      (forestArea / totalArea) * 100;
  }

  const protectedArea = getMetricValueByYear(
    metrics["Land Use - Protected Area (ha)"],
    currentYear,
  );
  if (protectedArea !== null && totalArea !== null && totalArea > 0) {
    stats.environmental_metrics.protected_area_percent =
      (protectedArea / totalArea) * 100;
  }

  // Extract biodiversity metrics
  const endangeredSpecies = getMetricValueByYear(
    metrics["Biodiversity - Endangered Species Count"],
    currentYear,
  );
  if (endangeredSpecies !== null) {
    stats.biodiversity_metrics.endangered_species_count = endangeredSpecies;
  }

  const habitatRestoration = getMetricValueByYear(
    metrics["Biodiversity - Habitat Restoration Area (ha)"],
    currentYear,
  );
  if (habitatRestoration !== null) {
    stats.biodiversity_metrics.habitat_restoration_area = habitatRestoration;
    if (totalArea !== null && totalArea > 0) {
      stats.biodiversity_metrics.restoration_percentage =
        (habitatRestoration / totalArea) * 100;
    }
  }

  // Extract social and governance metrics
  const communityPrograms = getMetricValueByYear(
    metrics["Social - Community Engagement Programs (count)"],
    currentYear,
  );
  if (communityPrograms !== null) {
    stats.social_governance_metrics.community_programs = communityPrograms;
  }

  const landUsePolicy = getMetricValueByYear(
    metrics["Governance - Land Use Policy (yes/no)"],
    currentYear,
  );
  if (landUsePolicy !== null) {
    stats.social_governance_metrics.land_use_policy = landUsePolicy
      ? "Yes"
      : "No";
  }

  const biodiversityPolicy = getMetricValueByYear(
    metrics["Governance - Biodiversity Policy (yes/no)"],
    currentYear,
  );
  if (biodiversityPolicy !== null) {
    stats.social_governance_metrics.biodiversity_policy = biodiversityPolicy
      ? "Yes"
      : "No";
  }

  return stats;
}

/**
 * Calculate water efficiency based on actual data
 */
function calculateWaterEfficiency(metrics, currentYear) {
  const waterUsage = getMetricValueByYear(
    metrics["Water Usage - Irrigation Water Usage (million ML)"],
    currentYear,
  );

  const totalArea = getMetricValueByYear(
    metrics["Land Use - Total Area (ha)"],
    currentYear,
  );

  if (waterUsage === null || totalArea === null || totalArea === 0) {
    return null;
  }

  return {
    water_usage_per_ha: waterUsage / totalArea,
    total_water_usage: waterUsage,
    total_area: totalArea,
  };
}

/**
 * Calculate land use change based on actual data
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

  const forestStart = getMetricValueByYear(
    metrics["Land Use - Forest Area (ha)"],
    startYear,
  );
  const forestEnd = getMetricValueByYear(
    metrics["Land Use - Forest Area (ha)"],
    endYear,
  );

  const agriStart = getMetricValueByYear(
    metrics["Land Use - Agricultural Area (ha)"],
    startYear,
  );
  const agriEnd = getMetricValueByYear(
    metrics["Land Use - Agricultural Area (ha)"],
    endYear,
  );

  const analysis = {
    period: `${startYear}-${endYear}`,
    forest_area: {
      start: forestStart,
      end: forestEnd,
      change:
        forestStart !== null && forestEnd !== null
          ? forestEnd - forestStart
          : null,
      change_percent:
        forestStart !== null && forestStart > 0 && forestEnd !== null
          ? ((forestEnd - forestStart) / forestStart) * 100
          : null,
    },
    agricultural_area: {
      start: agriStart,
      end: agriEnd,
      change:
        agriStart !== null && agriEnd !== null ? agriEnd - agriStart : null,
      change_percent:
        agriStart !== null && agriStart > 0 && agriEnd !== null
          ? ((agriEnd - agriStart) / agriStart) * 100
          : null,
    },
  };

  return analysis;
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
    // Year is now required
    if (!year && (!startYear || !endYear)) {
      throw new AppError(
        "Year or year range is required",
        400,
        "YEAR_REQUIRED",
      );
    }

    // Get company with all fields
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

    // Calculate deforestation analysis based on actual data
    const deforestationAnalysis = calculateDeforestationAnalysis(
      metrics,
      carbonData,
      years,
    );

    // Calculate biodiversity assessment based on actual data
    const biodiversityAssessment = calculateBiodiversityAssessment(
      metrics,
      carbonData,
      years,
    );

    // Generate comprehensive graphs based on actual data
    const graphs = generateBiodiversityGraphs(metrics, carbonData, years);

    // Calculate key statistics from actual data
    const keyStats = calculateKeyBiodiversityStats(metrics, carbonData, years);

    // Calculate water efficiency
    const waterEfficiency = calculateWaterEfficiency(metrics, currentYear);

    // Calculate land use change
    const landUseChange = calculateLandUseChange(metrics, years);

    // Prepare carbon emission accounting data
    const carbonEmissionAccounting = carbonData
      ? {
          framework: carbonData.framework,
          methodology: carbonData.emission_references?.methodology_statement,
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

    // Organize metrics by category
    const metricsByCategory = {
      environmental: [],
      social: [],
      governance: [],
    };

    Object.values(metrics).forEach((metric) => {
      const metricData = {
        name: metric.name,
        unit: metric.unit,
        description: metric.description,
        current_value: getMetricValueByYear(metric, currentYear),
        values: metric.values,
      };

      if (metric.category === "environmental") {
        metricsByCategory.environmental.push(metricData);
      } else if (metric.category === "social") {
        metricsByCategory.social.push(metricData);
      } else if (metric.category === "governance") {
        metricsByCategory.governance.push(metricData);
      }
    });

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
          ? ["ESGData", "CarbonEmissionAccounting"]
          : ["ESGData"],
      },

      // Return all company data
      company: company,

      reporting_period: {
        current_year: currentYear,
        baseline_year: baselineYear,
        analysis_years: years,
        period_covered: `${Math.min(...years)}-${Math.max(...years)}`,
        data_completeness: `${Object.keys(metrics).length} metrics available`,
        carbon_data_available: !!carbonData,
      },

      // Biodiversity Assessment based on actual data
      biodiversity_assessment: biodiversityAssessment,

      // Deforestation & Land Use Analysis based on actual data
      deforestation_analysis: deforestationAnalysis,

      // Land Use Metrics
      land_use_metrics: {
        current_year: {
          total_area: getMetricValueByYear(
            metrics["Land Use - Total Area (ha)"],
            currentYear,
          ),
          forest_area: getMetricValueByYear(
            metrics["Land Use - Forest Area (ha)"],
            currentYear,
          ),
          agricultural_area: getMetricValueByYear(
            metrics["Land Use - Agricultural Area (ha)"],
            currentYear,
          ),
          protected_area: getMetricValueByYear(
            metrics["Land Use - Protected Area (ha)"],
            currentYear,
          ),
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
        },
        change_analysis: landUseChange,
      },

      // Environmental Impact Metrics based on actual data
      environmental_impact: {
        water_management: {
          current_usage: getMetricValueByYear(
            metrics["Water Usage - Irrigation Water Usage (million ML)"],
            currentYear,
          ),
          trend: calculateTrend(
            metrics["Water Usage - Irrigation Water Usage (million ML)"],
            years,
          ),
          efficiency: waterEfficiency,
        },
        waste_management: {
          hazardous_waste: getMetricValueByYear(
            metrics[
              "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
            ],
            currentYear,
          ),
          recycled_waste: getMetricValueByYear(
            metrics[
              "Waste Management - Recycled waste (excl. Boiler Ash) (tons)"
            ],
            currentYear,
          ),
          trend: calculateTrend(
            metrics[
              "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
            ],
            years,
          ),
        },
        incident_management: {
          total_incidents: getMetricValueByYear(
            metrics[
              "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
            ],
            currentYear,
          ),
          trend: calculateTrend(
            metrics[
              "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
            ],
            years,
          ),
        },
        soil_health: {
          erosion_rate: getMetricValueByYear(
            metrics["Soil Quality - Erosion Rate (tons/ha/year)"],
            currentYear,
          ),
          organic_matter: getMetricValueByYear(
            metrics["Soil Quality - Organic Matter Content (%)"],
            currentYear,
          ),
          trend: calculateTrend(
            metrics["Soil Quality - Organic Matter Content (%)"],
            years,
          ),
        },
      },

      // Social & Governance Metrics based on actual data
      social_governance: {
        community_engagement: {
          programs_count: getMetricValueByYear(
            metrics["Social - Community Engagement Programs (count)"],
            currentYear,
          ),
          local_employment: getMetricValueByYear(
            metrics["Social - Local Employment Rate (%)"],
            currentYear,
          ),
          land_rights_complaints: getMetricValueByYear(
            metrics["Social - Land Rights Complaints (count)"],
            currentYear,
          ),
        },
        governance_strength: {
          land_use_policy: getMetricValueByYear(
            metrics["Governance - Land Use Policy (yes/no)"],
            currentYear,
          ),
          biodiversity_policy: getMetricValueByYear(
            metrics["Governance - Biodiversity Policy (yes/no)"],
            currentYear,
          ),
          compliance_audits: getMetricValueByYear(
            metrics["Governance - Environmental Compliance Audits (count)"],
            currentYear,
          ),
        },
      },

      // Carbon Emission Accounting
      carbon_emission_accounting: carbonEmissionAccounting,

      // ESG Metrics Data organized by category
      esg_metrics: metricsByCategory,

      // Graphs and Visualizations based on actual data
      graphs: graphs,

      // Key Statistics based on actual data
      key_statistics: keyStats,

      // Summary based on actual data
      summary: {
        data_availability: {
          total_metrics: Object.keys(metrics).length,
          years_covered: years.length,
          carbon_data: !!carbonData,
          ndvi_data:
            carbonData?.yearly_data?.some((y) => y.monthly_breakdown) || false,
        },
        notable_metrics: {
          forest_coverage:
            deforestationAnalysis.forest_coverage.coverage_percent,
          water_usage: getMetricValueByYear(
            metrics["Water Usage - Irrigation Water Usage (million ML)"],
            currentYear,
          ),
          incidents_count: getMetricValueByYear(
            metrics[
              "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"
            ],
            currentYear,
          ),
        },
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

module.exports = {
  getBiodiversityLandUseData,
};
