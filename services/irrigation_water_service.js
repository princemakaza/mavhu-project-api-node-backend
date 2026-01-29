const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
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

    const esgData = await ESGData.find(query).lean();

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
  if (initialValue === null || initialValue === undefined || initialValue === 0) return 0;
  return ((finalValue - initialValue) / Math.abs(initialValue)) * 100;
}

/**
 * Helper function to get metric value by year
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.values) return null;
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
      area_of_interest_formatted: company.area_of_interest
        ? {
            name: company.area_of_interest.name || "Unnamed Area",
            area_covered:
              company.area_of_interest.area_covered || "Not specified",
            coordinates_count: company.area_of_interest.coordinates
              ? company.area_of_interest.coordinates.length
              : 0,
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
    };

    const carbonData = await CarbonEmissionAccounting.findOne(query)
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) {
      return null;
    }

    // Filter yearly data if year is specified
    let filteredYearlyData = carbonData.yearly_data || [];
    if (year) {
      filteredYearlyData = filteredYearlyData.filter(
        (data) => data.year === year,
      );
    }

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
          const totalSequestration = validSequestration.reduce((a, b) => a + b, 0);
          const socArea = yearData.sequestration?.soc_area_ha;
          
          enhancedData.calculated_sequestration = {
            total_delta_co2_t: totalSequestration,
            average_monthly_delta_co2_t: totalSequestration / validSequestration.length,
            sequestration_rate_tco2_per_ha_per_year: socArea && socArea > 0 
              ? totalSequestration / socArea 
              : null,
          };
        }

        // Calculate NDVI indicators if available
        const validNdviValues = monthlyData
          .filter(
            (month) => month.ndvi_max !== null && month.ndvi_max !== undefined,
          )
          .map((month) => month.ndvi_max);

        if (validNdviValues.length > 0) {
          const mean = validNdviValues.reduce((a, b) => a + b, 0) / validNdviValues.length;
          const squaredDiffs = validNdviValues.map((value) => Math.pow(value - mean, 2));
          const variance = squaredDiffs.reduce((a, b) => a + b, 0) / validNdviValues.length;
          
          enhancedData.vegetation_indicators = {
            average_ndvi: mean,
            max_ndvi: Math.max(...validNdviValues),
            min_ndvi: Math.min(...validNdviValues),
            ndvi_variance: variance,
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
              validCarbonStock.reduce((a, b) => a + b, 0) / validCarbonStock.length,
            min_co2_per_ha: Math.min(...validCarbonStock),
            max_co2_per_ha: Math.max(...validCarbonStock),
            month_count: validCarbonStock.length,
          };
        }
      }

      return enhancedData;
    });

    return {
      ...carbonData,
      yearly_data: enhancedYearlyData,
    };
  } catch (error) {
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
  const avgArea = areas.length > 0 ? areas.reduce((a, b) => a + b, 0) / areas.length : 0;

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
 * Helper function to calculate confidence score based on actual data
 */
