const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to get all ESG metrics (all categories)
 */
async function getAllESGMetrics(companyId, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate({
        path: "company",
        select: "name industry country",
      })
      .lean();

    const metricsByCategory = {
      environmental: {},
      social: {},
      governance: {},
    };

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (!metricsByCategory[metric.category]) {
          metricsByCategory[metric.category] = {};
        }

        if (!metricsByCategory[metric.category][metric.metric_name]) {
          metricsByCategory[metric.category][metric.metric_name] = {
            name: metric.metric_name,
            category: metric.category,
            unit: metric.unit,
            description: metric.description,
            values: [],
          };
        }

        metric.values.forEach((value) => {
          if (years.length === 0 || years.includes(value.year)) {
            const existingValue = metricsByCategory[metric.category][
              metric.metric_name
            ].values.find((v) => v.year === value.year);

            if (!existingValue) {
              metricsByCategory[metric.category][
                metric.metric_name
              ].values.push({
                year: value.year,
                value: value.value,
                numeric_value: value.numeric_value,
                source_notes: value.source_notes,
              });
            }
          }
        });
      });
    });

    // Sort values by year
    Object.keys(metricsByCategory).forEach((category) => {
      Object.keys(metricsByCategory[category]).forEach((metricName) => {
        metricsByCategory[category][metricName].values.sort(
          (a, b) => a.year - b.year,
        );
      });
    });

    return metricsByCategory;
  } catch (error) {
    throw new AppError(
      `Error fetching all ESG metrics: ${error.message}`,
      500,
      "ALL_METRICS_FETCH_ERROR",
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
    if (metric && metric.values) {
      metric.values.forEach((value) => {
        allYears.add(value.year);
      });
    }
  });

  return Array.from(allYears).sort();
}

/**
 * Helper function to calculate percentage change
 */
function calculatePercentageChange(initialValue, finalValue) {
  if (initialValue === null || initialValue === undefined || initialValue === 0)
    return 0;
  return ((finalValue - initialValue) / Math.abs(initialValue)) * 100;
}

/**
 * Helper function to get metric value by year
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.values || !Array.isArray(metric.values)) return null;
  const value = metric.values.find((v) => v.year === year);
  if (value) {
    if (value.numeric_value !== undefined && value.numeric_value !== null) {
      return parseFloat(value.numeric_value);
    }
    if (value.value !== undefined && value.value !== null) {
      const parsed = parseFloat(value.value);
      return isNaN(parsed) ? null : parsed;
    }
  }
  return null;
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
 * Helper function to get company details with enhanced information
 */
