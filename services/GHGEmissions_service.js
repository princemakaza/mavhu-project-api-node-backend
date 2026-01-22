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
      .populate("company") // Populate all fields instead of specific ones
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

      // Process emissions data with detailed breakdown
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
              ef_number: source.ef_number,
              gwp: source.gwp,
              tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
              methodological_justification: source.methodological_justification,
              calculation_notes: source.calculation_notes,
              total_tco2e: source.annual_per_ha
                ? source.annual_per_ha *
                  (enhanced.sequestration?.soc_area_ha ||
                    enhanced.sequestration?.reporting_area_ha ||
                    1) *
                  (source.tco2e_per_ha_per_year || 0)
                : ((enhanced.emissions.scope1.total_tco2e || 0) *
                    (source.tco2e_per_ha_per_year || 0)) /
                  100,
            }));

          // Categorize Scope 1 emissions
          enhanced.emissions.scope1.categories = {
            stationary_combustion: enhanced.emissions.scope1.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("fuel") ||
                  s.source.toLowerCase().includes("coal"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
            mobile_combustion: enhanced.emissions.scope1.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("diesel") ||
                  s.source.toLowerCase().includes("petrol") ||
                  s.source.toLowerCase().includes("vehicle"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
            process_emissions: enhanced.emissions.scope1.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("fertilizer") ||
                  s.source.toLowerCase().includes("process"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
            fugitive_emissions: enhanced.emissions.scope1.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("fugitive") ||
                  s.source.toLowerCase().includes("leak"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
          };
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
              ef_number: source.ef_number,
              tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
              methodological_justification: source.methodological_justification,
              calculation_notes: source.calculation_notes,
              total_tco2e: source.annual_activity_per_ha
                ? source.annual_activity_per_ha *
                  (enhanced.sequestration?.soc_area_ha ||
                    enhanced.sequestration?.reporting_area_ha ||
                    1) *
                  (source.tco2e_per_ha_per_year || 0)
                : ((enhanced.emissions.scope2.total_tco2e || 0) *
                    (source.tco2e_per_ha_per_year || 0)) /
                  100,
            }));

          enhanced.emissions.scope2.energy_sources = {
            grid_electricity: enhanced.emissions.scope2.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("electricity") ||
                  s.source.toLowerCase().includes("grid"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
            purchased_steam: enhanced.emissions.scope2.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("steam") ||
                  s.source.toLowerCase().includes("heat"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
            purchased_cooling: enhanced.emissions.scope2.sources
              .filter(
                (s) =>
                  s.source.toLowerCase().includes("cooling") ||
                  s.source.toLowerCase().includes("chilled"),
              )
              .reduce((sum, s) => sum + (s.tco2e_per_ha_per_year || 0), 0),
          };
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
              ef_number: category.ef_number,
              tco2e_per_ha_per_year: category.tco2e_per_ha_per_year,
              methodological_justification:
                category.methodological_justification,
              calculation_notes: category.calculation_notes,
              total_tco2e: category.annual_activity_per_ha
                ? category.annual_activity_per_ha *
                  (enhanced.sequestration?.soc_area_ha ||
                    enhanced.sequestration?.reporting_area_ha ||
                    1) *
                  (category.tco2e_per_ha_per_year || 0)
                : ((enhanced.emissions.scope3.total_tco2e || 0) *
                    (category.tco2e_per_ha_per_year || 0)) /
                  100,
            }));

          // Map to GHG Protocol Scope 3 categories
          enhanced.emissions.scope3.ghg_protocol_categories = {
            purchased_goods: enhanced.emissions.scope3.categories
              .filter(
                (c) =>
                  c.category.toLowerCase().includes("purchased") ||
                  c.category.toLowerCase().includes("goods"),
              )
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            capital_goods: enhanced.emissions.scope3.categories
              .filter((c) => c.category.toLowerCase().includes("capital"))
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            fuel_and_energy: enhanced.emissions.scope3.categories
              .filter(
                (c) =>
                  c.category.toLowerCase().includes("fuel") ||
                  c.category.toLowerCase().includes("energy"),
              )
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            transportation: enhanced.emissions.scope3.categories
              .filter(
                (c) =>
                  c.category.toLowerCase().includes("transport") ||
                  c.category.toLowerCase().includes("logistics"),
              )
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            waste_generated: enhanced.emissions.scope3.categories
              .filter((c) => c.category.toLowerCase().includes("waste"))
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            business_travel: enhanced.emissions.scope3.categories
              .filter((c) => c.category.toLowerCase().includes("travel"))
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            employee_commuting: enhanced.emissions.scope3.categories
              .filter(
                (c) =>
                  c.category.toLowerCase().includes("commuting") ||
                  c.category.toLowerCase().includes("employee"),
              )
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
            leased_assets: enhanced.emissions.scope3.categories
              .filter(
                (c) =>
                  c.category.toLowerCase().includes("lease") ||
                  c.category.toLowerCase().includes("rent"),
              )
              .reduce((sum, c) => sum + (c.tco2e_per_ha_per_year || 0), 0),
          };
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
          per_production_unit: calculatePerProductionUnit(enhanced, companyId),
        };
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
 * Helper function to calculate emissions per production unit
 */
function calculatePerProductionUnit(yearData, companyId) {
  // This would ideally come from company production metrics
  // For now, we'll use industry averages
  const industryMultipliers = {
    "Agriculture & Sugar Production": 1000, // tons of sugar
    Agriculture: 100, // tons of crop
    "Sugar Production": 1000,
    default: 100,
  };

  const area =
    yearData.sequestration?.soc_area_ha ||
    yearData.sequestration?.reporting_area_ha ||
    1;
  const production =
    area *
    (industryMultipliers["Agriculture & Sugar Production"] ||
      industryMultipliers.default);

  return {
    scope1_per_unit: yearData.emissions?.scope1?.total_tco2e
      ? yearData.emissions.scope1.total_tco2e / production
      : 0,
    scope2_per_unit: yearData.emissions?.scope2?.total_tco2e
      ? yearData.emissions.scope2.total_tco2e / production
      : 0,
    scope3_per_unit: yearData.emissions?.scope3?.total_tco2e
      ? yearData.emissions.scope3.total_tco2e / production
      : 0,
    total_per_unit: yearData.emissions?.total_scope_emission_tco2e
      ? yearData.emissions.total_scope_emission_tco2e / production
      : 0,
    unit: "tCO2e/ton production",
  };
}

