const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract ALL environmental metric values for a specific year
 */
async function getAllEnvironmentalMetrics(companyId, year) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.category": "environmental",
      "metrics.values.year": year
    };

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country area_of_interest_metadata esg_reporting_framework latest_esg_report_year")
      .lean();

    if (!esgData || esgData.length === 0) {
      return {};
    }

    // Extract and organize all environmental metrics for the specified year
    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metric.category === "environmental") {
          if (!metrics[metric.metric_name]) {
            metrics[metric.metric_name] = {
              name: metric.metric_name,
              category: metric.category,
              unit: metric.unit || "",
              description: metric.description || "",
              values: []
            };
          }

          metric.values.forEach((value) => {
            if (value.year === year) {
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
 * Helper function to get comprehensive Carbon Emission Accounting data for a specific year
 */
async function getComprehensiveCarbonEmissionData(companyId, year) {
  try {
    const carbonData = await CarbonEmissionAccounting.findOne({
      company: companyId,
      is_active: true,
      status: { $in: ["draft", "under_review", "approved", "published"] },
      "yearly_data.year": year
    })
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) {
      console.log(
        `No comprehensive carbon data found for company: ${companyId}, year: ${year}`,
      );
      return null;
    }

    // Extract data for the specific year
    const yearData = carbonData.yearly_data.find((data) => data.year === year);
    
    if (!yearData) {
      return null;
    }

    // Enhanced yearly data processing
    const enhancedYearData = { ...yearData };

    // Process sequestration monthly data
    if (enhancedYearData.sequestration && enhancedYearData.sequestration.monthly_data) {
      const monthlyData = enhancedYearData.sequestration.monthly_data;

      // Sort by month number
      monthlyData.sort(
        (a, b) => (a.month_number || 0) - (b.month_number || 0),
      );

      // Calculate vegetation indices summary
      const ndviValues = monthlyData
        .filter((m) => m.ndvi_max !== null && m.ndvi_max !== undefined)
        .map((m) => m.ndvi_max);

      if (ndviValues.length > 0) {
        enhancedYearData.sequestration.vegetation_summary = {
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
        enhancedYearData.sequestration.soc_summary = {
          average_soc:
            socValues.reduce((a, b) => a + b, 0) / socValues.length,
          soc_change: monthlyData
            .filter((m) => m.delta_soc_co2_t)
            .reduce((sum, m) => sum + m.delta_soc_co2_t, 0),
          sequestration_rate: enhancedYearData.sequestration.soc_area_ha
            ? monthlyData
                .filter((m) => m.delta_soc_co2_t)
                .reduce((sum, m) => sum + m.delta_soc_co2_t, 0) /
              enhancedYearData.sequestration.soc_area_ha
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
        enhancedYearData.sequestration.biomass_summary = {
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
    if (enhancedYearData.emissions) {
      // Scope 1 details
      if (enhancedYearData.emissions.scope1 && enhancedYearData.emissions.scope1.sources) {
        enhancedYearData.emissions.scope1.detailed_sources =
          enhancedYearData.emissions.scope1.sources.map((source) => ({
            source: source.source,
            parameter: source.parameter,
            unit: source.unit,
            annual_per_ha: source.annual_per_ha,
            emission_factor: source.emission_factor,
            tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
            total_tco2e: source.annual_per_ha
              ? source.annual_per_ha *
                (enhancedYearData.sequestration?.soc_area_ha || 1) *
                (source.tco2e_per_ha_per_year || 0)
              : 0,
          }));
      }

      // Scope 2 details
      if (enhancedYearData.emissions.scope2 && enhancedYearData.emissions.scope2.sources) {
        enhancedYearData.emissions.scope2.detailed_sources =
          enhancedYearData.emissions.scope2.sources.map((source) => ({
            source: source.source,
            parameter: source.parameter,
            unit: source.unit,
            annual_activity_per_ha: source.annual_activity_per_ha,
            emission_factor: source.emission_factor,
            tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
            total_tco2e: source.annual_activity_per_ha
              ? source.annual_activity_per_ha *
                (enhancedYearData.sequestration?.soc_area_ha || 1) *
                (source.tco2e_per_ha_per_year || 0)
              : 0,
          }));
      }

      // Scope 3 details
      if (enhancedYearData.emissions.scope3 && enhancedYearData.emissions.scope3.categories) {
        enhancedYearData.emissions.scope3.detailed_categories =
          enhancedYearData.emissions.scope3.categories.map((category) => ({
            category: category.category,
            parameter: category.parameter,
            unit: category.unit,
            annual_activity_per_ha: category.annual_activity_per_ha,
            emission_factor: category.emission_factor,
            tco2e_per_ha_per_year: category.tco2e_per_ha_per_year,
            total_tco2e: category.annual_activity_per_ha
              ? category.annual_activity_per_ha *
                (enhancedYearData.sequestration?.soc_area_ha || 1) *
                (category.tco2e_per_ha_per_year || 0)
              : 0,
          }));
      }

      // Calculate emissions intensity
      const area =
        enhancedYearData.sequestration?.soc_area_ha ||
        enhancedYearData.sequestration?.reporting_area_ha ||
        1;
      enhancedYearData.emissions.intensity_metrics = {
        scope1_intensity: enhancedYearData.emissions.scope1?.total_tco2e
          ? enhancedYearData.emissions.scope1.total_tco2e / area
          : 0,
        scope2_intensity: enhancedYearData.emissions.scope2?.total_tco2e
          ? enhancedYearData.emissions.scope2.total_tco2e / area
          : 0,
        scope3_intensity: enhancedYearData.emissions.scope3?.total_tco2e
          ? enhancedYearData.emissions.scope3.total_tco2e / area
          : 0,
        total_intensity: enhancedYearData.emissions.total_scope_emission_tco2e
          ? enhancedYearData.emissions.total_scope_emission_tco2e / area
          : 0,
      };
    }

    return {
      ...carbonData,
      yearly_data: [enhancedYearData],
      comprehensive_summary: calculateCarbonComprehensiveSummary([enhancedYearData])
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
  const year = years[0];

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

  // Calculate averages
  const avgSequestration = sequestrationData[0]?.total || 0;
  const avgEmissions = emissionData[0]?.total || 0;
  const avgArea = sequestrationData[0]?.area || 0;

  return {
    period: {
      start_year: year,
      end_year: year,
      years_count: 1,
    },
    totals: {
      total_sequestration_tco2: avgSequestration,
      total_emissions_tco2e: avgEmissions,
      net_carbon_balance: avgSequestration - avgEmissions,
      average_area_ha: avgArea,
    },
    averages: {
      annual_sequestration: avgSequestration,
      annual_emissions: avgEmissions,
      carbon_intensity: avgArea > 0 ? avgEmissions / avgArea : 0,
      sequestration_rate: avgArea > 0 ? avgSequestration / avgArea : 0,
    },
    trends: {
      sequestration_trend: 0,
      emission_trend: 0,
      sequestration_direction: "stable",
      emission_direction: "stable",
    },
    composition: {
      scope1_percentage: avgEmissions > 0 ? (emissionData[0]?.scope1 || 0) / avgEmissions * 100 : 0,
      scope2_percentage: avgEmissions > 0 ? (emissionData[0]?.scope2 || 0) / avgEmissions * 100 : 0,
      scope3_percentage: avgEmissions > 0 ? (emissionData[0]?.scope3 || 0) / avgEmissions * 100 : 0,
      soc_sequestration_percentage: avgSequestration > 0 ? (sequestrationData[0]?.soc || 0) / avgSequestration * 100 : 0,
    },
  };
}

/**
 * Helper function to get metric value by year
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.values || metric.values.length === 0) return 0;
  const value = metric.values.find((v) => v.year === year);
  return value ? value.numeric_value || parseFloat(value.value) || 0 : 0;
}

/**
 * Helper function to calculate yield forecast based on multiple factors
 */
function calculateYieldForecast(metrics, carbonData, company, currentYear) {
  // Base yield from historical data if available, otherwise 0
  let baseYield = 0;
  
  // Try to get historical yield data from environmental metrics
  const yieldData = metrics["Crop Yield (t/ha)"] || metrics["Yield (t/ha)"] || metrics["Production Yield"];
  if (yieldData) {
    baseYield = getMetricValueByYear(yieldData, currentYear);
  }

  // Get current year carbon data for NDVI
  let ndviFactor = 1.0; // Default no change
  let biomassFactor = 1.0;
  let ndviData = null;

  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    if (yearData && yearData.sequestration?.vegetation_summary) {
      ndviData = yearData.sequestration.vegetation_summary;
      const ndvi = ndviData.average_ndvi;
      // Only use NDVI factor if we have actual data
      if (ndvi > 0) {
        ndviFactor = ndvi; // Use actual NDVI value
      }

      if (yearData.sequestration.biomass_summary) {
        const biomass = yearData.sequestration.biomass_summary.average_biomass;
        if (biomass > 0) {
          biomassFactor = biomass; // Use actual biomass value
        }
      }
    }
  }

  // Water efficiency factor
  const irrigationWaterData = metrics["Water Usage - Irrigation Water Usage (million ML)"];
  const irrigationWaterUsage = getMetricValueByYear(irrigationWaterData, currentYear);
  const waterEfficiency = irrigationWaterUsage > 0 ? 1 : 1; // No assumptions, use 1 if data exists

  // Energy efficiency factor
  const electricityData = metrics["Energy Consumption - Electricity Purchased (MWH)"];
  const electricityUsage = getMetricValueByYear(electricityData, currentYear);
  const energyEfficiency = electricityUsage > 0 ? 1 : 1; // No assumptions, use 1 if data exists

  // Soil health factor from carbon data
  let soilHealthFactor = 1.0;
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    if (yearData && yearData.sequestration?.soc_summary) {
      const avgSOC = yearData.sequestration.soc_summary.average_soc;
      if (avgSOC > 0) {
        soilHealthFactor = avgSOC; // Use actual SOC value
      }
    } else if (metrics["Soil Organic Matter (%)"]) {
      const soilOrganicMatter = getMetricValueByYear(metrics["Soil Organic Matter (%)"], currentYear);
      if (soilOrganicMatter > 0) {
        soilHealthFactor = soilOrganicMatter; // Use actual soil organic matter value
      }
    }
  }

  // Climate risk adjustment - only if we have country-specific data in database
  let climateFactor = 1.0;
  // No assumptions about countries

  // Calculate final yield forecast - only use factors if we have base yield
  let calculatedYield = baseYield;
  
  // Only apply factors if we have actual base yield data
  if (baseYield > 0) {
    // Apply factors only if they have meaningful values (> 0)
    if (ndviFactor > 0) calculatedYield *= ndviFactor;
    if (waterEfficiency > 0) calculatedYield *= waterEfficiency;
    if (energyEfficiency > 0) calculatedYield *= energyEfficiency;
    if (biomassFactor > 0) calculatedYield *= biomassFactor;
    if (soilHealthFactor > 0) calculatedYield *= soilHealthFactor;
    if (climateFactor > 0) calculatedYield *= climateFactor;
  }

  // Calculate confidence score (0-100) based on data availability
  let confidence = 0; // Start at 0

  // Add confidence based on data availability
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    confidence += 20; // Satellite data available
  }

  if (irrigationWaterData && electricityData) {
    confidence += 20; // Both water and energy data available
  } else if (irrigationWaterData || electricityData) {
    confidence += 10; // One of them available
  }

  if (metrics["Soil Organic Matter (%)"] || metrics["Land Use Change (ha)"]) {
    confidence += 10; // Additional soil/land data
  }

  if (yieldData) {
    confidence += 30; // Historical yield data available
  }

  // Add confidence based on data completeness
  if (ndviData && ndviData.growing_season_months && ndviData.growing_season_months.length > 0) {
    confidence += 20; // Growing season data available
  }

  confidence = Math.min(100, Math.max(0, confidence)); // Bound between 0-100%

  return {
    forecasted_yield: calculatedYield,
    unit: "t/ha",
    confidence_score: Math.round(confidence),
    calculation_factors: {
      base_yield: baseYield,
      ndvi_factor: ndviFactor,
      water_efficiency: waterEfficiency,
      energy_efficiency: energyEfficiency,
      biomass_factor: biomassFactor,
      soil_health_factor: soilHealthFactor,
      climate_factor: climateFactor,
    },
    formula: baseYield > 0 ? `Yield = ${baseYield} (base) × ${ndviFactor} (NDVI) × ${waterEfficiency} (Water) × ${energyEfficiency} (Energy) × ${biomassFactor} (Biomass) × ${soilHealthFactor} (Soil) × ${climateFactor} (Climate)` : "No historical yield data available",
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
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    pest_disease: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    energy: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    climate: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    soil_degradation: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    market: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    labor: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
    technology: {
      level: "Low",
      score: 0,
      probability: 0,
      factors: [],
      mitigation: [],
    },
  };

  // Drought risk based on water usage and NDVI stability
  const irrigationWaterData = metrics["Water Usage - Irrigation Water Usage (million ML)"];
  const waterTreatmentData = metrics["Water treatment (million ML)"];
  const irrigationWaterUsage = getMetricValueByYear(irrigationWaterData, currentYear);

  if (irrigationWaterUsage > 0) {
    // No assumptions about thresholds
    risks.drought.score += 10; // Just indicate we have water usage data
    risks.drought.factors.push("Water usage data available");
  }

  // Use NDVI stability as proxy for water stress
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    if (yearData && yearData.sequestration?.vegetation_summary) {
      const ndviStdDev = yearData.sequestration.vegetation_summary.ndvi_std_dev;
      risks.drought.score += 10;
      risks.drought.factors.push(`NDVI data available (σ=${ndviStdDev.toFixed(3)})`);
    }
  }

  // Pest/Disease risk based on NDVI anomalies and waste management
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    if (yearData && yearData.sequestration?.monthly_data) {
      risks.pest_disease.score += 10;
      risks.pest_disease.factors.push("Monthly NDVI data available");
    }
  }

  // Check waste management for pest indicators
  const wasteData = metrics["Waste Management - Recycled waste (excl. Boiler Ash) (tons)"];
  const wasteGenerated = getMetricValueByYear(wasteData, currentYear);
  if (wasteGenerated > 0) {
    risks.pest_disease.score += 10;
    risks.pest_disease.factors.push("Waste management data available");
  }

  // Energy risk
  const electricityData = metrics["Energy Consumption - Electricity Purchased (MWH)"];
  const electricityUsage = getMetricValueByYear(electricityData, currentYear);
  const dieselUsage = getMetricValueByYear(
    metrics["Energy Consumption - Inside Company Diesel Usage (litres)"],
    currentYear,
  );

  if (electricityUsage > 0) {
    risks.energy.score += 10;
    risks.energy.factors.push("Electricity consumption data available");
  }

  if (dieselUsage > 0) {
    risks.energy.score += 10;
    risks.energy.factors.push("Diesel usage data available");
  }

  // Climate risk based on location and emissions - only if we have data
  const totalGHG = getMetricValueByYear(
    metrics["Carbon Emissions (Total GHG, tCO2e)"],
    currentYear,
  );
  if (totalGHG > 0) {
    risks.climate.score += 10;
    risks.climate.factors.push("GHG emissions data available");
  }

  // Soil degradation risk
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    if (yearData && yearData.sequestration?.soc_summary) {
      const avgSOC = yearData.sequestration.soc_summary.average_soc;
      risks.soil_degradation.score += 10;
      risks.soil_degradation.factors.push(`SOC data available (${avgSOC.toFixed(1)} tC/ha)`);
    }
  }

  // Market risk - only if we have industry data
  if (company.industry) {
    risks.market.score += 10;
    risks.market.factors.push(`Industry: ${company.industry}`);
  }

  // Labor risk
  const hasLaborMetrics = metrics["Employee Turnover Rate (%)"] || metrics["Training Hours per Employee"];
  if (hasLaborMetrics) {
    risks.labor.score += 10;
    risks.labor.factors.push("Labor metrics available");
  }

  // Technology risk
  if (!carbonData) {
    risks.technology.score += 10;
    risks.technology.factors.push("No satellite monitoring data");
  }

  // Convert scores to levels and probabilities
  Object.keys(risks).forEach((risk) => {
    risks[risk].score = Math.min(100, Math.max(0, risks[risk].score));
    risks[risk].probability = (risks[risk].score / 100).toFixed(3);

    if (risks[risk].score >= 70) risks[risk].level = "High";
    else if (risks[risk].score >= 30) risks[risk].level = "Medium";
    else risks[risk].level = "Low";
  });

  // Calculate overall risk score with equal weights
  const riskCount = Object.keys(risks).length;
  const overallScore = Object.keys(risks).reduce(
    (sum, risk) => sum + risks[risk].score,
    0,
  ) / riskCount;

  risks.overall = {
    score: Math.round(overallScore),
    level:
      overallScore >= 70
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
) {
  const graphs = {};

  // 1. Water Usage Comparison
  const irrigationWaterData = metrics["Water Usage - Irrigation Water Usage (million ML)"];
  const waterTreatmentData = metrics["Water treatment (million ML)"];

  if (irrigationWaterData || waterTreatmentData) {
    graphs.water_usage_comparison = {
      type: "bar",
      title: "Water Usage Breakdown",
      description: "Comparison of irrigation and treatment water usage",
      labels: ["Current Year"],
      datasets: [
        {
          label: "Irrigation Water (million ML)",
          data: [getMetricValueByYear(irrigationWaterData, currentYear)],
          backgroundColor: "#3498db",
          borderColor: "#2980b9",
          borderWidth: 1,
        },
        {
          label: "Water Treatment (million ML)",
          data: [getMetricValueByYear(waterTreatmentData, currentYear)],
          backgroundColor: "#2ecc71",
          borderColor: "#27ae60",
          borderWidth: 1,
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
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
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
  const electricityData = metrics["Energy Consumption - Electricity Purchased (MWH)"];

  if (irrigationWaterData && electricityData) {
    graphs.resource_usage = {
      type: "bar",
      title: "Resource Usage",
      description: "Water and electricity consumption",
      labels: ["Current Year"],
      datasets: [
        {
          label: "Water Usage (million ML)",
          data: [getMetricValueByYear(irrigationWaterData, currentYear)],
          backgroundColor: "#3498db",
        },
        {
          label: "Energy Usage (MWH)",
          data: [getMetricValueByYear(electricityData, currentYear)],
          backgroundColor: "#f1c40f",
        },
      ],
    };
  }

  // 7. Emissions Breakdown
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
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
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    graphs.carbon_balance = {
      type: "bar",
      title: "Carbon Balance",
      description: "Sequestration vs Emissions balance",
      labels: ["Sequestration", "Emissions", "Net Balance"],
      datasets: [
        {
          label: "tCO₂",
          data: [
            yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
            yearData.emissions?.total_scope_emission_tco2e || 0,
            (yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0) -
            (yearData.emissions?.total_scope_emission_tco2e || 0)
          ],
          backgroundColor: ["#27ae60", "#e74c3c", "#3498db"],
        },
      ],
    };
  }

  // 9. Forecast Confidence Components
  graphs.forecast_confidence = {
    type: "polarArea",
    title: "Forecast Confidence Components",
    description: "Factors contributing to yield forecast confidence",
    labels: [
      "Satellite Data",
      "Water Metrics",
      "Energy Metrics",
      "Soil Data",
      "Historical Yield Data",
    ],
    datasets: [
      {
        data: [
          carbonData ? 20 : 0,
          irrigationWaterData ? 20 : 0,
          electricityData ? 20 : 0,
          metrics["Soil Organic Matter (%)"] ? 20 : 0,
          metrics["Crop Yield (t/ha)"] ? 20 : 0,
        ],
        backgroundColor: [
          "#3498db",
          "#2ecc71",
          "#f1c40f",
          "#e67e22",
          "#1abc9c",
        ],
      },
    ],
  };

  // 10. Yield Components Breakdown (only if we have base yield)
  if (yieldForecast.base_yield > 0) {
    graphs.yield_components = {
      type: "bar",
      title: "Yield Forecast Components",
      description: "Factors influencing yield forecast",
      labels: Object.keys(yieldForecast.calculation_factors || {}),
      datasets: [
        {
          label: "Factor Value",
          data: Object.values(yieldForecast.calculation_factors || {}),
          backgroundColor: "#9b59b6",
        },
      ],
    };
  }

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

  // Only provide recommendations based on actual data
  if (yieldForecast.forecasted_yield === 0) {
    recommendations.push({
      category: "Data Collection",
      priority: "High",
      action: "Collect historical yield data for accurate forecasting",
      impact: "Enable yield forecasting",
      timeline: "Immediate",
      cost_estimate: "",
      roi_estimate: "",
    });
  }

  // Water management
  const irrigationWaterData = metrics["Water Usage - Irrigation Water Usage (million ML)"];
  const irrigationWaterUsage = getMetricValueByYear(irrigationWaterData, currentYear);

  if (irrigationWaterUsage > 0) {
    recommendations.push({
      category: "Water Management",
      priority: "Medium",
      action: "Monitor water usage efficiency",
      impact: "Optimize water resource utilization",
      timeline: "Ongoing",
      cost_estimate: "",
      roi_estimate: "",
    });
  }

  // Energy efficiency
  const electricityData = metrics["Energy Consumption - Electricity Purchased (MWH)"];
  const electricityUsage = getMetricValueByYear(electricityData, currentYear);

  if (electricityUsage > 0) {
    recommendations.push({
      category: "Energy Efficiency",
      priority: "Medium",
      action: "Monitor energy consumption patterns",
      impact: "Identify energy saving opportunities",
      timeline: "Ongoing",
      cost_estimate: "",
      roi_estimate: "",
    });
  }

  // Risk mitigation
  if (risks.drought.level === "High") {
    recommendations.push({
      category: "Drought Risk",
      priority: "High",
      action: "Implement water conservation measures",
      impact: "Reduce drought vulnerability",
      timeline: "Next season",
      cost_estimate: "",
      roi_estimate: "",
    });
  }

  if (risks.pest_disease.level === "High") {
    recommendations.push({
      category: "Pest Management",
      priority: "High",
      action: "Establish pest monitoring system",
      impact: "Early pest detection and control",
      timeline: "Immediate",
      cost_estimate: "",
      roi_estimate: "",
    });
  }

  // Soil health
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data.length > 0) {
    const yearData = carbonData.yearly_data[0];
    if (yearData && yearData.sequestration?.soc_summary) {
      recommendations.push({
        category: "Soil Health",
        priority: "Medium",
        action: "Monitor soil organic carbon levels",
        impact: "Maintain soil fertility",
        timeline: "Continuous",
        cost_estimate: "",
        roi_estimate: "",
      });
    }
  }

  // Carbon credits
  if (carbonData && carbonData.comprehensive_summary &&
      carbonData.comprehensive_summary.totals.net_carbon_balance > 0) {
    recommendations.push({
      category: "Carbon Markets",
      priority: "Low",
      action: "Explore carbon credit opportunities",
      impact: "Additional revenue stream",
      timeline: "6-12 months",
      cost_estimate: "",
      roi_estimate: "",
    });
  }

  // Technology adoption
  if (!carbonData) {
    recommendations.push({
      category: "Monitoring Technology",
      priority: "Medium",
      action: "Consider satellite-based monitoring",
      impact: "Enhanced crop monitoring",
      timeline: "3-6 months",
      cost_estimate: "",
      roi_estimate: "",
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
function generateEnvironmentalMetricsSummary(metrics, currentYear) {
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
      data_coverage: 100, // Since we're getting data for a specific year
      completeness_score: calculateDataCompleteness(metrics, currentYear),
    },
  };

  // Calculate water metrics
  Object.keys(metrics).forEach((metricName) => {
    const metric = metrics[metricName];
    const currentValue = getMetricValueByYear(metric, currentYear);

    if (metricName.includes("Water") || metricName.includes("water")) {
      summary.water.total_metrics++;
      summary.water.total_usage += currentValue;
      summary.water.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit || "",
        trend: "stable", // Single year, no trend
      });
    }

    if (metricName.includes("Energy") || metricName.includes("Electricity")) {
      summary.energy.total_metrics++;
      summary.energy.total_consumption += currentValue;
      summary.energy.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit || "",
        trend: "stable",
      });
    }

    if (metricName.includes("Emission") || metricName.includes("GHG")) {
      summary.emissions.total_metrics++;
      summary.emissions.total_emissions += currentValue;
      summary.emissions.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit || "",
        trend: "stable",
      });
    }

    if (metricName.includes("Waste")) {
      summary.waste.total_metrics++;
      summary.waste.total_waste += currentValue;
      summary.waste.key_metrics.push({
        name: metricName,
        current_value: currentValue,
        unit: metric.unit || "",
        trend: "stable",
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
    if (getMetricValueByYear(metric, currentYear) !== 0) {
      completeMetrics++;
    }
  });

  return Math.round((completeMetrics / Object.keys(metrics).length) * 100);
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
      if (carbonData) indicators.push("NDVI values");
      if (metrics["Water Usage - Irrigation Water Usage (million ML)"]) indicators.push("Water usage data");
      break;
    case "pest_disease":
      if (carbonData) indicators.push("NDVI anomaly detection");
      if (metrics["Waste Management - Recycled waste (excl. Boiler Ash) (tons)"]) indicators.push("Waste management data");
      break;
    case "energy":
      if (metrics["Energy Consumption - Electricity Purchased (MWH)"]) indicators.push("Electricity consumption");
      if (metrics["Energy Consumption - Inside Company Diesel Usage (litres)"]) indicators.push("Diesel usage");
      break;
    case "soil_degradation":
      if (carbonData) indicators.push("SOC measurements");
      if (metrics["Soil Organic Matter (%)"]) indicators.push("Soil organic matter");
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

  // Only generate warnings based on actual risk levels
  if (risks.drought.level === "High") {
    warnings.push({
      type: "drought",
      level: risks.drought.level,
      indicators: ["Monitor water usage", "Check NDVI trends"],
      action: "Review water management practices",
    });
  }

  if (risks.pest_disease.level === "High") {
    warnings.push({
      type: "pest_disease",
      level: risks.pest_disease.level,
      indicators: ["Monitor NDVI anomalies", "Check waste management"],
      action: "Implement pest monitoring",
    });
  }

  if (risks.soil_degradation.level === "High") {
    warnings.push({
      type: "soil_degradation",
      level: risks.soil_degradation.level,
      indicators: ["Monitor SOC levels", "Check soil health metrics"],
      action: "Review soil management practices",
    });
  }

  return warnings;
}

/**
 * Helper function to determine season from date
 */
function getSeason(year) {
  const currentMonth = new Date().getMonth() + 1;
  // No assumptions about seasons - just return month-based description
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  return `${months[currentMonth - 1]} ${year}`;
}

/**
 * Helper function to generate planting schedule
 */
function generatePlantingSchedule(industry, year) {
  // No assumptions - return empty structure
  return {
    primary_crop: "",
    planting_window: "",
    optimal_planting: "",
    duration: "",
    rotation: "",
  };
}

/**
 * Helper function to generate harvest window
 */
function generateHarvestWindow(industry, year) {
  // No assumptions - return empty structure
  return {
    harvest_season: "",
    peak_harvest: "",
    expected_yield_period: "",
    post_harvest: "",
  };
}

/**
 * Helper function to generate seasonal risks
 */
function generateSeasonalRisks(season, risks) {
  // No assumptions about seasonal risks
  return [];
}

/**
 * Main Crop Yield Forecast API - Enhanced Version
 */
async function getCropYieldForecastData(companyId, year) {
  try {
    if (!year) {
      throw new AppError("Year is required", 400, "YEAR_REQUIRED");
    }

    const company = await Company.findById(companyId);
    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // Get ALL environmental metrics for the specific year
    const allEnvironmentalMetrics = await getAllEnvironmentalMetrics(companyId, year);

    if (Object.keys(allEnvironmentalMetrics).length === 0) {
      throw new AppError(
        "No environmental data available for crop production analysis",
        404,
        "NO_ENV_DATA",
      );
    }

    const currentYear = year;

    // Get comprehensive carbon emission data for the specific year
    const carbonData = await getComprehensiveCarbonEmissionData(companyId, currentYear);

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
    const categorizedMetrics = categorizeEnvironmentalMetrics(allEnvironmentalMetrics);
    const envMetricsSummary = generateEnvironmentalMetricsSummary(allEnvironmentalMetrics, currentYear);

    // Prepare comprehensive carbon emission accounting data
    const carbonEmissionAccounting = carbonData
      ? {
          framework: carbonData.framework,
          methodology: carbonData.emission_references?.methodology_statement || "",
          summary: carbonData.comprehensive_summary,
          yearly_data: carbonData.yearly_data.map((yearData) => ({
            year: yearData.year,
            sequestration: {
              reporting_area_ha: yearData.sequestration?.reporting_area_ha || 0,
              soc_area_ha: yearData.sequestration?.soc_area_ha || 0,
              monthly_data:
                yearData.sequestration?.monthly_data?.map((month) => ({
                  month: month.month || "",
                  month_number: month.month_number || 0,
                  ndvi_max: month.ndvi_max || 0,
                  soc_tc_per_ha: month.soc_tc_per_ha || 0,
                  soc_co2_t_per_ha: month.soc_co2_t_per_ha || 0,
                  delta_soc_co2_t: month.delta_soc_co2_t || 0,
                  agb_t_per_ha: month.agb_t_per_ha || 0,
                  biomass_co2_total_t: month.biomass_co2_total_t || 0,
                  meaning: month.meaning || "",
                })) || [],
              vegetation_summary: yearData.sequestration?.vegetation_summary || null,
              soc_summary: yearData.sequestration?.soc_summary || null,
              biomass_summary: yearData.sequestration?.biomass_summary || null,
              annual_summary: yearData.sequestration?.annual_summary || null,
            },
            emissions: {
              scope1: {
                total_tco2e: yearData.emissions?.scope1?.total_tco2e || 0,
                total_tco2e_per_ha: yearData.emissions?.scope1?.total_tco2e_per_ha || 0,
                sources:
                  yearData.emissions?.scope1?.detailed_sources ||
                  yearData.emissions?.scope1?.sources ||
                  [],
              },
              scope2: {
                total_tco2e: yearData.emissions?.scope2?.total_tco2e || 0,
                total_tco2e_per_ha: yearData.emissions?.scope2?.total_tco2e_per_ha || 0,
                sources:
                  yearData.emissions?.scope2?.detailed_sources ||
                  yearData.emissions?.scope2?.sources ||
                  [],
              },
              scope3: {
                total_tco2e: yearData.emissions?.scope3?.total_tco2e || 0,
                total_tco2e_per_ha: yearData.emissions?.scope3?.total_tco2e_per_ha || 0,
                categories:
                  yearData.emissions?.scope3?.detailed_categories ||
                  yearData.emissions?.scope3?.categories ||
                  [],
              },
              totals: {
                total_scope_emission_tco2e: yearData.emissions?.total_scope_emission_tco2e || 0,
                total_scope_emission_tco2e_per_ha: yearData.emissions?.total_scope_emission_tco2e_per_ha || 0,
                net_total_emission_tco2e: yearData.emissions?.net_total_emission_tco2e || 0,
              },
              intensity_metrics: yearData.emissions?.intensity_metrics || null,
            },
            data_quality: yearData.data_quality || null,
          })),
          emission_factors: carbonData.emission_references?.emission_factors || [],
          global_warming_potentials: carbonData.emission_references?.global_warming_potentials || null,
          conversion_factors: carbonData.emission_references?.conversion_factors || null,
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
        data_sources: carbonData,
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
        data_available_years: [currentYear],
        carbon_data_available: !!carbonData,
        satellite_data_years: carbonData?.yearly_data?.map((d) => d.year) || [],
        data_coverage_score: envMetricsSummary.overall.data_coverage,
      },
      confidence_score: {
        overall: confidenceScore,
        forecast_confidence: yieldForecast.confidence_score,
        risk_assessment_confidence: 100 - risks.overall.score,
        data_quality: envMetricsSummary.overall.completeness_score,
        methodology_rigor: 0, // No assumptions
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
          ...(envMetricsSummary.overall.completeness_score < 70
            ? ["More complete environmental metrics"]
            : []),
          ...(yieldForecast.base_yield === 0 ? ["Historical yield data"] : []),
        ],
      },
      yield_forecast: {
        ...yieldForecast,
        season: getSeason(currentYear),
        comparison_to_industry_average: {
          industry_average: 0,
          company_yield: yieldForecast.forecasted_yield,
          percentage_difference: 0,
          status: "",
          potential_improvement: 0,
        },
        sensitivity_analysis: {
          water_sensitivity: 0,
          climate_sensitivity: 0,
          management_sensitivity: 0,
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
            value: yieldForecast.forecasted_yield > 0 && getMetricValueByYear(allEnvironmentalMetrics["Water Usage - Irrigation Water Usage (million ML)"], currentYear) > 0 
              ? yieldForecast.forecasted_yield / getMetricValueByYear(allEnvironmentalMetrics["Water Usage - Irrigation Water Usage (million ML)"], currentYear) 
              : 0,
            unit: "t/ML",
            benchmark: 0,
            status: "",
          },
          energy_productivity: {
            value: yieldForecast.forecasted_yield > 0 && getMetricValueByYear(allEnvironmentalMetrics["Energy Consumption - Electricity Purchased (MWH)"], currentYear) > 0
              ? yieldForecast.forecasted_yield / getMetricValueByYear(allEnvironmentalMetrics["Energy Consumption - Electricity Purchased (MWH)"], currentYear)
              : 0,
            unit: "t/MWh",
            benchmark: 0,
            status: "",
          },
          carbon_intensity: {
            value: yieldForecast.forecasted_yield > 0 && getMetricValueByYear(allEnvironmentalMetrics["Carbon Emissions (Total GHG, tCO2e)"], currentYear) > 0
              ? getMetricValueByYear(allEnvironmentalMetrics["Carbon Emissions (Total GHG, tCO2e)"], currentYear) / yieldForecast.forecasted_yield
              : 0,
            unit: "tCO2e/t",
            benchmark: 0,
            status: "",
          },
          soil_health_index: {
            value: carbonData?.yearly_data?.[0]?.sequestration?.soc_summary?.average_soc || getMetricValueByYear(allEnvironmentalMetrics["Soil Organic Matter (%)"], currentYear) || 0,
            unit: "index",
            benchmark: 0,
            status: "",
          },
        },
      },
      carbon_emission_accounting: carbonEmissionAccounting,
      satellite_indicators: carbonData
        ? {
            ndvi_summary: carbonData.yearly_data?.[0]?.sequestration?.vegetation_summary || null,
            soc_summary: carbonData.yearly_data?.[0]?.sequestration?.soc_summary || null,
            biomass_summary: carbonData.yearly_data?.[0]?.sequestration?.biomass_summary || null,
            data_coverage: {
              months_with_data: carbonData.yearly_data?.[0]?.sequestration?.monthly_data?.length || 0,
              growing_season_coverage: carbonData.yearly_data?.[0]?.sequestration?.vegetation_summary?.growing_season_months?.length || 0,
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
          "____________________________________________",
          "_____________________________________________",
          "_____________________________________________",
        ],
        upcoming_risks: generateSeasonalRisks(getSeason(currentYear), risks),
        planting_schedule: generatePlantingSchedule(company.industry, currentYear),
        harvest_window: generateHarvestWindow(company.industry, currentYear),
      },
      summary: {
        outlook: yieldForecast.forecasted_yield > 0 ? "Data available for analysis" : "Insufficient data for yield forecasting",
        key_strengths: [
          ...(yieldForecast.confidence_score >= 70 ? ["High forecast confidence"] : []),
          ...(carbonData ? ["Satellite monitoring available"] : []),
          ...(envMetricsSummary.overall.completeness_score >= 80 ? ["____________________________________________"] : []),
        ],
        key_concerns: Object.keys(risks)
          .filter((k) => k !== "overall" && (risks[k].level === "High"))
          .map((k) => `${k.replace(/_/g, " ")} (${risks[k].level})`),
        opportunities: [
          ...(carbonData && carbonData.comprehensive_summary?.totals.net_carbon_balance > 0 ? ["_______________________________________"] : []),
          ...(carbonData ? ["_____________________________"] : ["____________________________________"]),
        ],
        data_gaps: [
          ...(!carbonData ? ["__________________________________"] : []),
          ...(!allEnvironmentalMetrics["Soil Organic Matter (%)"] ? ["__________________________"] : []),
          ...(envMetricsSummary.overall.completeness_score < 70 ? ["_______________________________________"] : []),
          ...(yieldForecast.base_yield === 0 ? ["Historical yield data"] : []),
        ],
        next_steps: [
          "_________________________________________________________",
          "__________________________________________________________",
          "__________________________________________________________",
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

module.exports = {
  getCropYieldForecastData,
};