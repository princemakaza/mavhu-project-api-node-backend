const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract all environmental metrics by category
 */
async function getMetricsByCategory(companyId, category, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.category": category,
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query).lean();

    // Extract and organize metrics
    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metric.category === category) {
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
      `Error fetching metrics by category: ${error.message}`,
      500,
      "METRICS_FETCH_ERROR",
    );
  }
}

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

    const esgData = await ESGData.find(query).lean();

    // Organize by category
    const metricsByCategory = {
      environmental: {},
      social: {},
      governance: {},
    };

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
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
            // Check if year already exists (avoid duplicates)
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

    // Parse data range years if available
    let dataRangeYears = null;
    if (company.data_range) {
      const ranges = company.data_range.split(",").map((range) => range.trim());
      dataRangeYears = [];

      for (const range of ranges) {
        const match = range.match(/(\d{4})\s*[-–]\s*(\d{4})/);
        if (match) {
          dataRangeYears.push({
            start: parseInt(match[1], 10),
            end: parseInt(match[2], 10),
            original: range,
          });
        } else if (range.match(/^\d{4}$/)) {
          const year = parseInt(range, 10);
          dataRangeYears.push({
            start: year,
            end: year,
            original: year.toString(),
          });
        }
      }
    }

    // Add calculated properties
    const enhancedCompany = {
      ...company,
      metadata: {
        has_area_of_interest: !!(
          company.area_of_interest &&
          company.area_of_interest.coordinates &&
          company.area_of_interest.coordinates.length > 0
        ),
        data_range_parsed: dataRangeYears,
        data_start_year: dataRangeYears
          ? Math.min(...dataRangeYears.map((range) => range.start))
          : null,
        data_end_year: dataRangeYears
          ? Math.max(...dataRangeYears.map((range) => range.end))
          : null,
        has_esg_contact: !!(
          company.esg_contact_person &&
          company.esg_contact_person.name &&
          company.esg_contact_person.email
        ),
      },
      // Format area of interest for better readability
      area_of_interest_formatted: company.area_of_interest
        ? {
            name: company.area_of_interest.name || "Unnamed Area",
            area_covered:
              company.area_of_interest.area_covered || "Not specified",
            coordinates_count: company.area_of_interest.coordinates
              ? company.area_of_interest.coordinates.length
              : 0,
            bounding_box:
              company.area_of_interest.coordinates &&
              company.area_of_interest.coordinates.length > 0
                ? {
                    min_longitude: Math.min(
                      ...company.area_of_interest.coordinates.map(
                        (coord) => coord[0],
                      ),
                    ),
                    max_longitude: Math.max(
                      ...company.area_of_interest.coordinates.map(
                        (coord) => coord[0],
                      ),
                    ),
                    min_latitude: Math.min(
                      ...company.area_of_interest.coordinates.map(
                        (coord) => coord[1],
                      ),
                    ),
                    max_latitude: Math.max(
                      ...company.area_of_interest.coordinates.map(
                        (coord) => coord[1],
                      ),
                    ),
                  }
                : null,
          }
        : null,
    };

    return enhancedCompany;
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
 * Helper function to get Carbon Emission Accounting data with enhanced query
 */
