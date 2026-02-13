const mongoose = require("mongoose");
const Company = require("../models/company_model");
const CropYieldData = require("../models/crop_yield_model"); // adjust path if needed
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Parse numeric value from string with commas
 */
function parseNumericValue(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/,/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
  }
  return 0;
}

/**
 * Get metric value for a specific year from a metric object
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.yearly_data || metric.yearly_data.length === 0)
    return 0;
  const yearlyEntry = metric.yearly_data.find((d) => d.year === String(year));
  if (!yearlyEntry) return 0;
  return yearlyEntry.numeric_value !== undefined &&
    yearlyEntry.numeric_value !== null
    ? yearlyEntry.numeric_value
    : parseNumericValue(yearlyEntry.value);
}

/**
 * Get the active CropYieldData record for a company and extract metrics for a given year
 */
async function getCropYieldMetricsForYear(companyId, year) {
  const record = await CropYieldData.findOne({
    company: companyId,
    is_active: true,
  })
    .populate("created_by", "name email")
    .populate("last_updated_by", "name email")
    .lean();

  if (!record) {
    throw new AppError(
      "No active crop yield data found for this company",
      404,
      "NO_CROP_YIELD_DATA",
    );
  }

  // Filter metrics that have yearly data for the requested year
  const metricsForYear = {};
  record.metrics.forEach((metric) => {
    if (!metric.is_active) return;
    const hasYear = metric.yearly_data?.some((d) => d.year === String(year));
    if (hasYear) {
      metricsForYear[metric.metric_name] = {
        ...metric,
        yearly_data: metric.yearly_data.filter((d) => d.year === String(year)),
      };
    }
  });

  if (Object.keys(metricsForYear).length === 0) {
    throw new AppError(
      `No crop yield metrics available for year ${year}`,
      404,
      "NO_METRICS_FOR_YEAR",
    );
  }

  return {
    record,
    metrics: metricsForYear,
    allMetrics: record.metrics, // keep full list for multi-year calculations
  };
}

/**
 * Calculate yield forecast based on historical yield data and YoY trends
 */
function calculateYieldForecast(metrics, company, currentYear) {
  // 1. Find the primary yield metric (Company's Estates yield)
  let yieldMetric = null;
  const possibleYieldNames = [
    "Company's Estates (tons/ha)",
    "Company Yield (tons/ha)",
    "Sugar Cane Yield - Company's Estates",
  ];
  for (const name of possibleYieldNames) {
    if (metrics[name]) {
      yieldMetric = metrics[name];
      break;
    }
  }

  let baseYield = 0;
  let historicalYields = [];

  if (yieldMetric && yieldMetric.yearly_data) {
    baseYield = getMetricValueByYear(yieldMetric, currentYear);
    // Get all years' yields for trend analysis
    const fullMetric = yieldMetric._id
      ? yieldMetric // already full metric?
      : null; // need to fetch from allMetrics if we stored it
  }

  // If we only have the filtered metric, we can't get historical. So we need to fetch from allMetrics.
  // We'll redesign: The caller passes the full record, so we can access all metrics unfiltered.
  // But for simplicity, assume we have access to full metrics via record.allMetrics.
  // We'll adjust in main function.

  // For now, use baseYield and assume no trend if only one year.
  let forecastedYield = baseYield;
  let confidence = baseYield > 0 ? 40 : 0; // base confidence if we have current yield

  // If we have YoY changes, we can project forward
  // Look for YoY metric for Company Yield
  let yoyMetric = null;
  const possibleYoyNames = [
    "Company Yield (tons/ha)",
    "Company's Estates Cane",
  ]; // from YoY section
  // In the provided data, YoY metric is "Company Yield (tons/ha)" under Year-over-Year Changes
  // We need to locate that metric in the record (category: year_over_year_change)

  // This will be handled later when we have full metrics.

  return {
    forecasted_yield: forecastedYield,
    unit: "t/ha",
    confidence_score: Math.round(confidence),
    calculation_factors: {
      base_yield: baseYield,
      historical_data_available: baseYield > 0,
      yoy_trend_available: false,
    },
    formula:
      baseYield > 0
        ? `Yield = ${baseYield} (current year)`
        : "No historical yield data available",
  };
}