/**
 * Helper function to calculate comprehensive carbon summary
 */
function calculateCarbonComprehensiveSummary(yearlyData) {
  if (!yearlyData || yearlyData.length === 0) return null;

  const years = yearlyData.map((d) => d.year);

  // Emission metrics
  const emissionData = yearlyData.map((d) => ({
    year: d.year,
    scope1: d.emissions?.scope1?.total_tco2e || 0,
    scope2: d.emissions?.scope2?.total_tco2e || 0,
    scope3: d.emissions?.scope3?.total_tco2e || 0,
    total: d.emissions?.total_scope_emission_tco2e || 0,
    net: d.emissions?.net_total_emission_tco2e || 0,
    area:
      d.sequestration?.soc_area_ha || d.sequestration?.reporting_area_ha || 1,
    scope1_details: d.emissions?.scope1?.categories || {},
    scope2_details: d.emissions?.scope2?.energy_sources || {},
    scope3_details: d.emissions?.scope3?.ghg_protocol_categories || {},
  }));

  // Calculate trends
  const scope1Trend =
    emissionData.length >= 2
      ? calculatePercentageChange(
          emissionData[0].scope1,
          emissionData[emissionData.length - 1].scope1,
        )
      : 0;
  const scope2Trend =
    emissionData.length >= 2
      ? calculatePercentageChange(
          emissionData[0].scope2,
          emissionData[emissionData.length - 1].scope2,
        )
      : 0;
  const scope3Trend =
    emissionData.length >= 2
      ? calculatePercentageChange(
          emissionData[0].scope3,
          emissionData[emissionData.length - 1].scope3,
        )
      : 0;
  const totalTrend =
    emissionData.length >= 2
      ? calculatePercentageChange(
          emissionData[0].total,
          emissionData[emissionData.length - 1].total,
        )
      : 0;

  // Calculate averages
  const avgScope1 =
    emissionData.reduce((sum, d) => sum + d.scope1, 0) / emissionData.length;
  const avgScope2 =
    emissionData.reduce((sum, d) => sum + d.scope2, 0) / emissionData.length;
  const avgScope3 =
    emissionData.reduce((sum, d) => sum + d.scope3, 0) / emissionData.length;
  const avgTotal =
    emissionData.reduce((sum, d) => sum + d.total, 0) / emissionData.length;
  const avgArea =
    emissionData.reduce((sum, d) => sum + d.area, 0) / emissionData.length;

  // Calculate cumulative emissions
  const cumulativeEmissions = emissionData.reduce((sum, d) => sum + d.total, 0);

  return {
    period: {
      start_year: Math.min(...years),
      end_year: Math.max(...years),
      years_count: years.length,
    },
    totals: {
      total_scope1_tco2e: emissionData.reduce((sum, d) => sum + d.scope1, 0),
      total_scope2_tco2e: emissionData.reduce((sum, d) => sum + d.scope2, 0),
      total_scope3_tco2e: emissionData.reduce((sum, d) => sum + d.scope3, 0),
      total_emissions_tco2e: cumulativeEmissions,
      cumulative_co2e: cumulativeEmissions,
      average_area_ha: avgArea,
    },
    averages: {
      annual_scope1: avgScope1,
      annual_scope2: avgScope2,
      annual_scope3: avgScope3,
      annual_total: avgTotal,
      carbon_intensity: avgArea > 0 ? avgTotal / avgArea : 0,
    },
    trends: {
      scope1_trend: scope1Trend,
      scope2_trend: scope2Trend,
      scope3_trend: scope3Trend,
      total_trend: totalTrend,
      scope1_direction:
        scope1Trend > 5
          ? "increasing"
          : scope1Trend < -5
            ? "decreasing"
            : "stable",
      scope2_direction:
        scope2Trend > 5
          ? "increasing"
          : scope2Trend < -5
            ? "decreasing"
            : "stable",
      scope3_direction:
        scope3Trend > 5
          ? "increasing"
          : scope3Trend < -5
            ? "decreasing"
            : "stable",
      total_direction:
        totalTrend > 5
          ? "increasing"
          : totalTrend < -5
            ? "decreasing"
            : "stable",
    },
    composition: {
      scope1_percentage: avgTotal > 0 ? (avgScope1 / avgTotal) * 100 : 0,
      scope2_percentage: avgTotal > 0 ? (avgScope2 / avgTotal) * 100 : 0,
      scope3_percentage: avgTotal > 0 ? (avgScope3 / avgTotal) * 100 : 0,
      scope1_breakdown: calculateScopeBreakdown(emissionData, "scope1_details"),
      scope2_breakdown: calculateScopeBreakdown(emissionData, "scope2_details"),
      scope3_breakdown: calculateScopeBreakdown(emissionData, "scope3_details"),
    },
    intensity_metrics: {
      scope1_intensity: avgArea > 0 ? avgScope1 / avgArea : 0,
      scope2_intensity: avgArea > 0 ? avgScope2 / avgArea : 0,
      scope3_intensity: avgArea > 0 ? avgScope3 / avgArea : 0,
      total_intensity: avgArea > 0 ? avgTotal / avgArea : 0,
    },
  };
}

/**
 * Helper function to calculate scope breakdown
 */
