const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");

// Version constants
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to get ALL metrics for a company for specific years
 */
async function getAllMetricsByYear(companyId, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country")
      .lean();

    // Extract and organize ALL metrics
    const allMetrics = {};
    
    esgData.forEach(data => {
      data.metrics.forEach(metric => {
        const metricName = metric.metric_name;
        
        if (!allMetrics[metricName]) {
          allMetrics[metricName] = {
            name: metricName,
            category: metric.category,
            unit: metric.unit,
            description: metric.description || "",
            values: []
          };
        }
        
        metric.values.forEach(value => {
          if (years.length === 0 || years.includes(value.year)) {
            allMetrics[metricName].values.push({
              year: value.year,
              value: value.value,
              numeric_value: value.numeric_value,
              source_notes: value.source_notes,
              added_at: value.added_at,
              last_updated_at: value.last_updated_at
            });
          }
        });
      });
    });

    // Sort values by year for each metric
    Object.keys(allMetrics).forEach(metricName => {
      allMetrics[metricName].values.sort((a, b) => a.year - b.year);
      
      // Remove duplicates (keep only one value per year)
      const uniqueValues = [];
      const seenYears = new Set();
      
      allMetrics[metricName].values.forEach(value => {
        if (!seenYears.has(value.year)) {
          seenYears.add(value.year);
          uniqueValues.push(value);
        }
      });
      
      allMetrics[metricName].values = uniqueValues;
    });

    return allMetrics;
  } catch (error) {
    throw new AppError(
      `Error fetching all metrics: ${error.message}`,
      500,
      "METRICS_FETCH_ERROR"
    );
  }
}

/**
 * Helper function to get specific metrics by names
 */
async function getMetricsByNames(companyId, metricNames, years = []) {
  const allMetrics = await getAllMetricsByYear(companyId, years);
  
  // Filter to only include requested metric names
  const filteredMetrics = {};
  metricNames.forEach(name => {
    if (allMetrics[name]) {
      filteredMetrics[name] = allMetrics[name];
    }
  });
  
  return filteredMetrics;
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
  const value = metric.values.find(v => v.year === year);
  return value ? value.numeric_value || parseFloat(value.value) || 0 : null;
}

/**
 * Helper function to get metric values for multiple years
 */