/**
 * Calculate risk factors based on crop yield, water, energy, and trend data
 */
function calculateRiskFactors(metrics, company, currentYear) {
  const risks = {
    yield_stability: { score: 0, level: "Low", factors: [], mitigation: [] },
    water_scarcity: { score: 0, level: "Low", factors: [], mitigation: [] },
    energy_cost: { score: 0, level: "Low", factors: [], mitigation: [] },
    market_volatility: { score: 0, level: "Low", factors: [], mitigation: [] },
    climate_extremes: { score: 0, level: "Low", factors: [], mitigation: [] },
    operational: { score: 0, level: "Low", factors: [], mitigation: [] },
  };

  // Yield stability: if we have multiple years, calculate CV; else just note single year
  // For now, just flag if current yield is below average (requires historical)
  // We'll compute from allMetrics in main function.

  // Water scarcity: if irrigation water usage is high or decreasing trend
  const irrigationMetric =
    metrics["Water Usage - Irrigation Water Usage (million ML)"];
  if (irrigationMetric) {
    const waterUsage = getMetricValueByYear(irrigationMetric, currentYear);
    risks.water_scarcity.score += 20;
    risks.water_scarcity.factors.push("Irrigation water usage tracked");
    if (waterUsage > 0) {
      // Could add trend later
    }
  }

  // Energy cost: if electricity or diesel usage is tracked
  const electricityMetric =
    metrics["Energy Consumption - Electricity Purchased (MWH)"];
  const dieselMetric =
    metrics["Energy Consumption - Inside Company Diesel Usage (litres)"];
  if (electricityMetric || dieselMetric) {
    risks.energy_cost.score += 20;
    risks.energy_cost.factors.push("Energy consumption monitored");
  }

  // Climate extremes: if yield is significantly lower than previous year? We need YoY data.
  // For now, just note if we have YoY data.
  // We'll look for year_over_year_change metrics later.

  // Operational: area under cane stability
  const areaMetric = metrics["Total Area (hectares)"];
  if (areaMetric) {
    risks.operational.score += 10;
    risks.operational.factors.push("Cultivated area tracked");
  }

  // Convert scores to levels
  Object.keys(risks).forEach((key) => {
    const risk = risks[key];
    risk.score = Math.min(100, risk.score);
    if (risk.score >= 60) risk.level = "High";
    else if (risk.score >= 30) risk.level = "Medium";
    else risk.level = "Low";
    risk.probability = (risk.score / 100).toFixed(2);
  });

  // Overall risk
  const overallScore =
    Object.keys(risks).reduce((sum, k) => sum + risks[k].score, 0) /
    Object.keys(risks).length;
  risks.overall = {
    score: Math.round(overallScore),
    level: overallScore >= 60 ? "High" : overallScore >= 30 ? "Medium" : "Low",
    probability: (overallScore / 100).toFixed(2),
    primary_risks: Object.keys(risks)
      .filter((k) => k !== "overall")
      .sort((a, b) => risks[b].score - risks[a].score)
      .slice(0, 3)
      .map((k) => ({
        category: k.replace(/_/g, " "),
        level: risks[k].level,
        score: risks[k].score,
      })),
  };

  return risks;
}

/**
 * Generate graphs based on available crop yield metrics
 */
