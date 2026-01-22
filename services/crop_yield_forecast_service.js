const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract ALL environmental metric values
 */
async function getAllEnvironmentalMetrics(companyId, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.category": "environmental",
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country")
      .lean();

    // Extract and organize all environmental metrics
    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metric.category === "environmental") {
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
              // Try to extract numeric value
              let numericValue = value.numeric_value;
              if (numericValue === undefined || numericValue === null) {
                // Try to parse from string value
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
      `Error fetching environmental metrics: ${error.message}`,
      500,
      "ENV_METRICS_FETCH_ERROR",
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
 * Helper function to get comprehensive Carbon Emission Accounting data
 */
async function getComprehensiveCarbonEmissionData(companyId, year = null) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      status: { $in: ["draft", "under_review", "approved", "published"] },
    };

    if (year) {
      query["yearly_data.year"] = year;
    }

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

    // Filter yearly data if year is specified
    let filteredYearlyData = carbonData.yearly_data || [];
    if (year && filteredYearlyData.length > 0) {
      filteredYearlyData = filteredYearlyData.filter(
        (data) => data.year === year,
      );
    }

    // Sort yearly data by year
    filteredYearlyData.sort((a, b) => a.year - b.year);

    // Enhanced yearly data processing
    const enhancedYearlyData = filteredYearlyData.map((yearData) => {
      const enhanced = { ...yearData };

      // Process sequestration monthly data
      if (enhanced.sequestration && enhanced.sequestration.monthly_data) {
        const monthlyData = enhanced.sequestration.monthly_data;

        // Sort by month number
        monthlyData.sort(
          (a, b) => (a.month_number || 0) - (b.month_number || 0),
        );

        // Calculate vegetation indices summary
        const ndviValues = monthlyData
          .filter((m) => m.ndvi_max !== null && m.ndvi_max !== undefined)
          .map((m) => m.ndvi_max);

        if (ndviValues.length > 0) {
          enhanced.sequestration.vegetation_summary = {
            average_ndvi:
              ndviValues.reduce((a, b) => a + b, 0) / ndviValues.length,
            max_ndvi: Math.max(...ndviValues),
            min_ndvi: Math.min(...ndviValues),
            ndvi_std_dev: calculateStandardDeviation(ndviValues),
            growing_season_months: monthlyData
              .filter((m) => m.month_number >= 3 && m.month_number <= 8)
              .map((m) => ({
                month: m.month,
                ndvi: m.ndvi_max,
                biomass: m.agb_t_per_ha,
              })),
          };
        }

        // Calculate SOC summary
        const socValues = monthlyData
          .filter(
            (m) => m.soc_tc_per_ha !== null && m.soc_tc_per_ha !== undefined,
          )
          .map((m) => m.soc_tc_per_ha);

        if (socValues.length > 0) {
          enhanced.sequestration.soc_summary = {
            average_soc:
              socValues.reduce((a, b) => a + b, 0) / socValues.length,
            soc_change: monthlyData
              .filter((m) => m.delta_soc_co2_t)
              .reduce((sum, m) => sum + m.delta_soc_co2_t, 0),
            sequestration_rate: enhanced.sequestration.soc_area_ha
              ? monthlyData
                  .filter((m) => m.delta_soc_co2_t)
                  .reduce((sum, m) => sum + m.delta_soc_co2_t, 0) /
                enhanced.sequestration.soc_area_ha
              : 0,
          };
        }

        // Calculate biomass summary
        const biomassValues = monthlyData
          .filter(
            (m) => m.agb_t_per_ha !== null && m.agb_t_per_ha !== undefined,
          )
          .map((m) => m.agb_t_per_ha);

        if (biomassValues.length > 0) {
          enhanced.sequestration.biomass_summary = {
            average_biomass:
              biomassValues.reduce((a, b) => a + b, 0) / biomassValues.length,
            peak_biomass_month: monthlyData.reduce((max, m) =>
              (m.agb_t_per_ha || 0) > (max.agb_t_per_ha || 0) ? m : max,
            ).month,
            total_biomass_co2: monthlyData
              .filter((m) => m.biomass_co2_total_t)
              .reduce((sum, m) => sum + m.biomass_co2_total_t, 0),
          };
        }
      }

      // Process emissions data
      if (enhanced.emissions) {
        // Scope 1 details
        if (enhanced.emissions.scope1 && enhanced.emissions.scope1.sources) {
          enhanced.emissions.scope1.detailed_sources =
            enhanced.emissions.scope1.sources.map((source) => ({
              source: source.source,
              parameter: source.parameter,
              unit: source.unit,
              annual_per_ha: source.annual_per_ha,
              emission_factor: source.emission_factor,
              tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
              total_tco2e: source.annual_per_ha
                ? source.annual_per_ha *
                  (enhanced.sequestration?.soc_area_ha || 1) *
                  (source.tco2e_per_ha_per_year || 0)
                : 0,
            }));
        }

        // Scope 2 details
        if (enhanced.emissions.scope2 && enhanced.emissions.scope2.sources) {
          enhanced.emissions.scope2.detailed_sources =
            enhanced.emissions.scope2.sources.map((source) => ({
              source: source.source,
              parameter: source.parameter,
              unit: source.unit,
              annual_activity_per_ha: source.annual_activity_per_ha,
              emission_factor: source.emission_factor,
              tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
              total_tco2e: source.annual_activity_per_ha
                ? source.annual_activity_per_ha *
                  (enhanced.sequestration?.soc_area_ha || 1) *
                  (source.tco2e_per_ha_per_year || 0)
                : 0,
            }));
        }

        // Scope 3 details
        if (enhanced.emissions.scope3 && enhanced.emissions.scope3.categories) {
          enhanced.emissions.scope3.detailed_categories =
            enhanced.emissions.scope3.categories.map((category) => ({
              category: category.category,
              parameter: category.parameter,
              unit: category.unit,
              annual_activity_per_ha: category.annual_activity_per_ha,
              emission_factor: category.emission_factor,
              tco2e_per_ha_per_year: category.tco2e_per_ha_per_year,
              total_tco2e: category.annual_activity_per_ha
                ? category.annual_activity_per_ha *
                  (enhanced.sequestration?.soc_area_ha || 1) *
                  (category.tco2e_per_ha_per_year || 0)
                : 0,
            }));
        }

        // Calculate emissions intensity
        const area =
          enhanced.sequestration?.soc_area_ha ||
          enhanced.sequestration?.reporting_area_ha ||
          1;
        enhanced.emissions.intensity_metrics = {
          scope1_intensity: enhanced.emissions.scope1?.total_tco2e
            ? enhanced.emissions.scope1.total_tco2e / area
            : 0,
          scope2_intensity: enhanced.emissions.scope2?.total_tco2e
            ? enhanced.emissions.scope2.total_tco2e / area
            : 0,
          scope3_intensity: enhanced.emissions.scope3?.total_tco2e
            ? enhanced.emissions.scope3.total_tco2e / area
            : 0,
          total_intensity: enhanced.emissions.total_scope_emission_tco2e
            ? enhanced.emissions.total_scope_emission_tco2e / area
            : 0,
        };
      }

      return enhanced;
    });

    return {
      ...carbonData,
      yearly_data: enhancedYearlyData,
      // Calculate comprehensive summary
      comprehensive_summary:
        calculateCarbonComprehensiveSummary(enhancedYearlyData),
    };
  } catch (error) {
    console.error("Error fetching comprehensive carbon emission data:", error);
    return null;
  }
}

/**
 * Helper function to calculate standard deviation
 */