function calculateConfidenceScore(carbonData, esgMetrics) {
  let score = 0;

  // Data completeness (0-40 points)
  if (carbonData) {
    score += 10; // Base score for having carbon data

    const yearlyData = carbonData.yearly_data || [];
    if (yearlyData.length > 0) {
      score += 10;

      // Check verification status
      const verifiedYears = yearlyData.filter(
        (yearData) =>
          yearData.data_quality?.verification_status === "verified" ||
          yearData.data_quality?.verification_status === "audited",
      ).length;

      if (verifiedYears > 0) {
        score += (verifiedYears / yearlyData.length) * 20;
      }
    }
  }

  // ESG metrics coverage (0-30 points)
  const environmentalMetrics = Object.keys(esgMetrics.environmental || {}).length;
  if (environmentalMetrics > 0) {
    score += Math.min(30, environmentalMetrics * 2); // Max 2 points per metric
  }

  // Temporal coverage (0-20 points)
  if (carbonData?.yearly_data?.length >= 3) {
    score += 20;
  } else if (carbonData?.yearly_data?.length === 2) {
    score += 10;
  } else if (carbonData?.yearly_data?.length === 1) {
    score += 5;
  }

  // Monthly data availability (0-10 points)
  if (carbonData?.yearly_data?.some((y) => y.sequestration?.monthly_data?.length >= 6)) {
    score += 10;
  } else if (carbonData?.yearly_data?.some((y) => y.sequestration?.monthly_data?.length >= 3)) {
    score += 5;
  }

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
      unit: "tCO₂/ha",
      trend: "unknown",
      permanence: "unknown",
      monthly_data: [],
      variance: null,
    },
    sequestrationRate: {
      value: null,
      unit: "tCO₂/ha/year",
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

  if (!carbonData || !carbonData.yearly_data || carbonData.yearly_data.length === 0) {
    return indicators;
  }

  // Get data for specific year or latest year
  let yearData;
  if (year) {
    yearData = carbonData.yearly_data.find((data) => data.year === year);
  } else {
    const latestYear = Math.max(...carbonData.yearly_data.map((d) => d.year));
    yearData = carbonData.yearly_data.find((data) => data.year === latestYear);
  }

  if (!yearData) return indicators;

  // Extract SOC data from monthly data
  const monthlyData = yearData.sequestration?.monthly_data || [];
  if (monthlyData.length > 0) {
    const sortedMonthlyData = [...monthlyData].sort(
      (a, b) => (a.month_number || 0) - (b.month_number || 0),
    );

    // Extract SOC values
    const socValues = sortedMonthlyData
      .filter((month) => month.soc_tc_per_ha !== null && month.soc_tc_per_ha !== undefined)
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.soc_tc_per_ha,
      }));

    // Extract carbon stock values
    const carbonStockValues = sortedMonthlyData
      .filter((month) => month.soc_co2_t_per_ha !== null && month.soc_co2_t_per_ha !== undefined)
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.soc_co2_t_per_ha,
      }));

    // Extract sequestration rates
    const sequestrationValues = sortedMonthlyData
      .filter((month) => month.delta_soc_co2_t !== null && month.delta_soc_co2_t !== undefined)
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.delta_soc_co2_t,
      }));

    // Extract NDVI values
    const ndviValues = sortedMonthlyData
      .filter((month) => month.ndvi_max !== null && month.ndvi_max !== undefined)
      .map((month) => ({
        month: month.month,
        month_number: month.month_number,
        value: month.ndvi_max,
      }));

    // Set SOC indicators
    if (socValues.length > 0) {
      const latestSoc = socValues[socValues.length - 1];
      indicators.soilOrganicCarbon.value = latestSoc.value;
      indicators.soilOrganicCarbon.monthly_data = socValues;

      if (socValues.length >= 2) {
        const firstValue = socValues[0].value;
        const lastValue = socValues[socValues.length - 1].value;
        const change = calculatePercentageChange(firstValue, lastValue);
        indicators.soilOrganicCarbon.trend =
          change > 0 ? "improving" : change < 0 ? "declining" : "stable";
        indicators.soilOrganicCarbon.annual_trend = change;
      }
    }

    // Set carbon stock indicators
    if (carbonStockValues.length > 0) {
      const latestStock = carbonStockValues[carbonStockValues.length - 1];
      indicators.carbonStock.value = latestStock.value;
      indicators.carbonStock.monthly_data = carbonStockValues;
      
      if (carbonStockValues.length > 0) {
        const values = carbonStockValues.map((v) => v.value);
        indicators.carbonStock.variance = calculateVariance(values);

        if (carbonStockValues.length >= 3) {
          const firstValue = values[0];
          const lastValue = values[values.length - 1];
          const change = calculatePercentageChange(firstValue, lastValue);
          indicators.carbonStock.trend = change > 0 ? "improving" : change < 0 ? "declining" : "stable";

          const variance = indicators.carbonStock.variance;
          if (variance < 1 && change > 0) {
            indicators.carbonStock.permanence = "high";
            indicators.carbonPermanence.score = 85;
            indicators.carbonPermanence.rating = "high";
            indicators.carbonPermanence.risk_level = "low";
          } else if (variance < 5 && change >= 0) {
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
            variance < 2 ? "Low monthly variance" : "Moderate to high monthly variance",
            change > 0 ? "Positive annual trend" : "Negative or stable trend",
            carbonStockValues.length >= 6 ? "Adequate data points" : "Limited data points",
          ];
        }
      }
    }

    // Set sequestration indicators
    if (sequestrationValues.length > 0) {
      const totalSequestration = sequestrationValues.reduce((sum, item) => sum + item.value, 0);
      const socArea = yearData.sequestration?.soc_area_ha || 0;
      indicators.sequestrationRate.value = socArea > 0 ? totalSequestration / socArea : 0;
      indicators.sequestrationRate.monthly_data = sequestrationValues;
      indicators.sequestrationRate.annual_total = totalSequestration;

      if (sequestrationValues.length >= 2) {
        const firstHalf = sequestrationValues.slice(0, Math.floor(sequestrationValues.length / 2));
        const secondHalf = sequestrationValues.slice(Math.floor(sequestrationValues.length / 2));
        
        if (firstHalf.length > 0 && secondHalf.length > 0) {
          const avgFirst = firstHalf.reduce((sum, item) => sum + item.value, 0) / firstHalf.length;
          const avgSecond = secondHalf.reduce((sum, item) => sum + item.value, 0) / secondHalf.length;
          const change = calculatePercentageChange(avgFirst, avgSecond);
          indicators.sequestrationRate.trend = change > 0 ? "improving" : change < 0 ? "declining" : "stable";
        }
      }
    }

    // Set vegetation health indicators
    if (ndviValues.length > 0) {
      const avgNdvi = ndviValues.reduce((sum, item) => sum + item.value, 0) / ndviValues.length;
      indicators.vegetationHealth.average_ndvi = avgNdvi;
      indicators.vegetationHealth.monthly_data = ndviValues;

      if (avgNdvi > 0.6) {
        indicators.vegetationHealth.classification = "Excellent";
      } else if (avgNdvi > 0.4) {
        indicators.vegetationHealth.classification = "Good";
      } else if (avgNdvi > 0.2) {
        indicators.vegetationHealth.classification = "Moderate";
      } else {
        indicators.vegetationHealth.classification = "Poor";
      }

      if (ndviValues.length >= 2) {
        const firstValue = ndviValues[0].value;
        const lastValue = ndviValues[ndviValues.length - 1].value;
        const change = calculatePercentageChange(firstValue, lastValue);
        indicators.vegetationHealth.ndvi_trend = change > 0 ? "improving" : change < 0 ? "declining" : "stable";
      }
    }
  }

  return indicators;
}