async function getCarbonEmissionAccountingData(companyId, year = null) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      status: { $in: ["draft", "under_review", "approved", "published"] }, // Include draft status for development
    };

    const carbonData = await CarbonEmissionAccounting.findOne(query)
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) {
      console.log(`No carbon data found for company: ${companyId}`);
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

    // Calculate SOC and sequestration from monthly data if available
    const enhancedYearlyData = filteredYearlyData.map((yearData) => {
      const enhancedData = { ...yearData };

      // Calculate SOC and sequestration from monthly data
      if (yearData.sequestration && yearData.sequestration.monthly_data) {
        const monthlyData = yearData.sequestration.monthly_data;

        // Calculate average SOC for the year
        const validSocValues = monthlyData
          .filter(
            (month) =>
              month.soc_tc_per_ha !== null && month.soc_tc_per_ha !== undefined,
          )
          .map((month) => month.soc_tc_per_ha);

        if (validSocValues.length > 0) {
          enhancedData.calculated_soc = {
            average_tc_per_ha:
              validSocValues.reduce((a, b) => a + b, 0) / validSocValues.length,
            min_tc_per_ha: Math.min(...validSocValues),
            max_tc_per_ha: Math.max(...validSocValues),
            month_count: validSocValues.length,
          };
        }

        // Calculate sequestration rates
        const validSequestration = monthlyData
          .filter(
            (month) =>
              month.delta_soc_co2_t !== null &&
              month.delta_soc_co2_t !== undefined,
          )
          .map((month) => month.delta_soc_co2_t);

        if (validSequestration.length > 0) {
          enhancedData.calculated_sequestration = {
            total_delta_co2_t: validSequestration.reduce((a, b) => a + b, 0),
            average_monthly_delta_co2_t:
              validSequestration.reduce((a, b) => a + b, 0) /
              validSequestration.length,
            sequestration_rate_tco2_per_ha_per_year: yearData.sequestration
              .soc_area_ha
              ? validSequestration.reduce((a, b) => a + b, 0) /
                yearData.sequestration.soc_area_ha
              : null,
          };
        }

        // Calculate NDVI/NDWI-based indicators if available
        const validNdviValues = monthlyData
          .filter(
            (month) => month.ndvi_max !== null && month.ndvi_max !== undefined,
          )
          .map((month) => month.ndvi_max);

        if (validNdviValues.length > 0) {
          enhancedData.vegetation_indicators = {
            average_ndvi:
              validNdviValues.reduce((a, b) => a + b, 0) /
              validNdviValues.length,
            max_ndvi: Math.max(...validNdviValues),
            min_ndvi: Math.min(...validNdviValues),
            ndvi_variance: calculateVariance(validNdviValues),
          };
        }

        // Calculate carbon stock indicators
        const validCarbonStock = monthlyData
          .filter(
            (month) =>
              month.soc_co2_t_per_ha !== null &&
              month.soc_co2_t_per_ha !== undefined,
          )
          .map((month) => month.soc_co2_t_per_ha);

        if (validCarbonStock.length > 0) {
          enhancedData.carbon_stock_indicators = {
            average_co2_per_ha:
              validCarbonStock.reduce((a, b) => a + b, 0) /
              validCarbonStock.length,
            min_co2_per_ha: Math.min(...validCarbonStock),
            max_co2_per_ha: Math.max(...validCarbonStock),
            month_count: validCarbonStock.length,
          };
        }
      }

      return enhancedData;
    });

    // Calculate or use existing summary
    const summary =
      carbonData.summary || calculateCarbonSummary(enhancedYearlyData);

    return {
      ...carbonData,
      yearly_data: enhancedYearlyData,
      summary: summary,
      // Add emission references details
      emission_references: carbonData.emission_references || {},
      // Add framework details
      framework: carbonData.framework || {},
    };
  } catch (error) {
    console.error("Error fetching carbon emission accounting data:", error);
    throw new AppError(
      `Error fetching carbon emission accounting data: ${error.message}`,
      500,
      "CARBON_DATA_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to calculate variance
 */
function calculateVariance(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((value) => Math.pow(value - mean, 2));
  return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Helper function to calculate carbon summary from yearly data
 */
function calculateCarbonSummary(yearlyData) {
  if (!yearlyData || yearlyData.length === 0) return null;

  const years = yearlyData.map((d) => d.year);
  const sequestrationValues = yearlyData.map(
    (d) => d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
  );
  const emissionValues = yearlyData.map(
    (d) => d.emissions?.total_scope_emission_tco2e || 0,
  );

  // Calculate areas
  const areas = yearlyData
    .filter((d) => d.sequestration?.soc_area_ha)
    .map((d) => d.sequestration.soc_area_ha);
  const avgArea =
    areas.length > 0 ? areas.reduce((a, b) => a + b, 0) / areas.length : 0;

  const totalSequestration = sequestrationValues.reduce((a, b) => a + b, 0);
  const totalEmissions = emissionValues.reduce((a, b) => a + b, 0);

  return {
    total_reporting_area_ha: avgArea,
    average_sequestration_tco2_per_year:
      sequestrationValues.length > 0
        ? totalSequestration / sequestrationValues.length
        : 0,
    average_emissions_tco2e_per_year:
      emissionValues.length > 0 ? totalEmissions / emissionValues.length : 0,
    net_carbon_balance_tco2e: totalSequestration - totalEmissions,
    carbon_intensity_tco2e_per_ha: avgArea > 0 ? totalEmissions / avgArea : 0,
    baseline_year: Math.min(...years),
    current_year: Math.max(...years),
    total_sequestration_tco2: totalSequestration,
    total_emissions_tco2e: totalEmissions,
    sequestration_per_ha: avgArea > 0 ? totalSequestration / avgArea : 0,
  };
}

/**
 * Helper function to calculate confidence score
 */
function calculateConfidenceScore(carbonData, esgMetrics) {
  let score = 50; // Base score

  // Data completeness (0-30 points)
  if (carbonData) {
    score += 20;

    // Check data quality
    const yearlyData = carbonData.yearly_data || [];
    if (yearlyData.length > 0) {
      score += 10;

      // Check verification status
      const verifiedYears = yearlyData.filter(
        (yearData) =>
          yearData.data_quality?.verification_status === "verified" ||
          yearData.data_quality?.verification_status === "audited",
      ).length;

      score += (verifiedYears / yearlyData.length) * 15;
    }
  }

  // ESG metrics coverage (0-20 points)
  const environmentalMetrics = Object.keys(
    esgMetrics.environmental || {},
  ).length;

  if (environmentalMetrics > 5) score += 10;
  if (environmentalMetrics > 10) score += 10;

  // Temporal coverage (0-15 points)
  if (carbonData?.yearly_data?.length >= 3) score += 15;
  else if (carbonData?.yearly_data?.length >= 2) score += 10;
  else if (carbonData?.yearly_data?.length >= 1) score += 5;

  // Monthly data availability (0-15 points)
  if (
    carbonData?.yearly_data?.some(
      (y) => y.sequestration?.monthly_data?.length >= 6,
    )
  ) {
    score += 15;
  } else if (
    carbonData?.yearly_data?.some(
      (y) => y.sequestration?.monthly_data?.length >= 3,
    )
  ) {
    score += 10;
  }

  // Cap at 100
  return Math.min(Math.round(score), 100);
}

/**
 * Helper function to calculate soil health indicators from carbon data
 */
function calculateSoilHealthIndicators(carbonData, year) {
  const indicators = {
    soilOrganicCarbon: {
      value: null,
      unit: "tC/ha",
      trend: "unknown",
      confidence: "medium",
      monthly_data: [],
      annual_trend: null,
    },
    carbonStock: {
      value: null,
      unit: "tCO2/ha",
      trend: "unknown",
      permanence: "unknown",
      monthly_data: [],
      variance: null,
    },
    sequestrationRate: {
      value: null,
      unit: "tCO2/ha/year",
      trend: "unknown",
      monthly_data: [],
      annual_total: null,
    },
    vegetationHealth: {
      average_ndvi: null,
      ndvi_trend: "unknown",
      monthly_data: [],
      classification: null,
    },
    carbonPermanence: {
      score: null,
      rating: "unknown",
      factors: [],
      risk_level: "medium",
    },
  };

  if (
    !carbonData ||
    !carbonData.yearly_data ||
    carbonData.yearly_data.length === 0
  ) {
    return indicators;
  }

  // Get data for specific year or latest year
  let yearData;
  if (year) {
    yearData = carbonData.yearly_data.find((data) => data.year === year);
  } else {
    // Get latest year
    const latestYear = Math.max(...carbonData.yearly_data.map((d) => d.year));
    yearData = carbonData.yearly_data.find((data) => data.year === latestYear);
  }

  if (!yearData) return indicators;

  // Extract SOC data from monthly data
  const monthlyData = yearData.sequestration?.monthly_data || [];
  if (monthlyData.length > 0) {
    // Sort monthly data by month number
    const sortedMonthlyData = [...monthlyData].sort(
      (a, b) => (a.month_number || 0) - (b.month_number || 0),
    );

    // Extract SOC values
    const socValues = sortedMonthlyData
      .filter(
        (month) =>
          month.soc_tc_per_ha !== null && month.soc_tc_per_ha !== undefined,
      )
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.soc_tc_per_ha,
      }));

    // Extract carbon stock values
    const carbonStockValues = sortedMonthlyData
      .filter(
        (month) =>
          month.soc_co2_t_per_ha !== null &&
          month.soc_co2_t_per_ha !== undefined,
      )
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.soc_co2_t_per_ha,
      }));

    // Extract sequestration rates
    const sequestrationValues = sortedMonthlyData
      .filter(
        (month) =>
          month.delta_soc_co2_t !== null && month.delta_soc_co2_t !== undefined,
      )
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.delta_soc_co2_t,
      }));

    // Extract NDVI values
    const ndviValues = sortedMonthlyData
      .filter(
        (month) => month.ndvi_max !== null && month.ndvi_max !== undefined,
      )
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.ndvi_max,
      }));

    // Set indicators with latest month data
    if (socValues.length > 0) {
      const latestSoc = socValues[socValues.length - 1];
      indicators.soilOrganicCarbon.value = latestSoc.value;
      indicators.soilOrganicCarbon.monthly_data = socValues;

      // Calculate trend from monthly data
      if (socValues.length >= 2) {
        const firstValue = socValues[0].value;
        const lastValue = socValues[socValues.length - 1].value;
        const change = calculatePercentageChange(firstValue, lastValue);
        indicators.soilOrganicCarbon.trend =
          change > 2 ? "improving" : change < -2 ? "declining" : "stable";
        indicators.soilOrganicCarbon.annual_trend = change;
      }
    }

    if (carbonStockValues.length > 0) {
      const latestStock = carbonStockValues[carbonStockValues.length - 1];
      indicators.carbonStock.value = latestStock.value;
      indicators.carbonStock.monthly_data = carbonStockValues;
      indicators.carbonStock.variance = calculateVariance(
        carbonStockValues.map((v) => v.value),
      );

      // Calculate trend and permanence
      if (carbonStockValues.length >= 3) {
        const values = carbonStockValues.map((v) => v.value);
        const firstValue = values[0];
        const lastValue = values[values.length - 1];
        const change = calculatePercentageChange(firstValue, lastValue);
        indicators.carbonStock.trend =
          change > 2 ? "improving" : change < -2 ? "declining" : "stable";

        // Calculate permanence based on variance and trend
        const variance = indicators.carbonStock.variance;
        if (variance < 5 && change > 0) {
          indicators.carbonStock.permanence = "high";
          indicators.carbonPermanence.score = 85;
          indicators.carbonPermanence.rating = "high";
          indicators.carbonPermanence.risk_level = "low";
        } else if (variance < 15 && change >= 0) {
          indicators.carbonStock.permanence = "medium";
          indicators.carbonPermanence.score = 65;
          indicators.carbonPermanence.rating = "medium";
          indicators.carbonPermanence.risk_level = "medium";
        } else {
          indicators.carbonStock.permanence = "low";
          indicators.carbonPermanence.score = 40;
          indicators.carbonPermanence.rating = "low";
          indicators.carbonPermanence.risk_level = "high";
        }

        indicators.carbonPermanence.factors = [
          variance < 10
            ? "Low monthly variance"
            : "Moderate to high monthly variance",
          change > 0 ? "Positive annual trend" : "Negative or stable trend",
          carbonStockValues.length >= 6
            ? "Adequate data points"
            : "Limited data points",
        ];
      }
    }

    if (sequestrationValues.length > 0) {
      // Calculate annual sequestration rate
      const totalSequestration = sequestrationValues.reduce(
        (sum, item) => sum + item.value,
        0,
      );
      const socArea = yearData.sequestration?.soc_area_ha || 1; // Avoid division by zero
      indicators.sequestrationRate.value = totalSequestration / socArea;
      indicators.sequestrationRate.monthly_data = sequestrationValues;
      indicators.sequestrationRate.annual_total = totalSequestration;

      // Calculate trend
      if (sequestrationValues.length >= 2) {
        const firstHalf = sequestrationValues.slice(
          0,
          Math.floor(sequestrationValues.length / 2),
        );
        const secondHalf = sequestrationValues.slice(
          Math.floor(sequestrationValues.length / 2),
        );
        const avgFirst =
          firstHalf.reduce((sum, item) => sum + item.value, 0) /
          firstHalf.length;
        const avgSecond =
          secondHalf.reduce((sum, item) => sum + item.value, 0) /
          secondHalf.length;
        const change = calculatePercentageChange(avgFirst, avgSecond);
        indicators.sequestrationRate.trend =
          change > 5 ? "improving" : change < -5 ? "declining" : "stable";
      }
    }

    if (ndviValues.length > 0) {
      const latestNdvi = ndviValues[ndviValues.length - 1];
      const avgNdvi =
        ndviValues.reduce((sum, item) => sum + item.value, 0) /
        ndviValues.length;

      indicators.vegetationHealth.average_ndvi = avgNdvi;
      indicators.vegetationHealth.monthly_data = ndviValues;

      // Classify vegetation health
      if (avgNdvi > 0.6) {
        indicators.vegetationHealth.classification = "Excellent";
      } else if (avgNdvi > 0.4) {
        indicators.vegetationHealth.classification = "Good";
      } else if (avgNdvi > 0.2) {
        indicators.vegetationHealth.classification = "Moderate";
      } else {
        indicators.vegetationHealth.classification = "Poor";
      }

      // Calculate NDVI trend
      if (ndviValues.length >= 2) {
        const firstValue = ndviValues[0].value;
        const lastValue = ndviValues[ndviValues.length - 1].value;
        const change = calculatePercentageChange(firstValue, lastValue);
        indicators.vegetationHealth.ndvi_trend =
          change > 5 ? "improving" : change < -5 ? "declining" : "stable";
      }
    }
  }

  return indicators;
}