function calculateStandardDeviation(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((value) => Math.pow(value - mean, 2));
  return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Helper function to calculate comprehensive carbon summary
 */
function calculateCarbonComprehensiveSummary(yearlyData) {
  if (!yearlyData || yearlyData.length === 0) return null;

  const years = yearlyData.map((d) => d.year);

  // Sequestration metrics
  const sequestrationData = yearlyData.map((d) => ({
    year: d.year,
    total: d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
    soc: d.sequestration?.annual_summary?.total_soc_co2_t || 0,
    biomass: d.sequestration?.annual_summary?.total_biomass_co2_t || 0,
    area:
      d.sequestration?.soc_area_ha || d.sequestration?.reporting_area_ha || 0,
  }));

  // Emission metrics
  const emissionData = yearlyData.map((d) => ({
    year: d.year,
    scope1: d.emissions?.scope1?.total_tco2e || 0,
    scope2: d.emissions?.scope2?.total_tco2e || 0,
    scope3: d.emissions?.scope3?.total_tco2e || 0,
    total: d.emissions?.total_scope_emission_tco2e || 0,
    net: d.emissions?.net_total_emission_tco2e || 0,
  }));

  // Calculate trends
  const sequestrationTrend =
    sequestrationData.length >= 2
      ? calculatePercentageChange(
          sequestrationData[0].total,
          sequestrationData[sequestrationData.length - 1].total,
        )
      : 0;

  const emissionTrend =
    emissionData.length >= 2
      ? calculatePercentageChange(
          emissionData[0].total,
          emissionData[emissionData.length - 1].total,
        )
      : 0;

  // Calculate averages
  const avgSequestration =
    sequestrationData.reduce((sum, d) => sum + d.total, 0) /
    sequestrationData.length;
  const avgEmissions =
    emissionData.reduce((sum, d) => sum + d.total, 0) / emissionData.length;
  const avgArea =
    sequestrationData.reduce((sum, d) => sum + d.area, 0) /
    sequestrationData.length;

  return {
    period: {
      start_year: Math.min(...years),
      end_year: Math.max(...years),
      years_count: years.length,
    },
    totals: {
      total_sequestration_tco2: sequestrationData.reduce(
        (sum, d) => sum + d.total,
        0,
      ),
      total_emissions_tco2e: emissionData.reduce((sum, d) => sum + d.total, 0),
      net_carbon_balance:
        sequestrationData.reduce((sum, d) => sum + d.total, 0) -
        emissionData.reduce((sum, d) => sum + d.total, 0),
      average_area_ha: avgArea,
    },
    averages: {
      annual_sequestration: avgSequestration,
      annual_emissions: avgEmissions,
      carbon_intensity: avgArea > 0 ? avgEmissions / avgArea : 0,
      sequestration_rate: avgArea > 0 ? avgSequestration / avgArea : 0,
    },
    trends: {
      sequestration_trend: sequestrationTrend,
      emission_trend: emissionTrend,
      sequestration_direction:
        sequestrationTrend > 5
          ? "increasing"
          : sequestrationTrend < -5
            ? "decreasing"
            : "stable",
      emission_direction:
        emissionTrend > 5
          ? "increasing"
          : emissionTrend < -5
            ? "decreasing"
            : "stable",
    },
    composition: {
      scope1_percentage:
        emissionData.reduce((sum, d) => sum + d.scope1, 0) > 0
          ? (emissionData.reduce((sum, d) => sum + d.scope1, 0) /
              emissionData.reduce((sum, d) => sum + d.total, 0)) *
            100
          : 0,
      scope2_percentage:
        emissionData.reduce((sum, d) => sum + d.scope2, 0) > 0
          ? (emissionData.reduce((sum, d) => sum + d.scope2, 0) /
              emissionData.reduce((sum, d) => sum + d.total, 0)) *
            100
          : 0,
      scope3_percentage:
        emissionData.reduce((sum, d) => sum + d.scope3, 0) > 0
          ? (emissionData.reduce((sum, d) => sum + d.scope3, 0) /
              emissionData.reduce((sum, d) => sum + d.total, 0)) *
            100
          : 0,
      soc_sequestration_percentage:
        sequestrationData.reduce((sum, d) => sum + d.soc, 0) > 0
          ? (sequestrationData.reduce((sum, d) => sum + d.soc, 0) /
              sequestrationData.reduce((sum, d) => sum + d.total, 0)) *
            100
          : 0,
    },
  };
}

/**
 * Helper function to calculate yield forecast based on multiple factors
 */
function calculateYieldForecast(metrics, carbonData, company, currentYear) {
  const baseIndustryYields = {
    "Agriculture & Sugar Production": 80,
    Agriculture: 60,
    "Sugar Production": 85,
    Agribusiness: 70,
    Farming: 55,
    default: 50,
  };

  const baseYield =
    baseIndustryYields[company.industry] || baseIndustryYields.default;

  // Get current year carbon data for NDVI
  let ndviFactor = 0.8; // Default
  let biomassFactor = 1.0;
  let ndviData = null;

  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.sequestration?.vegetation_summary) {
      ndviData = yearData.sequestration.vegetation_summary;
      const ndvi = ndviData.average_ndvi;
      ndviFactor = Math.min(1.2, Math.max(0.5, ndvi / 0.6)); // Normalize around 0.6 NDVI

      if (yearData.sequestration.biomass_summary) {
        const biomass = yearData.sequestration.biomass_summary.average_biomass;
        biomassFactor = Math.min(1.3, Math.max(0.7, biomass / 10)); // Normalize around 10 t/ha
      }
    }
  }

  // Water efficiency factor
  const waterData =
    metrics["Water Usage - Irrigation Water Usage (million ML)"] ||
    metrics["Water Usage (m³)"] ||
    metrics["Water Usage - Total (m³)"];
  const waterUsage = getMetricValueByYear(waterData, currentYear) || 0;
  const waterEfficiency =
    waterUsage > 0
      ? Math.min(
          1.1,
          Math.max(
            0.6,
            1 -
              waterUsage /
                (waterData?.unit?.includes("million") ? 500 : 500000),
          ),
        )
      : 0.85;

  // Energy efficiency factor
  const electricityData =
    metrics["Energy Consumption - Electricity Purchased (MWH)"] ||
    metrics["Energy Consumption - Total (MWH)"];
  const electricityUsage =
    getMetricValueByYear(electricityData, currentYear) || 0;
  const energyEfficiency =
    electricityUsage > 0
      ? Math.min(1.1, Math.max(0.7, 1 - electricityUsage / 20000))
      : 0.8;

  // Soil health factor from carbon data
  let soilHealthFactor = 1.0;
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.sequestration?.soc_summary) {
      const avgSOC = yearData.sequestration.soc_summary.average_soc;
      soilHealthFactor = Math.min(1.2, Math.max(0.8, avgSOC / 30));
    } else if (metrics["Soil Organic Matter (%)"]) {
      const soilOrganicMatter =
        getMetricValueByYear(metrics["Soil Organic Matter (%)"], currentYear) ||
        0;
      soilHealthFactor = Math.min(1.2, Math.max(0.8, soilOrganicMatter / 3));
    }
  }

  // Climate risk adjustment
  let climateFactor = 1.0;
  if (company.country === "Zimbabwe") {
    // Zimbabwe climate risk adjustment
    climateFactor = 0.9;
  }

  // Calculate final yield forecast
  const calculatedYield =
    baseYield *
    ndviFactor *
    waterEfficiency *
    energyEfficiency *
    biomassFactor *
    soilHealthFactor *
    climateFactor;

  // Calculate confidence score (0-100)
  let confidence = 50; // Base confidence

  // Add confidence based on data availability
  if (
    carbonData &&
    carbonData.yearly_data &&
    carbonData.yearly_data.some((y) => y.year === currentYear)
  ) {
    confidence += 20; // Satellite data available
  }

  if (waterData && electricityData) {
    confidence += 15; // Both water and energy data available
  } else if (waterData || electricityData) {
    confidence += 8; // One of them available
  }

  if (metrics["Soil Organic Matter (%)"] || metrics["Land Use Change (ha)"]) {
    confidence += 10; // Additional soil/land data
  }

  // Add confidence based on data completeness
  if (ndviData && ndviData.growing_season_months.length >= 3) {
    confidence += 10; // Good growing season coverage
  }

  confidence = Math.min(95, Math.max(30, confidence)); // Bound between 30-95%

  return {
    forecasted_yield: calculatedYield,
    unit: "t/ha",
    confidence_score: Math.round(confidence),
    calculation_factors: {
      base_yield: baseYield,
      ndvi_factor: ndviFactor.toFixed(3),
      water_efficiency: waterEfficiency.toFixed(3),
      energy_efficiency: energyEfficiency.toFixed(3),
      biomass_factor: biomassFactor.toFixed(3),
      soil_health_factor: soilHealthFactor.toFixed(3),
      climate_factor: climateFactor.toFixed(3),
    },
    formula: `Yield = Base(${baseYield}) × NDVI(${ndviFactor.toFixed(3)}) × Water(${waterEfficiency.toFixed(3)}) × Energy(${energyEfficiency.toFixed(3)}) × Biomass(${biomassFactor.toFixed(3)}) × Soil(${soilHealthFactor.toFixed(3)}) × Climate(${climateFactor.toFixed(3)})`,
    ndvi_indicators: ndviData,
  };
}