/**
 * Helper function to predict carbon sequestration for credits (only if sufficient data)
 */
function predictCarbonSequestration(carbonData, soilHealthIndicators, yearsToPredict = 5) {
  if (!carbonData || !carbonData.yearly_data || carbonData.yearly_data.length < 2) {
    return null;
  }

  const yearlyData = carbonData.yearly_data;
  const latestYear = Math.max(...yearlyData.map((d) => d.year));

  // Get sequestration rates from available years
  const recentYears = yearlyData
    .filter((d) => d.sequestration?.annual_summary?.sequestration_total_tco2)
    .sort((a, b) => b.year - a.year);

  if (recentYears.length < 2) return null;

  // Calculate average sequestration rate
  const sequestrationRates = recentYears
    .map((yearData) => {
      const totalSequestration = yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0;
      const area = yearData.sequestration?.soc_area_ha || 0;
      return area > 0 ? totalSequestration / area : 0;
    })
    .filter((rate) => rate > 0);

  if (sequestrationRates.length === 0) return null;

  const avgSequestrationRate = sequestrationRates.reduce((a, b) => a + b, 0) / sequestrationRates.length;
  const latestArea = recentYears[0].sequestration?.soc_area_ha || 0;

  // Calculate trend
  let annualGrowthRate = 0;
  if (sequestrationRates.length >= 2) {
    const oldestRate = sequestrationRates[sequestrationRates.length - 1];
    const latestRate = sequestrationRates[0];
    annualGrowthRate = calculatePercentageChange(oldestRate, latestRate) / (sequestrationRates.length - 1);
  }

  // Predict future sequestration
  const predictions = [];
  for (let i = 1; i <= yearsToPredict; i++) {
    const year = latestYear + i;
    const predictedRate = avgSequestrationRate * Math.pow(1 + annualGrowthRate / 100, i);
    const predictedTotal = latestArea > 0 ? predictedRate * latestArea : 0;

    predictions.push({
      year: year,
      sequestration_rate_tco2_per_ha: predictedRate,
      total_sequestration_tco2: predictedTotal,
      carbon_credits: predictedTotal,
      confidence: annualGrowthRate !== 0 ? "medium" : "low",
      assumptions: [
        latestArea > 0 ? `Constant land area of ${latestArea} ha` : "Land area data unavailable",
        annualGrowthRate !== 0 ? `Annual growth rate of ${annualGrowthRate.toFixed(2)}%` : "Stable sequestration rate",
      ],
    });
  }

  return {
    baseline_year: latestYear,
    baseline_sequestration_rate: avgSequestrationRate,
    annual_growth_rate_percent: annualGrowthRate,
    projected_area_ha: latestArea,
    predictions: predictions,
    methodology: "Linear projection based on historical sequestration rates",
    eligibility_criteria: {
      minimum_permanence: soilHealthIndicators.carbonStock.permanence !== "low",
      minimum_monitoring: yearlyData.some((y) => y.sequestration?.monthly_data?.length >= 6),
      verification_status: yearlyData.some((y) => y.data_quality?.verification_status === "verified"),
      positive_sequestration: avgSequestrationRate > 0,
    },
    total_potential_credits: predictions.reduce((sum, p) => sum + p.carbon_credits, 0),
  };
}