/**
 * Helper function to predict carbon sequestration for credits
 */
function predictCarbonSequestration(
  carbonData,
  soilHealthIndicators,
  yearsToPredict = 5,
) {
  if (
    !carbonData ||
    !carbonData.yearly_data ||
    carbonData.yearly_data.length < 2
  ) {
    return null;
  }

  const yearlyData = carbonData.yearly_data;
  const latestYear = Math.max(...yearlyData.map((d) => d.year));

  // Get sequestration rates from last 3 years
  const recentYears = yearlyData
    .filter((d) => d.year >= latestYear - 2)
    .sort((a, b) => b.year - a.year);

  if (recentYears.length < 2) return null;

  // Calculate average sequestration rate
  const sequestrationRates = recentYears
    .map((yearData) => {
      const totalSequestration =
        yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0;
      const area = yearData.sequestration?.soc_area_ha || 1;
      return totalSequestration / area;
    })
    .filter((rate) => rate > 0);

  if (sequestrationRates.length === 0) return null;

  const avgSequestrationRate =
    sequestrationRates.reduce((a, b) => a + b, 0) / sequestrationRates.length;
  const latestArea = recentYears[0].sequestration?.soc_area_ha || 1;

  // Calculate trend
  let annualGrowthRate = 0;
  if (sequestrationRates.length >= 2) {
    const oldestRate = sequestrationRates[sequestrationRates.length - 1];
    const latestRate = sequestrationRates[0];
    annualGrowthRate =
      calculatePercentageChange(oldestRate, latestRate) /
      (sequestrationRates.length - 1);
  }

  // Predict future sequestration
  const predictions = [];
  for (let i = 1; i <= yearsToPredict; i++) {
    const year = latestYear + i;
    const predictedRate =
      avgSequestrationRate * Math.pow(1 + annualGrowthRate / 100, i);
    const predictedTotal = predictedRate * latestArea;

    // Calculate carbon credits (1 credit = 1 ton CO2)
    const predictedCredits = Math.max(0, predictedTotal);

    // Estimate credit value (conservative estimate)
    const creditValueUSD = predictedCredits * 15; // $15 per credit

    predictions.push({
      year: year,
      sequestration_rate_tco2_per_ha: predictedRate,
      total_sequestration_tco2: predictedTotal,
      carbon_credits: predictedCredits,
      credit_value_usd: creditValueUSD,
      confidence: annualGrowthRate !== 0 ? "medium" : "low",
      assumptions: [
        `Constant land area of ${latestArea} ha`,
        annualGrowthRate > 0
          ? `Annual growth rate of ${annualGrowthRate.toFixed(2)}%`
          : "Stable sequestration rate",
        soilHealthIndicators.carbonStock.permanence === "high"
          ? "High carbon permanence"
          : "Standard permanence",
        "No major land use changes",
      ],
    });
  }

  return {
    baseline_year: latestYear,
    baseline_sequestration_rate: avgSequestrationRate,
    annual_growth_rate_percent: annualGrowthRate,
    projected_area_ha: latestArea,
    predictions: predictions,
    methodology:
      "Linear projection based on historical sequestration rates with adjustment for permanence",
    eligibility_criteria: {
      minimum_permanence: soilHealthIndicators.carbonStock.permanence !== "low",
      minimum_monitoring: yearlyData.some(
        (y) => y.sequestration?.monthly_data?.length >= 6,
      ),
      verification_status: yearlyData.some(
        (y) => y.data_quality?.verification_status === "verified",
      ),
      positive_sequestration: avgSequestrationRate > 0,
    },
    total_potential_credits: predictions.reduce(
      (sum, p) => sum + p.carbon_credits,
      0,
    ),
    total_potential_value_usd: predictions.reduce(
      (sum, p) => sum + p.credit_value_usd,
      0,
    ),
  };
}

/**
 * Helper function to monitor soil degradation/regeneration
 */