/**
 * Helper function to calculate risk factors
 */
function calculateRiskFactors(metrics, carbonData, company, currentYear) {
  const risks = {
    drought: {
      level: "Low",
      score: 25,
      probability: 0.25,
      factors: [],
      mitigation: [],
    },
    pest_disease: {
      level: "Low",
      score: 20,
      probability: 0.2,
      factors: [],
      mitigation: [],
    },
    energy: {
      level: "Low",
      score: 15,
      probability: 0.15,
      factors: [],
      mitigation: [],
    },
    climate: {
      level: "Low",
      score: 30,
      probability: 0.3,
      factors: [],
      mitigation: [],
    },
    soil_degradation: {
      level: "Low",
      score: 20,
      probability: 0.2,
      factors: [],
      mitigation: [],
    },
    market: {
      level: "Low",
      score: 25,
      probability: 0.25,
      factors: [],
      mitigation: [],
    },
    labor: {
      level: "Low",
      score: 15,
      probability: 0.15,
      factors: [],
      mitigation: [],
    },
    technology: {
      level: "Low",
      score: 10,
      probability: 0.1,
      factors: [],
      mitigation: [],
    },
  };

  // Drought risk based on water usage and NDVI stability
  const waterData =
    metrics["Water Usage - Irrigation Water Usage (million ML)"] ||
    metrics["Water Usage (m³)"];
  const waterUsage = getMetricValueByYear(waterData, currentYear) || 0;

  if (waterUsage > 200) {
    risks.drought.score += 30;
    risks.drought.factors.push("High water usage (>200 ML)");
    risks.drought.mitigation.push("Implement drip irrigation");
  } else if (waterUsage > 100) {
    risks.drought.score += 15;
    risks.drought.factors.push("Moderate water usage (>100 ML)");
    risks.drought.mitigation.push("Optimize irrigation scheduling");
  }

  // Use NDVI stability as proxy for water stress
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.sequestration?.vegetation_summary) {
      const ndviStdDev = yearData.sequestration.vegetation_summary.ndvi_std_dev;
      if (ndviStdDev > 0.15) {
        risks.drought.score += 25;
        risks.drought.factors.push(
          `High NDVI variability (σ=${ndviStdDev.toFixed(3)})`,
        );
        risks.drought.mitigation.push("Monitor soil moisture");
      }

      // Check for low NDVI
      if (yearData.sequestration.vegetation_summary.average_ndvi < 0.4) {
        risks.drought.score += 20;
        risks.drought.factors.push(
          `Low average NDVI (${yearData.sequestration.vegetation_summary.average_ndvi.toFixed(3)})`,
        );
        risks.drought.mitigation.push("Consider drought-resistant varieties");
      }
    }
  }

  // Pest/Disease risk based on NDVI anomalies and waste management
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.sequestration?.monthly_data) {
      const monthlyData = yearData.sequestration.monthly_data;
      if (monthlyData.length >= 3) {
        // Check for sudden NDVI drops
        const recentMonths = monthlyData.slice(-3);
        const drops = recentMonths
          .slice(1)
          .map(
            (month, idx) =>
              (month.ndvi_max - recentMonths[idx].ndvi_max) /
              recentMonths[idx].ndvi_max,
          );
        const maxDrop = Math.min(...drops);

        if (maxDrop < -0.15) {
          risks.pest_disease.score += 40;
          risks.pest_disease.factors.push(
            `Recent NDVI drop of ${(maxDrop * 100).toFixed(1)}%`,
          );
          risks.pest_disease.mitigation.push("Implement IPM system");
        }
      }
    }
  }

  // Check waste management for pest indicators
  const wasteData =
    metrics["Waste Management - Recycled waste (excl. Boiler Ash) (tons)"] ||
    metrics["Waste Generated (tons)"];
  const wasteGenerated = getMetricValueByYear(wasteData, currentYear) || 0;
  if (wasteGenerated > 1000) {
    risks.pest_disease.score += 15;
    risks.pest_disease.factors.push("High waste generation");
    risks.pest_disease.mitigation.push("Improve waste management");
  }

  // Energy risk
  const electricityData =
    metrics["Energy Consumption - Electricity Purchased (MWH)"] ||
    metrics["Energy Consumption - Total (MWH)"];
  const electricityUsage =
    getMetricValueByYear(electricityData, currentYear) || 0;
  const dieselUsage =
    getMetricValueByYear(
      metrics["Energy Consumption - Inside Company Diesel Usage (litres)"],
      currentYear,
    ) || 0;

  if (electricityUsage > 15000) {
    risks.energy.score += 25;
    risks.energy.factors.push("High electricity consumption (>15,000 MWh)");
    risks.energy.mitigation.push("Transition to renewable energy");
  }

  if (dieselUsage > 100000) {
    risks.energy.score += 20;
    risks.energy.factors.push("High diesel usage (>100,000 litres)");
    risks.energy.mitigation.push("Optimize machinery usage");
  }

  // Climate risk based on location and emissions
  if (company.country === "Zimbabwe") {
    risks.climate.score += 25;
    risks.climate.factors.push("Region prone to seasonal droughts");
    risks.climate.mitigation.push("Implement climate-smart agriculture");
  }

  // Check GHG emissions for climate impact
  const totalGHG =
    getMetricValueByYear(
      metrics["Carbon Emissions (Total GHG, tCO2e)"],
      currentYear,
    ) || 0;
  if (totalGHG > 50000) {
    risks.climate.score += 20;
    risks.climate.factors.push("High GHG emissions");
    risks.climate.mitigation.push("Reduce carbon footprint");
  }

  // Soil degradation risk
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.sequestration?.soc_summary) {
      const avgSOC = yearData.sequestration.soc_summary.average_soc;
      if (avgSOC < 20) {
        risks.soil_degradation.score += 40;
        risks.soil_degradation.factors.push(
          `Low soil organic carbon (${avgSOC.toFixed(1)} tC/ha)`,
        );
        risks.soil_degradation.mitigation.push("Apply organic amendments");
      }

      if (yearData.sequestration.soc_summary.soc_change < 0) {
        risks.soil_degradation.score += 30;
        risks.soil_degradation.factors.push("Negative SOC change");
        risks.soil_degradation.mitigation.push(
          "Implement conservation tillage",
        );
      }
    }
  }

  // Market risk based on industry
  if (company.industry.includes("Sugar")) {
    risks.market.score += 20;
    risks.market.factors.push("Volatile sugar market prices");
    risks.market.mitigation.push("Diversify crop portfolio");
  }

  // Labor risk
  const hasLaborMetrics =
    metrics["Employee Turnover Rate (%)"] ||
    metrics["Training Hours per Employee"];
  if (!hasLaborMetrics) {
    risks.labor.score += 10;
    risks.labor.factors.push("Limited labor data");
    risks.labor.mitigation.push("Implement HR monitoring");
  }

  // Technology risk
  if (!carbonData) {
    risks.technology.score += 30;
    risks.technology.factors.push("No satellite monitoring");
    risks.technology.mitigation.push("Adopt precision agriculture tech");
  }

  // Convert scores to levels and probabilities
  Object.keys(risks).forEach((risk) => {
    risks[risk].score = Math.min(100, Math.max(0, risks[risk].score));
    risks[risk].probability = (risks[risk].score / 100).toFixed(3);

    if (risks[risk].score >= 70) risks[risk].level = "Critical";
    else if (risks[risk].score >= 50) risks[risk].level = "High";
    else if (risks[risk].score >= 30) risks[risk].level = "Medium";
    else risks[risk].level = "Low";
  });

  // Calculate overall risk score with weighted average
  const weights = {
    drought: 0.2,
    pest_disease: 0.15,
    energy: 0.1,
    climate: 0.15,
    soil_degradation: 0.15,
    market: 0.1,
    labor: 0.08,
    technology: 0.07,
  };

  const overallScore = Object.keys(weights).reduce(
    (sum, risk) => sum + risks[risk].score * weights[risk],
    0,
  );

  risks.overall = {
    score: Math.round(overallScore),
    level:
      overallScore >= 70
        ? "Critical"
        : overallScore >= 50
          ? "High"
          : overallScore >= 30
            ? "Medium"
            : "Low",
    probability: (overallScore / 100).toFixed(3),
    primary_risks: Object.keys(risks)
      .filter((k) => k !== "overall")
      .sort((a, b) => risks[b].score - risks[a].score)
      .slice(0, 3)
      .map((k) => ({
        category: k,
        level: risks[k].level,
        score: risks[k].score,
      })),
  };

  return risks;
}