/**
 * Helper function to monitor soil degradation/regeneration based on actual data
 */
function monitorSoilDegradation(carbonData, esgMetrics, currentYear) {
  const indicators = {
    degradation_status: "unknown",
    regeneration_status: "unknown",
    risk_factors: [],
    improvement_opportunities: [],
    degradation_score: 0,
    regeneration_potential: 0,
  };

  if (!carbonData || !carbonData.yearly_data) return indicators;

  const yearlyData = carbonData.yearly_data;
  const latestYear = Math.max(...yearlyData.map((d) => d.year));
  const latestData = yearlyData.find((d) => d.year === latestYear);

  if (!latestData) return indicators;

  // Analyze soil health indicators
  const socValue = latestData.calculated_soc?.average_tc_per_ha;
  const socTrend = socValue !== undefined && socValue !== null 
    ? (socValue > 20 ? "healthy" : "at_risk")
    : "unknown";

  const ndviAvg = latestData.vegetation_indicators?.average_ndvi;
  const ndviStatus = ndviAvg !== undefined && ndviAvg !== null
    ? (ndviAvg > 0.4 ? "healthy" : "degraded")
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

  // Calculate degradation score
  let score = 0;
  if (socTrend === "at_risk") score += 30;
  if (ndviStatus === "degraded") score += 30;
  if (riskFactors.length > 0) score += riskFactors.length * 10;

  // Calculate regeneration potential
  let regenerationScore = 0;
  if (latestData.sequestration?.monthly_data?.length >= 6) regenerationScore += 30;
  if (latestData.data_quality?.verification_status === "verified") regenerationScore += 30;
  if (improvements.length > 0) regenerationScore += improvements.length * 10;

  indicators.degradation_status = score >= 60 ? "high_risk" : score >= 30 ? "moderate_risk" : "low_risk";
  indicators.regeneration_status = regenerationScore >= 60 ? "high" : regenerationScore >= 30 ? "medium" : "low";
  indicators.risk_factors = riskFactors;
  indicators.improvement_opportunities = improvements;
  indicators.degradation_score = Math.min(score, 100);
  indicators.regeneration_potential = Math.min(regenerationScore, 100);

  return indicators;
}

/**
 * Helper function to generate graphs based on actual data
 */
