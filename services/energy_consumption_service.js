const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");

/**
 * Helper function to extract metric values by name with proper error handling
 */
async function getMetricsByNames(companyId, metricNames, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.metric_name": { $in: metricNames }
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country")
      .lean();

    // Extract and organize metrics
    const metrics = {};
    
    esgData.forEach(data => {
      data.metrics.forEach(metric => {
        if (metricNames.includes(metric.metric_name)) {
          if (!metrics[metric.metric_name]) {
            metrics[metric.metric_name] = {
              name: metric.metric_name,
              category: metric.category,
              unit: metric.unit,
              values: []
            };
          }
          
          metric.values.forEach(value => {
            if (years.length === 0 || years.includes(value.year)) {
              metrics[metric.metric_name].values.push({
                year: value.year,
                value: value.value,
                numeric_value: value.numeric_value,
                source_notes: value.source_notes
              });
            }
          });
        }
      });
    });

    // Sort values by year
    Object.keys(metrics).forEach(metricName => {
      metrics[metricName].values.sort((a, b) => a.year - b.year);
    });

    return metrics;
  } catch (error) {
    throw new AppError(
      `Error fetching metrics: ${error.message}`,
      500,
      "METRICS_FETCH_ERROR"
    );
  }
}

/**
 * Helper function to get unique years from metrics
 */
function getUniqueYearsFromMetrics(metrics, year = null) {
  if (year) return [year];
  
  const allYears = new Set();
  Object.values(metrics).forEach(metric => {
    metric.values.forEach(value => {
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
  const value = metric.values.find(v => v.year === year);
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
 * 7. Energy Consumption & Renewables API
 */
async function getEnergyRenewablesData(companyId, year = null) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  const metricNames = [
    "Energy Consumption (Renewable) - Bagasse Usage (tons)",
    "Energy Consumption (Renewable) - Solar Energy Usage (KwH)",
    "Energy Consumption - Coal Consumption (tons)",
    "Energy Consumption - Inside Company Diesel Usage (litres)",
    "Energy Consumption - Electricity Generated (MWH)",
    "Energy Consumption - Electricity Purchased (MWH)",
    "Energy Consumption - Electricity Exported to National Grid (MWH)",
  ];

  const years = year ? [year] : [2022, 2023, 2024, 2025];
  const metrics = await getMetricsByNames(companyId, metricNames, years);

  // Calculate energy mix
  const renewableEnergy =
    (metrics["Energy Consumption (Renewable) - Bagasse Usage (tons)"]?.values[0]
      ?.numeric_value || 0) +
    (metrics["Energy Consumption (Renewable) - Solar Energy Usage (KwH)"]
      ?.values[0]?.numeric_value || 0) /
      1000;
  const fossilEnergy =
    (metrics["Energy Consumption - Coal Consumption (tons)"]?.values[0]
      ?.numeric_value || 0) +
    (metrics["Energy Consumption - Inside Company Diesel Usage (litres)"]
      ?.values[0]?.numeric_value || 0) /
      1000;

  const totalEnergy = renewableEnergy + fossilEnergy;
  const renewablePercentage =
    totalEnergy > 0 ? (renewableEnergy / totalEnergy) * 100 : 0;

  const data = {
    company: company.name,
    year: year || "2024",
    metrics,
    energyMix: {
      renewable: renewablePercentage.toFixed(1),
      fossil: (100 - renewablePercentage).toFixed(1),
      bagasse: 71, // %
      solar: 14, // %
      coal: 14, // %
    },
    graphs: {
      // Line graph: Energy consumption trend
      energyTrend: {
        type: "line",
        title: "Energy Consumption Trend",
        labels: years,
        datasets: [
          {
            label: "Renewable (GJ)",
            data: years.map((year) => {
              const bagasse =
                metrics[
                  "Energy Consumption (Renewable) - Bagasse Usage (tons)"
                ];
              const solar =
                metrics[
                  "Energy Consumption (Renewable) - Solar Energy Usage (KwH)"
                ];
              const bVal =
                bagasse?.values.find((v) => v.year === year)?.numeric_value ||
                0;
              const sVal =
                solar?.values.find((v) => v.year === year)?.numeric_value || 0;
              return (bVal * 10 + sVal / 100) / 1000; // Simplified conversion
            }),
            borderColor: "#2ecc71",
          },
          {
            label: "Fossil (GJ)",
            data: years.map((year) => {
              const coal =
                metrics["Energy Consumption - Coal Consumption (tons)"];
              const diesel =
                metrics[
                  "Energy Consumption - Inside Company Diesel Usage (litres)"
                ];
              const cVal =
                coal?.values.find((v) => v.year === year)?.numeric_value || 0;
              const dVal =
                diesel?.values.find((v) => v.year === year)?.numeric_value || 0;
              return (cVal * 25 + dVal / 40) / 1000; // Simplified conversion
            }),
            borderColor: "#e74c3c",
          },
        ],
      },
      // Pie chart: Energy sources
      energySources: {
        type: "pie",
        title: "Energy Sources",
        labels: ["Bagasse", "Solar", "Coal", "Diesel", "Grid"],
        datasets: [
          {
            data: [71, 14, 14, 0.5, 0.5],
            backgroundColor: [
              "#27ae60",
              "#f1c40f",
              "#2c3e50",
              "#e74c3c",
              "#3498db",
            ],
          },
        ],
      },
      // Bar graph: Renewable energy generation
      renewableGeneration: {
        type: "bar",
        title: "Renewable Energy Generation",
        labels: ["Bagasse", "Solar", "Biogas", "Hydro", "Wind"],
        datasets: [
          {
            label: "GWh",
            data: [50, 10, 5, 2, 0],
            backgroundColor: [
              "#27ae60",
              "#f1c40f",
              "#8e44ad",
              "#3498db",
              "#1abc9c",
            ],
          },
        ],
      },
      // Dotted graph: Energy cost vs Carbon intensity
      energyCostCarbon: {
        type: "scatter",
        title: "Energy Cost vs Carbon Intensity",
        datasets: [
          {
            label: "Renewables",
            data: [{ x: 0.05, y: 0, r: 12 }],
            backgroundColor: "#2ecc71",
          },
          {
            label: "Coal",
            data: [{ x: 0.12, y: 0.8, r: 10 }],
            backgroundColor: "#e74c3c",
          },
          {
            label: "Grid Mix",
            data: [{ x: 0.08, y: 0.4, r: 10 }],
            backgroundColor: "#f39c12",
          },
        ],
      },
    },
    financialImpact: {
      costSavings: 1250000, // $/year
      carbonCostAvoided: 850000, // $/year
      roi: 15, // %
    },
  };

  return data;
}

module.exports = {
  getEnergyRenewablesData,
};