/**
 * Helper function to generate comprehensive graphs
 */
function generateGraphs(
  metrics,
  carbonData,
  yieldForecast,
  risks,
  currentYear,
  years,
) {
  const graphs = {};

  // 1. Yield Forecast Trend
  if (years.length >= 2) {
    const historicalYields = years.map((year) => {
      const baseYield = 80;
      const waterData =
        metrics["Water Usage - Irrigation Water Usage (million ML)"] ||
        metrics["Water Usage (m³)"];
      const waterUsage = getMetricValueByYear(waterData, year) || 0;
      const waterFactor = Math.min(1.1, Math.max(0.6, 1 - waterUsage / 500));
      return baseYield * waterFactor;
    });

    graphs.yield_trend = {
      type: "line",
      title: "Yield Forecast Trend",
      description: "Historical and forecasted crop yields",
      labels: [...years, "Forecast"],
      datasets: [
        {
          label: "Yield (t/ha)",
          data: [...historicalYields, yieldForecast.forecasted_yield],
          borderColor: "#27ae60",
          backgroundColor: "rgba(39, 174, 96, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Industry Average",
          data: [...years.map(() => 80), 80],
          borderColor: "#7f8c8d",
          borderDash: [5, 5],
          fill: false,
        },
      ],
    };
  }

  // 2. Risk Distribution Radar Chart
  graphs.risk_distribution = {
    type: "radar",
    title: "Production Risk Profile",
    description: "Multi-dimensional risk assessment",
    labels: Object.keys(risks)
      .filter((k) => k !== "overall")
      .map((k) => k.replace(/_/g, " ").toUpperCase()),
    datasets: [
      {
        label: "Risk Score",
        data: Object.keys(risks)
          .filter((k) => k !== "overall")
          .map((k) => risks[k].score),
        backgroundColor: "rgba(231, 76, 60, 0.2)",
        borderColor: "#e74c3c",
        pointBackgroundColor: "#e74c3c",
      },
    ],
  };

  // 3. NDVI Trend (if carbon data available)
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.sequestration?.monthly_data) {
      const monthlyData = yearData.sequestration.monthly_data;
      graphs.ndvi_trend = {
        type: "line",
        title: `Monthly NDVI Trend - ${currentYear}`,
        description: "Vegetation health index throughout the year",
        labels: monthlyData.map((m) => `${m.month} ${currentYear}`),
        datasets: [
          {
            label: "NDVI",
            data: monthlyData.map((m) => m.ndvi_max || 0),
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.1)",
            fill: true,
            tension: 0.4,
          },
          {
            label: "Healthy Threshold (0.6)",
            data: monthlyData.map(() => 0.6),
            borderColor: "#27ae60",
            borderDash: [5, 5],
            fill: false,
          },
        ],
      };

      // 4. SOC Trend
      if (monthlyData.some((m) => m.soc_tc_per_ha)) {
        graphs.soc_trend = {
          type: "line",
          title: `Monthly Soil Organic Carbon - ${currentYear}`,
          description: "Soil carbon stock variation",
          labels: monthlyData.map((m) => m.month),
          datasets: [
            {
              label: "SOC (tC/ha)",
              data: monthlyData.map((m) => m.soc_tc_per_ha || 0),
              borderColor: "#8e44ad",
              backgroundColor: "rgba(142, 68, 173, 0.1)",
              fill: true,
            },
          ],
        };
      }

      // 5. Biomass Accumulation
      if (monthlyData.some((m) => m.agb_t_per_ha)) {
        graphs.biomass_accumulation = {
          type: "bar",
          title: `Monthly Biomass Production - ${currentYear}`,
          description: "Above ground biomass accumulation",
          labels: monthlyData.map((m) => m.month),
          datasets: [
            {
              label: "Biomass (t/ha)",
              data: monthlyData.map((m) => m.agb_t_per_ha || 0),
              backgroundColor: "#3498db",
              borderColor: "#2980b9",
            },
          ],
        };
      }
    }
  }

  // 6. Resource Usage Comparison
  const waterData =
    metrics["Water Usage - Irrigation Water Usage (million ML)"] ||
    metrics["Water Usage (m³)"];
  const electricityData =
    metrics["Energy Consumption - Electricity Purchased (MWH)"];

  if (waterData && electricityData && years.length >= 2) {
    const recentYears = years.slice(-3);
    graphs.resource_usage = {
      type: "bar",
      title: "Resource Usage Efficiency Trend",
      description: "Water and electricity consumption trends",
      labels: recentYears,
      datasets: [
        {
          label: "Water Usage Index",
          data: recentYears.map((year) => {
            const usage = getMetricValueByYear(waterData, year) || 0;
            return Math.min(100, usage * 0.5); // Scale for visualization
          }),
          backgroundColor: "#3498db",
          yAxisID: "y",
        },
        {
          label: "Energy Usage Index",
          data: recentYears.map((year) => {
            const usage = getMetricValueByYear(electricityData, year) || 0;
            return Math.min(100, usage * 0.003);
          }),
          backgroundColor: "#f1c40f",
          yAxisID: "y1",
        },
      ],
      options: {
        scales: {
          y: {
            type: "linear",
            position: "left",
            title: {
              display: true,
              text: "Water Usage Index",
            },
          },
          y1: {
            type: "linear",
            position: "right",
            title: {
              display: true,
              text: "Energy Usage Index",
            },
            grid: {
              drawOnChartArea: false,
            },
          },
        },
      },
    };
  }

  // 7. Emissions Breakdown
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.emissions) {
      graphs.emissions_breakdown = {
        type: "doughnut",
        title: `Emissions by Scope - ${currentYear}`,
        description: "Greenhouse gas emissions composition",
        labels: ["Scope 1", "Scope 2", "Scope 3"],
        datasets: [
          {
            data: [
              yearData.emissions.scope1?.total_tco2e || 0,
              yearData.emissions.scope2?.total_tco2e || 0,
              yearData.emissions.scope3?.total_tco2e || 0,
            ],
            backgroundColor: ["#e74c3c", "#f39c12", "#3498db"],
            borderWidth: 2,
          },
        ],
      };
    }
  }

  // 8. Carbon Balance
  if (
    carbonData &&
    carbonData.yearly_data &&
    carbonData.yearly_data.length >= 2
  ) {
    const sortedData = [...carbonData.yearly_data].sort(
      (a, b) => a.year - b.year,
    );
    graphs.carbon_balance = {
      type: "bar",
      title: "Carbon Balance Over Time",
      description: "Sequestration vs Emissions balance",
      labels: sortedData.map((d) => d.year),
      datasets: [
        {
          label: "Sequestration (tCO₂)",
          data: sortedData.map(
            (d) =>
              d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
          ),
          backgroundColor: "#27ae60",
        },
        {
          label: "Emissions (tCO₂e)",
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
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // 9. Yield vs Risk Correlation
  graphs.yield_risk_correlation = {
    type: "scatter",
    title: "Yield Forecast vs Risk Score",
    description: "Relationship between forecasted yield and production risks",
    datasets: [
      {
        label: "Current Year",
        data: [
          {
            x: yieldForecast.forecasted_yield,
            y: risks.overall.score,
            r: 15,
          },
        ],
        backgroundColor: "#e74c3c",
      },
      {
        label: "Industry Benchmark",
        data: [
          {
            x: 80, // Industry average
            y: 30, // Low risk benchmark
            r: 10,
          },
        ],
        backgroundColor: "#2ecc71",
      },
    ],
    options: {
      scales: {
        x: {
          title: {
            display: true,
            text: "Yield Forecast (t/ha)",
          },
        },
        y: {
          title: {
            display: true,
            text: "Risk Score",
          },
        },
      },
    },
  };

  // 10. Forecast Confidence Components
  graphs.forecast_confidence = {
    type: "polarArea",
    title: "Forecast Confidence Components",
    description: "Factors contributing to yield forecast confidence",
    labels: [
      "Satellite Data",
      "Water Metrics",
      "Energy Metrics",
      "Soil Data",
      "Historical Data",
      "Methodology",
    ],
    datasets: [
      {
        data: [
          carbonData ? 80 : 20,
          waterData ? 70 : 15,
          electricityData ? 65 : 15,
          metrics["Soil Organic Matter (%)"] || metrics["Land Use Change (ha)"]
            ? 75
            : 10,
          years.length >= 3 ? 85 : 30,
          90, // Methodology score
        ],
        backgroundColor: [
          "#3498db",
          "#2ecc71",
          "#f1c40f",
          "#e67e22",
          "#9b59b6",
          "#1abc9c",
        ],
      },
    ],
  };

  return graphs;
}

/**
 * Helper function to generate recommendations
 */
function generateRecommendations(
  yieldForecast,
  risks,
  metrics,
  carbonData,
  currentYear,
) {
  const recommendations = [];

  // Yield optimization
  if (yieldForecast.forecasted_yield < 60) {
    recommendations.push({
      category: "Yield Optimization",
      priority: "High",
      action: "Implement precision agriculture and soil testing",
      impact: "Increase yield by 15-25%",
      timeline: "Next growing season",
      cost_estimate: "Medium",
      roi_estimate: "2-3 years",
    });
  }

  // Water management
  const waterData =
    metrics["Water Usage - Irrigation Water Usage (million ML)"] ||
    metrics["Water Usage (m³)"];
  const waterUsage = getMetricValueByYear(waterData, currentYear) || 0;

  if (waterUsage > 150) {
    recommendations.push({
      category: "Water Management",
      priority: "High",
      action: "Install drip irrigation and soil moisture sensors",
      impact: "Reduce water usage by 30-40%",
      timeline: "3-6 months",
      cost_estimate: "High",
      roi_estimate: "3-5 years",
    });
  }

  // Energy efficiency
  const electricityData =
    metrics["Energy Consumption - Electricity Purchased (MWH)"];
  const electricityUsage =
    getMetricValueByYear(electricityData, currentYear) || 0;

  if (electricityUsage > 10000) {
    recommendations.push({
      category: "Energy Efficiency",
      priority: "Medium",
      action: "Transition to solar-powered irrigation pumps",
      impact: "Reduce energy costs by 40-60%",
      timeline: "6-12 months",
      cost_estimate: "High",
      roi_estimate: "5-7 years",
    });
  }

  // Risk mitigation
  if (risks.drought.level === "High" || risks.drought.level === "Critical") {
    recommendations.push({
      category: "Drought Risk",
      priority: "High",
      action: "Implement drought-resistant varieties and water harvesting",
      impact: "Reduce yield loss by 50% during drought",
      timeline: "Next planting season",
      cost_estimate: "Low-Medium",
      roi_estimate: "Immediate",
    });
  }

  if (
    risks.pest_disease.level === "High" ||
    risks.pest_disease.level === "Critical"
  ) {
    recommendations.push({
      category: "Pest Management",
      priority: "High",
      action: "Establish integrated pest management (IPM) system",
      impact: "Reduce crop loss by 25-35%",
      timeline: "Immediate",
      cost_estimate: "Medium",
      roi_estimate: "1-2 years",
    });
  }

  // Soil health
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (
      yearData &&
      yearData.sequestration?.soc_summary &&
      yearData.sequestration.soc_summary.average_soc < 25
    ) {
      recommendations.push({
        category: "Soil Health",
        priority: "Medium",
        action: "Apply organic amendments and implement cover cropping",
        impact: "Increase SOC by 0.5-1% annually",
        timeline: "Continuous",
        cost_estimate: "Low",
        roi_estimate: "2-4 years",
      });
    }
  }

  // Carbon credits
  if (
    carbonData &&
    carbonData.comprehensive_summary &&
    carbonData.comprehensive_summary.totals.net_carbon_balance > 0
  ) {
    recommendations.push({
      category: "Carbon Markets",
      priority: "Low",
      action: "Register for carbon credit certification",
      impact: "Generate additional revenue from carbon sequestration",
      timeline: "6-12 months",
      cost_estimate: "Medium",
      roi_estimate: "1-3 years",
    });
  }

  // Technology adoption
  if (!carbonData) {
    recommendations.push({
      category: "Monitoring Technology",
      priority: "Medium",
      action: "Implement satellite-based monitoring system",
      impact: "Improve yield forecast accuracy by 30%",
      timeline: "3-6 months",
      cost_estimate: "Medium",
      roi_estimate: "2-3 years",
    });
  }

  return recommendations;
}

/**
 * Helper function to categorize environmental metrics
 */
function categorizeEnvironmentalMetrics(metrics) {
  const categories = {
    water: {},
    energy: {},
    emissions: {},
    waste: {},
    soil_land: {},
    biodiversity: {},
    other: {},
  };

  Object.keys(metrics).forEach((metricName) => {
    const metric = metrics[metricName];

    // Categorize based on metric name and description
    if (metricName.includes("Water") || metricName.includes("water")) {
      categories.water[metricName] = metric;
    } else if (
      metricName.includes("Energy") ||
      metricName.includes("Electricity") ||
      metricName.includes("Diesel") ||
      metricName.includes("Coal")
    ) {
      categories.energy[metricName] = metric;
    } else if (
      metricName.includes("Emission") ||
      metricName.includes("GHG") ||
      metricName.includes("Carbon") ||
      metricName.includes("CO2")
    ) {
      categories.emissions[metricName] = metric;
    } else if (
      metricName.includes("Waste") ||
      metricName.includes("Recycled")
    ) {
      categories.waste[metricName] = metric;
    } else if (
      metricName.includes("Soil") ||
      metricName.includes("Land") ||
      metricName.includes("Organic Matter")
    ) {
      categories.soil_land[metricName] = metric;
    } else if (
      metricName.includes("Biodiversity") ||
      metricName.includes("Habitat")
    ) {
      categories.biodiversity[metricName] = metric;
    } else {
      categories.other[metricName] = metric;
    }
  });

  return categories;
}

/**
 * Helper function to generate environmental metrics summary
 */
function generateEnvironmentalMetricsSummary(metrics, currentYear, years) {
  const summary = {
    water: {
      total_metrics: 0,
      total_usage: 0,
      efficiency_trend: "stable",
      key_metrics: [],
    },
    energy: {
      total_metrics: 0,
      total_consumption: 0,
      efficiency_trend: "stable",
      key_metrics: [],
    },
    emissions: {
      total_metrics: 0,
      total_emissions: 0,
      intensity_trend: "stable",
      key_metrics: [],
    },
    waste: {
      total_metrics: 0,
      total_waste: 0,
      recycling_rate: 0,
      key_metrics: [],
    },
    overall: {
      total_metrics: Object.keys(metrics).length,
      data_coverage: Math.min(100, years.length * 20), // Score based on years of data
      completeness_score: calculateDataCompleteness(metrics, currentYear),
    },
  };

  // Calculate water metrics
  Object.keys(metrics).forEach((metricName) => {
    const metric = metrics[metricName];

    if (metricName.includes("Water") || metricName.includes("water")) {
      summary.water.total_metrics++;
      const currentValue = getMetricValueByYear(metric, currentYear) || 0;
      summary.water.total_usage += currentValue;
      summary.water.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit,
        trend: calculateTrend(metric, years),
      });
    }

    if (metricName.includes("Energy") || metricName.includes("Electricity")) {
      summary.energy.total_metrics++;
      const currentValue = getMetricValueByYear(metric, currentYear) || 0;
      summary.energy.total_consumption += currentValue;
      summary.energy.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit,
        trend: calculateTrend(metric, years),
      });
    }

    if (metricName.includes("Emission") || metricName.includes("GHG")) {
      summary.emissions.total_metrics++;
      const currentValue = getMetricValueByYear(metric, currentYear) || 0;
      summary.emissions.total_emissions += currentValue;
      summary.emissions.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit,
        trend: calculateTrend(metric, years),
      });
    }

    if (metricName.includes("Waste")) {
      summary.waste.total_metrics++;
      const currentValue = getMetricValueByYear(metric, currentYear) || 0;
      summary.waste.total_waste += currentValue;
      summary.waste.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit,
        trend: calculateTrend(metric, years),
      });
    }
  });

  return summary;
}