function generateKeyGraphs(carbonData, esgMetrics, currentYear, years) {
  const allGraphs = {};

  // 1. SOC Trend over time
  if (carbonData?.yearly_data?.length > 0) {
    const socData = carbonData.yearly_data
      .filter((d) => d.calculated_soc?.average_tc_per_ha !== undefined && d.calculated_soc?.average_tc_per_ha !== null)
      .sort((a, b) => a.year - b.year);

    if (socData.length > 0) {
      allGraphs.soc_trend = {
        type: "line",
        title: "Soil Organic Carbon Trend",
        description: "Trend of soil organic carbon stock over time",
        labels: socData.map((d) => d.year.toString()),
        datasets: [
          {
            label: "Average SOC (tC/ha)",
            data: socData.map((d) => parseFloat(d.calculated_soc.average_tc_per_ha.toFixed(2))),
            borderColor: "#27ae60",
            backgroundColor: "rgba(39, 174, 96, 0.1)",
            fill: true,
          },
        ],
      };
    }
  }

  // 2. Carbon Balance (Sequestration vs Emissions)
  if (carbonData?.yearly_data?.length > 0) {
    const balanceData = carbonData.yearly_data
      .filter((d) => 
        (d.sequestration?.annual_summary?.sequestration_total_tco2 !== undefined && 
         d.sequestration?.annual_summary?.sequestration_total_tco2 !== null) ||
        (d.emissions?.total_scope_emission_tco2e !== undefined && 
         d.emissions?.total_scope_emission_tco2e !== null)
      )
      .sort((a, b) => a.year - b.year);

    if (balanceData.length > 0) {
      allGraphs.carbon_balance = {
        type: "bar",
        title: "Carbon Balance Analysis",
        description: "Sequestration vs Emissions",
        labels: balanceData.map((d) => d.year.toString()),
        datasets: [
          {
            label: "Sequestration (tCO₂)",
            data: balanceData.map((d) => d.sequestration?.annual_summary?.sequestration_total_tco2 || 0),
            backgroundColor: "#27ae60",
          },
          {
            label: "Emissions (tCO₂e)",
            data: balanceData.map((d) => d.emissions?.total_scope_emission_tco2e || 0),
            backgroundColor: "#e74c3c",
          },
        ],
      };
    }
  }

  // 3. Monthly SOC Variation (Current Year)
  if (currentYear && carbonData) {
    const currentYearData = carbonData.yearly_data?.find((y) => y.year === currentYear);
    if (currentYearData?.sequestration?.monthly_data?.length > 0) {
      const monthlyData = currentYearData.sequestration.monthly_data
        .filter((m) => m.soc_tc_per_ha !== null && m.soc_tc_per_ha !== undefined)
        .sort((a, b) => (a.month_number || 0) - (b.month_number || 0));

      if (monthlyData.length > 0) {
        allGraphs.monthly_soc = {
          type: "line",
          title: `Monthly Soil Organic Carbon - ${currentYear}`,
          description: "Monthly variation in SOC",
          labels: monthlyData.map((m) => m.month),
          datasets: [
            {
              label: "SOC (tC/ha)",
              data: monthlyData.map((m) => parseFloat(m.soc_tc_per_ha.toFixed(2))),
              borderColor: "#2ecc71",
              backgroundColor: "rgba(46, 204, 113, 0.1)",
              fill: true,
            },
          ],
        };
      }
    }
  }

  // 4. Vegetation Health (NDVI) Trend
  if (carbonData?.yearly_data?.some((y) => y.vegetation_indicators?.average_ndvi)) {
    const ndviData = carbonData.yearly_data
      .filter((y) => y.vegetation_indicators?.average_ndvi !== undefined && y.vegetation_indicators?.average_ndvi !== null)
      .sort((a, b) => a.year - b.year);

    if (ndviData.length > 0) {
      allGraphs.ndvi_trend = {
        type: "line",
        title: "Vegetation Health (NDVI) Trend",
        description: "Average NDVI values over time",
        labels: ndviData.map((d) => d.year.toString()),
        datasets: [
          {
            label: "Average NDVI",
            data: ndviData.map((y) => parseFloat(y.vegetation_indicators.average_ndvi.toFixed(3))),
            borderColor: "#1abc9c",
            backgroundColor: "rgba(26, 188, 156, 0.1)",
            fill: true,
          },
        ],
      };
    }
  }

  // 5. Scope Emissions Breakdown (Current Year)
  if (currentYear && carbonData) {
    const currentYearData = carbonData.yearly_data?.find((y) => y.year === currentYear);
    if (currentYearData?.emissions) {
      const scope1 = currentYearData.emissions.scope1?.total_tco2e || 0;
      const scope2 = currentYearData.emissions.scope2?.total_tco2e || 0;
      const scope3 = currentYearData.emissions.scope3?.total_tco2e || 0;

      if (scope1 > 0 || scope2 > 0 || scope3 > 0) {
        allGraphs.emissions_breakdown = {
          type: "doughnut",
          title: `GHG Emissions by Scope - ${currentYear}`,
          description: "Emissions composition by scope",
          labels: ["Scope 1 (Direct)", "Scope 2 (Indirect Energy)", "Scope 3 (Other Indirect)"],
          datasets: [
            {
              data: [scope1, scope2, scope3],
              backgroundColor: ["#e74c3c", "#f39c12", "#3498db"],
            },
          ],
        };
      }
    }
  }

  return allGraphs;
}