function calculateScopeBreakdown(emissionData, scopeKey) {
  const breakdown = {};

  emissionData.forEach((data) => {
    const details = data[scopeKey];
    if (details) {
      Object.keys(details).forEach((key) => {
        if (!breakdown[key]) {
          breakdown[key] = 0;
        }
        breakdown[key] += details[key];
      });
    }
  });

  // Convert to averages
  const count = emissionData.length;
  Object.keys(breakdown).forEach((key) => {
    breakdown[key] = breakdown[key] / count;
  });

  return breakdown;
}

/**
 * Helper function to generate comprehensive emission graphs
 */
function generateEmissionGraphs(metrics, carbonData, years, currentYear) {
  const graphs = {};

  // 1. Total Emissions Trend (All Scopes)
  if (years.length >= 2) {
    graphs.total_emissions_trend = {
      type: "line",
      title: "Total GHG Emissions Trend",
      description: "Historical trend of total greenhouse gas emissions",
      labels: years,
      datasets: [
        {
          label: "Total Emissions (tCO₂e)",
          data: years.map((year) => {
            const totalMetric = metrics["Carbon Emissions (Total GHG, tCO2e)"];
            return getMetricValueByYear(totalMetric, year) || 0;
          }),
          borderColor: "#2c3e50",
          backgroundColor: "rgba(44, 62, 80, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Industry Benchmark",
          data: years.map(() => 50000), // Example benchmark
          borderColor: "#7f8c8d",
          borderDash: [5, 5],
          fill: false,
        },
      ],
    };
  }

  // 2. Scope-wise Emissions Breakdown (Current Year)
  const scope1 = metrics["GHG Scope 1 (tCO2e)"];
  const scope2 = metrics["GHG Scope 2 (tCO2e)"];
  const scope3 = metrics["GHG Scope 3 (tCO2e)"];

  if (scope1 && scope2 && scope3) {
    graphs.scope_composition = {
      type: "doughnut",
      title: `GHG Emissions by Scope - ${currentYear}`,
      description: "Breakdown of emissions by Scope 1, 2, and 3",
      labels: [
        "Scope 1: Direct Emissions",
        "Scope 2: Indirect Energy",
        "Scope 3: Value Chain",
      ],
      datasets: [
        {
          data: [
            getMetricValueByYear(scope1, currentYear) || 0,
            getMetricValueByYear(scope2, currentYear) || 0,
            getMetricValueByYear(scope3, currentYear) || 0,
          ],
          backgroundColor: ["#e74c3c", "#3498db", "#9b59b6"],
          borderWidth: 2,
        },
      ],
    };
  }

  // 3. Scope-wise Trends Over Time
  if (years.length >= 2 && scope1 && scope2 && scope3) {
    graphs.scope_trends = {
      type: "line",
      title: "Emissions Trends by Scope",
      description: "Historical trends for each emission scope",
      labels: years,
      datasets: [
        {
          label: "Scope 1",
          data: years.map((y) => getMetricValueByYear(scope1, y) || 0),
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.1)",
          fill: true,
        },
        {
          label: "Scope 2",
          data: years.map((y) => getMetricValueByYear(scope2, y) || 0),
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          fill: true,
        },
        {
          label: "Scope 3",
          data: years.map((y) => getMetricValueByYear(scope3, y) || 0),
          borderColor: "#9b59b6",
          backgroundColor: "rgba(155, 89, 182, 0.1)",
          fill: true,
        },
      ],
    };
  }

  // 4. Scope 1 Detailed Breakdown (if carbon data available)
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.emissions?.scope1?.categories) {
      const categories = yearData.emissions.scope1.categories;
      graphs.scope1_breakdown = {
        type: "bar",
        title: `Scope 1: Direct Emissions Breakdown - ${currentYear}`,
        description: "Detailed breakdown of direct emissions sources",
        labels: Object.keys(categories).map((k) =>
          k.replace(/_/g, " ").toUpperCase(),
        ),
        datasets: [
          {
            label: "tCO₂e",
            data: Object.values(categories),
            backgroundColor: ["#e74c3c", "#c0392b", "#d35400", "#e67e22"],
          },
        ],
      };
    }
  }

  // 5. Scope 3 Value Chain Categories
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    if (yearData && yearData.emissions?.scope3?.ghg_protocol_categories) {
      const categories = yearData.emissions.scope3.ghg_protocol_categories;
      const sortedEntries = Object.entries(categories)
        .filter(([_, value]) => value > 0)
        .sort((a, b) => b[1] - a[1]);

      if (sortedEntries.length > 0) {
        graphs.scope3_categories = {
          type: "horizontalBar",
          title: `Scope 3: Value Chain Categories - ${currentYear}`,
          description: "GHG Protocol Scope 3 category breakdown",
          labels: sortedEntries.map(([key]) =>
            key.replace(/_/g, " ").toUpperCase(),
          ),
          datasets: [
            {
              label: "tCO₂e",
              data: sortedEntries.map(([_, value]) => value),
              backgroundColor: "#9b59b6",
            },
          ],
        };
      }
    }
  }

  // 6. Emissions Intensity Over Time
  if (
    carbonData &&
    carbonData.yearly_data &&
    carbonData.yearly_data.length >= 2
  ) {
    const sortedData = [...carbonData.yearly_data].sort(
      (a, b) => a.year - b.year,
    );
    graphs.emissions_intensity = {
      type: "line",
      title: "Carbon Intensity Trend",
      description: "Emissions per hectare over time",
      labels: sortedData.map((d) => d.year),
      datasets: [
        {
          label: "Intensity (tCO₂e/ha)",
          data: sortedData.map((d) => {
            const emissions = d.emissions?.total_scope_emission_tco2e || 0;
            const area =
              d.sequestration?.soc_area_ha ||
              d.sequestration?.reporting_area_ha ||
              1;
            return emissions / area;
          }),
          borderColor: "#27ae60",
          backgroundColor: "rgba(39, 174, 96, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // 7. Emission Sources Heat Map (Year-over-Year)
  if (years.length >= 3) {
    const energySources = [
      "Energy Consumption - Coal Consumption (tons)",
      "Energy Consumption - Electricity Purchased (MWH)",
      "Energy Consumption - Inside Company Diesel Usage (litres)",
      "Energy Consumption - Inside Company Petrol Usage (litres)",
    ];

    const validSources = energySources.filter((source) => metrics[source]);

    if (validSources.length > 0) {
      graphs.emission_sources_heatmap = {
        type: "bar",
        title: "Emission Sources Over Time",
        description: "Comparison of major emission sources",
        labels: years.slice(-3),
        datasets: validSources.map((source, index) => ({
          label: source.split("-")[1].trim(),
          data: years
            .slice(-3)
            .map((year) => getMetricValueByYear(metrics[source], year) || 0),
          backgroundColor: ["#e74c3c", "#3498db", "#f39c12", "#2ecc71"][
            index % 4
          ],
        })),
      };
    }
  }

  // 8. Cumulative Emissions
  if (years.length >= 2) {
    let cumulative = 0;
    const cumulativeData = years.map((year) => {
      const totalMetric = metrics["Carbon Emissions (Total GHG, tCO2e)"];
      cumulative += getMetricValueByYear(totalMetric, year) || 0;
      return cumulative;
    });

    graphs.cumulative_emissions = {
      type: "line",
      title: "Cumulative GHG Emissions",
      description: "Total accumulated emissions over time",
      labels: years,
      datasets: [
        {
          label: "Cumulative Emissions (tCO₂e)",
          data: cumulativeData,
          borderColor: "#8e44ad",
          backgroundColor: "rgba(142, 68, 173, 0.1)",
          fill: true,
          tension: 0.4,
        },
        {
          label: "Annual Emissions",
          data: years.map((year) => {
            const totalMetric = metrics["Carbon Emissions (Total GHG, tCO2e)"];
            return getMetricValueByYear(totalMetric, year) || 0;
          }),
          borderColor: "#3498db",
          borderDash: [5, 5],
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          fill: false,
        },
      ],
    };
  }

  // 9. Emissions vs Sequestration Balance
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
      title: "Carbon Balance: Emissions vs Sequestration",
      description: "Net carbon position including sequestration",
      labels: sortedData.map((d) => d.year),
      datasets: [
        {
          label: "Emissions (tCO₂e)",
          data: sortedData.map(
            (d) => d.emissions?.total_scope_emission_tco2e || 0,
          ),
          backgroundColor: "#e74c3c",
        },
        {
          label: "Sequestration (tCO₂)",
          data: sortedData.map(
            (d) =>
              d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
          ),
          backgroundColor: "#27ae60",
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

  // 10. Emission Reduction Progress
  if (years.length >= 2) {
    const baselineYear = Math.min(...years);
    const baselineValue =
      getMetricValueByYear(
        metrics["Carbon Emissions (Total GHG, tCO2e)"],
        baselineYear,
      ) || 0;

    graphs.reduction_progress = {
      type: "line",
      title: "Emission Reduction Progress",
      description: "Progress against reduction targets",
      labels: years,
      datasets: [
        {
          label: "Actual Emissions",
          data: years.map(
            (year) =>
              getMetricValueByYear(
                metrics["Carbon Emissions (Total GHG, tCO2e)"],
                year,
              ) || 0,
          ),
          borderColor: "#e74c3c",
          backgroundColor: "rgba(231, 76, 60, 0.1)",
          fill: true,
        },
        {
          label: "10% Reduction Target",
          data: years.map((year) => baselineValue * 0.9),
          borderColor: "#27ae60",
          borderDash: [5, 5],
          fill: false,
        },
        {
          label: "30% Reduction Target",
          data: years.map((year) => baselineValue * 0.7),
          borderColor: "#3498db",
          borderDash: [10, 5],
          fill: false,
        },
      ],
    };
  }

  return graphs;
}

/**
 * Helper function to calculate 8 key emission totals
 */
function calculateKeyEmissionTotals(metrics, carbonData, currentYear, years) {
  const scope1 = metrics["GHG Scope 1 (tCO2e)"];
  const scope2 = metrics["GHG Scope 2 (tCO2e)"];
  const scope3 = metrics["GHG Scope 3 (tCO2e)"];
  const totalGHG = metrics["Carbon Emissions (Total GHG, tCO2e)"];

  const currentScope1 = getMetricValueByYear(scope1, currentYear) || 0;
  const currentScope2 = getMetricValueByYear(scope2, currentYear) || 0;
  const currentScope3 = getMetricValueByYear(scope3, currentYear) || 0;
  const currentTotal = getMetricValueByYear(totalGHG, currentYear) || 0;

  // Calculate baseline (first year)
  const baselineYear = Math.min(...years);
  const baselineTotal =
    getMetricValueByYear(totalGHG, baselineYear) || currentTotal;

  // Calculate cumulative emissions
  let cumulativeEmissions = 0;
  years.forEach((year) => {
    cumulativeEmissions += getMetricValueByYear(totalGHG, year) || 0;
  });

  // Calculate intensity
  let intensity = 0;
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    const area =
      yearData?.sequestration?.soc_area_ha ||
      yearData?.sequestration?.reporting_area_ha ||
      1;
    intensity = currentTotal / area;
  }

  // Calculate reduction percentage
  const reductionPercentage =
    baselineTotal > 0
      ? ((baselineTotal - currentTotal) / baselineTotal) * 100
      : 0;

  // Calculate Scope 3 percentage
  const scope3Percentage =
    currentTotal > 0 ? (currentScope3 / currentTotal) * 100 : 0;

  return {
    total_emissions_current_year: {
      value: currentTotal,
      unit: "tCO₂e",
      description: "Total GHG emissions for current reporting year",
    },
    scope1_direct_emissions: {
      value: currentScope1,
      unit: "tCO₂e",
      description: "Direct emissions from owned or controlled sources",
    },
    scope2_indirect_energy: {
      value: currentScope2,
      unit: "tCO₂e",
      description: "Indirect emissions from purchased energy",
    },
    scope3_value_chain: {
      value: currentScope3,
      unit: "tCO₂e",
      description: "Indirect emissions from value chain activities",
    },
    cumulative_emissions: {
      value: cumulativeEmissions,
      unit: "tCO₂e",
      description: "Total emissions accumulated over reporting period",
    },
    carbon_intensity: {
      value: intensity,
      unit: "tCO₂e/ha",
      description: "Emissions per unit area of operation",
    },
    reduction_from_baseline: {
      value: reductionPercentage,
      unit: "%",
      description: "Percentage reduction from baseline year",
    },
    scope3_percentage_of_total: {
      value: scope3Percentage,
      unit: "%",
      description: "Value chain emissions as percentage of total",
    },
  };
}

/**
 * Helper function to generate reduction targets
 */
function generateReductionTargets(
  currentTotal,
  baselineYear,
  baselineTotal,
  years,
) {
  const targetYears = [2025, 2030, 2050];

  return targetYears.map((targetYear) => {
    const yearsToTarget = targetYear - new Date().getFullYear();
    const requiredAnnualReduction = currentTotal * 0.05; // 5% per year as example

    return {
      target_year: targetYear,
      years_to_target: yearsToTarget,
      target_value: currentTotal * (1 - yearsToTarget * 0.05),
      required_annual_reduction: requiredAnnualReduction,
      current_progress:
        ((baselineTotal - currentTotal) /
          (baselineTotal * (yearsToTarget * 0.05))) *
        100,
      alignment: {
        paris_agreement:
          targetYear <= 2030
            ? "Aligned with 1.5°C pathway"
            : "Needs strengthening",
        science_based_targets:
          currentTotal > 10000 ? "Eligible for SBTi" : "Below threshold",
        net_zero:
          targetYear === 2050 ? "Net zero target required" : "Interim target",
      },
    };
  });
}

/**
 * Helper function to generate compliance recommendations
 */
function generateComplianceRecommendations(
  metrics,
  carbonData,
  currentYear,
  company,
) {
  const recommendations = [];
  const scope1 = metrics["GHG Scope 1 (tCO2e)"];
  const scope2 = metrics["GHG Scope 2 (tCO2e)"];
  const scope3 = metrics["GHG Scope 3 (tCO2e)"];

  const currentScope1 = getMetricValueByYear(scope1, currentYear) || 0;
  const currentScope2 = getMetricValueByYear(scope2, currentYear) || 0;
  const currentScope3 = getMetricValueByYear(scope3, currentYear) || 0;
  const currentTotal =
    getMetricValueByYear(
      metrics["Carbon Emissions (Total GHG, tCO2e)"],
      currentYear,
    ) || 0;

  // Scope 1 recommendations
  if (currentScope1 > 10000) {
    recommendations.push({
      category: "Scope 1 Reduction",
      priority: "High",
      action:
        "Implement fuel efficiency measures and transition to renewable fuels",
      impact: "Reduce Scope 1 emissions by 20-30%",
      compliance_benefit:
        "Aligns with GHG Protocol and IPCC guidance for direct emissions",
      timeframe: "12-18 months",
    });
  }

  // Scope 2 recommendations
  if (currentScope2 > 5000) {
    recommendations.push({
      category: "Scope 2 Optimization",
      priority: "Medium",
      action: "Procure renewable energy through PPAs or RECs",
      impact: "Achieve 100% renewable electricity",
      compliance_benefit:
        "Supports RE100 initiative and carbon neutrality goals",
      timeframe: "6-12 months",
    });
  }

  // Scope 3 recommendations
  if (currentScope3 > currentTotal * 0.4) {
    // If Scope 3 > 40% of total
    recommendations.push({
      category: "Scope 3 Management",
      priority: "High",
      action:
        "Engage suppliers and implement value chain emission reduction program",
      impact: "Reduce Scope 3 emissions by 15-25%",
      compliance_benefit:
        "Addresses value chain emissions as per GHG Protocol Scope 3 Standard",
      timeframe: "18-24 months",
    });
  }

  // Reporting recommendations
  if (!carbonData) {
    recommendations.push({
      category: "Reporting Enhancement",
      priority: "Medium",
      action:
        "Implement comprehensive carbon accounting system with Scope 3 coverage",
      impact: "Improve emission data accuracy by 30-40%",
      compliance_benefit:
        "Aligns with TCFD recommendations and ESG reporting frameworks",
      timeframe: "3-6 months",
    });
  }

  // Verification recommendations
  if (
    carbonData &&
    !carbonData.yearly_data?.some(
      (y) => y.data_quality?.verification_status === "verified",
    )
  ) {
    recommendations.push({
      category: "Data Verification",
      priority: "Medium",
      action: "Obtain third-party verification of emission inventory",
      impact: "Enhance credibility and assurance of reported data",
      compliance_benefit:
        "Required for CDP reporting and many sustainability certifications",
      timeframe: "3-6 months",
    });
  }

  // Intensity reduction
  if (carbonData && carbonData.yearly_data) {
    const yearData = carbonData.yearly_data.find((y) => y.year === currentYear);
    const area =
      yearData?.sequestration?.soc_area_ha ||
      yearData?.sequestration?.reporting_area_ha ||
      1;
    const intensity = currentTotal / area;

    if (intensity > 50) {
      // Example threshold
      recommendations.push({
        category: "Intensity Reduction",
        priority: "High",
        action:
          "Implement operational efficiency improvements and best practices",
        impact: "Reduce carbon intensity by 20-30%",
        compliance_benefit: "Supports sector-specific decarbonization pathways",
        timeframe: "12-24 months",
      });
    }
  }

  return recommendations;
}

/**
 * Helper function to calculate data confidence score
 */
function calculateDataConfidenceScore(metrics, carbonData, years) {
  let score = 50; // Base score

  // Data completeness (0-30 points)
  const requiredMetrics = [
    "Carbon Emissions (Total GHG, tCO2e)",
    "GHG Scope 1 (tCO2e)",
    "GHG Scope 2 (tCO2e)",
    "GHG Scope 3 (tCO2e)",
  ];

  const availableMetrics = requiredMetrics.filter((metric) => metrics[metric]);
  score += (availableMetrics.length / requiredMetrics.length) * 30;

  // Temporal coverage (0-20 points)
  if (years.length >= 3) score += 20;
  else if (years.length >= 2) score += 15;
  else if (years.length >= 1) score += 10;

  // Methodological rigor (0-25 points)
  if (carbonData) {
    score += 15;

    // Check for detailed breakdown
    if (carbonData.yearly_data && carbonData.yearly_data.length > 0) {
      const latestYear =
        carbonData.yearly_data[carbonData.yearly_data.length - 1];
      if (latestYear.emissions?.scope1?.detailed_sources) score += 5;
      if (latestYear.emissions?.scope2?.detailed_sources) score += 3;
      if (latestYear.emissions?.scope3?.detailed_categories) score += 2;
    }
  }

  // Verification status (0-15 points)
  if (
    carbonData &&
    carbonData.yearly_data?.some(
      (y) => y.data_quality?.verification_status === "verified",
    )
  ) {
    score += 15;
  } else if (
    carbonData &&
    carbonData.yearly_data?.some(
      (y) => y.data_quality?.verification_status === "audited",
    )
  ) {
    score += 12;
  } else if (carbonData) {
    score += 5;
  }

  // Data consistency (0-10 points)
  const totalFromScopes =
    (getMetricValueByYear(metrics["GHG Scope 1 (tCO2e)"], Math.max(...years)) ||
      0) +
    (getMetricValueByYear(metrics["GHG Scope 2 (tCO2e)"], Math.max(...years)) ||
      0) +
    (getMetricValueByYear(metrics["GHG Scope 3 (tCO2e)"], Math.max(...years)) ||
      0);
  const reportedTotal =
    getMetricValueByYear(
      metrics["Carbon Emissions (Total GHG, tCO2e)"],
      Math.max(...years),
    ) || 0;

  if (Math.abs(totalFromScopes - reportedTotal) / reportedTotal < 0.05) {
    // Within 5%
    score += 10;
  } else if (Math.abs(totalFromScopes - reportedTotal) / reportedTotal < 0.1) {
    // Within 10%
    score += 5;
  }

  return Math.min(Math.round(score), 100);
}

/**
 * Main GHG Emissions API
 */
/**
 * Main GHG Emissions API
 */
async function getGHGEmissionsData(companyId, year = null) {
  try {
    const company = await Company.findById(companyId).lean();
    if (!company)
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");

    // Get emissions-related metrics
    const metricNames = [
      "Carbon Emissions (Total GHG, tCO2e)",
      "GHG Scope 1 (tCO2e)",
      "GHG Scope 2 (tCO2e)",
      "GHG Scope 3 (tCO2e)",
      "Energy Consumption - Coal Consumption (tons)",
      "Energy Consumption - Electricity Purchased (MWH)",
      "Energy Consumption - Inside Company Diesel Usage (litres)",
      "Energy Consumption - Inside Company Petrol Usage (litres)",
      "Energy Consumption - Outside Company Diesel Usage (litres)",
      "Energy Consumption - Outside Company Petrol Usage (litres)",
      "Water Usage (m³)",
      "Waste Generated (tons)",
      "Land Use Change (ha)",
    ];

    const metrics = await getMetricsByNames(companyId, metricNames);
    const years = getUniqueYearsFromMetrics(metrics, year);

    if (years.length === 0) {
      throw new AppError(
        "No emissions data available",
        404,
        "NO_EMISSIONS_DATA",
      );
    }

    const currentYear = year || Math.max(...years);
    const baselineYear = Math.min(...years);
    const previousYear = currentYear > baselineYear ? currentYear - 1 : null;

    // Get comprehensive carbon emission data
    const carbonData = await getComprehensiveCarbonEmissionData(
      companyId,
      currentYear,
    );

    // Calculate key totals
    const keyTotals = calculateKeyEmissionTotals(
      metrics,
      carbonData,
      currentYear,
      years,
    );

    // Generate graphs
    const graphs = generateEmissionGraphs(
      metrics,
      carbonData,
      years,
      currentYear,
    );

    // Calculate reduction targets
    const baselineTotal =
      getMetricValueByYear(
        metrics["Carbon Emissions (Total GHG, tCO2e)"],
        baselineYear,
      ) ||
      getMetricValueByYear(
        metrics["Carbon Emissions (Total GHG, tCO2e)"],
        currentYear,
      ) ||
      0;
    const currentTotal =
      getMetricValueByYear(
        metrics["Carbon Emissions (Total GHG, tCO2e)"],
        currentYear,
      ) || 0;

    const reductionTargets = generateReductionTargets(
      currentTotal,
      baselineYear,
      baselineTotal,
      years,
    );

    // Generate recommendations
    const recommendations = generateComplianceRecommendations(
      metrics,
      carbonData,
      currentYear,
      company,
    );

    // Calculate confidence score
    const confidenceScore = calculateDataConfidenceScore(
      metrics,
      carbonData,
      years,
    );

    // Prepare carbon emission accounting data
    const carbonEmissionAccounting = carbonData
      ? {
          framework: carbonData.framework,
          methodology: carbonData.emission_references?.methodology_statement,
          summary: carbonData.comprehensive_summary,
          emission_factors:
            carbonData.emission_references?.emission_factors || [],
          global_warming_potentials:
            carbonData.emission_references?.global_warming_potentials,
          conversion_factors:
            carbonData.emission_references?.conversion_factors,
          yearly_data: carbonData.yearly_data.map((yearData) => ({
            year: yearData.year,
            scope1: {
              total_tco2e: yearData.emissions?.scope1?.total_tco2e,
              total_tco2e_per_ha:
                yearData.emissions?.scope1?.total_tco2e_per_ha,
              categories: yearData.emissions?.scope1?.categories,
              sources:
                yearData.emissions?.scope1?.detailed_sources ||
                yearData.emissions?.scope1?.sources ||
                [],
            },
            scope2: {
              total_tco2e: yearData.emissions?.scope2?.total_tco2e,
              total_tco2e_per_ha:
                yearData.emissions?.scope2?.total_tco2e_per_ha,
              energy_sources: yearData.emissions?.scope2?.energy_sources,
              sources:
                yearData.emissions?.scope2?.detailed_sources ||
                yearData.emissions?.scope2?.sources ||
                [],
            },
            scope3: {
              total_tco2e: yearData.emissions?.scope3?.total_tco2e,
              total_tco2e_per_ha:
                yearData.emissions?.scope3?.total_tco2e_per_ha,
              ghg_protocol_categories:
                yearData.emissions?.scope3?.ghg_protocol_categories,
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
            data_quality: yearData.data_quality,
          })),
        }
      : null;

    // Prepare complete company data with all fields
    const companyData = {
      id: company._id,
      name: company.name,
      registrationNumber: company.registrationNumber || null,
      email: company.email || null,
      phone: company.phone || null,
      address: company.address || null,
      website: company.website || null,
      country: company.country || null,
      industry: company.industry || null,
      description: company.description || null,
      purpose: company.purpose || null,
      scope: company.scope || null,
      data_source: company.data_source || [],
      area_of_interest_metadata: company.area_of_interest_metadata || {
        name: null,
        area_covered: null,
        coordinates: [],
      },
      data_range: company.data_range || null,
      data_processing_workflow: company.data_processing_workflow || null,
      analytical_layer_metadata: company.analytical_layer_metadata || null,
      esg_reporting_framework: company.esg_reporting_framework || [],
      esg_contact_person: company.esg_contact_person || {
        name: null,
        email: null,
        phone: null,
      },
      latest_esg_report_year: company.latest_esg_report_year || null,
      esg_data_status: company.esg_data_status || "not_collected",
      has_esg_linked_pay: company.has_esg_linked_pay || false,
      created_at: company.created_at,
      updated_at: company.updated_at,
    };

    const data = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "ghg_emissions",
        company_id: companyId,
        year_requested: year,
        data_sources: carbonData
          ? ["ESGData", "CarbonEmissionAccounting", "GHGProtocol", "IPCC"]
          : ["ESGData", "GHGProtocol"],
        calculation_methods: [
          "GHG Protocol Corporate Standard for Scope 1 & 2",
          "GHG Protocol Scope 3 Standard for value chain emissions",
          "IPCC 2006 Guidelines and 2019 Refinement",
          "Activity-based calculation using emission factors",
          "Global Warming Potentials from IPCC AR5",
        ],
        compliance_frameworks: [
          "GHG Protocol",
          "TCFD Recommendations",
          "CDP Reporting",
          "ISO 14064-1",
          "Science Based Targets initiative (SBTi)",
        ],
      },
      company: companyData,
      reporting_period: {
        current_year: currentYear,
        baseline_year: baselineYear,
        previous_year: previousYear,
        available_years: years,
        carbon_data_available: !!carbonData,
        data_coverage: `${years.length} year${years.length > 1 ? "s" : ""} of data`,
      },
      confidence_assessment: {
        overall_score: confidenceScore,
        data_completeness: Math.min(
          100,
          (Object.keys(metrics).length / metricNames.length) * 100,
        ),
        methodological_rigor: carbonData ? 85 : 50,
        verification_status: carbonData?.yearly_data?.some(
          (y) => y.data_quality?.verification_status === "verified",
        )
          ? 90
          : 40,
        temporal_coverage: Math.min(100, years.length * 25),
        interpretation:
          confidenceScore >= 80
            ? "High confidence - Suitable for external reporting"
            : confidenceScore >= 60
              ? "Medium confidence - Suitable for internal decision making"
              : confidenceScore >= 40
                ? "Low confidence - Requires improvement"
                : "Very low confidence - Not suitable for reporting",
      },
      key_totals: keyTotals,
      scope_breakdown: {
        scope1: {
          definition: "Direct emissions from owned or controlled sources",
          examples: [
            "Diesel combustion",
            "N₂O from fertilizer application",
            "Process emissions",
          ],
          current_year: keyTotals.scope1_direct_emissions.value,
          trend: calculateTrend(metrics["GHG Scope 1 (tCO2e)"], years),
          percentage_of_total:
            keyTotals.scope1_direct_emissions.value > 0
              ? (keyTotals.scope1_direct_emissions.value /
                  keyTotals.total_emissions_current_year.value) *
                100
              : 0,
          detailed_sources:
            carbonData?.yearly_data?.find((y) => y.year === currentYear)
              ?.emissions?.scope1?.detailed_sources || [],
        },
        scope2: {
          definition:
            "Indirect emissions from purchased electricity, steam, heating and cooling",
          examples: ["Grid electricity", "Purchased steam", "District heating"],
          current_year: keyTotals.scope2_indirect_energy.value,
          trend: calculateTrend(metrics["GHG Scope 2 (tCO2e)"], years),
          percentage_of_total:
            keyTotals.scope2_indirect_energy.value > 0
              ? (keyTotals.scope2_indirect_energy.value /
                  keyTotals.total_emissions_current_year.value) *
                100
              : 0,
          detailed_sources:
            carbonData?.yearly_data?.find((y) => y.year === currentYear)
              ?.emissions?.scope2?.detailed_sources || [],
        },
        scope3: {
          definition: "All other indirect emissions in the value chain",
          examples: [
            "Fertilizer production",
            "Purchased goods and services",
            "Transportation",
            "Waste disposal",
          ],
          current_year: keyTotals.scope3_value_chain.value,
          trend: calculateTrend(metrics["GHG Scope 3 (tCO2e)"], years),
          percentage_of_total: keyTotals.scope3_percentage_of_total.value,
          categories:
            carbonData?.yearly_data?.find((y) => y.year === currentYear)
              ?.emissions?.scope3?.ghg_protocol_categories || {},
          detailed_categories:
            carbonData?.yearly_data?.find((y) => y.year === currentYear)
              ?.emissions?.scope3?.detailed_categories || [],
        },
      },
      intensity_analysis: {
        carbon_intensity: keyTotals.carbon_intensity.value,
        unit: keyTotals.carbon_intensity.unit,
        benchmark: getIndustryBenchmark(company.industry),
        performance:
          keyTotals.carbon_intensity.value <=
          getIndustryBenchmark(company.industry)
            ? "Better than industry average"
            : "Needs improvement",
        trend:
          carbonData && carbonData.comprehensive_summary
            ? carbonData.comprehensive_summary.trends.total_direction
            : "unknown",
      },
      reduction_targets: {
        current_performance: {
          baseline_year: baselineYear,
          baseline_emissions: baselineTotal,
          current_emissions: currentTotal,
          reduction_achieved: keyTotals.reduction_from_baseline.value,
          annual_reduction_rate:
            years.length > 1
              ? keyTotals.reduction_from_baseline.value /
                (currentYear - baselineYear)
              : 0,
        },
        future_targets: reductionTargets,
        alignment: {
          paris_agreement:
            currentTotal < baselineTotal * 0.7
              ? "On track for 1.5°C"
              : currentTotal < baselineTotal * 0.9
                ? "On track for 2°C"
                : "Not aligned",
          national_contributions: "Check local NDC requirements",
          corporate_commitments: "Consider SBTi validation",
        },
      },
      carbon_emission_accounting: carbonEmissionAccounting,
      emission_metrics: {
        all_metrics: metrics,
        key_metrics_summary: Object.keys(metrics).map((key) => ({
          name: key,
          category: metrics[key].category,
          unit: metrics[key].unit,
          current_value: getMetricValueByYear(metrics[key], currentYear),
          trend: calculateTrend(metrics[key], years),
          years_available: metrics[key].values.map((v) => v.year),
        })),
      },
      graphs: graphs,
      compliance_recommendations: recommendations,
      reporting_requirements: {
        mandatory: getMandatoryReportingRequirements(
          company.country,
          company.industry,
        ),
        voluntary: ["CDP", "TCFD", "GRI", "SASB"],
        deadlines: getReportingDeadlines(currentYear),
        verification_required: currentTotal > 25000, // Example threshold
        penalties_non_compliance:
          "Fines, reputational damage, exclusion from tenders",
      },
      summary: {
        overall_assessment:
          keyTotals.reduction_from_baseline.value > 0
            ? "Emissions reduction progress observed"
            : "Emissions stable or increasing",
        key_achievements: [
          ...(keyTotals.reduction_from_baseline.value > 0
            ? [
                `${keyTotals.reduction_from_baseline.value.toFixed(1)}% reduction from baseline`,
              ]
            : []),
          ...(carbonData
            ? ["Comprehensive carbon accounting implemented"]
            : []),
          ...(years.length >= 3
            ? ["Multiple years of consistent reporting"]
            : []),
        ],
        critical_areas: [
          ...(keyTotals.scope3_percentage_of_total.value > 50
            ? ["High proportion of Scope 3 emissions"]
            : []),
          ...(keyTotals.carbon_intensity.value >
          getIndustryBenchmark(company.industry)
            ? ["Carbon intensity above industry average"]
            : []),
          ...(!carbonData ? ["Limited detailed emission source data"] : []),
        ],
        next_steps: [
          "Implement high-priority reduction measures",
          "Enhance Scope 3 data collection",
          "Consider third-party verification",
          "Set science-based targets",
        ],
        outlook:
          keyTotals.reduction_from_baseline.value > 5
            ? "Positive"
            : keyTotals.reduction_from_baseline.value >= -5
              ? "Neutral"
              : "Concerning",
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve GHG emissions data",
      500,
      "GHG_EMISSIONS_API_ERROR",
      { details: error.message },
    );
  }
}

/**
 * Helper function to get industry benchmark
 */
function getIndustryBenchmark(industry) {
  const benchmarks = {
    "Agriculture & Sugar Production": 50,
    Agriculture: 45,
    "Sugar Production": 55,
    Manufacturing: 100,
    default: 60,
  };

  return benchmarks[industry] || benchmarks.default;
}

/**
 * Helper function to get mandatory reporting requirements
 */
function getMandatoryReportingRequirements(country, industry) {
  const requirements = [];

  if (country === "Zimbabwe") {
    requirements.push("National Climate Change Response Strategy");
    requirements.push("Environmental Management Act regulations");
  }

  if (industry.includes("Agriculture")) {
    requirements.push("Agricultural sector emissions reporting");
  }

  return requirements.length > 0 ? requirements : ["Check local regulations"];
}

/**
 * Helper function to get reporting deadlines
 */
function getReportingDeadlines(currentYear) {
  return {
    cdp: `${currentYear + 1}-07-31`,
    annual_report: `${currentYear + 1}-03-31`,
    sustainability_report: `${currentYear + 1}-06-30`,
    regulatory_submissions: "Check local deadlines",
  };
}

module.exports = {
  getGHGEmissionsData,
};