/**
 * Helper function to calculate data completeness
 */
function calculateDataCompleteness(metrics, currentYear) {
  if (Object.keys(metrics).length === 0) return 0;

  let completeMetrics = 0;
  Object.values(metrics).forEach((metric) => {
    if (getMetricValueByYear(metric, currentYear) !== null) {
      completeMetrics++;
    }
  });

  return Math.round((completeMetrics / Object.keys(metrics).length) * 100);
}

/**
 * Main Crop Yield Forecast API - Enhanced Version
 */
async function getCropYieldForecastData(companyId, year = null) {
  try {
    const company = await Company.findById(companyId);
    if (!company)
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");

    // Get ALL environmental metrics
    const allEnvironmentalMetrics = await getAllEnvironmentalMetrics(companyId);
    const years = getUniqueYearsFromMetrics(allEnvironmentalMetrics, year);

    if (years.length === 0) {
      throw new AppError(
        "No environmental data available for crop production analysis",
        404,
        "NO_ENV_DATA",
      );
    }

    const currentYear = year || Math.max(...years);

    // Get comprehensive carbon emission data
    const carbonData = await getComprehensiveCarbonEmissionData(
      companyId,
      currentYear,
    );

    // Calculate yield forecast
    const yieldForecast = calculateYieldForecast(
      allEnvironmentalMetrics,
      carbonData,
      company,
      currentYear,
    );

    // Calculate risk factors
    const risks = calculateRiskFactors(
      allEnvironmentalMetrics,
      carbonData,
      company,
      currentYear,
    );

    // Generate comprehensive graphs
    const graphs = generateGraphs(
      allEnvironmentalMetrics,
      carbonData,
      yieldForecast,
      risks,
      currentYear,
      years,
    );

    // Generate recommendations
    const recommendations = generateRecommendations(
      yieldForecast,
      risks,
      allEnvironmentalMetrics,
      carbonData,
      currentYear,
    );

    // Calculate confidence score
    const confidenceScore = Math.round(
      yieldForecast.confidence_score * 0.6 + (100 - risks.overall.score) * 0.4,
    );

    // Categorize environmental metrics
    const categorizedMetrics = categorizeEnvironmentalMetrics(
      allEnvironmentalMetrics,
    );
    const envMetricsSummary = generateEnvironmentalMetricsSummary(
      allEnvironmentalMetrics,
      currentYear,
      years,
    );

    // Prepare comprehensive carbon emission accounting data
    const carbonEmissionAccounting = carbonData
      ? {
          framework: carbonData.framework,
          methodology: carbonData.emission_references?.methodology_statement,
          summary: carbonData.comprehensive_summary,
          yearly_data: carbonData.yearly_data.map((yearData) => ({
            year: yearData.year,
            sequestration: {
              reporting_area_ha: yearData.sequestration?.reporting_area_ha,
              soc_area_ha: yearData.sequestration?.soc_area_ha,
              monthly_data:
                yearData.sequestration?.monthly_data?.map((month) => ({
                  month: month.month,
                  month_number: month.month_number,
                  ndvi_max: month.ndvi_max,
                  soc_tc_per_ha: month.soc_tc_per_ha,
                  soc_co2_t_per_ha: month.soc_co2_t_per_ha,
                  delta_soc_co2_t: month.delta_soc_co2_t,
                  agb_t_per_ha: month.agb_t_per_ha,
                  biomass_co2_total_t: month.biomass_co2_total_t,
                  meaning: month.meaning,
                })) || [],
              vegetation_summary: yearData.sequestration?.vegetation_summary,
              soc_summary: yearData.sequestration?.soc_summary,
              biomass_summary: yearData.sequestration?.biomass_summary,
              annual_summary: yearData.sequestration?.annual_summary,
            },
            emissions: {
              scope1: {
                total_tco2e: yearData.emissions?.scope1?.total_tco2e,
                total_tco2e_per_ha:
                  yearData.emissions?.scope1?.total_tco2e_per_ha,
                sources:
                  yearData.emissions?.scope1?.detailed_sources ||
                  yearData.emissions?.scope1?.sources ||
                  [],
              },
              scope2: {
                total_tco2e: yearData.emissions?.scope2?.total_tco2e,
                total_tco2e_per_ha:
                  yearData.emissions?.scope2?.total_tco2e_per_ha,
                sources:
                  yearData.emissions?.scope2?.detailed_sources ||
                  yearData.emissions?.scope2?.sources ||
                  [],
              },
              scope3: {
                total_tco2e: yearData.emissions?.scope3?.total_tco2e,
                total_tco2e_per_ha:
                  yearData.emissions?.scope3?.total_tco2e_per_ha,
                categories:
                  yearData.emissions?.scope3?.detailed_categories ||
                  yearData.emissions?.scope3?.categories ||
                  [],
              },
              totals: {
                total_scope_emission_tco2e:
                  yearData.emissions?.total_scope_emission_tco2e,
                total_scope_emission_tco2e_per_ha:
                  yearData.emissions?.total_scope_emission_tco2e_per_ha,
                net_total_emission_tco2e:
                  yearData.emissions?.net_total_emission_tco2e,
              },
              intensity_metrics: yearData.emissions?.intensity_metrics,
            },
            data_quality: yearData.data_quality,
          })),
          emission_factors:
            carbonData.emission_references?.emission_factors || [],
          global_warming_potentials:
            carbonData.emission_references?.global_warming_potentials,
          conversion_factors:
            carbonData.emission_references?.conversion_factors,
        }
      : null;

    const data = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "crop_yield_forecast",
        company_id: companyId,
        year_requested: year,
        data_sources: carbonData
          ? [
              "ESGData",
              "CarbonEmissionAccounting",
              "SatelliteIndices",
              "CompanyProfile",
            ]
          : ["ESGData", "CompanyProfile"],
        calculation_methods: [
          "Yield forecast based on NDVI trends, water usage, and energy efficiency",
          "Risk assessment from vegetation stress indicators and resource consumption",
          "Satellite-derived biomass estimation using Sentinel-2 imagery at 10m resolution",
          "IPCC 2006 Guidelines for AFOLU carbon accounting",
          "Greenhouse Gas Protocol for emissions calculation",
        ],
        spatial_resolution: "10m (Sentinel-2)",
        temporal_resolution: "Monthly composites",
      },
      company: {
        id: company._id,
        name: company.name,
        industry: company.industry,
        country: company.country,
        area_of_interest: company.area_of_interest_metadata,
        esg_frameworks: company.esg_reporting_framework,
        latest_report_year: company.latest_esg_report_year,
      },
      reporting_period: {
        current_year: currentYear,
        data_available_years: years,
        carbon_data_available: !!carbonData,
        satellite_data_years: carbonData?.yearly_data?.map((d) => d.year) || [],
        data_coverage_score: envMetricsSummary.overall.data_coverage,
      },
      confidence_score: {
        overall: confidenceScore,
        forecast_confidence: yieldForecast.confidence_score,
        risk_assessment_confidence: 100 - risks.overall.score,
        data_quality: envMetricsSummary.overall.completeness_score,
        methodology_rigor: 85, // Based on IPCC and GHG Protocol
        interpretation:
          confidenceScore >= 80
            ? "High confidence"
            : confidenceScore >= 60
              ? "Medium confidence"
              : confidenceScore >= 40
                ? "Low confidence"
                : "Very low confidence",
        improvement_areas: [
          ...(carbonData ? [] : ["Satellite monitoring data"]),
          ...(years.length < 3 ? ["Longer historical data"] : []),
          ...(envMetricsSummary.overall.completeness_score < 70
            ? ["More complete environmental metrics"]
            : []),
        ],
      },
      yield_forecast: {
        ...yieldForecast,
        season: getSeason(currentYear),
        comparison_to_industry_average: {
          industry_average: 80,
          company_yield: yieldForecast.forecasted_yield,
          percentage_difference: (
            ((yieldForecast.forecasted_yield - 80) / 80) *
            100
          ).toFixed(1),
          status:
            yieldForecast.forecasted_yield >= 80
              ? "Above average"
              : yieldForecast.forecasted_yield >= 70
                ? "Near average"
                : "Below average",
          potential_improvement: Math.max(
            0,
            80 - yieldForecast.forecasted_yield,
          ),
        },
        sensitivity_analysis: {
          water_sensitivity: yieldForecast.forecasted_yield * 0.15, // ±15% with water changes
          climate_sensitivity: yieldForecast.forecasted_yield * 0.2, // ±20% with climate
          management_sensitivity: yieldForecast.forecasted_yield * 0.25, // ±25% with management
        },
      },
      risk_assessment: {
        overall: risks.overall,
        detailed_risks: Object.keys(risks)
          .filter((k) => k !== "overall")
          .map((k) => ({
            category: k.replace(/_/g, " "),
            level: risks[k].level,
            score: risks[k].score,
            probability: risks[k].probability,
            factors: risks[k].factors,
            mitigation: risks[k].mitigation,
            monitoring_indicators: getRiskMonitoringIndicators(
              k,
              allEnvironmentalMetrics,
              carbonData,
              currentYear,
            ),
          })),
        mitigation_priorities: Object.keys(risks)
          .filter((k) => k !== "overall")
          .sort((a, b) => risks[b].score - risks[a].score)
          .slice(0, 3)
          .map((k) => k.replace(/_/g, " ")),
        early_warning_indicators: generateEarlyWarningIndicators(
          risks,
          allEnvironmentalMetrics,
          carbonData,
          currentYear,
        ),
      },
      environmental_metrics: {
        all_metrics: allEnvironmentalMetrics,
        categorized_metrics: categorizedMetrics,
        summary: envMetricsSummary,
        key_performance_indicators: {
          water_use_efficiency: {
            value:
              yieldForecast.forecasted_yield /
              (getMetricValueByYear(
                allEnvironmentalMetrics[
                  "Water Usage - Irrigation Water Usage (million ML)"
                ] || allEnvironmentalMetrics["Water Usage (m³)"],
                currentYear,
              ) || 1),
            unit: "t/ML",
            benchmark: 0.5,
            status:
              yieldForecast.forecasted_yield /
                (getMetricValueByYear(
                  allEnvironmentalMetrics[
                    "Water Usage - Irrigation Water Usage (million ML)"
                  ] || allEnvironmentalMetrics["Water Usage (m³)"],
                  currentYear,
                ) || 1) >=
              0.5
                ? "Good"
                : "Needs improvement",
          },
          energy_productivity: {
            value:
              yieldForecast.forecasted_yield /
              ((getMetricValueByYear(
                allEnvironmentalMetrics[
                  "Energy Consumption - Electricity Purchased (MWH)"
                ],
                currentYear,
              ) || 1) /
                1000),
            unit: "t/MWh",
            benchmark: 0.1,
            status:
              yieldForecast.forecasted_yield /
                ((getMetricValueByYear(
                  allEnvironmentalMetrics[
                    "Energy Consumption - Electricity Purchased (MWH)"
                  ],
                  currentYear,
                ) || 1) /
                  1000) >=
              0.1
                ? "Good"
                : "Needs improvement",
          },
          carbon_intensity: {
            value:
              (getMetricValueByYear(
                allEnvironmentalMetrics["Carbon Emissions (Total GHG, tCO2e)"],
                currentYear,
              ) || 0) / yieldForecast.forecasted_yield,
            unit: "tCO2e/t",
            benchmark: 0.5,
            status:
              (getMetricValueByYear(
                allEnvironmentalMetrics["Carbon Emissions (Total GHG, tCO2e)"],
                currentYear,
              ) || 0) /
                yieldForecast.forecasted_yield <=
              0.5
                ? "Good"
                : "Needs improvement",
          },
          soil_health_index: {
            value:
              carbonData?.yearly_data?.find((y) => y.year === currentYear)
                ?.sequestration?.soc_summary?.average_soc ||
              getMetricValueByYear(
                allEnvironmentalMetrics["Soil Organic Matter (%)"],
                currentYear,
              ) * 10 ||
              0,
            unit: "index",
            benchmark: 25,
            status:
              (carbonData?.yearly_data?.find((y) => y.year === currentYear)
                ?.sequestration?.soc_summary?.average_soc || 0) >= 25
                ? "Good"
                : "Needs improvement",
          },
        },
      },
      carbon_emission_accounting: carbonEmissionAccounting,
      satellite_indicators: carbonData
        ? {
            ndvi_summary:
              carbonData.yearly_data?.find((y) => y.year === currentYear)
                ?.sequestration?.vegetation_summary || null,
            soc_summary:
              carbonData.yearly_data?.find((y) => y.year === currentYear)
                ?.sequestration?.soc_summary || null,
            biomass_summary:
              carbonData.yearly_data?.find((y) => y.year === currentYear)
                ?.sequestration?.biomass_summary || null,
            data_coverage: {
              months_with_data:
                carbonData.yearly_data?.find((y) => y.year === currentYear)
                  ?.sequestration?.monthly_data?.length || 0,
              growing_season_coverage:
                carbonData.yearly_data?.find((y) => y.year === currentYear)
                  ?.sequestration?.vegetation_summary?.growing_season_months
                  ?.length || 0,
              spatial_resolution: "10m (Sentinel-2)",
              temporal_resolution: "Monthly composites",
              cloud_cover: "<20% masked",
            },
          }
        : null,
      graphs: graphs,
      recommendations: recommendations,
      seasonal_advisory: {
        current_season: getSeason(currentYear),
        next_season: getSeason(currentYear + 1),
        recommended_actions: [
          "Monitor NDVI weekly for early stress detection",
          "Adjust irrigation based on soil moisture sensors",
          "Schedule fertilizer application during peak growth periods",
          "Implement integrated pest management if NDVI drops >15%",
          "Prepare for seasonal climate patterns based on historical data",
        ],
        upcoming_risks: generateSeasonalRisks(getSeason(currentYear), risks),
        planting_schedule: generatePlantingSchedule(
          company.industry,
          currentYear,
        ),
        harvest_window: generateHarvestWindow(company.industry, currentYear),
      },
      summary: {
        outlook:
          yieldForecast.forecasted_yield >= 70
            ? "Positive"
            : yieldForecast.forecasted_yield >= 50
              ? "Moderate"
              : "Challenging",
        key_strengths: [
          ...(yieldForecast.confidence_score >= 70
            ? ["High forecast confidence"]
            : []),
          ...(risks.overall.score < 30 ? ["Low overall risk"] : []),
          ...(carbonData ? ["Satellite monitoring available"] : []),
          ...(years.length >= 3 ? ["Good historical data"] : []),
        ],
        key_concerns: Object.keys(risks)
          .filter(
            (k) =>
              k !== "overall" &&
              (risks[k].level === "Critical" || risks[k].level === "High"),
          )
          .map((k) => `${k.replace(/_/g, " ")} (${risks[k].level})`),
        opportunities: [
          ...(yieldForecast.forecasted_yield < 60
            ? ["Yield optimization potential"]
            : []),
          ...(risks.drought?.level === "High"
            ? ["Water efficiency improvements"]
            : []),
          ...(carbonData &&
          carbonData.comprehensive_summary?.totals.net_carbon_balance > 0
            ? ["Carbon credit opportunities"]
            : []),
          ...(carbonData
            ? ["Precision agriculture expansion"]
            : ["Technology adoption"]),
        ],
        data_gaps: [
          ...(!carbonData ? ["Satellite-based vegetation monitoring"] : []),
          ...(!allEnvironmentalMetrics["Soil Organic Matter (%)"]
            ? ["Regular soil testing"]
            : []),
          ...(years.length < 3 ? ["Longer historical data"] : []),
          ...(envMetricsSummary.overall.completeness_score < 70
            ? ["More complete environmental metrics"]
            : []),
        ],
        next_steps: [
          "Implement high-priority recommendations",
          "Monitor key risk indicators weekly",
          "Update forecast with new data monthly",
          "Schedule mid-season review",
        ],
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve crop yield forecast data",
      500,
      "CROP_YIELD_API_ERROR",
      { details: error.message },
    );
  }
}