function monitorSoilDegradation(carbonData, esgMetrics, currentYear) {
  const indicators = {
    degradation_status: "unknown",
    regeneration_status: "unknown",
    risk_factors: [],
    improvement_opportunities: [],
    degradation_score: 0, // 0-100, higher is worse
    regeneration_potential: 0, // 0-100, higher is better
  };

  if (!carbonData || !carbonData.yearly_data) return indicators;

  const yearlyData = carbonData.yearly_data;
  const latestYear = Math.max(...yearlyData.map((d) => d.year));
  const latestData = yearlyData.find((d) => d.year === latestYear);

  if (!latestData) return indicators;

  // Analyze soil health indicators
  const socTrend = latestData.calculated_soc
    ? latestData.calculated_soc.average_tc_per_ha > 20
      ? "healthy"
      : "at_risk"
    : "unknown";

  const ndviStatus = latestData.vegetation_indicators
    ? latestData.vegetation_indicators.average_ndvi > 0.4
      ? "healthy"
      : "degraded"
    : "unknown";

  // Check for degradation risk factors
  const riskFactors = [];
  const improvements = [];

  if (socTrend === "at_risk") {
    riskFactors.push("Low soil organic carbon (< 20 tC/ha)");
    improvements.push("Implement cover cropping and organic amendments");
  }

  if (ndviStatus === "degraded") {
    riskFactors.push("Poor vegetation health (NDVI < 0.4)");
    improvements.push("Improve vegetation cover through agroforestry");
  }

  // Check erosion indicators from ESG metrics if available
  const erosionMetric = esgMetrics.environmental?.["Soil Erosion (tons/ha)"];
  if (erosionMetric) {
    const erosionValue = getMetricValueByYear(erosionMetric, currentYear);
    if (erosionValue && erosionValue > 5) {
      riskFactors.push(`High soil erosion (${erosionValue} tons/ha)`);
      improvements.push(
        "Implement erosion control measures (contouring, terraces)",
      );
    }
  }

  // Calculate degradation score
  let score = 50;
  if (socTrend === "at_risk") score += 20;
  if (ndviStatus === "degraded") score += 20;
  if (riskFactors.length > 2) score += 10;

  // Calculate regeneration potential
  let regenerationScore = 50;
  if (latestData.sequestration?.monthly_data?.length >= 6)
    regenerationScore += 20;
  if (latestData.data_quality?.verification_status === "verified")
    regenerationScore += 15;
  if (improvements.length > 0) regenerationScore += 15;

  indicators.degradation_status =
    score >= 70 ? "high_risk" : score >= 50 ? "moderate_risk" : "low_risk";
  indicators.regeneration_status =
    regenerationScore >= 70
      ? "high"
      : regenerationScore >= 50
        ? "medium"
        : "low";
  indicators.risk_factors = riskFactors;
  indicators.improvement_opportunities = improvements;
  indicators.degradation_score = Math.min(score, 100);
  indicators.regeneration_potential = Math.min(regenerationScore, 100);

  return indicators;
}

/**
 * Helper function to generate comprehensive graphs (5 key graphs)
 */
/**
 * Helper function to generate comprehensive graphs (5 key graphs)
 */
function generateKeyGraphs(
  allCarbonData, // Always pass all years data here
  carbonDataForYear, // Year-filtered data for other graphs
  esgMetrics,
  soilHealthIndicators,
  currentYear,
  years,
) {
  const allGraphs = {};

  // 1. SOC Trend over time (Soil Health) - ALWAYS use all years data for trend
  if (allCarbonData?.yearly_data?.length > 0) {
    const socYears = allCarbonData.yearly_data
      .filter((d) => d.calculated_soc?.average_tc_per_ha)
      .map((d) => d.year);

    if (socYears.length > 0) {
      allGraphs.soc_trend = {
        type: "line",
        title: "Soil Organic Carbon Trend",
        description:
          "Trend of soil organic carbon stock over time - Key indicator of soil health",
        labels: socYears,
        datasets: [
          {
            label: "Average SOC (tC/ha)",
            data: allCarbonData.yearly_data
              .filter((d) => d.calculated_soc?.average_tc_per_ha)
              .sort((a, b) => a.year - b.year) // Ensure chronological order
              .map((d) => d.calculated_soc.average_tc_per_ha),
            borderColor: "#27ae60",
            backgroundColor: "rgba(39, 174, 96, 0.1)",
            fill: true,
            tension: 0.4,
          },
        ],
        interpretation:
          "Higher SOC indicates better soil health and carbon storage capacity",
        data_period: `${socYears[0]} - ${socYears[socYears.length - 1]}`,
        note: "Shows multi-year trend regardless of selected year",
      };
    }
  }

  // 2. Carbon Balance (Sequestration vs Emissions) - Use all years data
  if (allCarbonData?.yearly_data?.length > 0) {
    const balanceYears = allCarbonData.yearly_data
      .sort((a, b) => a.year - b.year)
      .map((d) => d.year);

    const sequestrationData = allCarbonData.yearly_data
      .sort((a, b) => a.year - b.year)
      .map(
        (d) => d.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
      );

    const emissionData = allCarbonData.yearly_data
      .sort((a, b) => a.year - b.year)
      .map((d) => d.emissions?.total_scope_emission_tco2e || 0);

    if (
      sequestrationData.some((v) => v > 0) ||
      emissionData.some((v) => v > 0)
    ) {
      allGraphs.carbon_balance = {
        type: "bar",
        title: "Carbon Balance Analysis",
        description:
          "Sequestration vs Emissions - Critical for net carbon accounting",
        labels: balanceYears,
        datasets: [
          {
            label: "Sequestration (tCO₂)",
            data: sequestrationData,
            backgroundColor: "#27ae60",
            stack: "Stack 0",
          },
          {
            label: "Emissions (tCO₂e)",
            data: emissionData,
            backgroundColor: "#e74c3c",
            stack: "Stack 1",
          },
        ],
        interpretation:
          "Positive net balance indicates carbon sink; negative indicates source",
      };
    }
  }

  // 3. GHG Emissions Breakdown by Scope - Use current year data
  const scope1Data = esgMetrics.environmental?.["GHG Scope 1 (tCO2e)"];
  const scope2Data = esgMetrics.environmental?.["GHG Scope 2 (tCO2e)"];
  const scope3Data = esgMetrics.environmental?.["GHG Scope 3 (tCO2e)"];

  if (scope1Data || scope2Data || scope3Data) {
    const scope1Value = getMetricValueByYear(scope1Data, currentYear) || 0;
    const scope2Value = getMetricValueByYear(scope2Data, currentYear) || 0;
    const scope3Value = getMetricValueByYear(scope3Data, currentYear) || 0;

    if (scope1Value > 0 || scope2Value > 0 || scope3Value > 0) {
      allGraphs.emissions_breakdown = {
        type: "doughnut",
        title: "GHG Emissions by Scope",
        description:
          "Current year emissions composition - Essential for reduction strategies",
        labels: [
          "Scope 1 (Direct)",
          "Scope 2 (Indirect Energy)",
          "Scope 3 (Other Indirect)",
        ],
        datasets: [
          {
            data: [scope1Value, scope2Value, scope3Value],
            backgroundColor: ["#e74c3c", "#f39c12", "#3498db"],
            borderWidth: 2,
          },
        ],
        interpretation:
          "Scope 1 emissions are direct emissions from owned/controlled sources",
      };
    }
  }

  // 4. Monthly SOC Variation - Use year-filtered data
  if (carbonDataForYear) {
    const currentYearData = carbonDataForYear.yearly_data?.find(
      (y) => y.year === currentYear,
    );
    if (currentYearData?.sequestration?.monthly_data?.length > 0) {
      const monthlyData = currentYearData.sequestration.monthly_data
        .filter(
          (m) => m.soc_tc_per_ha !== null && m.soc_tc_per_ha !== undefined,
        )
        .sort((a, b) => (a.month_number || 0) - (b.month_number || 0));

      if (monthlyData.length > 0) {
        allGraphs.monthly_soc = {
          type: "line",
          title: `Monthly Soil Organic Carbon - ${currentYear}`,
          description:
            "Monthly variation in SOC - Important for permanence assessment",
          labels: monthlyData.map((m) => m.month),
          datasets: [
            {
              label: "SOC (tC/ha)",
              data: monthlyData.map((m) => m.soc_tc_per_ha),
              borderColor: "#2ecc71",
              backgroundColor: "rgba(46, 204, 113, 0.1)",
              fill: true,
              tension: 0.4,
            },
          ],
          interpretation:
            "Seasonal variation shows natural fluctuations; consistent trends indicate permanence",
        };
      }
    }
  }

  // 5. Vegetation Health (NDVI) Trend - ALWAYS use all years data for trend
  if (
    allCarbonData?.yearly_data?.some(
      (y) => y.vegetation_indicators?.average_ndvi,
    )
  ) {
    const ndviYears = allCarbonData.yearly_data
      .filter((y) => y.vegetation_indicators?.average_ndvi)
      .sort((a, b) => a.year - b.year)
      .map((d) => d.year);

    if (ndviYears.length > 0) {
      allGraphs.ndvi_trend = {
        type: "line",
        title: "Vegetation Health (NDVI) Trend",
        description:
          "Average NDVI values over time - Indicator of ecosystem health",
        labels: ndviYears,
        datasets: [
          {
            label: "Average NDVI",
            data: allCarbonData.yearly_data
              .filter((y) => y.vegetation_indicators?.average_ndvi)
              .sort((a, b) => a.year - b.year)
              .map((y) => y.vegetation_indicators.average_ndvi),
            borderColor: "#1abc9c",
            backgroundColor: "rgba(26, 188, 156, 0.1)",
            fill: true,
            tension: 0.4,
          },
        ],
        interpretation:
          "NDVI > 0.4 indicates healthy vegetation; trends show ecosystem changes",
        data_period: `${ndviYears[0]} - ${ndviYears[ndviYears.length - 1]}`,
        note: "Shows multi-year trend regardless of selected year",
      };
    }
  }

  // Select top 5 graphs based on priority
  const priorityOrder = [
    "soc_trend", // Primary soil health indicator (multi-year)
    "carbon_balance", // Net carbon accounting (multi-year)
    "emissions_breakdown", // Emission sources (current year)
    "monthly_soc", // Permanence monitoring (current year)
    "ndvi_trend", // Ecosystem health (multi-year)
  ];

  const selectedGraphs = {};
  let count = 0;

  for (const key of priorityOrder) {
    if (allGraphs[key] && count < 5) {
      selectedGraphs[key] = allGraphs[key];
      count++;
    }
  }

  return selectedGraphs;
}