/**
 * 1. Soil Health & Carbon Quality API
 */
async function getSoilHealthCarbonQualityData(companyId, year = null) {
  try {
    // Get company details
    const company = await getEnhancedCompanyDetails(companyId);

    // Get Carbon Emission Accounting data
    const carbonData = await getCarbonEmissionAccountingData(companyId, year);

    // Get ESG metrics
    const allESGMetrics = await getAllESGMetrics(companyId, year ? [year] : []);
    const environmentalMetrics = allESGMetrics.environmental || {};

    // Get unique years from data
    const yearsFromESG = getUniqueYearsFromMetrics(environmentalMetrics, year);
    const yearsFromCarbon = carbonData?.yearly_data?.map((d) => d.year) || [];
    const allYears = Array.from(new Set([...yearsFromESG, ...yearsFromCarbon])).sort();

    if (allYears.length === 0 && !carbonData) {
      throw new AppError(
        "No soil health and carbon quality data available",
        404,
        "NO_DATA_AVAILABLE",
      );
    }

    const currentYear = year || (allYears.length > 0 ? Math.max(...allYears) : null);

    // Calculate soil health indicators
    const soilHealthIndicators = calculateSoilHealthIndicators(carbonData, currentYear);

    // Calculate confidence score
    const confidenceScore = calculateConfidenceScore(carbonData, allESGMetrics);

    // Predict carbon sequestration
    const sequestrationPrediction = predictCarbonSequestration(carbonData, soilHealthIndicators, 5);

    // Monitor soil degradation
    const soilDegradationAnalysis = monitorSoilDegradation(carbonData, allESGMetrics, currentYear);

    // Generate graphs
    const graphs = generateKeyGraphs(carbonData, allESGMetrics, currentYear, allYears);

    // Prepare carbon emission response with scope data
    const carbonEmissionResponse = carbonData ? {
      framework: carbonData.framework || {},
      summary: carbonData.summary || calculateCarbonSummary(carbonData.yearly_data),
      methodology: carbonData.emission_references?.methodology_statement || null,
      emission_factors: carbonData.emission_references?.emission_factors || [],
      global_warming_potentials: carbonData.emission_references?.global_warming_potentials || {},
      conversion_factors: carbonData.emission_references?.conversion_factors || {},
      yearly_data_summary: carbonData.yearly_data?.map((yearData) => {
        const emissions = yearData.emissions || {};
        return {
          year: yearData.year,
          sequestration: {
            reporting_area_ha: yearData.sequestration?.reporting_area_ha || 0,
            soc_area_ha: yearData.sequestration?.soc_area_ha || 0,
            monthly_data_count: yearData.sequestration?.monthly_data?.length || 0,
            annual_total_tco2: yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
            calculated_soc: yearData.calculated_soc || null,
            calculated_sequestration: yearData.calculated_sequestration || null,
            vegetation_indicators: yearData.vegetation_indicators || null,
            carbon_stock_indicators: yearData.carbon_stock_indicators || null,
          },
          emissions: {
            scope1: {
              sources: emissions.scope1?.sources || [],
              total_tco2e: emissions.scope1?.total_tco2e || 0,
              total_tco2e_per_ha: emissions.scope1?.total_tco2e_per_ha || 0,
            },
            scope2: {
              sources: emissions.scope2?.sources || [],
              total_tco2e: emissions.scope2?.total_tco2e || 0,
              total_tco2e_per_ha: emissions.scope2?.total_tco2e_per_ha || 0,
            },
            scope3: {
              categories: emissions.scope3?.categories || [],
              total_tco2e: emissions.scope3?.total_tco2e || 0,
              total_tco2e_per_ha: emissions.scope3?.total_tco2e_per_ha || 0,
            },
            total_scope_emission_tco2e: emissions.total_scope_emission_tco2e || 0,
            total_scope_emission_tco2e_per_ha: emissions.total_scope_emission_tco2e_per_ha || 0,
            net_total_emission_tco2e: emissions.net_total_emission_tco2e || 0,
          },
          data_quality: yearData.data_quality || {},
        };
      }) || [],
    } : null;

    // Prepare environmental metrics summary
    const environmentalMetricsSummary = Object.keys(environmentalMetrics).map((key) => {
      const metric = environmentalMetrics[key];
      const currentValue = getMetricValueByYear(metric, currentYear);
      return {
        name: metric.name,
        category: metric.category,
        unit: metric.unit || "unit",
        description: metric.description || "",
        current_value: currentValue !== null ? parseFloat(currentValue.toFixed(2)) : null,
        trend: calculateTrend(metric, yearsFromESG),
        years_available: metric.values.map((v) => v.year),
        values: metric.values.map(v => ({
          year: v.year,
          value: v.value,
          numeric_value: v.numeric_value !== null ? parseFloat(v.numeric_value.toFixed(2)) : null,
        })),
      };
    });

    // Calculate regenerative agriculture outcomes
    const soilHealthScore = (() => {
      if (soilHealthIndicators.soilOrganicCarbon.value !== null && 
          soilHealthIndicators.vegetationHealth.average_ndvi !== null) {
        let score = 0;
        if (soilHealthIndicators.soilOrganicCarbon.value > 0) score += 50;
        if (soilHealthIndicators.vegetationHealth.average_ndvi > 0.4) score += 30;
        if (soilHealthIndicators.sequestrationRate.value > 0) score += 20;
        return Math.min(100, score);
      }
      return null;
    })();

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
        data_sources: carbonData
          ? ["CarbonEmissionAccounting", "ESGData"]
          : ["ESGData"],
      },

      company: company,

      reporting_period: {
        start_year: allYears.length > 0 ? Math.min(...allYears) : null,
        end_year: allYears.length > 0 ? Math.max(...allYears) : null,
        current_year: currentYear,
        data_available_years: allYears,
        carbon_data_years: yearsFromCarbon,
        esg_data_years: yearsFromESG,
      },

      confidence_score: {
        overall: confidenceScore,
        interpretation: confidenceScore >= 80 ? "High confidence" :
                      confidenceScore >= 60 ? "Medium confidence" :
                      confidenceScore >= 40 ? "Low confidence" : "Very low confidence",
      },

      soil_organic_carbon_quantification: {
        current_value: soilHealthIndicators.soilOrganicCarbon.value !== null 
          ? parseFloat(soilHealthIndicators.soilOrganicCarbon.value.toFixed(2)) 
          : null,
        unit: soilHealthIndicators.soilOrganicCarbon.unit,
        trend: soilHealthIndicators.soilOrganicCarbon.trend,
        annual_change_percent: soilHealthIndicators.soilOrganicCarbon.annual_trend !== null
          ? parseFloat(soilHealthIndicators.soilOrganicCarbon.annual_trend.toFixed(2))
          : null,
        monthly_data_available: soilHealthIndicators.soilOrganicCarbon.monthly_data.length > 0,
      },

      carbon_permanence_assessment: {
        permanence_score: soilHealthIndicators.carbonPermanence.score,
        permanence_rating: soilHealthIndicators.carbonPermanence.rating,
        risk_level: soilHealthIndicators.carbonPermanence.risk_level,
        factors: soilHealthIndicators.carbonPermanence.factors,
      },

      soil_health_trends: {
        soc_trend: soilHealthIndicators.soilOrganicCarbon.trend,
        carbon_stock_trend: soilHealthIndicators.carbonStock.trend,
        sequestration_trend: soilHealthIndicators.sequestrationRate.trend,
        vegetation_trend: soilHealthIndicators.vegetationHealth.ndvi_trend,
      },

      carbon_stock_analysis: {
        total_carbon_stock: soilHealthIndicators.carbonStock.value !== null
          ? parseFloat(soilHealthIndicators.carbonStock.value.toFixed(2))
          : null,
        unit: soilHealthIndicators.carbonStock.unit,
        trend: soilHealthIndicators.carbonStock.trend,
        sequestration_rate: soilHealthIndicators.sequestrationRate.value !== null
          ? parseFloat(soilHealthIndicators.sequestrationRate.value.toFixed(2))
          : null,
        sequestration_unit: soilHealthIndicators.sequestrationRate.unit,
        annual_sequestration_total: soilHealthIndicators.sequestrationRate.annual_total !== null
          ? parseFloat(soilHealthIndicators.sequestrationRate.annual_total.toFixed(2))
          : null,
      },

      vegetation_health: {
        average_ndvi: soilHealthIndicators.vegetationHealth.average_ndvi !== null
          ? parseFloat(soilHealthIndicators.vegetationHealth.average_ndvi.toFixed(3))
          : null,
        ndvi_trend: soilHealthIndicators.vegetationHealth.ndvi_trend,
        classification: soilHealthIndicators.vegetationHealth.classification,
      },

      // Complete Carbon Emission Data with Scope 1, 2, 3
      carbon_emission_accounting: carbonEmissionResponse,

      // Complete Environmental ESG Data
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
        },
      },

      // All ESG Metrics
      all_esg_metrics: allESGMetrics,

      // Analytics Graphs
      graphs: graphs,

      // Regenerative Agriculture Outcomes
      regenerative_agriculture_outcomes: {
        soil_health_score: soilHealthScore,
        permanence_score: soilHealthIndicators.carbonPermanence.score,
        vegetation_health_score: soilHealthIndicators.vegetationHealth.average_ndvi !== null
          ? Math.min(100, Math.round(soilHealthIndicators.vegetationHealth.average_ndvi * 100))
          : null,
      },

      // Carbon Credit Predictions
      carbon_credit_predictions: sequestrationPrediction ? {
        eligible: sequestrationPrediction.eligibility_criteria.positive_sequestration &&
                 sequestrationPrediction.eligibility_criteria.minimum_permanence,
        methodology: sequestrationPrediction.methodology,
        baseline_year: sequestrationPrediction.baseline_year,
        baseline_rate_tco2_per_ha: parseFloat(sequestrationPrediction.baseline_sequestration_rate.toFixed(2)),
        annual_growth_rate_percent: parseFloat(sequestrationPrediction.annual_growth_rate_percent.toFixed(2)),
        total_potential_credits: parseFloat(sequestrationPrediction.total_potential_credits.toFixed(2)),
        yearly_predictions: sequestrationPrediction.predictions.map(p => ({
          year: p.year,
          sequestration_rate_tco2_per_ha: parseFloat(p.sequestration_rate_tco2_per_ha.toFixed(2)),
          total_sequestration_tco2: parseFloat(p.total_sequestration_tco2.toFixed(2)),
          carbon_credits: parseFloat(p.carbon_credits.toFixed(2)),
        })),
      } : null,

      // Soil Degradation Monitoring
      soil_degradation_monitoring: soilDegradationAnalysis,

      summary: {
        key_indicators: {
          soil_organic_carbon: soilHealthIndicators.soilOrganicCarbon.value !== null
            ? parseFloat(soilHealthIndicators.soilOrganicCarbon.value.toFixed(2))
            : null,
          carbon_stock: soilHealthIndicators.carbonStock.value !== null
            ? parseFloat(soilHealthIndicators.carbonStock.value.toFixed(2))
            : null,
          net_carbon_balance: carbonEmissionResponse?.summary?.net_carbon_balance_tco2e !== undefined
            ? parseFloat(carbonEmissionResponse.summary.net_carbon_balance_tco2e.toFixed(2))
            : null,
          vegetation_health: soilHealthIndicators.vegetationHealth.average_ndvi !== null
            ? parseFloat(soilHealthIndicators.vegetationHealth.average_ndvi.toFixed(3))
            : null,
        },
        recommendations: [
          {
            category: "Data Collection",
            actions: [
              "Ensure regular monthly SOC measurements",
              "Maintain consistent NDVI monitoring",
              "Document all emission sources by scope",
            ],
            priority: confidenceScore < 60 ? "High" : "Medium",
          },
        ],
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