/**
 * Helper function to get risk monitoring indicators
 */
function getRiskMonitoringIndicators(
  riskCategory,
  metrics,
  carbonData,
  currentYear,
) {
  const indicators = [];

  switch (riskCategory) {
    case "drought":
      indicators.push("Weekly NDVI values");
      indicators.push("Soil moisture readings");
      indicators.push("Rainfall data");
      indicators.push("Irrigation water levels");
      break;
    case "pest_disease":
      indicators.push("NDVI anomaly detection");
      indicators.push("Field scouting reports");
      indicators.push("Weather conditions (humidity, temperature)");
      indicators.push("Pest trap counts");
      break;
    case "energy":
      indicators.push("Electricity consumption daily");
      indicators.push("Fuel usage records");
      indicators.push("Equipment runtime");
      indicators.push("Energy costs");
      break;
    case "soil_degradation":
      indicators.push("Monthly SOC measurements");
      indicators.push("Soil compaction tests");
      indicators.push("Erosion observations");
      indicators.push("Soil pH and nutrient levels");
      break;
  }

  return indicators;
}

/**
 * Helper function to generate early warning indicators
 */
function generateEarlyWarningIndicators(
  risks,
  metrics,
  carbonData,
  currentYear,
) {
  const warnings = [];

  // Drought warnings
  if (risks.drought.score > 50) {
    warnings.push({
      type: "drought",
      level: risks.drought.level,
      indicators: ["Low NDVI", "High water usage", "Low rainfall"],
      action: "Activate water conservation measures",
    });
  }

  // Pest warnings
  if (risks.pest_disease.score > 50) {
    warnings.push({
      type: "pest_disease",
      level: risks.pest_disease.level,
      indicators: ["NDVI drops >15%", "Favorable weather for pests"],
      action: "Initiate IPM protocols",
    });
  }

  // Soil degradation warnings
  if (risks.soil_degradation.score > 50) {
    warnings.push({
      type: "soil_degradation",
      level: risks.soil_degradation.level,
      indicators: ["Declining SOC", "Soil compaction"],
      action: "Implement soil conservation practices",
    });
  }

  return warnings;
}