function getMetricValuesForYears(metric, years) {
  return years.map(year => getMetricValueByYear(metric, year));
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
 * Get carbon emission data for a specific year (excluding sequestration and scope1 details)
 */
async function getCarbonEmissionsForYear(companyId, year) {
  try {
    const carbonData = await CarbonEmissionAccounting.findOne({
      company: companyId,
      "yearly_data.year": year,
      is_active: true
    })
    .populate("company", "name industry country")
    .lean();

    if (!carbonData) return null;

    // Find the specific year data
    const yearData = carbonData.yearly_data.find(d => d.year === year);
    if (!yearData) return null;

    // Return only the emissions data (excluding sequestration and scope1 details)
    return {
      year: yearData.year,
      emissions: {
        scope2: {
          total_tco2e_per_ha: yearData.emissions.scope2?.total_tco2e_per_ha || 0,
          total_tco2e: yearData.emissions.scope2?.total_tco2e || 0,
          sources: yearData.emissions.scope2?.sources || []
        },
        scope3: {
          total_tco2e_per_ha: yearData.emissions.scope3?.total_tco2e_per_ha || 0,
          total_tco2e: yearData.emissions.scope3?.total_tco2e || 0,
          categories: yearData.emissions.scope3?.categories || []
        },
        totals: {
          total_scope_emission_tco2e_per_ha: yearData.emissions.total_scope_emission_tco2e_per_ha || 0,
          total_scope_emission_tco2e: yearData.emissions.total_scope_emission_tco2e || 0,
          net_total_emission_tco2e: yearData.emissions.net_total_emission_tco2e || 0
        }
      },
      data_quality: yearData.data_quality || {}
    };
  } catch (error) {
    console.error("Error fetching carbon emissions:", error);
    return null;
  }
}

/**
 * 7. Energy Consumption & Renewables API
 */
async function getEnergyRenewablesData(companyId, year) {
  if (!year) {
    throw new AppError("Year is required", 400, "YEAR_REQUIRED");
  }

  const company = await Company.findById(companyId).lean();
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  // Get ALL metrics for the selected year
  const currentYear = parseInt(year);
  const trendYears = [currentYear - 3, currentYear - 2, currentYear - 1, currentYear].filter(y => y >= 2020);
  
  // Get all metrics for current year
  const allMetricsCurrentYear = await getAllMetricsByYear(companyId, [currentYear]);
  
  // Get metrics for trend years (for graphs and trends)
  const allMetricsTrendYears = await getAllMetricsByYear(companyId, trendYears);

  // Define energy-specific metrics for calculations
  const energyMetricNames = [
    "Energy Consumption (Renewable) - Bagasse Usage (tons)",
    "Energy Consumption (Renewable) - Solar Energy Usage (KwH)",
    "Energy Consumption - Coal Consumption (tons)",
    "Energy Consumption - Inside Company Diesel Usage (litres)",
    "Energy Consumption - Electricity Generated (MWH)",
    "Energy Consumption - Electricity Purchased (MWH)",
    "Energy Consumption - Electricity Exported to National Grid (MWH)",
    "Total Energy Consumption (GJ)",
    "Renewable Energy Percentage (%)",
    "Energy Intensity (GJ/unit production)",
    "Energy Cost (USD)"
  ];

  // Extract energy metrics from all metrics
  const energyMetrics = {};
  energyMetricNames.forEach(name => {
    if (allMetricsTrendYears[name]) {
      energyMetrics[name] = allMetricsTrendYears[name];
    }
  });

  const carbonEmissions = await getCarbonEmissionsForYear(companyId, currentYear);

  // Calculate values for current year using energy metrics
  const bagasseUsage = getMetricValueByYear(
    energyMetrics["Energy Consumption (Renewable) - Bagasse Usage (tons)"],
    currentYear
  ) || 0;

  const solarUsage = getMetricValueByYear(
    energyMetrics["Energy Consumption (Renewable) - Solar Energy Usage (KwH)"],
    currentYear
  ) || 0;

  const coalConsumption = getMetricValueByYear(
    energyMetrics["Energy Consumption - Coal Consumption (tons)"],
    currentYear
  ) || 0;

  const dieselUsage = getMetricValueByYear(
    energyMetrics["Energy Consumption - Inside Company Diesel Usage (litres)"],
    currentYear
  ) || 0;

  const electricityGenerated = getMetricValueByYear(
    energyMetrics["Energy Consumption - Electricity Generated (MWH)"],
    currentYear
  ) || 0;

  const electricityPurchased = getMetricValueByYear(
    energyMetrics["Energy Consumption - Electricity Purchased (MWH)"],
    currentYear
  ) || 0;

  const electricityExported = getMetricValueByYear(
    energyMetrics["Energy Consumption - Electricity Exported to National Grid (MWH)"],
    currentYear
  ) || 0;

  const totalEnergy = getMetricValueByYear(
    energyMetrics["Total Energy Consumption (GJ)"],
    currentYear
  ) || 0;

  // Calculate renewable energy (convert to GJ)
  // Conversion factors: 1 ton bagasse ≈ 10 GJ, 1 KWh ≈ 0.0036 GJ
  const renewableEnergyGJ = (bagasseUsage * 10) + (solarUsage * 0.0036);
  
  // Calculate fossil energy (convert to GJ)
  // Conversion factors: 1 ton coal ≈ 25 GJ, 1 liter diesel ≈ 0.036 GJ
  const fossilEnergyGJ = (coalConsumption * 25) + (dieselUsage * 0.036);
  
  // Calculate total energy if not provided
  const totalEnergyGJ = totalEnergy > 0 ? totalEnergy : (renewableEnergyGJ + fossilEnergyGJ);
  
  // Calculate percentages
  const renewablePercentage = totalEnergyGJ > 0 ? (renewableEnergyGJ / totalEnergyGJ) * 100 : 0;
  const fossilPercentage = totalEnergyGJ > 0 ? (fossilEnergyGJ / totalEnergyGJ) * 100 : 0;

  // Calculate renewable energy mix percentages
  const bagassePercentage = renewableEnergyGJ > 0 ? ((bagasseUsage * 10) / renewableEnergyGJ) * 100 : 0;
  const solarPercentage = renewableEnergyGJ > 0 ? ((solarUsage * 0.0036) / renewableEnergyGJ) * 100 : 0;

  // Calculate fossil energy mix percentages
  const coalPercentage = fossilEnergyGJ > 0 ? ((coalConsumption * 25) / fossilEnergyGJ) * 100 : 0;
  const dieselPercentage = fossilEnergyGJ > 0 ? ((dieselUsage * 0.036) / fossilEnergyGJ) * 100 : 0;

  // Calculate trends
  const coalTrend = calculateTrend(energyMetrics["Energy Consumption - Coal Consumption (tons)"], trendYears);
  const dieselTrend = calculateTrend(energyMetrics["Energy Consumption - Inside Company Diesel Usage (litres)"], trendYears);
  const renewableTrend = calculateTrend(energyMetrics["Renewable Energy Percentage (%)"], trendYears);

  // Calculate grid dependency
  const totalElectricityConsumption = electricityGenerated + electricityPurchased - electricityExported;
  const gridDependencyPercentage = totalElectricityConsumption > 0 ? 
    ((electricityPurchased - electricityExported) / totalElectricityConsumption) * 100 : 0;

  // Calculate financial impact
  const energyCost = getMetricValueByYear(energyMetrics["Energy Cost (USD)"], currentYear) || 0;
  const costSavings = renewableEnergyGJ > 0 ? renewableEnergyGJ * 10 : 0; // Assuming $10/GJ savings for renewable
  const carbonCostAvoided = renewableEnergyGJ * 0.05 * 50; // Assuming 0.05 tCO2e/GJ avoided and $50/ton carbon price

  // Calculate data quality score
  const availableMetrics = Object.keys(energyMetrics).length;
  const totalExpectedMetrics = energyMetricNames.length;
  const completenessScore = totalExpectedMetrics > 0 ? 
    Math.round((availableMetrics / totalExpectedMetrics) * 100) : 0;

  // Organize all metrics by category for the response
  const metricsByCategory = {
    environmental: {},
    social: {},
    governance: {}
  };

  Object.keys(allMetricsCurrentYear).forEach(metricName => {
    const metric = allMetricsCurrentYear[metricName];
    const category = metric.category || "uncategorized";
    
    if (metricsByCategory[category]) {
      metricsByCategory[category][metricName] = metric;
    } else {
      if (!metricsByCategory.other) metricsByCategory.other = {};
      metricsByCategory.other[metricName] = metric;
    }
  });

  const data = {
    company: company,
    reporting_period: {
      year: currentYear,
      date_range: `${currentYear}-01-01 to ${currentYear}-12-31`,
      fiscal_year: currentYear
    },
    
    // ALL metrics for the selected year, organized by category
    all_metrics: {
      by_category: metricsByCategory,
      total_metrics: Object.keys(allMetricsCurrentYear).length,
      energy_metrics_count: Object.keys(energyMetrics).length,
      environmental_metrics_count: Object.keys(metricsByCategory.environmental || {}).length,
      social_metrics_count: Object.keys(metricsByCategory.social || {}).length,
      governance_metrics_count: Object.keys(metricsByCategory.governance || {}).length
    },
    
    // Key Performance Indicators
    kpis: {
      renewable_energy_percentage: renewablePercentage.toFixed(1),
      fossil_fuel_percentage: fossilPercentage.toFixed(1),
      grid_dependency_percentage: gridDependencyPercentage.toFixed(1),
      energy_intensity: getMetricValueByYear(energyMetrics["Energy Intensity (GJ/unit production)"], currentYear) || 0,
      total_energy_consumption_gj: totalEnergyGJ.toFixed(0),
      renewable_energy_generation_gj: renewableEnergyGJ.toFixed(0),
      carbon_intensity_tco2e_per_gj: totalEnergyGJ > 0 ? 
        ((carbonEmissions?.emissions?.scope2?.total_tco2e || 0) / totalEnergyGJ).toFixed(3) : 0,
      clean_energy_transition_score: renewablePercentage > 30 ? "high" : renewablePercentage > 15 ? "moderate" : "low"
    },
    
    // Energy Mix Analysis
    energy_mix: {
      renewable_sources: {
        percentage: renewablePercentage.toFixed(1),
        breakdown: {
          bagasse: bagassePercentage.toFixed(1),
          solar: solarPercentage.toFixed(1),
          other_renewables: Math.max(0, (100 - bagassePercentage - solarPercentage)).toFixed(1)
        },
        generation_gj: renewableEnergyGJ.toFixed(0)
      },
      fossil_sources: {
        percentage: fossilPercentage.toFixed(1),
        breakdown: {
          coal: coalPercentage.toFixed(1),
          diesel: dieselPercentage.toFixed(1),
          other_fossil: Math.max(0, (100 - coalPercentage - dieselPercentage)).toFixed(1)
        },
        consumption_gj: fossilEnergyGJ.toFixed(0)
      },
      total_energy_gj: totalEnergyGJ.toFixed(0)
    },
    
    // Grid Operations
    grid_operations: {
      electricity_generated_mwh: electricityGenerated.toFixed(0),
      electricity_purchased_mwh: electricityPurchased.toFixed(0),
      electricity_exported_mwh: electricityExported.toFixed(0),
      net_grid_import_mwh: (electricityPurchased - electricityExported).toFixed(0),
      grid_self_sufficiency_percentage: (electricityGenerated + electricityPurchased) > 0 ? 
        (electricityGenerated / (electricityGenerated + electricityPurchased) * 100).toFixed(1) : 0,
      grid_dependency: gridDependencyPercentage.toFixed(1)
    },
    
    // Trends Analysis
    trends: {
      coal_consumption: coalTrend,
      diesel_consumption: dieselTrend,
      renewable_energy_adoption: renewableTrend,
      clean_energy_transition: renewablePercentage > 30 ? "accelerating" : renewablePercentage > 15 ? "moderate" : "beginning",
      energy_efficiency: calculateTrend(energyMetrics["Energy Intensity (GJ/unit production)"], trendYears) || "stable"
    },
    
    // Carbon Emissions from Energy
    carbon_emissions: carbonEmissions || {
      message: "Carbon emissions data not available for this year",
      emissions: {
        scope2: { 
          total_tco2e: 0,
          sources: []
        },
        scope3: { 
          total_tco2e: 0,
          categories: []
        },
        totals: { 
          total_scope_emission_tco2e: 0,
          net_total_emission_tco2e: 0
        }
      }
    },
    
    // Financial Impact
    financial_impact: {
      total_energy_cost_usd: energyCost.toLocaleString(),
      renewable_energy_cost_savings_usd: costSavings.toLocaleString(),
      carbon_cost_avoided_usd: carbonCostAvoided.toLocaleString(),
      total_savings_usd: (costSavings + carbonCostAvoided).toLocaleString(),
      roi_percentage: energyCost > 0 ? ((costSavings + carbonCostAvoided) / energyCost * 100).toFixed(1) : 0,
      energy_cost_per_gj: totalEnergyGJ > 0 ? (energyCost / totalEnergyGJ).toFixed(2) : 0
    },
    
    // Dashboard Graphs (6 graphs as requested)
    graphs: {
      // 1. Energy Mix Pie Chart
      energy_mix_chart: {
        type: "pie",
        title: "Energy Mix Composition",
        description: "Breakdown of renewable vs fossil fuel energy sources",
        labels: ["Renewable Energy", "Fossil Fuels"],
        datasets: [
          {
            data: [renewablePercentage, fossilPercentage],
            backgroundColor: ["#27ae60", "#e74c3c"],
            borderColor: ["#219a52", "#c0392b"]
          }
        ]
      },
      
      // 2. Renewable Energy Sources Breakdown
      renewable_sources_chart: {
        type: "doughnut",
        title: "Renewable Energy Sources",
        description: "Breakdown of different renewable energy sources",
        labels: ["Bagasse", "Solar", "Other Renewables"],
        datasets: [
          {
            data: [bagassePercentage, solarPercentage, Math.max(0, (100 - bagassePercentage - solarPercentage))],
            backgroundColor: ["#2ecc71", "#f1c40f", "#3498db"],
            borderColor: ["#27ae60", "#f39c12", "#2980b9"]
          }
        ]
      },
      
      // 3. Energy Consumption Trend (4-year trend)
      energy_consumption_trend: {
        type: "line",
        title: "Energy Consumption Trend",
        description: "Historical energy consumption over the past 4 years",
        labels: trendYears,
        datasets: [
          {
            label: "Total Energy (GJ)",
            data: trendYears.map(year => 
              getMetricValueByYear(energyMetrics["Total Energy Consumption (GJ)"], year) || 0
            ),
            borderColor: "#3498db",
            backgroundColor: "rgba(52, 152, 219, 0.1)",
            tension: 0.3
          },
          {
            label: "Renewable Energy (GJ)",
            data: trendYears.map(year => {
              const bagasse = getMetricValueByYear(
                energyMetrics["Energy Consumption (Renewable) - Bagasse Usage (tons)"], year
              ) || 0;
              const solar = getMetricValueByYear(
                energyMetrics["Energy Consumption (Renewable) - Solar Energy Usage (KwH)"], year
              ) || 0;
              return (bagasse * 10) + (solar * 0.0036);
            }),
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.1)",
            tension: 0.3
          }
        ]
      },
      
      // 4. Fossil Fuel Consumption Trend
      fossil_fuel_trend: {
        type: "bar",
        title: "Fossil Fuel Consumption Trend",
        description: "Coal and diesel consumption trends over the past 4 years",
        labels: trendYears,
        datasets: [
          {
            label: "Coal (tons)",
            data: trendYears.map(year => 
              getMetricValueByYear(energyMetrics["Energy Consumption - Coal Consumption (tons)"], year) || 0
            ),
            backgroundColor: "#2c3e50",
            borderColor: "#1a252f"
          },
          {
            label: "Diesel (liters)",
            data: trendYears.map(year => 
              getMetricValueByYear(energyMetrics["Energy Consumption - Inside Company Diesel Usage (litres)"], year) || 0
            ),
            backgroundColor: "#e74c3c",
            borderColor: "#c0392b"
          }
        ]
      },
      
      // 5. Grid Electricity Flow
      grid_electricity_flow: {
        type: "bar",
        title: "Grid Electricity Operations",
        description: "Electricity generation, purchase, and export to grid",
        labels: ["Generated", "Purchased", "Exported"],
        datasets: [
          {
            label: "Electricity (MWH)",
            data: [electricityGenerated, electricityPurchased, electricityExported],
            backgroundColor: ["#9b59b6", "#3498db", "#2ecc71"],
            borderColor: ["#8e44ad", "#2980b9", "#27ae60"]
          }
        ]
      },
      
      // 6. Renewable Energy Growth
      renewable_growth_chart: {
        type: "line",
        title: "Renewable Energy Adoption",
        description: "Growth of renewable energy percentage over time",
        labels: trendYears,
        datasets: [
          {
            label: "Renewable Energy %",
            data: trendYears.map(year => 
              getMetricValueByYear(energyMetrics["Renewable Energy Percentage (%)"], year) || 0
            ),
            borderColor: "#27ae60",
            backgroundColor: "rgba(39, 174, 96, 0.1)",
            fill: true,
            tension: 0.4
          },
          {
            label: "Target (30%)",
            data: trendYears.map(() => 30),
            borderColor: "#f39c12",
            borderDash: [5, 5],
            backgroundColor: "transparent",
            pointRadius: 0
          }
        ]
      }
    },
    
    // Versions
    versions: {
      api: API_VERSION,
      calculation: CALCULATION_VERSION,
      gee_adapter: GEE_ADAPTER_VERSION,
      last_updated: new Date().toISOString()
    },
    
    // Data Quality
    data_quality: {
      completeness_score: completenessScore,
      verified_metrics: Object.keys(energyMetrics).length,
      total_expected_metrics: energyMetricNames.length,
      verification_status: completenessScore > 80 ? "good" : completenessScore > 50 ? "moderate" : "poor",
      notes: completenessScore < 100 ? `Missing ${energyMetricNames.length - Object.keys(energyMetrics).length} energy metrics` : "All energy metrics available",
      energy_data_coverage: `${Object.keys(energyMetrics).length}/${energyMetricNames.length} metrics`
    },
    
    // Summary
    summary: {
      message: `Energy & Renewables Analysis for ${company.name} - ${currentYear}`,
      key_insight: renewablePercentage > 30 ? 
        "Strong renewable energy adoption with significant cost savings" :
        renewablePercentage > 15 ?
        "Moderate renewable energy use with potential for improvement" :
        "Significant opportunity to increase renewable energy usage",
      recommendation: renewablePercentage < 30 ? 
        "Consider expanding solar capacity and increasing bagasse utilization" :
        "Maintain current renewable energy mix and explore additional clean energy sources"
    }
  };

  return data;
}

module.exports = {
  getEnergyRenewablesData,
  getAllMetricsByYear
};