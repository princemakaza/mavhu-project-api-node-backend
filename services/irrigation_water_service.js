const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");

// Version constants
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";

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
        "name industry country area_of_interest_metadata esg_reporting_framework",
      )
      .lean();

    // Extract and organize metrics
    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metricNames.includes(metric.metric_name) && metric.is_active) {
          if (!metrics[metric.metric_name]) {
            metrics[metric.metric_name] = {
              name: metric.metric_name,
              category: metric.category,
              unit: metric.unit,
              description: metric.description,
              values: [],
            };
          }

          metric.values.forEach((value) => {
            if (years.length === 0 || years.includes(value.year)) {
              metrics[metric.metric_name].values.push({
                year: value.year,
                value: value.value,
                numeric_value: value.numeric_value,
                source_notes: value.source_notes,
                added_at: value.added_at,
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
      if (value.year) allYears.add(value.year);
    });
  });

  return Array.from(allYears).sort();
}

/**
 * Helper function to calculate percentage change
 */
function calculatePercentageChange(initialValue, finalValue) {
  if (initialValue === null || finalValue === null || initialValue === 0) return 0;
  return ((finalValue - initialValue) / initialValue) * 100;
}

/**
 * Helper function to get metric value by year
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.values) return null;
  const value = metric.values.find((v) => v.year === year);
  return value ? (value.numeric_value !== undefined ? value.numeric_value : parseFloat(value.value) || null) : null;
}

/**
 * Helper function to calculate trends based on actual data
 */
function calculateTrend(values, years) {
  if (!values || values.length < 2) return "insufficient_data";

  const validYears = years.filter(year => getMetricValueByYear(values, year) !== null);
  if (validYears.length < 2) return "insufficient_data";

  const sortedYears = [...validYears].sort((a, b) => a - b);
  const firstYear = sortedYears[0];
  const lastYear = sortedYears[sortedYears.length - 1];

  const firstValue = getMetricValueByYear(values, firstYear);
  const lastValue = getMetricValueByYear(values, lastYear);

  if (firstValue === null || lastValue === null) return "insufficient_data";

  const change = calculatePercentageChange(firstValue, lastValue);

  if (change > 5) return "improving";
  if (change < -5) return "declining";
  return "stable";
}

/**
 * Calculate data completeness score based on available metrics
 */
function calculateDataCompleteness(metrics, year, requiredMetrics) {
  if (!metrics || !year) return 0;
  
  let availableCount = 0;
  requiredMetrics.forEach(metricName => {
    const metric = metrics[metricName];
    if (metric && getMetricValueByYear(metric, year) !== null) {
      availableCount++;
    }
  });
  
  return requiredMetrics.length > 0 ? (availableCount / requiredMetrics.length) * 100 : 0;
}

/**
 * Get exact totals from actual data in database
 */
async function getExactWaterMetrics(companyId, year = null) {
  try {
    // Get company with full details
    const company = await Company.findById(companyId).lean();
    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // Define metrics based on ACTUAL data from CSV - only metrics that exist
    const metricNames = [
      // Water metrics that exist in CSV
      "Water Usage - Irrigation Water Usage (million ML)",
      "Water treatment (million ML)",
      "Effluent discharge for Irrigation (thousand ML)",
      
      // Energy metrics that exist in CSV (for water-energy nexus)
      "Energy Consumption - Electricity Purchased (MWH)",
      "Energy Consumption - Electricity Generated (MWH)",
      
      // Waste metrics (for environmental context)
      "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
      "Waste Management - Disposed waste (excl. Boiler Ash) (tons)",
      
      // Environmental incidents
      "Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)",
    ];

    // Get all metrics
    const metrics = await getMetricsByNames(companyId, metricNames);
    const years = getUniqueYearsFromMetrics(metrics, year);

    if (years.length === 0) {
      throw new AppError("No water usage data available", 404, "NO_WATER_DATA");
    }

    const currentYear = year || Math.max(...years);
    const previousYear = years.includes(currentYear - 1) ? currentYear - 1 : null;

    // Define required metrics based on what we ACTUALLY have
    const requiredCoreMetrics = [
      "Water Usage - Irrigation Water Usage (million ML)",
      "Water treatment (million ML)",
      "Effluent discharge for Irrigation (thousand ML)",
    ];

    // Calculate data completeness
    const dataCompleteness = calculateDataCompleteness(metrics, currentYear, requiredCoreMetrics);

    // Get exact values from database
    const getExactValue = (metricName) => {
      const metric = metrics[metricName];
      if (!metric) return null;
      const value = getMetricValueByYear(metric, currentYear);
      return value !== null ? value : null;
    };

    // Extract exact values - only from metrics that exist
    const exactValues = {
      // Water usage (from CSV)
      irrigationWater: getExactValue("Water Usage - Irrigation Water Usage (million ML)"),
      waterTreatment: getExactValue("Water treatment (million ML)"),
      effluentDischarge: getExactValue("Effluent discharge for Irrigation (thousand ML)"),
      
      // Energy (from CSV)
      electricityPurchased: getExactValue("Energy Consumption - Electricity Purchased (MWH)"),
      electricityGenerated: getExactValue("Energy Consumption - Electricity Generated (MWH)"),
      
      // Waste (from CSV)
      wasteRecycled: getExactValue("Waste Management - Recycled waste (excl. Boiler Ash) (tons)"),
      wasteDisposed: getExactValue("Waste Management - Disposed waste (excl. Boiler Ash) (tons)"),
      
      // Environmental incidents (from CSV)
      environmentIncidents: getExactValue("Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"),
    };

    // Calculate only necessary derived metrics that can be calculated from actual data
    const derivedMetrics = {};
    
    // Water reuse rate - from CSV data (Effluent discharge / Water treatment)
    if (exactValues.waterTreatment && exactValues.waterTreatment > 0 && exactValues.effluentDischarge) {
      derivedMetrics.waterReuseRate = ((exactValues.effluentDischarge / 1000 / exactValues.waterTreatment) * 100).toFixed(1);
    }
    
    // Water-energy intensity - using irrigation water and purchased electricity
    if (exactValues.irrigationWater && exactValues.irrigationWater > 0 && exactValues.electricityPurchased) {
      derivedMetrics.waterEnergyIntensity = (exactValues.electricityPurchased / exactValues.irrigationWater).toFixed(2);
    }
    
    // Waste recycling rate
    if (exactValues.wasteRecycled && exactValues.wasteDisposed) {
      const totalWaste = exactValues.wasteRecycled + exactValues.wasteDisposed;
      if (totalWaste > 0) {
        derivedMetrics.wasteRecyclingRate = ((exactValues.wasteRecycled / totalWaste) * 100).toFixed(1);
      }
    }
    
    // Water usage trend calculation
    if (exactValues.irrigationWater && previousYear && metrics["Water Usage - Irrigation Water Usage (million ML)"]) {
      const previousWater = getMetricValueByYear(
        metrics["Water Usage - Irrigation Water Usage (million ML)"], 
        previousYear
      );
      if (previousWater !== null) {
        derivedMetrics.waterUsageChange = calculatePercentageChange(previousWater, exactValues.irrigationWater).toFixed(1);
      }
    }

    // Generate graphs from actual data
    const graphs = generateGraphsFromActualData(metrics, years, currentYear);

    // Prepare exact response data
    const responseData = {
      apiInfo: {
        version: API_VERSION,
        calculationVersion: CALCULATION_VERSION,
        timestamp: new Date().toISOString(),
        dataCompleteness: `${dataCompleteness.toFixed(1)}%`,
        dataConfidence: dataCompleteness >= 80 ? "High" : 
                       dataCompleteness >= 60 ? "Medium" : "Low",
      },
      company: {
        id: company._id,
        name: company.name,
        industry: company.industry,
        country: company.country,
        areaOfInterest: company.area_of_interest_metadata || {},
        esgFrameworks: company.esg_reporting_framework || [],
      },
      year: currentYear,
      period: {
        currentYear,
        previousYear,
        availableYears: years,
      },
      dataQuality: {
        completenessScore: dataCompleteness.toFixed(1),
        confidenceLevel: dataCompleteness >= 80 ? "High" : 
                        dataCompleteness >= 60 ? "Medium" : "Low",
        missingMetrics: requiredCoreMetrics.filter(metricName => 
          !metrics[metricName] || getMetricValueByYear(metrics[metricName], currentYear) === null
        ),
        availableMetrics: Object.keys(metrics).filter(metricName => 
          getMetricValueByYear(metrics[metricName], currentYear) !== null
        ),
      },
      exactMetrics: {
        // Raw metric values from database
        rawValues: exactValues,
        
        // Calculated metrics (only what can be calculated from actual data)
        calculated: derivedMetrics,
        
        // Trend analysis based on actual data
        trends: {
          irrigationWater: metrics["Water Usage - Irrigation Water Usage (million ML)"] ? 
            calculateTrend(metrics["Water Usage - Irrigation Water Usage (million ML)"], years) : "insufficient_data",
          waterTreatment: metrics["Water treatment (million ML)"] ? 
            calculateTrend(metrics["Water treatment (million ML)"], years) : "insufficient_data",
          effluentDischarge: metrics["Effluent discharge for Irrigation (thousand ML)"] ? 
            calculateTrend(metrics["Effluent discharge for Irrigation (thousand ML)"], years) : "insufficient_data",
        },
        
        // Year-over-year changes (if previous year exists)
        yearOverYear: previousYear ? {
          irrigationWaterChange: metrics["Water Usage - Irrigation Water Usage (million ML)"] ? 
            calculatePercentageChange(
              getMetricValueByYear(metrics["Water Usage - Irrigation Water Usage (million ML)"], previousYear),
              exactValues.irrigationWater
            ).toFixed(1) + "%" : "insufficient_data",
          waterTreatmentChange: metrics["Water treatment (million ML)"] ? 
            calculatePercentageChange(
              getMetricValueByYear(metrics["Water treatment (million ML)"], previousYear),
              exactValues.waterTreatment
            ).toFixed(1) + "%" : "insufficient_data",
          effluentDischargeChange: metrics["Effluent discharge for Irrigation (thousand ML)"] ? 
            calculatePercentageChange(
              getMetricValueByYear(metrics["Effluent discharge for Irrigation (thousand ML)"], previousYear),
              exactValues.effluentDischarge
            ).toFixed(1) + "%" : "insufficient_data",
        } : null,
      },
      graphs: graphs,
      
      // Statistical summary (based on actual data)
      statisticalSummary: years.length > 1 ? {
        irrigationWater: {
          min: getMinValue(metrics["Water Usage - Irrigation Water Usage (million ML)"], years),
          max: getMaxValue(metrics["Water Usage - Irrigation Water Usage (million ML)"], years),
          average: getAverageValue(metrics["Water Usage - Irrigation Water Usage (million ML)"], years),
          standardDeviation: getStandardDeviation(metrics["Water Usage - Irrigation Water Usage (million ML)"], years),
        },
        waterTreatment: metrics["Water treatment (million ML)"] ? {
          min: getMinValue(metrics["Water treatment (million ML)"], years),
          max: getMaxValue(metrics["Water treatment (million ML)"], years),
          average: getAverageValue(metrics["Water treatment (million ML)"], years),
        } : null,
        effluentDischarge: metrics["Effluent discharge for Irrigation (thousand ML)"] ? {
          min: getMinValue(metrics["Effluent discharge for Irrigation (thousand ML)"], years),
          max: getMaxValue(metrics["Effluent discharge for Irrigation (thousand ML)"], years),
          average: getAverageValue(metrics["Effluent discharge for Irrigation (thousand ML)"], years),
        } : null,
      } : null,
      
      // Environmental context (from available waste and incident data)
      environmentalContext: {
        wasteManagement: exactValues.wasteRecycled !== null || exactValues.wasteDisposed !== null ? {
          recycled: exactValues.wasteRecycled,
          disposed: exactValues.wasteDisposed,
          recyclingRate: derivedMetrics.wasteRecyclingRate ? derivedMetrics.wasteRecyclingRate + "%" : "insufficient_data",
        } : null,
        incidents: exactValues.environmentIncidents !== null ? {
          count: exactValues.environmentIncidents,
          type: "Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss",
        } : null,
      },
      
      // Source information
      sourceInformation: {
        primarySource: "HVE Integrated Report 2025",
        pages: {
          waterMetrics: "p.27-28",
          energyMetrics: "p.27",
          wasteMetrics: "p.29-30",
        },
        dataAccuracy: "Reported figures from company integrated report",
      },
    };

    return responseData;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve water metrics data",
      500,
      "WATER_METRICS_ERROR",
      { details: error.message },
    );
  }
}