/**
 * Helper function to calculate trends over multiple years
 */
function calculateMultiYearTrend(allCarbonData, metricType) {
  if (!allCarbonData?.yearly_data || allCarbonData.yearly_data.length < 2) {
    return "stable";
  }

  const yearlyData = allCarbonData.yearly_data.sort((a, b) => a.year - b.year);

  let firstValue = null;
  let lastValue = null;

  if (metricType === "soc") {
    const socData = yearlyData.filter(
      (d) => d.calculated_soc?.average_tc_per_ha,
    );
    if (socData.length < 2) return "stable";

    firstValue = socData[0].calculated_soc.average_tc_per_ha;
    lastValue = socData[socData.length - 1].calculated_soc.average_tc_per_ha;
  } else if (metricType === "ndvi") {
    const ndviData = yearlyData.filter(
      (d) => d.vegetation_indicators?.average_ndvi,
    );
    if (ndviData.length < 2) return "stable";

    firstValue = ndviData[0].vegetation_indicators.average_ndvi;
    lastValue =
      ndviData[ndviData.length - 1].vegetation_indicators.average_ndvi;
  } else if (metricType === "sequestration") {
    const seqData = yearlyData.filter(
      (d) =>
        d.calculated_sequestration?.sequestration_rate_tco2_per_ha_per_year,
    );
    if (seqData.length < 2) return "stable";

    firstValue =
      seqData[0].calculated_sequestration
        .sequestration_rate_tco2_per_ha_per_year;
    lastValue =
      seqData[seqData.length - 1].calculated_sequestration
        .sequestration_rate_tco2_per_ha_per_year;
  } else if (metricType === "emissions") {
    const emissionsData = yearlyData.filter(
      (d) => d.emissions?.total_scope_emission_tco2e,
    );
    if (emissionsData.length < 2) return "stable";

    firstValue = emissionsData[0].emissions.total_scope_emission_tco2e;
    lastValue =
      emissionsData[emissionsData.length - 1].emissions
        .total_scope_emission_tco2e;
  }

  if (firstValue === null || lastValue === null || firstValue === 0) {
    return "stable";
  }

  const change = ((lastValue - firstValue) / firstValue) * 100;

  if (metricType === "emissions") {
    // For emissions, decreasing is better
    return change < -5 ? "improving" : change > 5 ? "declining" : "stable";
  } else {
    // For SOC, NDVI, sequestration, increasing is better
    return change > 5 ? "improving" : change < -5 ? "declining" : "stable";
  }
}

/**
 * Helper function to get soil health trend from multi-year data
 */
function calculateSoilHealthTrend(allCarbonData) {
  if (!allCarbonData?.yearly_data || allCarbonData.yearly_data.length < 2) {
    return "stable";
  }

  const yearlyData = allCarbonData.yearly_data.sort((a, b) => a.year - b.year);

  // Calculate trend from multiple indicators
  const socTrend = calculateMultiYearTrend(allCarbonData, "soc");
  const sequestrationTrend = calculateMultiYearTrend(
    allCarbonData,
    "sequestration",
  );
  const ndviTrend = calculateMultiYearTrend(allCarbonData, "ndvi");

  // Weighted decision: SOC is most important, followed by sequestration, then NDVI
  let improvingCount = 0;
  let decliningCount = 0;

  if (socTrend === "improving") improvingCount += 3;
  else if (socTrend === "declining") decliningCount += 3;

  if (sequestrationTrend === "improving") improvingCount += 2;
  else if (sequestrationTrend === "declining") decliningCount += 2;

  if (ndviTrend === "improving") improvingCount += 1;
  else if (ndviTrend === "declining") decliningCount += 1;

  if (improvingCount > decliningCount) return "improving";
  if (decliningCount > improvingCount) return "declining";
  return "stable";
}

/**
 * 1. Soil Health & Carbon Quality API
 * Quantifies soil organic carbon, soil health trends, and carbon permanence
 * to support sequestration claims and regenerative agriculture outcomes.
 * Monitors soil degradation/regeneration; predicts sequestration for carbon credits.
 */