async function getEnhancedCompanyDetails(companyId) {
  try {
    const company = await Company.findById(companyId)
      .select("-_id -__v -created_at -updated_at")
      .lean();

    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    return company;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `Error fetching company details: ${error.message}`,
      500,
      "COMPANY_DETAILS_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to calculate confidence score based on actual data
 */
function calculateConfidenceScore(esgMetrics) {
  let score = 0;

  // Check for environmental metrics completeness (0-50 points)
  const environmentalMetrics = Object.keys(
    esgMetrics.environmental || {},
  ).length;
  if (environmentalMetrics > 0) {
    score += Math.min(50, environmentalMetrics * 5); // Max 5 points per metric

    // Check for key environmental metrics
    const hasCarbonMetrics =
      esgMetrics.environmental["Carbon Emissions (Total GHG, tCO2e)"] ||
      esgMetrics.environmental["GHG Scope 1 (tCO2e)"] ||
      esgMetrics.environmental["GHG Scope 2 (tCO2e)"];
    if (hasCarbonMetrics) score += 20;

    const hasWaterMetrics =
      esgMetrics.environmental[
        "Water Usage - Irrigation Water Usage (million ML)"
      ] ||
      esgMetrics.environmental["Water Usage - Water treatment (million ML)"];
    if (hasWaterMetrics) score += 15;
  }

  // Temporal coverage (0-30 points)
  const years = getUniqueYearsFromMetrics(esgMetrics.environmental || {});
  if (years.length >= 3) {
    score += 30;
  } else if (years.length === 2) {
    score += 15;
  } else if (years.length === 1) {
    score += 5;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Helper function to analyze water usage and efficiency
 */
function analyzeWaterUsage(esgMetrics, currentYear) {
  const analysis = {
    irrigation_water: {
      current_value: null,
      unit: "million ML",
      trend: "unknown",
      efficiency_score: null,
      savings_potential: null,
      monthly_data: [],
    },
    treatment_water: {
      current_value: null,
      unit: "million ML",
      trend: "unknown",
      efficiency_score: null,
      savings_potential: null,
      monthly_data: [],
    },
    total_water_usage: {
      current_value: null,
      unit: "million ML",
      trend: "unknown",
      per_hectare: null,
      benchmark: null,
    },
    shortage_risk: {
      level: "unknown",
      probability: null,
      factors: [],
      mitigation_strategies: [],
    },
    water_savings_analysis: {
      potential_savings: null,
      cost_savings: null,
      implementation_cost: null,
      roi_period: null,
      recommendations: [],
    },
  };

  // Get water metrics
  const irrigationMetric =
    esgMetrics.environmental?.[
      "Water Usage - Irrigation Water Usage (million ML)"
    ];
  const treatmentMetric =
    esgMetrics.environmental?.["Water Usage - Water treatment (million ML)"];

  if (irrigationMetric) {
    const currentValue = getMetricValueByYear(irrigationMetric, currentYear);
    analysis.irrigation_water.current_value =
      currentValue !== null ? parseFloat(currentValue.toFixed(2)) : null;
    analysis.irrigation_water.trend = calculateTrend(
      irrigationMetric,
      getUniqueYearsFromMetrics({ irrigation: irrigationMetric }),
    );

    // Calculate efficiency if we have area data
    const irrigationEfficiency = calculateWaterEfficiency(
      irrigationMetric,
      currentYear,
    );
    if (irrigationEfficiency) {
      analysis.irrigation_water.efficiency_score = irrigationEfficiency.score;
      analysis.irrigation_water.savings_potential =
        irrigationEfficiency.savings_potential;
    }
  }

  if (treatmentMetric) {
    const currentValue = getMetricValueByYear(treatmentMetric, currentYear);
    analysis.treatment_water.current_value =
      currentValue !== null ? parseFloat(currentValue.toFixed(2)) : null;
    analysis.treatment_water.trend = calculateTrend(
      treatmentMetric,
      getUniqueYearsFromMetrics({ treatment: treatmentMetric }),
    );

    // Calculate treatment efficiency
    const treatmentEfficiency = calculateWaterEfficiency(
      treatmentMetric,
      currentYear,
    );
    if (treatmentEfficiency) {
      analysis.treatment_water.efficiency_score = treatmentEfficiency.score;
      analysis.treatment_water.savings_potential =
        treatmentEfficiency.savings_potential;
    }
  }

  // Calculate total water usage
  if (
    analysis.irrigation_water.current_value !== null &&
    analysis.treatment_water.current_value !== null
  ) {
    analysis.total_water_usage.current_value = parseFloat(
      (
        analysis.irrigation_water.current_value +
        analysis.treatment_water.current_value
      ).toFixed(2),
    );

    // Calculate trend for total water usage
    const totalTrend = "unknown"; // We would need a combined metric for this
    analysis.total_water_usage.trend = totalTrend;
  }

  // Calculate shortage risk
  if (analysis.total_water_usage.current_value !== null) {
    const shortageAnalysis = calculateShortageRisk(
      analysis.total_water_usage.current_value,
      currentYear,
    );
    analysis.shortage_risk = {
      ...analysis.shortage_risk,
      ...shortageAnalysis,
    };
  }

  // Calculate water savings potential
  if (
    analysis.irrigation_water.savings_potential !== null ||
    analysis.treatment_water.savings_potential !== null
  ) {
    const irrigationSavings = analysis.irrigation_water.savings_potential || 0;
    const treatmentSavings = analysis.treatment_water.savings_potential || 0;
    const totalSavings = irrigationSavings + treatmentSavings;

    analysis.water_savings_analysis.potential_savings = parseFloat(
      totalSavings.toFixed(2),
    );
    analysis.water_savings_analysis.cost_savings = parseFloat(
      (totalSavings * 0.85).toFixed(2),
    ); // Assuming $0.85 per ML saved
    analysis.water_savings_analysis.implementation_cost = parseFloat(
      (totalSavings * 0.3).toFixed(2),
    ); // 30% of savings as implementation cost
    analysis.water_savings_analysis.roi_period =
      analysis.water_savings_analysis.implementation_cost > 0
        ? parseFloat(
            (
              analysis.water_savings_analysis.implementation_cost /
              analysis.water_savings_analysis.cost_savings
            ).toFixed(1),
          )
        : null;

    analysis.water_savings_analysis.recommendations = [
      "Implement drip irrigation systems",
      "Use soil moisture sensors for precision irrigation",
      "Collect and store rainwater",
      "Implement water recycling systems",
      "Regular maintenance of irrigation equipment",
    ];
  }

  return analysis;
}

/**
 * Helper function to calculate water efficiency
 */
function calculateWaterEfficiency(waterMetric, currentYear) {
  if (!waterMetric || !waterMetric.values || waterMetric.values.length === 0) {
    return null;
  }

  const currentValue = getMetricValueByYear(waterMetric, currentYear);
  if (currentValue === null) return null;

  // Get historical data for trend analysis
  const historicalValues = waterMetric.values
    .filter((v) => v.year < currentYear)
    .map((v) => v.numeric_value || parseFloat(v.value) || 0)
    .filter((v) => !isNaN(v));

  if (historicalValues.length === 0) return null;

  const avgHistoricalValue =
    historicalValues.reduce((a, b) => a + b, 0) / historicalValues.length;

  // Calculate efficiency score (0-100)
  const benchmark = avgHistoricalValue * 0.85; // Target: 15% reduction from historical average
  const efficiencyScore = Math.max(
    0,
    Math.min(100, 100 - ((currentValue - benchmark) / benchmark) * 100),
  );

  // Calculate savings potential
  const savingsPotential = Math.max(0, currentValue - benchmark);

  return {
    score: parseFloat(efficiencyScore.toFixed(1)),
    savings_potential: parseFloat(savingsPotential.toFixed(2)),
    benchmark: parseFloat(benchmark.toFixed(2)),
    historical_average: parseFloat(avgHistoricalValue.toFixed(2)),
  };
}

/**
 * Helper function to calculate water shortage risk
 */
function calculateShortageRisk(currentWaterUsage, currentYear) {
  // Simplified risk calculation based on usage patterns
  let riskLevel = "low";
  let probability = 0.2; // Default 20% probability
  const factors = [];
  const mitigationStrategies = [];

  // High usage risk factors
  if (currentWaterUsage > 10) {
    // > 10 million ML
    riskLevel = "high";
    probability = 0.7;
    factors.push("High water consumption exceeding sustainable levels");
    mitigationStrategies.push("Implement water rationing plans");
    mitigationStrategies.push("Invest in alternative water sources");
  } else if (currentWaterUsage > 5) {
    // 5-10 million ML
    riskLevel = "medium";
    probability = 0.4;
    factors.push("Moderate water consumption approaching limits");
    mitigationStrategies.push("Optimize irrigation schedules");
    mitigationStrategies.push("Improve water recycling systems");
  } else {
    riskLevel = "low";
    probability = 0.2;
    factors.push("Water usage within sustainable limits");
    mitigationStrategies.push("Continue monitoring usage patterns");
    mitigationStrategies.push("Maintain current conservation practices");
  }

  // Seasonal risk factors
  const currentMonth = new Date().getMonth();
  if (currentMonth >= 3 && currentMonth <= 9) {
    // April to September (dry season in many regions)
    probability *= 1.5;
    factors.push("Current season typically experiences lower rainfall");
  }

  return {
    level: riskLevel,
    probability: parseFloat(probability.toFixed(2)),
    factors: factors,
    mitigation_strategies: mitigationStrategies,
  };
}

/**
 * Helper function to generate graphs based on actual ESG data
 */
function generateKeyGraphs(esgMetrics, waterAnalysis, currentYear, years) {
  const allGraphs = {};

  // 1. Water Usage Trends (Irrigation + Treatment)
  const irrigationMetric =
    esgMetrics.environmental?.[
      "Water Usage - Irrigation Water Usage (million ML)"
    ];
  const treatmentMetric =
    esgMetrics.environmental?.["Water Usage - Water treatment (million ML)"];

  if (irrigationMetric && irrigationMetric.values.length > 1) {
    const sortedValues = [...irrigationMetric.values].sort(
      (a, b) => a.year - b.year,
    );
    allGraphs.irrigation_water_trend = {
      type: "line",
      title: "Irrigation Water Usage Trend",
      description: "Historical irrigation water usage in million ML",
      labels: sortedValues.map((v) => v.year.toString()),
      datasets: [
        {
          label: "Irrigation Water (million ML)",
          data: sortedValues.map((v) =>
            parseFloat(
              (v.numeric_value || parseFloat(v.value) || 0).toFixed(2),
            ),
          ),
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }

  if (treatmentMetric && treatmentMetric.values.length > 1) {
    const sortedValues = [...treatmentMetric.values].sort(
      (a, b) => a.year - b.year,
    );
    allGraphs.treatment_water_trend = {
      type: "line",
      title: "Water Treatment Usage Trend",
      description: "Historical water treatment usage in million ML",
      labels: sortedValues.map((v) => v.year.toString()),
      datasets: [
        {
          label: "Treatment Water (million ML)",
          data: sortedValues.map((v) =>
            parseFloat(
              (v.numeric_value || parseFloat(v.value) || 0).toFixed(2),
            ),
          ),
          borderColor: "#9b59b6",
          backgroundColor: "rgba(155, 89, 182, 0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }

  // 2. Combined Water Usage (if both metrics exist)
  if (
    irrigationMetric &&
    treatmentMetric &&
    irrigationMetric.values.length > 0 &&
    treatmentMetric.values.length > 0
  ) {
    const yearsSet = new Set();
    irrigationMetric.values.forEach((v) => yearsSet.add(v.year));
    treatmentMetric.values.forEach((v) => yearsSet.add(v.year));
    const allYears = Array.from(yearsSet).sort();

    const combinedData = allYears.map((year) => {
      const irrigationValue = getMetricValueByYear(irrigationMetric, year) || 0;
      const treatmentValue = getMetricValueByYear(treatmentMetric, year) || 0;
      return irrigationValue + treatmentValue;
    });

    if (combinedData.some((v) => v > 0)) {
      allGraphs.total_water_trend = {
        type: "bar",
        title: "Total Water Usage Trend",
        description: "Combined irrigation and treatment water usage",
        labels: allYears.map((y) => y.toString()),
        datasets: [
          {
            label: "Irrigation",
            data: allYears.map(
              (year) => getMetricValueByYear(irrigationMetric, year) || 0,
            ),
            backgroundColor: "#3498db",
          },
          {
            label: "Treatment",
            data: allYears.map(
              (year) => getMetricValueByYear(treatmentMetric, year) || 0,
            ),
            backgroundColor: "#9b59b6",
          },
        ],
      };
    }
  }

  // 3. Water Efficiency Trends
  const efficiencyData = [];
  const yearsForEfficiency = [];

  if (irrigationMetric && irrigationMetric.values.length > 1) {
    const sortedValues = [...irrigationMetric.values].sort(
      (a, b) => a.year - b.year,
    );
    const baseline =
      sortedValues[0].numeric_value || parseFloat(sortedValues[0].value) || 0;

    sortedValues.forEach((v, index) => {
      if (index > 0) {
        const currentValue = v.numeric_value || parseFloat(v.value) || 0;
        const efficiency =
          baseline > 0 ? ((baseline - currentValue) / baseline) * 100 : 0;
        efficiencyData.push(parseFloat(efficiency.toFixed(1)));
        yearsForEfficiency.push(v.year.toString());
      }
    });

    if (efficiencyData.length > 0) {
      allGraphs.water_efficiency_trend = {
        type: "line",
        title: "Water Efficiency Improvement",
        description: "Percentage improvement in water efficiency over time",
        labels: yearsForEfficiency,
        datasets: [
          {
            label: "Efficiency Improvement (%)",
            data: efficiencyData,
            borderColor: "#2ecc71",
            backgroundColor: "rgba(46, 204, 113, 0.1)",
            fill: true,
            tension: 0.3,
          },
        ],
      };
    }
  }

  // 4. Carbon Emissions Trend (if available)
  const carbonMetric =
    esgMetrics.environmental?.["Carbon Emissions (Total GHG, tCO2e)"];
  if (carbonMetric && carbonMetric.values.length > 1) {
    const sortedValues = [...carbonMetric.values].sort(
      (a, b) => a.year - b.year,
    );
    allGraphs.carbon_emissions_trend = {
      type: "line",
      title: "Carbon Emissions Trend",
      description: "Total GHG emissions in tCO2e",
      labels: sortedValues.map((v) => v.year.toString()),
      datasets: [
        {
          label: "GHG Emissions (tCO2e)",
          data: sortedValues.map((v) =>
            parseFloat(
              (v.numeric_value || parseFloat(v.value) || 0).toFixed(2),
            ),
          ),
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.1)",
          fill: true,
          tension: 0.3,
        },
      ],
    };
  }

  // 5. Water vs Carbon Correlation (if both metrics exist)
  if (
    irrigationMetric &&
    carbonMetric &&
    irrigationMetric.values.length > 0 &&
    carbonMetric.values.length > 0
  ) {
    const commonYears = irrigationMetric.values
      .map((v) => v.year)
      .filter((year) => carbonMetric.values.some((c) => c.year === year))
      .sort();

    if (commonYears.length > 1) {
      const waterData = commonYears.map(
        (year) => getMetricValueByYear(irrigationMetric, year) || 0,
      );
      const carbonData = commonYears.map(
        (year) => getMetricValueByYear(carbonMetric, year) || 0,
      );

      allGraphs.water_carbon_correlation = {
        type: "scatter",
        title: "Water Usage vs Carbon Emissions",
        description:
          "Correlation between water consumption and carbon emissions",
        labels: commonYears.map((y) => y.toString()),
        datasets: [
          {
            label: "Water (ML) vs Carbon (tCO2e)",
            data: waterData.map((water, index) => ({
              x: water,
              y: carbonData[index],
              r: 10,
            })),
            backgroundColor: "#f39c12",
          },
        ],
      };
    }
  }

  // 6. Water Risk Assessment
  if (
    waterAnalysis.shortage_risk &&
    waterAnalysis.shortage_risk.level !== "unknown"
  ) {
    const riskLevels = ["low", "medium", "high"];
    const riskData = riskLevels.map((level) =>
      waterAnalysis.shortage_risk.level === level ? 100 : 0,
    );

    allGraphs.water_risk_assessment = {
      type: "radar",
      title: "Water Risk Assessment",
      description: "Comprehensive water risk analysis",
      labels: [
        "Shortage Risk",
        "Efficiency",
        "Conservation",
        "Infrastructure",
        "Regulatory",
      ],
      datasets: [
        {
          label: "Current Status",
          data: riskData,
          backgroundColor: "rgba(52, 152, 219, 0.2)",
          borderColor: "#3498db",
          borderWidth: 2,
        },
      ],
    };
  }

  return allGraphs;
}

/**
 * Helper function to generate farmer benefits analysis
 */
function generateFarmerBenefits(waterAnalysis, esgMetrics) {
  const benefits = {
    water_savings: {
      estimated_savings:
        waterAnalysis.water_savings_analysis.potential_savings || 0,
      unit: "million ML/year",
      cost_savings: waterAnalysis.water_savings_analysis.cost_savings || 0,
      currency: "USD",
    },
    crop_yield_improvement: {
      estimated_improvement: "______", // Would need crop yield data
      factors: ["Improved water efficiency", "Better irrigation timing"],
    },
    input_cost_reduction: {
      water_pumping_costs:
        waterAnalysis.water_savings_analysis.cost_savings || 0,
      fertilizer_efficiency: "______", // Would need fertilizer data
      labor_savings: "______", // Would need labor data
    },
    risk_reduction: {
      drought_risk:
        waterAnalysis.shortage_risk.level === "high"
          ? "High reduction potential"
          : "Moderate reduction potential",
      water_cost_volatility: "Stable water costs",
      regulatory_compliance: "Improved compliance",
    },
  };

  return benefits;
}

/**
 * Helper function to generate bank risk assessment
 */
function generateBankRiskAssessment(waterAnalysis, esgMetrics, company) {
  const assessment = {
    water_related_risks: {
      shortage_risk: {
        level: waterAnalysis.shortage_risk.level,
        probability: waterAnalysis.shortage_risk.probability,
        impact:
          waterAnalysis.shortage_risk.level === "high"
            ? "High"
            : waterAnalysis.shortage_risk.level === "medium"
              ? "Medium"
              : "Low",
        mitigation: waterAnalysis.shortage_risk.mitigation_strategies,
      },
      regulatory_risks: {
        water_use_permits: "______",
        discharge_regulations: "______",
        conservation_requirements: "______",
      },
      reputation_risks: {
        community_relations:
          waterAnalysis.total_water_usage.current_value > 10 ? "High" : "Low",
        environmental_impact: "______",
        stakeholder_perception: "______",
      },
    },
    financial_implications: {
      potential_losses: waterAnalysis.shortage_risk.probability * 1000000, // Simplified calculation
      insurance_costs:
        waterAnalysis.shortage_risk.level === "high" ? "Increased" : "Standard",
      financing_terms:
        waterAnalysis.shortage_risk.level === "low" ? "Favorable" : "Standard",
    },
    recommendation: {
      loan_terms:
        waterAnalysis.shortage_risk.level === "high"
          ? "Strict water conservation covenants"
          : waterAnalysis.shortage_risk.level === "medium"
            ? "Water efficiency improvements required"
            : "Standard terms",
      monitoring_requirements:
        waterAnalysis.shortage_risk.level === "high"
          ? "Quarterly water usage reports"
          : "Annual water audit",
      collateral_valuation:
        waterAnalysis.shortage_risk.level === "high"
          ? "Discount for water risk"
          : "Standard valuation",
    },
  };

  return assessment;
}

/**
 * Helper function to generate agritech revenue opportunities
 */
function generateAgritechOpportunities(waterAnalysis, company) {
  const opportunities = {
    water_management_services: {
      smart_irrigation_systems: {
        potential_revenue:
          waterAnalysis.water_savings_analysis.potential_savings * 50, // $50 per ML saved
        implementation_cost:
          waterAnalysis.water_savings_analysis.implementation_cost,
        roi_period: waterAnalysis.water_savings_analysis.roi_period,
        market_size: "______",
      },
      water_monitoring_platforms: {
        subscription_revenue: company.industry === "Agriculture" ? 10000 : 5000, // Annual subscription
        installation_fee: 5000,
        maintenance_fee: 2000,
      },
      data_analytics_services: {
        per_hectare_fee: 50,
        estimated_hectares: "______",
        total_revenue: "______",
      },
    },
    efficiency_improvements: {
      drip_irrigation_retrofits: {
        cost_per_hectare: 1000,
        water_savings: "30-50%",
        payback_period: "2-3 years",
      },
      soil_moisture_sensors: {
        cost_per_sensor: 200,
        coverage_per_sensor: "5 hectares",
        roi: "6-12 months",
      },
      water_recycling_systems: {
        installation_cost: waterAnalysis.treatment_water.current_value * 10000,
        operational_savings:
          waterAnalysis.treatment_water.savings_potential * 0.85,
        roi_period: "3-5 years",
      },
    },
    revenue_streams: {
      service_fees: waterAnalysis.water_savings_analysis.potential_savings * 25, // 25% of savings as fee
      subscription_fees:
        company.industry === "Agriculture"
          ? "High potential"
          : "Medium potential",
      data_licensing: "______",
      consulting_services:
        waterAnalysis.shortage_risk.level === "high"
          ? "High demand"
          : "Medium demand",
    },
  };

  return opportunities;
}

/**
 * Irrigation Water Risk Analysis API
 */
async function getIrrigationWaterRiskData(companyId, year = null) {
  try {
    // Get company details
    const company = await getEnhancedCompanyDetails(companyId);

    // Get all ESG metrics
    const allESGMetrics = await getAllESGMetrics(companyId, year ? [year] : []);

    // Get unique years from data
    const years = getUniqueYearsFromMetrics(
      allESGMetrics.environmental || {},
      year,
    );

    if (
      years.length === 0 &&
      Object.keys(allESGMetrics.environmental || {}).length === 0
    ) {
      throw new AppError(
        "No ESG data available for analysis",
        404,
        "NO_DATA_AVAILABLE",
      );
    }

    const currentYear = year || (years.length > 0 ? Math.max(...years) : null);

    // Calculate confidence score
    const confidenceScore = calculateConfidenceScore(allESGMetrics);

    // Analyze water usage
    const waterAnalysis = analyzeWaterUsage(allESGMetrics, currentYear);

    // Generate graphs
    const graphs = generateKeyGraphs(
      allESGMetrics,
      waterAnalysis,
      currentYear,
      years,
    );

    // Prepare environmental metrics summary
    const environmentalMetrics = allESGMetrics.environmental || {};
    const environmentalMetricsSummary = Object.keys(environmentalMetrics).map(
      (key) => {
        const metric = environmentalMetrics[key];
        const currentValue = getMetricValueByYear(metric, currentYear);
        return {
          name: metric.name,
          category: metric.category,
          unit: metric.unit || "unit",
          description: metric.description || "",
          current_value:
            currentValue !== null ? parseFloat(currentValue.toFixed(2)) : null,
          trend: calculateTrend(
            metric,
            getUniqueYearsFromMetrics({ metric: metric }),
          ),
          years_available: metric.values
            ? metric.values.map((v) => v.year)
            : [],
          values: metric.values
            ? metric.values.map((v) => ({
                year: v.year,
                value: v.value,
                numeric_value:
                  v.numeric_value !== null
                    ? parseFloat(v.numeric_value.toFixed(2))
                    : null,
              }))
            : [],
        };
      },
    );

    // Generate stakeholder benefits
    const farmerBenefits = generateFarmerBenefits(waterAnalysis, allESGMetrics);
    const bankRiskAssessment = generateBankRiskAssessment(
      waterAnalysis,
      allESGMetrics,
      company,
    );
    const agritechOpportunities = generateAgritechOpportunities(
      waterAnalysis,
      company,
    );

    // Prepare response data
    const data = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "irrigation_water_risk",
        company_id: companyId,
        year_requested: year,
        data_sources: ["ESGData"],
      },

      company: company,

      reporting_period: {
        start_year: years.length > 0 ? Math.min(...years) : null,
        end_year: years.length > 0 ? Math.max(...years) : null,
        current_year: currentYear,
        data_available_years: years,
      },

      confidence_score: {
        overall: confidenceScore,
        interpretation:
          confidenceScore >= 80
            ? "High confidence"
            : confidenceScore >= 60
              ? "Medium confidence"
              : confidenceScore >= 40
                ? "Low confidence"
                : "Very low confidence",
        factors: [
          environmentalMetricsSummary.length > 5
            ? "Comprehensive environmental metrics"
            : "Limited environmental metrics",
          years.length >= 3
            ? "Multiple years of data"
            : "Limited historical data",
        ],
      },

      // Water Usage Analysis
      water_usage_analysis: waterAnalysis,

      // Environmental Metrics
      environmental_metrics: {
        total_metrics: Object.keys(environmentalMetrics).length,
        detailed_metrics: environmentalMetricsSummary,
        summary: {
          total_ghg_emissions: getMetricValueByYear(
            environmentalMetrics["Carbon Emissions (Total GHG, tCO2e)"],
            currentYear,
          ),
          scope1_emissions: getMetricValueByYear(
            environmentalMetrics["GHG Scope 1 (tCO2e)"],
            currentYear,
          ),
          scope2_emissions: getMetricValueByYear(
            environmentalMetrics["GHG Scope 2 (tCO2e)"],
            currentYear,
          ),
          scope3_emissions: getMetricValueByYear(
            environmentalMetrics["GHG Scope 3 (tCO2e)"],
            currentYear,
          ),
          irrigation_water_usage: waterAnalysis.irrigation_water.current_value,
          treatment_water_usage: waterAnalysis.treatment_water.current_value,
          total_water_usage: waterAnalysis.total_water_usage.current_value,
        },
      },

      // All ESG Metrics
      all_esg_metrics: allESGMetrics,

      // Analytics Graphs (at least 6 graphs)
      graphs: graphs,

      // Stakeholder Benefits Analysis
      stakeholder_benefits: {
        farmers: farmerBenefits,
        banks: bankRiskAssessment,
        agritech_revenue_opportunities: agritechOpportunities,
      },

      summary: {
        key_findings: [
          waterAnalysis.irrigation_water.current_value !== null
            ? `Current irrigation water usage: ${waterAnalysis.irrigation_water.current_value} million ML`
            : "Irrigation water data not available",
          waterAnalysis.treatment_water.current_value !== null
            ? `Current water treatment usage: ${waterAnalysis.treatment_water.current_value} million ML`
            : "Water treatment data not available",
          waterAnalysis.shortage_risk.level !== "unknown"
            ? `Water shortage risk: ${waterAnalysis.shortage_risk.level}`
            : "Water shortage risk assessment not available",
          waterAnalysis.water_savings_analysis.potential_savings !== null
            ? `Potential water savings: ${waterAnalysis.water_savings_analysis.potential_savings} million ML/year`
            : "Water savings potential not calculated",
        ],
        recommendations: [
          {
            category: "Water Management",
            actions:
              waterAnalysis.shortage_risk.mitigation_strategies.length > 0
                ? waterAnalysis.shortage_risk.mitigation_strategies
                : [
                    "Implement water usage monitoring",
                    "Develop water conservation plan",
                  ],
            priority:
              waterAnalysis.shortage_risk.level === "high"
                ? "High"
                : waterAnalysis.shortage_risk.level === "medium"
                  ? "Medium"
                  : "Low",
          },
          {
            category: "Data Collection",
            actions: [
              "Maintain regular water usage monitoring",
              "Track water efficiency improvements",
              "Document water conservation measures",
            ],
            priority: confidenceScore < 60 ? "High" : "Medium",
          },
          {
            category: "Stakeholder Engagement",
            actions: [
              "Share water efficiency best practices with farmers",
              "Collaborate with banks on water risk assessment",
              "Explore agritech partnerships for water management",
            ],
            priority: "Medium",
          },
        ],
        next_steps: [
          "Implement recommended water conservation measures",
          "Monitor water usage trends quarterly",
          "Update risk assessment annually",
          "Explore water efficiency technologies",
        ],
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve irrigation water risk data",
      500,
      "IRRIGATION_WATER_RISK_API_ERROR",
      { details: error.message },
    );
  }
}

module.exports = {
  getIrrigationWaterRiskData,
};