/**
 * Helper functions for statistical calculations
 */
function getMinValue(metric, years) {
  if (!metric) return null;
  const values = years
    .map(year => getMetricValueByYear(metric, year))
    .filter(value => value !== null);
  return values.length > 0 ? Math.min(...values) : null;
}

function getMaxValue(metric, years) {
  if (!metric) return null;
  const values = years
    .map(year => getMetricValueByYear(metric, year))
    .filter(value => value !== null);
  return values.length > 0 ? Math.max(...values) : null;
}

function getAverageValue(metric, years) {
  if (!metric) return null;
  const values = years
    .map(year => getMetricValueByYear(metric, year))
    .filter(value => value !== null);
  return values.length > 0 ? 
    (values.reduce((sum, val) => sum + val, 0) / values.length).toFixed(2) : null;
}

function getStandardDeviation(metric, years) {
  if (!metric) return null;
  const values = years
    .map(year => getMetricValueByYear(metric, year))
    .filter(value => value !== null);
  
  if (values.length < 2) return null;
  
  const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
  const squareDiffs = values.map(value => Math.pow(value - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((sum, val) => sum + val, 0) / squareDiffs.length;
  return Math.sqrt(avgSquareDiff).toFixed(2);
}

/**
 * Generate graphs from actual data that exists
 */
function generateGraphsFromActualData(metrics, years, currentYear) {
  const graphs = {};
  
  // Graph 1: Water Usage Trend (Line)
  const irrigationWater = metrics["Water Usage - Irrigation Water Usage (million ML)"];
  
  if (irrigationWater) {
    const waterData = years.map(y => getMetricValueByYear(irrigationWater, y));
    if (waterData.some(v => v !== null)) {
      graphs.waterUsageTrend = {
        type: "line",
        title: "Irrigation Water Usage Trend",
        description: "Historical trend of irrigation water usage (million ML)",
        labels: years,
        datasets: [
          {
            label: "Irrigation Water (million ML)",
            data: waterData,
            borderColor: "#3498db",
            backgroundColor: "rgba(52, 152, 219, 0.1)",
            tension: 0.4,
            fill: true,
          },
        ],
      };
    }
  }
  
  // Graph 2: Water Treatment and Effluent Discharge (Dual Axis)
  const waterTreatment = metrics["Water treatment (million ML)"];
  const effluentDischarge = metrics["Effluent discharge for Irrigation (thousand ML)"];
  
  if (waterTreatment || effluentDischarge) {
    const treatmentData = waterTreatment ? years.map(y => getMetricValueByYear(waterTreatment, y)) : null;
    const effluentData = effluentDischarge ? years.map(y => getMetricValueByYear(effluentDischarge, y)) : null;
    
    if ((treatmentData && treatmentData.some(v => v !== null)) || 
        (effluentData && effluentData.some(v => v !== null))) {
      graphs.waterTreatmentEffluent = {
        type: "bar",
        title: "Water Treatment and Effluent Discharge",
        description: "Water treatment capacity vs effluent discharge for irrigation",
        labels: years,
        datasets: [
          waterTreatment && {
            label: "Water Treated (million ML)",
            data: treatmentData,
            backgroundColor: "#2ecc71",
            yAxisID: "y",
            type: "bar",
          },
          effluentDischarge && {
            label: "Effluent Discharge (thousand ML)",
            data: effluentData,
            backgroundColor: "#e74c3c",
            yAxisID: "y1",
            type: "line",
            tension: 0.4,
          },
        ].filter(dataset => dataset !== null),
        options: {
          scales: {
            y: {
              type: "linear",
              position: "left",
              title: { display: true, text: "Water Treated (million ML)" },
            },
            y1: {
              type: "linear",
              position: "right",
              title: { display: true, text: "Effluent Discharge (thousand ML)" },
              grid: { drawOnChartArea: false },
            },
          },
        },
      };
    }
  }
  
  // Graph 3: Water-Energy Nexus
  const electricityPurchased = metrics["Energy Consumption - Electricity Purchased (MWH)"];
  
  if (irrigationWater && electricityPurchased) {
    const waterData = years.map(y => getMetricValueByYear(irrigationWater, y));
    const energyData = years.map(y => getMetricValueByYear(electricityPurchased, y));
    
    if (waterData.some(v => v !== null) && energyData.some(v => v !== null)) {
      graphs.waterEnergyNexus = {
        type: "line",
        title: "Water-Energy Nexus",
        description: "Relationship between water usage and electricity consumption",
        labels: years,
        datasets: [
          {
            label: "Irrigation Water (million ML)",
            data: waterData,
            borderColor: "#3498db",
            backgroundColor: "rgba(52, 152, 219, 0.1)",
            yAxisID: "y",
            fill: true,
          },
          {
            label: "Electricity Purchased (MWh)",
            data: energyData,
            borderColor: "#f39c12",
            backgroundColor: "rgba(243, 156, 18, 0.1)",
            yAxisID: "y1",
          },
        ],
        options: {
          scales: {
            y: {
              type: "linear",
              position: "left",
              title: { display: true, text: "Water (million ML)" },
            },
            y1: {
              type: "linear",
              position: "right",
              title: { display: true, text: "Electricity (MWh)" },
              grid: { drawOnChartArea: false },
            },
          },
        },
      };
    }
  }
  
  // Graph 4: Water Reuse Rate Over Time
  if (waterTreatment && effluentDischarge) {
    const reuseRates = years.map(year => {
      const treatment = getMetricValueByYear(waterTreatment, year);
      const effluent = getMetricValueByYear(effluentDischarge, year);
      if (treatment && treatment > 0 && effluent) {
        return (effluent / 1000 / treatment) * 100;
      }
      return null;
    });
    
    if (reuseRates.some(v => v !== null)) {
      graphs.waterReuseTrend = {
        type: "line",
        title: "Water Reuse Rate Trend",
        description: "Percentage of treated water reused for irrigation",
        labels: years,
        datasets: [
          {
            label: "Water Reuse Rate (%)",
            data: reuseRates,
            borderColor: "#9b59b6",
            backgroundColor: "rgba(155, 89, 182, 0.1)",
            fill: true,
            tension: 0.4,
          },
        ],
      };
    }
  }
  
  // Graph 5: Waste Management (Stacked Bar)
  const wasteRecycled = metrics["Waste Management - Recycled waste (excl. Boiler Ash) (tons)"];
  const wasteDisposed = metrics["Waste Management - Disposed waste (excl. Boiler Ash) (tons)"];
  
  if (wasteRecycled || wasteDisposed) {
    const recycledData = wasteRecycled ? years.map(y => getMetricValueByYear(wasteRecycled, y)) : null;
    const disposedData = wasteDisposed ? years.map(y => getMetricValueByYear(wasteDisposed, y)) : null;
    
    if ((recycledData && recycledData.some(v => v !== null)) || 
        (disposedData && disposedData.some(v => v !== null))) {
      graphs.wasteManagement = {
        type: "bar",
        title: "Waste Management",
        description: "Recycled vs disposed waste over time",
        labels: years,
        datasets: [
          wasteRecycled && {
            label: "Recycled Waste (tons)",
            data: recycledData,
            backgroundColor: "#2ecc71",
            stack: "stack1",
          },
          wasteDisposed && {
            label: "Disposed Waste (tons)",
            data: disposedData,
            backgroundColor: "#e74c3c",
            stack: "stack1",
          },
        ].filter(dataset => dataset !== null),
      };
    }
  }
  
  // Graph 6: Environmental Incidents
  const environmentIncidents = metrics["Environment Incidents (Sewage blockage, Stillage overflow, Illegal waste disposal, Out of spec emissions, Effluent spillage, Water loss)"];
  
  if (environmentIncidents) {
    const incidentData = years.map(y => getMetricValueByYear(environmentIncidents, y));
    if (incidentData.some(v => v !== null)) {
      graphs.environmentalIncidents = {
        type: "bar",
        title: "Environmental Incidents",
        description: "Number of environmental incidents per year",
        labels: years,
        datasets: [
          {
            label: "Incidents (count)",
            data: incidentData,
            backgroundColor: years.map(year => 
              year === currentYear ? "#e74c3c" : "#f39c12"
            ),
          },
        ],
      };
    }
  }
  
  // Graph 7: Comparative Analysis - Current vs Previous Year (if available)
  if (years.length >= 2 && irrigationWater && waterTreatment && effluentDischarge) {
    const currentYear = Math.max(...years);
    const previousYear = years[years.indexOf(currentYear) - 1];
    
    if (previousYear) {
      const currentWater = getMetricValueByYear(irrigationWater, currentYear);
      const previousWater = getMetricValueByYear(irrigationWater, previousYear);
      const currentTreatment = getMetricValueByYear(waterTreatment, currentYear);
      const previousTreatment = getMetricValueByYear(waterTreatment, previousYear);
      const currentEffluent = getMetricValueByYear(effluentDischarge, currentYear);
      const previousEffluent = getMetricValueByYear(effluentDischarge, previousYear);
      
      if (currentWater !== null && previousWater !== null) {
        graphs.yearComparison = {
          type: "bar",
          title: "Year-over-Year Comparison",
          description: `Comparison of key metrics between ${previousYear} and ${currentYear}`,
          labels: ["Irrigation Water", "Water Treatment", "Effluent Discharge"],
          datasets: [
            {
              label: previousYear.toString(),
              data: [previousWater, previousTreatment, previousEffluent ? previousEffluent/1000 : null],
              backgroundColor: "rgba(52, 152, 219, 0.7)",
            },
            {
              label: currentYear.toString(),
              data: [currentWater, currentTreatment, currentEffluent ? currentEffluent/1000 : null],
              backgroundColor: "rgba(46, 204, 113, 0.7)",
            },
          ],
        };
      }
    }
  }
  
  return graphs;
}

module.exports = {
  getIrrigationWaterRiskData: getExactWaterMetrics,
};