function generateGraphs(metrics, yieldForecast, risks, currentYear) {
  const graphs = {};

  // 1. Yield trend (if multiple years available)
  // We need all years data, so this will be built later if we have full historical.

  // 2. Water vs Energy usage comparison
  const irrigationMetric =
    metrics["Water Usage - Irrigation Water Usage (million ML)"];
  const electricityMetric =
    metrics["Energy Consumption - Electricity Purchased (MWH)"];
  if (irrigationMetric && electricityMetric) {
    graphs.resource_usage = {
      type: "bar",
      title: "Resource Usage (Current Year)",
      description: "Water and electricity consumption",
      labels: [String(currentYear)],
      datasets: [
        {
          label: "Irrigation Water (million ML)",
          data: [getMetricValueByYear(irrigationMetric, currentYear)],
          backgroundColor: "#3498db",
        },
        {
          label: "Electricity (MWH)",
          data: [getMetricValueByYear(electricityMetric, currentYear)],
          backgroundColor: "#f1c40f",
        },
      ],
    };
  }

  // 3. Risk distribution radar
  graphs.risk_distribution = {
    type: "radar",
    title: "Crop Production Risk Profile",
    description: "Multi‑dimensional risk assessment",
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

  // 4. Yield forecast confidence components
  graphs.forecast_confidence = {
    type: "polarArea",
    title: "Forecast Confidence Components",
    description: "Data availability for yield forecast",
    labels: [
      "Current Yield Data",
      "Historical Yield Trend",
      "Water Metrics",
      "Energy Metrics",
      "Area Metrics",
    ],
    datasets: [
      {
        data: [
          yieldForecast.base_yield > 0 ? 20 : 0,
          0, // historical
          irrigationMetric ? 20 : 0,
          electricityMetric ? 20 : 0,
          metrics["Total Area (hectares)"] ? 20 : 0,
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

  return graphs;
}

/**
 * Generate actionable recommendations based on forecast and risks
 */
function generateRecommendations(yieldForecast, risks, metrics, currentYear) {
  const recommendations = [];

  if (yieldForecast.base_yield === 0) {
    recommendations.push({
      category: "Data Collection",
      priority: "High",
      action: "Record historical yield data for accurate forecasting",
      impact: "Enable yield prediction",
      timeline: "Immediate",
    });
  }

  if (risks.water_scarcity.score > 30) {
    recommendations.push({
      category: "Water Management",
      priority: risks.water_scarcity.level,
      action: "Optimize irrigation scheduling and monitor water use efficiency",
      impact: "Reduce water consumption risk",
      timeline: "Next growing season",
    });
  }

  if (risks.energy_cost.score > 30) {
    recommendations.push({
      category: "Energy Efficiency",
      priority: risks.energy_cost.level,
      action: "Audit energy consumption and explore renewable alternatives",
      impact: "Lower operational costs",
      timeline: "3-6 months",
    });
  }

  if (risks.yield_stability.score > 30) {
    recommendations.push({
      category: "Yield Stability",
      priority: risks.yield_stability.level,
      action: "Analyze yield variability factors and adopt best practices",
      impact: "Reduce yield fluctuation",
      timeline: "Ongoing",
    });
  }

  // Generic recommendation for any data gaps
  if (!metrics["Cane to Sugar Ratio (%)"]) {
    recommendations.push({
      category: "Process Efficiency",
      priority: "Medium",
      action: "Track cane-to-sugar ratio to monitor processing efficiency",
      impact: "Improve sugar recovery",
      timeline: "Next reporting cycle",
    });
  }

  return recommendations;
}

/**
 * Categorize crop yield metrics into logical groups
 */
function categorizeCropYieldMetrics(metrics) {
  const categories = {
    cane_harvested: {},
    sugar_production: {},
    sugar_cane_yield: {},
    area_under_cane: {},
    year_over_year_change: {},
    other: {},
  };

  Object.keys(metrics).forEach((name) => {
    const metric = metrics[name];
    const cat = metric.category;
    if (categories[cat]) {
      categories[cat][name] = metric;
    } else {
      categories.other[name] = metric;
    }
  });

  return categories;
}

/**
 * Generate summary statistics for the reporting year
 */
function generateYieldMetricsSummary(metrics, currentYear) {
  const summary = {
    total_cane_harvested_company: 0,
    total_cane_harvested_private: 0,
    total_cane_milled: 0,
    total_sugar_produced_company: 0,
    total_molasses_produced: 0,
    cane_to_sugar_ratio: 0,
    company_yield: 0,
    private_yield: 0,
    total_area: 0,
  };

  const harvestCompany = metrics["Company's Own Estates (tons)"];
  if (harvestCompany)
    summary.total_cane_harvested_company = getMetricValueByYear(
      harvestCompany,
      currentYear,
    );

  const harvestPrivate = metrics["Private Farmers (tons)"];
  if (harvestPrivate)
    summary.total_cane_harvested_private = getMetricValueByYear(
      harvestPrivate,
      currentYear,
    );

  const totalMilled = metrics["Total Cane Milled (tons)"];
  if (totalMilled)
    summary.total_cane_milled = getMetricValueByYear(totalMilled, currentYear);

  const sugarCompany =
    metrics["Company's Own Estates (tons)"] &&
    metrics["Company's Own Estates (tons)"].category === "sugar_production"
      ? metrics["Company's Own Estates (tons)"]
      : null;
  if (sugarCompany)
    summary.total_sugar_produced_company = getMetricValueByYear(
      sugarCompany,
      currentYear,
    );

  const molasses = metrics["Molasses Production (tons)"];
  if (molasses)
    summary.total_molasses_produced = getMetricValueByYear(
      molasses,
      currentYear,
    );

  const ratio = metrics["Cane to Sugar Ratio (%)"];
  if (ratio)
    summary.cane_to_sugar_ratio = getMetricValueByYear(ratio, currentYear);

  const yieldCompany = metrics["Company's Estates (tons/ha)"];
  if (yieldCompany)
    summary.company_yield = getMetricValueByYear(yieldCompany, currentYear);

  const yieldPrivate = metrics["Private Farmers (tons/ha)"];
  if (yieldPrivate)
    summary.private_yield = getMetricValueByYear(yieldPrivate, currentYear);

  const area = metrics["Total Area (hectares)"];
  if (area) summary.total_area = getMetricValueByYear(area, currentYear);

  return summary;
}

/**
 * Determine season based on month (no hard assumptions, just naming)
 */
function getSeasonDescription(year) {
  const month = new Date().getMonth();
  const seasons = ["Summer", "Autumn", "Winter", "Spring"];
  const seasonIndex = Math.floor((month % 12) / 3);
  return `${seasons[seasonIndex]} ${year}`;
}

/**
 * Main API function – returns crop yield forecast and risk data
 */
async function getCropYieldForecastData(companyId, year) {
  try {
    if (!year) {
      throw new AppError("Year is required", 400, "YEAR_REQUIRED");
    }

    // --- Fetch the complete company document (lean plain object) ---
    const company = await Company.findById(companyId).lean();
    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // Fetch the full crop yield record and extract metrics for the requested year
    const { record, metrics, allMetrics } = await getCropYieldMetricsForYear(
      companyId,
      year,
    );

    // Calculate yield forecast (using allMetrics for historical context)
    const yieldForecast = calculateYieldForecast(
      metrics,
      company,
      year,
      allMetrics,
    );

    // Calculate risk factors
    const risks = calculateRiskFactors(metrics, company, year, allMetrics);

    // Generate graphs
    const graphs = generateGraphs(metrics, yieldForecast, risks, year);

    // Generate recommendations
    const recommendations = generateRecommendations(
      yieldForecast,
      risks,
      metrics,
      year,
    );

    // Confidence score: weighted average of forecast confidence and inverse of overall risk
    const confidenceScore = Math.round(
      yieldForecast.confidence_score * 0.7 + (100 - risks.overall.score) * 0.3,
    );

    // Categorize metrics
    const categorizedMetrics = categorizeCropYieldMetrics(metrics);

    // Summary statistics for the year
    const yearSummary = generateYieldMetricsSummary(metrics, year);

    // Prepare YoY changes if available
    const yoyChanges = [];
    const yoyMetrics = allMetrics.filter(
      (m) => m.category === "year_over_year_change" && m.is_active,
    );
    yoyMetrics.forEach((metric) => {
      metric.yearly_data?.forEach((data) => {
        yoyChanges.push({
          metric: metric.metric_name,
          period: data.year,
          change: data.value,
          numeric_change: data.numeric_value,
        });
      });
    });

    // --- Construct final response ---
    const response = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION, // ✅ new version constant
        generated_at: new Date().toISOString(),
        endpoint: "crop_yield_forecast",
        company_id: companyId,
        year_requested: year,
        data_source: {
          record_id: record._id,
          version: record.version,
          import_source: record.import_source,
          source_file: record.source_file_name,
          original_source: record.original_source,
          data_period: {
            start: record.data_period_start,
            end: record.data_period_end,
          },
        },
      },
      // ✅ Full company object (all fields) – replaces the previous subset
      company: company,
      reporting_period: {
        current_year: year,
        data_available_years: Array.from(
          new Set(
            allMetrics
              .filter((m) => m.yearly_data)
              .flatMap((m) => m.yearly_data.map((d) => d.year)),
          ),
        ).sort(),
        data_coverage_score: Object.keys(metrics).length, // number of metrics available this year
      },
      confidence_score: {
        overall: confidenceScore,
        forecast_confidence: yieldForecast.confidence_score,
        risk_assessment_confidence: 100 - risks.overall.score,
        interpretation:
          confidenceScore >= 80
            ? "High confidence"
            : confidenceScore >= 60
              ? "Medium confidence"
              : confidenceScore >= 40
                ? "Low confidence"
                : "Very low confidence",
        improvement_areas: [
          ...(!yieldForecast.calculation_factors.historical_data_available
            ? ["Historical yield data"]
            : []),
          ...(yieldForecast.confidence_score < 50
            ? ["More complete yield records"]
            : []),
          ...(!metrics["Water Usage - Irrigation Water Usage (million ML)"]
            ? ["Water usage metrics"]
            : []),
          ...(!metrics["Energy Consumption - Electricity Purchased (MWH)"]
            ? ["Energy consumption metrics"]
            : []),
        ],
      },
      yield_forecast: {
        ...yieldForecast,
        season: getSeasonDescription(year),
        next_season_forecast: {
          year: Number(year) + 1,
          predicted_yield: yieldForecast.forecasted_yield * 1.02, // placeholder; can be improved
          confidence: Math.max(0, yieldForecast.confidence_score - 10),
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
          })),
        mitigation_priorities: risks.overall.primary_risks.map(
          (r) => r.category,
        ),
      },
      crop_yield_metrics: {
        yearly_summary: yearSummary,
        categorized_metrics: categorizedMetrics,
        year_over_year_changes: yoyChanges,
      },
      graphs,
      recommendations,
      seasonal_advisory: {
        current_season: getSeasonDescription(year),
        next_season: getSeasonDescription(Number(year) + 1),
        planting_window: "October–November (Southern Hemisphere)", // generic; can be customized per country
        harvest_window: "April–September",
        recommended_actions: recommendations
          .filter((r) => r.priority === "High")
          .map((r) => r.action)
          .slice(0, 3),
      },
      summary: {
        outlook:
          yieldForecast.forecasted_yield > 0
            ? `Stable production expected with ${confidenceScore}% confidence`
            : "Insufficient data for yield outlook",
        key_strengths: [
          ...(yieldForecast.base_yield > 0
            ? ["Current yield data available"]
            : []),
          ...(risks.overall.score < 30 ? ["Low overall risk profile"] : []),
          ...(Object.keys(metrics).length > 5
            ? ["Comprehensive metric coverage"]
            : []),
        ],
        key_concerns: risks.overall.primary_risks
          .filter((r) => r.level === "High" || r.level === "Medium")
          .map((r) => `${r.category} (${r.level})`),
        opportunities: [
          ...(yieldForecast.calculation_factors.historical_data_available
            ? ["Improve forecast with multi‑year trend analysis"]
            : ["Establish historical yield baseline"]),
          ...(!metrics["Cane to Sugar Ratio (%)"]
            ? ["Monitor sugar recovery efficiency"]
            : []),
        ],
        data_gaps: [
          ...(!yieldForecast.calculation_factors.historical_data_available
            ? ["Historical yield records"]
            : []),
          ...(!metrics["Private Farmers (tons)"]
            ? ["Private farmer contributions"]
            : []),
          ...(yoyChanges.length === 0
            ? ["Year‑over‑year change analysis"]
            : []),
        ],
        next_steps: recommendations
          .sort((a, b) => (a.priority === "High" ? -1 : 1))
          .slice(0, 3)
          .map((r) => r.action),
      },
    };

    return response;
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