/**
 * Helper function to generate seasonal risks
 */
function generateSeasonalRisks(season, risks) {
  const seasonalRisks = [];

  if (season.includes("Summer")) {
    seasonalRisks.push("Heat stress on crops");
    seasonalRisks.push("Increased water demand");
    seasonalRisks.push("Pest population growth");
  } else if (season.includes("Autumn")) {
    seasonalRisks.push("Early frost risk");
    seasonalRisks.push("Harvest timing challenges");
    seasonalRisks.push("Post-harvest storage issues");
  } else if (season.includes("Winter")) {
    seasonalRisks.push("Soil erosion from rains");
    seasonalRisks.push("Planning and preparation delays");
    seasonalRisks.push("Equipment maintenance backlog");
  }

  return seasonalRisks;
}

/**
 * Helper function to generate planting schedule
 */
function generatePlantingSchedule(industry, currentYear) {
  if (industry.includes("Sugar")) {
    return {
      primary_crop: "Sugarcane",
      planting_window: "September - November",
      optimal_planting: "Mid-October",
      duration: "12-18 months",
      rotation: "Every 5-6 years",
    };
  } else {
    return {
      primary_crop: "Main crop",
      planting_window: "Based on local conditions",
      optimal_planting: "Consult agronomist",
      duration: "Varies by crop",
      rotation: "Annual rotation recommended",
    };
  }
}

/**
 * Helper function to generate harvest window
 */
function generateHarvestWindow(industry, currentYear) {
  if (industry.includes("Sugar")) {
    return {
      harvest_season: "May - September",
      peak_harvest: "July",
      expected_yield_period: "June - August",
      post_harvest: "October - December (ratoon management)",
    };
  } else {
    return {
      harvest_season: "Based on crop cycle",
      peak_harvest: "Monitor crop maturity",
      expected_yield_period: "At physiological maturity",
      post_harvest: "Proper storage and processing",
    };
  }
}

/**
 * Helper function to determine season
 */
function getSeason(year) {
  const currentMonth = new Date().getMonth() + 1;

  // Southern Hemisphere seasons for Zimbabwe
  if (currentMonth >= 9 || currentMonth <= 2) {
    return "Summer Growing Season (Sep-Feb)";
  } else if (currentMonth >= 3 && currentMonth <= 5) {
    return "Autumn Harvest Season (Mar-May)";
  } else {
    return "Winter Planning Season (Jun-Aug)";
  }
}

module.exports = {
  getCropYieldForecastData,
};