async function getSoilHealthCarbonQualityData(companyId, year = null) {
  try {
    // Get company details with enhanced information
    const company = await getEnhancedCompanyDetails(companyId);

    // Get ALL Carbon Emission Accounting data (complete dataset) - for multi-year trends
    const allCarbonData = await getCarbonEmissionAccountingData(
      companyId,
      null,
    );

    // Get year-specific Carbon Emission Accounting data (if year specified)
    const carbonDataForYear = year
      ? await getCarbonEmissionAccountingData(companyId, year)
      : allCarbonData;

    // Get ALL ESG metrics (all categories, not just environmental)
    const allESGMetrics = await getAllESGMetrics(companyId, year ? [year] : []);

    // Get just environmental metrics for specific calculations
    const environmentalMetrics = allESGMetrics.environmental || {};

    // Get unique years from data
    const yearsFromESG = getUniqueYearsFromMetrics(environmentalMetrics, year);
    const yearsFromCarbon =
      allCarbonData?.yearly_data?.map((d) => d.year) || [];
    const allYears = Array.from(
      new Set([...yearsFromESG, ...yearsFromCarbon]),
    ).sort();

    if (allYears.length === 0 && !allCarbonData) {
      throw new AppError(
        "No soil health and carbon quality data available",
        404,
        "NO_DATA_AVAILABLE",
      );
    }

    const currentYear =
      year ||
      (allYears.length > 0
        ? Math.max(...allYears)
        : allCarbonData?.yearly_data?.length > 0
          ? Math.max(...allCarbonData.yearly_data.map((d) => d.year))
          : null);

    // Calculate soil health indicators from year-specific data
    const soilHealthIndicators = calculateSoilHealthIndicators(
      carbonDataForYear,
      currentYear,
    );

    // Calculate confidence score using all data
    const confidenceScore = calculateConfidenceScore(
      allCarbonData,
      allESGMetrics,
    );

    // Predict carbon sequestration for credits using all data
    const sequestrationPrediction = predictCarbonSequestration(
      allCarbonData,
      soilHealthIndicators,
      5,
    );

    // Monitor soil degradation/regeneration using all data
    const soilDegradationAnalysis = monitorSoilDegradation(
      allCarbonData,
      allESGMetrics,
      currentYear,
    );

    // Generate comprehensive graphs (5 key graphs)
    // Pass both allCarbonData (for multi-year trends) and carbonDataForYear (for year-specific graphs)
    const graphs = generateKeyGraphs(
      allCarbonData, // For multi-year trend graphs
      carbonDataForYear, // For year-specific graphs
      allESGMetrics,
      soilHealthIndicators,
      currentYear,
      allYears,
    );

    // Prepare enhanced carbon emission accounting response using year-specific data
    const carbonEmissionResponse = carbonDataForYear
      ? {
          framework: carbonDataForYear.framework || {},
          summary: carbonDataForYear.summary || {},
          methodology:
            carbonDataForYear.emission_references?.methodology_statement,
          emission_factors:
            carbonDataForYear.emission_references?.emission_factors || [],
          global_warming_potentials:
            carbonDataForYear.emission_references?.global_warming_potentials ||
            {},
          conversion_factors:
            carbonDataForYear.emission_references?.conversion_factors || {},
          yearly_data_summary:
            carbonDataForYear.yearly_data?.map((yearData) => ({
              year: yearData.year,
              sequestration: {
                reporting_area_ha: yearData.sequestration?.reporting_area_ha,
                soc_area_ha: yearData.sequestration?.soc_area_ha,
                monthly_data_count:
                  yearData.sequestration?.monthly_data?.length || 0,
                annual_total_tco2:
                  yearData.sequestration?.annual_summary
                    ?.sequestration_total_tco2,
                calculated_soc: yearData.calculated_soc,
                calculated_sequestration: yearData.calculated_sequestration,
                vegetation_indicators: yearData.vegetation_indicators,
                carbon_stock_indicators: yearData.carbon_stock_indicators,
              },
              emissions: {
                scope1_sources:
                  yearData.emissions?.scope1?.sources?.length || 0,
                scope1_total_tco2e: yearData.emissions?.scope1?.total_tco2e,
                scope2_sources:
                  yearData.emissions?.scope2?.sources?.length || 0,
                scope2_total_tco2e: yearData.emissions?.scope2?.total_tco2e,
                scope3_categories:
                  yearData.emissions?.scope3?.categories?.length || 0,
                scope3_total_tco2e: yearData.emissions?.scope3?.total_tco2e,
                total_emissions_tco2e:
                  yearData.emissions?.total_scope_emission_tco2e,
              },
              data_quality: yearData.data_quality,
            })) || [],
          area_coverage: {
            reporting_area_ha:
              carbonDataForYear.summary?.total_reporting_area_ha,
            soc_area_ha:
              carbonDataForYear.yearly_data?.[
                carbonDataForYear.yearly_data.length - 1
              ]?.sequestration?.soc_area_ha,
          },
          // Include detailed monthly data for current year if requested
          detailed_monthly_data:
            year &&
            carbonDataForYear.yearly_data?.find((y) => y.year === year)
              ?.sequestration?.monthly_data
              ? carbonDataForYear.yearly_data
                  .find((y) => y.year === year)
                  .sequestration.monthly_data.sort(
                    (a, b) => (a.month_number || 0) - (b.month_number || 0),
                  )
                  .map((month) => ({
                    month: month.month,
                    month_number: month.month_number,
                    ndvi_max: month.ndvi_max,
                    soc_tc_per_ha: month.soc_tc_per_ha,
                    soc_co2_t_per_ha: month.soc_co2_t_per_ha,
                    delta_soc_co2_t: month.delta_soc_co2_t,
                    biomass_c_t_per_ha: month.biomass_c_t_per_ha,
                    biomass_co2_t_per_ha: month.biomass_co2_t_per_ha,
                    meaning: month.meaning,
                  }))
              : null,
        }
      : null;

    // Calculate regenerative agriculture outcomes
    const soilHealthScore = soilHealthIndicators.soilOrganicCarbon.value
      ? Math.min(
          100,
          Math.max(
            0,
            soilHealthIndicators.soilOrganicCarbon.value * 2 + // SOC contributes up to 50 points
              (soilHealthIndicators.vegetationHealth.average_ndvi || 0) * 25 + // NDVI contributes up to 25 points
              (soilHealthIndicators.sequestrationRate.value > 0 ? 25 : 0), // Positive sequestration contributes 25 points
          ),
        )
      : null;

    // Calculate multi-year trends from all data
    const socTrendAllYears = calculateMultiYearTrend(allCarbonData, "soc");
    const ndviTrendAllYears = calculateMultiYearTrend(allCarbonData, "ndvi");
    const sequestrationTrendAllYears = calculateMultiYearTrend(
      allCarbonData,
      "sequestration",
    );
    const emissionsTrendAllYears = calculateMultiYearTrend(
      allCarbonData,
      "emissions",
    );
    const soilHealthTrendAllYears = calculateSoilHealthTrend(allCarbonData);

    // Prepare environmental metrics summary
    const environmentalMetricsSummary = Object.keys(environmentalMetrics).map(
      (key) => ({
        name: environmentalMetrics[key].name,
        category: environmentalMetrics[key].category,
        unit: environmentalMetrics[key].unit,
        description: environmentalMetrics[key].description,
        current_value: getMetricValueByYear(
          environmentalMetrics[key],
          currentYear,
        ),
        trend: calculateTrend(environmentalMetrics[key], yearsFromESG),
        years_available: environmentalMetrics[key].values.map((v) => v.year),
        values: environmentalMetrics[key].values,
      }),
    );

    // Prepare response data
    const data = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "soil_health_carbon_quality",
        company_id: companyId,
        year_requested: year,
        year_used_for_current_values: currentYear,
        trend_period:
          allYears.length > 0
            ? `${Math.min(...allYears)} - ${Math.max(...allYears)}`
            : "N/A",
        data_sources: allCarbonData
          ? ["CarbonEmissionAccounting", "ESGData", "SatelliteIndices"]
          : ["ESGData"],
        calculation_methods: allCarbonData
          ? [
              "SOC calculated from satellite-derived NDVI/NDWI/NDBI indices",
              "Carbon sequestration estimated using IPCC AFOLU guidelines",
              "Monthly composites from Sentinel-2 imagery at 10m resolution",
              "Carbon permanence assessment based on variance and trend analysis",
              "Multi-year trends calculated from complete historical data",
            ]
          : ["ESG metrics from company reports"],
      },
      company: company,
      reporting_period: {
        start_year:
          allYears.length > 0
            ? Math.min(...allYears)
            : allCarbonData?.yearly_data?.[0]?.year,
        end_year: allYears.length > 0 ? Math.max(...allYears) : currentYear,
        current_year: currentYear,
        data_available_years: allYears,
        carbon_data_years: allCarbonData?.yearly_data?.map((d) => d.year) || [],
        esg_data_years: yearsFromESG,
        note: year
          ? "Trend graphs show multi-year data; other graphs show selected year data"
          : "All graphs show available multi-year data",
      },
      confidence_score: {
        overall: confidenceScore,
        breakdown: {
          data_completeness: allCarbonData ? 0 : 0,
          verification_status: allCarbonData?.yearly_data?.some(
            (d) => d.data_quality?.verification_status === "verified",
          )
            ? 0
            : 0,
          temporal_coverage:
            allYears.length >= 3 ? 0 : allYears.length >= 2 ? 0 : 0,
          methodological_rigor: allCarbonData?.framework
            ?.sequestration_methodology
            ? 85
            : 50,
          monthly_data_availability: allCarbonData?.yearly_data?.some(
            (y) => y.sequestration?.monthly_data?.length >= 6,
          )
            ? 0
            : allCarbonData?.yearly_data?.some(
                  (y) => y.sequestration?.monthly_data?.length >= 3,
                )
              ? 0
              : 0,
        },
        interpretation:
          confidenceScore >= 80
            ? "High confidence"
            : confidenceScore >= 60
              ? "Medium confidence"
              : confidenceScore >= 40
                ? "Low confidence"
                : "Very low confidence",
      },

      // QUANTIFICATION OF SOIL ORGANIC CARBON
      soil_organic_carbon_quantification: {
        current_value: soilHealthIndicators.soilOrganicCarbon.value,
        unit: soilHealthIndicators.soilOrganicCarbon.unit,
        trend: socTrendAllYears, // Use multi-year trend
        trend_period:
          allYears.length > 0
            ? `${Math.min(...allYears)} - ${Math.max(...allYears)}`
            : "N/A",
        annual_change_percent:
          soilHealthIndicators.soilOrganicCarbon.annual_trend,
        confidence: soilHealthIndicators.soilOrganicCarbon.confidence,
        calculation_method:
          allCarbonData?.framework?.sequestration_methodology ||
          "IPCC 2006 Guidelines for AFOLU sector",
        monthly_data_available:
          soilHealthIndicators.soilOrganicCarbon.monthly_data.length > 0,
        monthly_variation:
          soilHealthIndicators.soilOrganicCarbon.monthly_data.length > 0
            ? calculateVariance(
                soilHealthIndicators.soilOrganicCarbon.monthly_data.map(
                  (m) => m.value,
                ),
              )
            : null,
        interpretation: soilHealthIndicators.soilOrganicCarbon.value
          ? soilHealthIndicators.soilOrganicCarbon.value > 30
            ? "High SOC content - Excellent soil health"
            : soilHealthIndicators.soilOrganicCarbon.value > 20
              ? "Moderate SOC content - Good soil health"
              : soilHealthIndicators.soilOrganicCarbon.value > 10
                ? "Low SOC content - Soil improvement needed"
                : "Very low SOC content - Critical improvement needed"
          : "No SOC data available",
      },

      // CARBON PERMANENCE ASSESSMENT
      carbon_permanence_assessment: {
        permanence_score: soilHealthIndicators.carbonPermanence.score,
        permanence_rating: soilHealthIndicators.carbonPermanence.rating,
        risk_level: soilHealthIndicators.carbonPermanence.risk_level,
        factors: soilHealthIndicators.carbonPermanence.factors,
        variance: soilHealthIndicators.carbonStock.variance,
        trend: soilHealthIndicators.carbonStock.trend,
        interpretation:
          soilHealthIndicators.carbonStock.permanence === "high"
            ? "High carbon permanence - Suitable for long-term carbon credits"
            : soilHealthIndicators.carbonStock.permanence === "medium"
              ? "Moderate carbon permanence - May require additional monitoring"
              : "Low carbon permanence - Not suitable for carbon credits without improvement",
      },

      // SOIL HEALTH TRENDS - ALWAYS use multi-year data for trends
      soil_health_trends: {
        soc_trend: socTrendAllYears, // Multi-year trend
        carbon_stock_trend: soilHealthIndicators.carbonStock.trend,
        sequestration_trend: sequestrationTrendAllYears, // Multi-year trend
        vegetation_trend: ndviTrendAllYears, // Multi-year trend
        emissions_trend: emissionsTrendAllYears, // Multi-year trend
        overall_trend: soilHealthTrendAllYears, // Multi-year trend
        monitoring_period:
          allYears.length > 0
            ? `${Math.min(...allYears)} - ${Math.max(...allYears)}`
            : "N/A",
        trend_calculation_method:
          "Multi-year analysis using complete historical data",
        note: year
          ? "Trends calculated from all available years, not just selected year"
          : "Trends calculated from available multi-year data",
      },

      // CARBON STOCK ANALYSIS
      carbon_stock_analysis: {
        total_carbon_stock: soilHealthIndicators.carbonStock.value,
        unit: soilHealthIndicators.carbonStock.unit,
        trend: soilHealthIndicators.carbonStock.trend,
        sequestration_rate: soilHealthIndicators.sequestrationRate.value,
        sequestration_unit: soilHealthIndicators.sequestrationRate.unit,
        annual_sequestration_total:
          soilHealthIndicators.sequestrationRate.annual_total,
        net_balance: carbonDataForYear?.summary?.net_carbon_balance_tco2e,
        carbon_intensity:
          carbonDataForYear?.summary?.carbon_intensity_tco2e_per_ha,
        monthly_data_available:
          soilHealthIndicators.carbonStock.monthly_data.length > 0,
      },

      // VEGETATION HEALTH
      vegetation_health: {
        average_ndvi: soilHealthIndicators.vegetationHealth.average_ndvi,
        ndvi_trend: ndviTrendAllYears, // Multi-year trend
        classification: soilHealthIndicators.vegetationHealth.classification,
        interpretation: soilHealthIndicators.vegetationHealth.average_ndvi
          ? soilHealthIndicators.vegetationHealth.average_ndvi > 0.6
            ? "Excellent vegetation health - High biomass production"
            : soilHealthIndicators.vegetationHealth.average_ndvi > 0.4
              ? "Good vegetation health - Sustainable ecosystem"
              : soilHealthIndicators.vegetationHealth.average_ndvi > 0.2
                ? "Moderate vegetation health - Improvement opportunities"
                : "Poor vegetation health - Degradation risk"
          : null,
        monthly_data_available:
          soilHealthIndicators.vegetationHealth.monthly_data.length > 0,
      },

      // COMPLETE CARBON EMISSION DATA (year-specific if year provided)
      carbon_emission_accounting: carbonEmissionResponse,

      // COMPLETE ENVIRONMENTAL ESG DATA
      environmental_metrics: {
        total_metrics: Object.keys(environmentalMetrics).length,
        metrics_by_category: {
          climate_change: Object.keys(environmentalMetrics).filter(
            (name) =>
              name.includes("GHG") ||
              name.includes("Carbon") ||
              name.includes("Emissions"),
          ).length,
          resource_use: Object.keys(environmentalMetrics).filter(
            (name) =>
              name.includes("Water") ||
              name.includes("Energy") ||
              name.includes("Waste"),
          ).length,
          biodiversity: Object.keys(environmentalMetrics).filter(
            (name) =>
              name.includes("Land") ||
              name.includes("Soil") ||
              name.includes("Biodiversity"),
          ).length,
        },
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
          water_usage: getMetricValueByYear(
            environmentalMetrics["Water Usage (m³)"],
            currentYear,
          ),
          energy_consumption: getMetricValueByYear(
            environmentalMetrics["Energy Consumption - Total (MWh)"],
            currentYear,
          ),
          waste_generated: getMetricValueByYear(
            environmentalMetrics["Waste Generated (tons)"],
            currentYear,
          ),
        },
      },

      // ANALYTICS GRAPHS (5 KEY GRAPHS)
      graphs: graphs,

      // REGENERATIVE AGRICULTURE OUTCOMES
      regenerative_agriculture_outcomes: {
        soil_health_score: soilHealthScore,
        soil_health_trend: soilHealthTrendAllYears, // Multi-year trend
        carbon_sequestration_potential: soilHealthIndicators.sequestrationRate
          .value
          ? soilHealthIndicators.sequestrationRate.value * 100
          : null, // Projected over 100ha
        permanence_score: soilHealthIndicators.carbonPermanence.score,
        vegetation_health_score: soilHealthIndicators.vegetationHealth
          .average_ndvi
          ? Math.min(
              100,
              soilHealthIndicators.vegetationHealth.average_ndvi * 100,
            )
          : null,
        verification_status: allCarbonData?.yearly_data?.some(
          (d) => d.data_quality?.verification_status === "verified",
        )
          ? "Verified"
          : "Unverified",
      },

      // CARBON CREDIT PREDICTIONS
      carbon_credit_predictions: sequestrationPrediction
        ? {
            eligible:
              sequestrationPrediction.eligibility_criteria
                .positive_sequestration &&
              sequestrationPrediction.eligibility_criteria.minimum_permanence,
            methodology: sequestrationPrediction.methodology,
            baseline_year: sequestrationPrediction.baseline_year,
            baseline_rate_tco2_per_ha:
              sequestrationPrediction.baseline_sequestration_rate,
            annual_growth_rate_percent:
              sequestrationPrediction.annual_growth_rate_percent,
            total_potential_credits:
              sequestrationPrediction.total_potential_credits,
            total_potential_value_usd:
              sequestrationPrediction.total_potential_value_usd,
            yearly_predictions: sequestrationPrediction.predictions,
            eligibility_status: sequestrationPrediction.eligibility_criteria,
            credit_standards_applicable: [
              "Verified Carbon Standard (VCS)",
              "Gold Standard",
              "Climate Action Reserve",
              "American Carbon Registry",
            ].filter(
              (standard) =>
                soilHealthIndicators.carbonPermanence.rating === "high" ||
                standard !== "Gold Standard", // Gold Standard requires high permanence
            ),
          }
        : null,

      // SOIL DEGRADATION/REGENERATION MONITORING
      soil_degradation_monitoring: soilDegradationAnalysis,

      summary: {
        key_indicators: {
          soil_organic_carbon: soilHealthIndicators.soilOrganicCarbon.value,
          carbon_stock: soilHealthIndicators.carbonStock.value,
          net_carbon_balance:
            carbonDataForYear?.summary?.net_carbon_balance_tco2e,
          carbon_intensity:
            carbonDataForYear?.summary?.carbon_intensity_tco2e_per_ha,
          vegetation_health: soilHealthIndicators.vegetationHealth.average_ndvi,
          sequestration_rate: soilHealthIndicators.sequestrationRate.value,
          permanence_rating: soilHealthIndicators.carbonPermanence.rating,
        },
        trends: {
          soil_health: soilHealthTrendAllYears, // Multi-year trend
          carbon_stock: soilHealthIndicators.carbonStock.trend,
          emissions: emissionsTrendAllYears, // Multi-year trend
          sequestration: sequestrationTrendAllYears, // Multi-year trend
          vegetation: ndviTrendAllYears, // Multi-year trend
          degradation: soilDegradationAnalysis.degradation_status,
          regeneration: soilDegradationAnalysis.regeneration_status,
        },
        recommendations: [
          {
            category: "Soil Health Improvement",
            actions: [
              "Implement cover cropping to increase soil organic matter",
              "Adopt conservation tillage to reduce soil disturbance",
              "Apply organic amendments to enhance soil carbon",
            ],
            expected_impact: "Increase SOC by 0.1-0.2% annually",
            priority:
              soilHealthIndicators.soilOrganicCarbon.value < 20
                ? "High"
                : "Medium",
          },
          {
            category: "Carbon Sequestration Enhancement",
            actions: [
              "Expand agroforestry systems",
              "Implement rotational grazing management",
              "Use biochar application in degraded areas",
            ],
            expected_impact:
              "Enhance carbon permanence and sequestration rates",
            priority:
              soilHealthIndicators.sequestrationRate.value < 1
                ? "High"
                : "Medium",
          },
          {
            category: "Carbon Credit Development",
            actions: [
              "Complete third-party verification",
              "Document management practices for 3+ years",
              "Establish monitoring, reporting, and verification (MRV) system",
              "Engage with carbon credit registries",
            ],
            expected_impact:
              "Generate carbon credits for voluntary/compliance markets",
            priority: sequestrationPrediction?.eligible ? "High" : "Medium",
          },
          {
            category: "Emission Reduction",
            actions: [
              "Optimize fertilizer application rates",
              "Transition to renewable energy sources",
              "Improve irrigation efficiency",
            ],
            expected_impact: "Reduce Scope 1 emissions by 15-20%",
            priority:
              getMetricValueByYear(
                environmentalMetrics["Carbon Emissions (Total GHG, tCO2e)"],
                currentYear,
              ) > 10000
                ? "High"
                : "Medium",
          },
          {
            category: "Monitoring & Reporting",
            actions: [
              "Implement continuous satellite monitoring",
              "Establish ground truth validation points",
              "Regular soil sampling for SOC validation",
              "Third-party verification of carbon claims",
            ],
            expected_impact: "Improve data confidence score by 20-30 points",
            priority: confidenceScore < 60 ? "High" : "Medium",
          },
        ],
        data_quality_assessment: {
          confidence_level:
            confidenceScore >= 80
              ? "High"
              : confidenceScore >= 60
                ? "Medium"
                : "Low",
          gaps_identified: [
            ...(!allCarbonData ? ["Carbon accounting data missing"] : []),
            ...(soilHealthIndicators.soilOrganicCarbon.value === null
              ? ["Soil organic carbon measurements needed"]
              : []),
            ...(allCarbonData &&
            allCarbonData.yearly_data?.some(
              (y) => !y.sequestration?.monthly_data?.length,
            )
              ? ["Monthly sequestration data incomplete"]
              : []),
            ...(allCarbonData &&
            !allCarbonData.yearly_data?.some(
              (y) => y.data_quality?.verification_status === "verified",
            )
              ? ["Carbon data not verified by third party"]
              : []),
          ],
          improvement_suggestions: [
            "Regular soil sampling for SOC validation",
            "Continuous monitoring of land management practices",
            "Third-party verification of carbon claims",
            "Monthly satellite data processing for NDVI/NDWI indices",
            "Integration of ground sensor data with satellite observations",
          ],
        },
        carbon_credit_readiness: {
          status: sequestrationPrediction?.eligible
            ? "Ready"
            : "Needs Improvement",
          requirements_met: sequestrationPrediction?.eligibility_criteria
            ? Object.keys(sequestrationPrediction.eligibility_criteria).filter(
                (key) => sequestrationPrediction.eligibility_criteria[key],
              ).length
            : 0,
          total_requirements: sequestrationPrediction?.eligibility_criteria
            ? Object.keys(sequestrationPrediction.eligibility_criteria).length
            : 0,
          time_to_credits: "12-24 months for verification and issuance",
          estimated_annual_revenue:
            sequestrationPrediction?.total_potential_value_usd
              ? `$${Math.round(sequestrationPrediction.total_potential_value_usd / 5)} per year`
              : "Not available",
        },
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve soil health and carbon quality data",
      500,
      "SOIL_HEALTH_API_ERROR",
      { details: error.message },
    );
  }
}

module.exports = {
  getSoilHealthCarbonQualityData,
};
