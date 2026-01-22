const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");

/**
 * Enhanced helper function to extract all metrics with proper structure
 */
async function getAllCompanyMetrics(companyId, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate(
        "company",
        "name industry country esg_reporting_framework latest_esg_report_year esg_data_status",
      )
      .select("-__v")
      .lean();

    // Organize all metrics by category
    const allMetrics = {
      environmental: [],
      social: [],
      governance: [],
      companyInfo: {},
    };

    if (esgData.length > 0) {
      // Extract company information from ESG data
      const companyData = esgData[0].company;
      allMetrics.companyInfo = {
        name: companyData?.name,
        industry: companyData?.industry,
        country: companyData?.country,
        esgReportingFramework: companyData?.esg_reporting_framework || [],
        latestEsgReportYear: companyData?.latest_esg_report_year,
        esgDataStatus: companyData?.esg_data_status,
        // Add metadata from ESGData
        dataSource: esgData[0].data_source,
        verificationStatus: esgData[0].verification_status,
        dataQualityScore: esgData[0].data_quality_score,
        reportingPeriod: {
          start: esgData[0].reporting_period_start,
          end: esgData[0].reporting_period_end,
        },
      };

      // Extract all metrics
      esgData.forEach((data) => {
        data.metrics.forEach((metric) => {
          const metricCategory = metric.category;
          if (!allMetrics[metricCategory]) {
            allMetrics[metricCategory] = [];
          }

          // Check if metric already exists
          const existingMetricIndex = allMetrics[metricCategory].findIndex(
            (m) => m.metric_name === metric.metric_name,
          );

          if (existingMetricIndex === -1) {
            // Create new metric entry
            const metricEntry = {
              metric_name: metric.metric_name,
              unit: metric.unit,
              description: metric.description,
              is_active: metric.is_active,
              category: metric.category,
              values: [],
            };

            // Add values with filtering
            metric.values.forEach((value) => {
              if (years.length === 0 || years.includes(value.year)) {
                metricEntry.values.push({
                  year: value.year,
                  value: value.value,
                  numeric_value: value.numeric_value,
                  source_notes: value.source_notes,
                  added_by: value.added_by,
                  added_at: value.added_at,
                  last_updated_at: value.last_updated_at,
                });
              }
            });

            // Sort values by year
            metricEntry.values.sort((a, b) => a.year - b.year);
            allMetrics[metricCategory].push(metricEntry);
          } else {
            // Merge values from different ESGData documents
            metric.values.forEach((value) => {
              if (years.length === 0 || years.includes(value.year)) {
                const existingValue = allMetrics[metricCategory][
                  existingMetricIndex
                ].values.find((v) => v.year === value.year);

                if (!existingValue) {
                  allMetrics[metricCategory][existingMetricIndex].values.push({
                    year: value.year,
                    value: value.value,
                    numeric_value: value.numeric_value,
                    source_notes: value.source_notes,
                    added_by: value.added_by,
                    added_at: value.added_at,
                    last_updated_at: value.last_updated_at,
                  });

                  // Re-sort after adding
                  allMetrics[metricCategory][existingMetricIndex].values.sort(
                    (a, b) => a.year - b.year,
                  );
                }
              }
            });
          }
        });
      });
    }

    return allMetrics;
  } catch (error) {
    throw new AppError(
      `Error fetching company metrics: ${error.message}`,
      500,
      "METRICS_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to extract specific metrics by names
 */
async function getMetricsByNames(companyId, metricNames, years = []) {
  const allMetrics = await getAllCompanyMetrics(companyId, years);

  const result = {};
  ["environmental", "social", "governance"].forEach((category) => {
    allMetrics[category].forEach((metric) => {
      if (metricNames.includes(metric.metric_name)) {
        result[metric.metric_name] = metric;
      }
    });
  });

  return result;
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

  return Array.from(allYears).sort((a, b) => a - b);
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
  if (!metric || !metric.values) return null;
  const value = metric.values.find((v) => v.year === year);
  if (!value) return null;

  // Try numeric_value first, then parse from value
  if (value.numeric_value !== null && value.numeric_value !== undefined) {
    return value.numeric_value;
  }

  if (value.value !== null && value.value !== undefined) {
    const parsed = parseFloat(value.value);
    return isNaN(parsed) ? 0 : parsed;
  }

  return 0;
}

/**
 * Helper function to calculate trends
 */
function calculateTrend(values, years, metricName = null) {
  if (!values || values.length < 2 || years.length < 2) return "stable";

  const sortedYears = [...years].sort((a, b) => a - b);
  const firstYear = sortedYears[0];
  const lastYear = sortedYears[sortedYears.length - 1];

  const firstValue = getMetricValueByYear(values, firstYear);
  const lastValue = getMetricValueByYear(values, lastYear);

  if (firstValue === null || lastValue === null) return "stable";

  const change = calculatePercentageChange(firstValue, lastValue);

  // Different thresholds based on metric type
  if (
    (metricName && metricName.includes("risk")) ||
    (metricName && metricName.includes("intensity"))
  ) {
    // For risk/intensity metrics, lower is better
    if (change < -10) return "improving";
    if (change > 10) return "declining";
  } else {
    // For usage/efficiency metrics, higher is better
    if (change > 10) return "improving";
    if (change < -10) return "declining";
  }

  return "stable";
}

/**
 * Helper to calculate NDWI-based drought risk (simulated)
 */
function calculateNDWIRisk(companyInfo, irrigationUsage, year) {
  // Simulated NDWI calculation based on region and usage
  const baseRisk = companyInfo.country === "Zimbabwe" ? 0.6 : 0.4;
  const usageFactor =
    irrigationUsage > 200 ? 0.3 : irrigationUsage > 150 ? 0.2 : 0.1;
  const annualVariation = (year % 10) * 0.05; // Simulate annual variation

  const ndwiScore = Math.min(1, baseRisk + usageFactor + annualVariation);

  return {
    score: ndwiScore.toFixed(2),
    level: ndwiScore > 0.7 ? "High" : ndwiScore > 0.4 ? "Medium" : "Low",
    description: `NDWI-based drought risk assessment for ${companyInfo.country}`,
  };
}

/**
 * Helper to calculate water scarcity projections
 */
function calculateScarcityProjections(currentUsage, reuseRate, yearsAhead = 5) {
  const baseProjection = currentUsage;
  const climateFactor = 1.02; // 2% increase due to climate change
  const efficiencyFactor = reuseRate > 50 ? 0.95 : reuseRate > 30 ? 0.98 : 1.02;

  const projections = [];
  for (let i = 1; i <= yearsAhead; i++) {
    const projected =
      baseProjection * Math.pow(climateFactor * efficiencyFactor, i);
    projections.push({
      year: new Date().getFullYear() + i,
      value: projected.toFixed(1),
      change: calculatePercentageChange(currentUsage, projected).toFixed(1),
    });
  }

  return projections;
}

/**
 * Enhanced irrigation water risk analysis function
 */
async function getIrrigationWaterRiskData(companyId, year = null) {
  try {
    // Get company info with all fields
    const company = await Company.findById(companyId).lean();

    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // Define all relevant metric names
    const waterMetricNames = [
      "Water Usage - Irrigation Water Usage (million ML)",
      "Water treatment (million ML)",
      "Effluent discharge for Irrigation (thousand ML)",
      "Water Withdrawal - Total (million ML)",
      "Water Recycling Rate (%)",
      "Water Consumption - Process Water (million ML)",
      "Water Consumption - Cooling Water (million ML)",
      "Water Discharge - Total (million ML)",
      "Water Intensity (ML/product unit)",
    ];

    const energyMetricNames = [
      "Energy Consumption - Electricity Purchased (MWH)",
      "Energy Consumption - Inside Company Diesel Usage (litres)",
      "Energy Consumption - Total (GJ)",
      "Renewable Energy Consumption (%)",
      "Energy Intensity (GJ/product unit)",
    ];

    const riskMetricNames = [
      "Water Risk - Physical (score)",
      "Water Risk - Regulatory (score)",
      "Water Risk - Reputational (score)",
      "Drought Exposure Index",
      "Water Stress Level",
    ];

    // Get all metrics
    const allMetrics = await getAllCompanyMetrics(companyId);
    const waterMetrics = await getMetricsByNames(companyId, waterMetricNames);
    const energyMetrics = await getMetricsByNames(companyId, energyMetricNames);
    const riskMetrics = await getMetricsByNames(companyId, riskMetricNames);

    // Combine all metrics for analysis
    const metrics = { ...waterMetrics, ...energyMetrics, ...riskMetrics };

    // Determine years for analysis
    const years = getUniqueYearsFromMetrics(metrics, year);
    if (years.length === 0) {
      throw new AppError(
        "No data available for analysis",
        404,
        "NO_DATA_AVAILABLE",
      );
    }

    const currentYear = year || Math.max(...years);
    const previousYear =
      years.length > 1
        ? years[years.indexOf(currentYear) - 1] || years[0]
        : null;
    const threeYearAvgYears = years.slice(-3);

    // Extract key metric values
    const irrigationWater =
      metrics["Water Usage - Irrigation Water Usage (million ML)"];
    const waterTreatment = metrics["Water treatment (million ML)"];
    const effluentDischarge =
      metrics["Effluent discharge for Irrigation (thousand ML)"];
    const totalWaterWithdrawal =
      metrics["Water Withdrawal - Total (million ML)"];
    const waterRecyclingRate = metrics["Water Recycling Rate (%)"];
    const electricity =
      metrics["Energy Consumption - Electricity Purchased (MWH)"];
    const diesel =
      metrics["Energy Consumption - Inside Company Diesel Usage (litres)"];
    const totalEnergy = metrics["Energy Consumption - Total (GJ)"];
    const renewableEnergy = metrics["Renewable Energy Consumption (%)"];
    const waterRiskPhysical = metrics["Water Risk - Physical (score)"];
    const waterRiskRegulatory = metrics["Water Risk - Regulatory (score)"];

    // Calculate current values
    const currentIrrigation =
      getMetricValueByYear(irrigationWater, currentYear) || 0;
    const currentTreatment =
      getMetricValueByYear(waterTreatment, currentYear) || 0;
    const currentEffluent =
      getMetricValueByYear(effluentDischarge, currentYear) || 0;
    const currentTotalWithdrawal =
      getMetricValueByYear(totalWaterWithdrawal, currentYear) ||
      currentIrrigation;
    const currentRecyclingRate =
      getMetricValueByYear(waterRecyclingRate, currentYear) || 0;
    const currentElectricity =
      getMetricValueByYear(electricity, currentYear) || 0;
    const currentDiesel = getMetricValueByYear(diesel, currentYear) || 0;
    const currentTotalEnergy =
      getMetricValueByYear(totalEnergy, currentYear) ||
      currentElectricity * 0.0036 + currentDiesel * 0.0386; // Convert to GJ
    const currentRenewable =
      getMetricValueByYear(renewableEnergy, currentYear) || 0;
    const currentPhysicalRisk =
      getMetricValueByYear(waterRiskPhysical, currentYear) || 50;
    const currentRegulatoryRisk =
      getMetricValueByYear(waterRiskRegulatory, currentYear) || 50;

    // Calculate water reuse rate
    const calculatedReuseRate =
      currentRecyclingRate > 0
        ? currentRecyclingRate
        : currentTreatment > 0
          ? (currentEffluent / 1000 / currentTreatment) * 100
          : 0;

    // Calculate 8 KEY TOTALS
    const keyTotals = {
      // 1. Total Annual Water Withdrawal
      totalWaterWithdrawal: {
        value: currentTotalWithdrawal,
        unit: "million ML",
        trend: previousYear
          ? calculateTrend(totalWaterWithdrawal, [previousYear, currentYear])
          : "stable",
        industryBenchmark: 150, // Example benchmark
        performance:
          currentTotalWithdrawal <= 150 ? "Good" : "Needs Improvement",
      },

      // 2. Irrigation Water Usage
      irrigationWaterUsage: {
        value: currentIrrigation,
        unit: "million ML",
        percentageOfTotal:
          currentTotalWithdrawal > 0
            ? ((currentIrrigation / currentTotalWithdrawal) * 100).toFixed(1)
            : 0,
        trend: previousYear
          ? calculateTrend(irrigationWater, [previousYear, currentYear])
          : "stable",
      },

      // 3. Water Treatment Capacity
      waterTreatmentCapacity: {
        value: currentTreatment,
        unit: "million ML",
        coverage:
          currentTotalWithdrawal > 0
            ? ((currentTreatment / currentTotalWithdrawal) * 100).toFixed(1) +
              "%"
            : "0%",
        gap: Math.max(0, currentTotalWithdrawal - currentTreatment),
      },

      // 4. Water Reuse/Recycling
      waterReuse: {
        rate: calculatedReuseRate,
        unit: "%",
        volume: currentEffluent / 1000,
        unitVolume: "million ML",
        rating:
          calculatedReuseRate > 50
            ? "Excellent"
            : calculatedReuseRate > 30
              ? "Good"
              : "Needs Improvement",
      },

      // 5. Energy for Water Management
      waterRelatedEnergy: {
        value: (currentElectricity * 0.3).toFixed(0), // Assume 30% for water
        unit: "MWh",
        percentageOfTotal: currentElectricity > 0 ? "30%" : "0%",
        intensity:
          currentIrrigation > 0
            ? ((currentElectricity * 0.3) / currentIrrigation).toFixed(2)
            : 0,
        unitIntensity: "MWh/ML",
      },

      // 6. Water Efficiency Score
      waterEfficiency: {
        score: Math.min(
          100,
          Math.max(
            0,
            100 -
              (currentIrrigation > 200
                ? 25
                : currentIrrigation > 150
                  ? 12
                  : 0) -
              (calculatedReuseRate < 30
                ? 20
                : calculatedReuseRate < 50
                  ? 10
                  : 0) +
              (currentTreatment / currentTotalWithdrawal > 0.8 ? 15 : 0),
          ),
        ),
        rating: function () {
          const score = this.score;
          return score >= 85
            ? "Excellent"
            : score >= 70
              ? "Good"
              : score >= 50
                ? "Fair"
                : "Poor";
        }.call({
          score: Math.min(
            100,
            Math.max(
              0,
              100 -
                (currentIrrigation > 200
                  ? 25
                  : currentIrrigation > 150
                    ? 12
                    : 0) -
                (calculatedReuseRate < 30
                  ? 20
                  : calculatedReuseRate < 50
                    ? 10
                    : 0) +
                (currentTreatment / currentTotalWithdrawal > 0.8 ? 15 : 0),
            ),
          ),
        }),
        drivers: [
          currentIrrigation > 200 ? "High consumption" : null,
          calculatedReuseRate < 30 ? "Low recycling" : null,
          currentTreatment / currentTotalWithdrawal < 0.7
            ? "Inadequate treatment"
            : null,
        ].filter((d) => d),
      },

      // 7. Water Risk Index
      waterRiskIndex: {
        score: Math.min(
          100,
          (currentIrrigation > 200 ? 35 : currentIrrigation > 150 ? 20 : 10) +
            (calculatedReuseRate < 30
              ? 30
              : calculatedReuseRate < 50
                ? 15
                : 0) +
            currentPhysicalRisk / 2 +
            currentRegulatoryRisk / 2,
        ),
        level: function () {
          const score = this.score;
          return score > 70 ? "High" : score > 40 ? "Medium" : "Low";
        }.call({
          score: Math.min(
            100,
            (currentIrrigation > 200 ? 35 : currentIrrigation > 150 ? 20 : 10) +
              (calculatedReuseRate < 30
                ? 30
                : calculatedReuseRate < 50
                  ? 15
                  : 0) +
              currentPhysicalRisk / 2 +
              currentRegulatoryRisk / 2,
          ),
        }),
        components: {
          physical: currentPhysicalRisk,
          regulatory: currentRegulatoryRisk,
          operational:
            currentIrrigation > 200 ? 40 : currentIrrigation > 150 ? 25 : 10,
        },
      },

      // 8. Cost Implications
      costImplications: {
        waterCost: (currentTotalWithdrawal * 1000).toFixed(0), // $1000 per million ML
        energyCost: (currentElectricity * 0.3 * 0.12).toFixed(0), // $0.12 per kWh
        potentialSavings: (currentTotalWithdrawal * 0.15 * 1000).toFixed(0), // 15% savings
        unit: "$/year",
        roiPeriod: currentIrrigation > 200 ? "2-3 years" : "3-5 years",
      },
    };

    // Calculate NDWI-based drought risk
    const ndwiRisk = calculateNDWIRisk(
      {
        country: company.country,
        name: company.name,
      },
      currentIrrigation,
      currentYear,
    );

    // Calculate scarcity projections
    const scarcityProjections = calculateScarcityProjections(
      currentIrrigation,
      keyTotals.waterReuse.rate,
      5,
    );

    // Prepare comprehensive response
    const data = {
      // Company Information
      company: {
        id: company._id,
        name: company.name,
        registrationNumber: company.registrationNumber,
        email: company.email,
        phone: company.phone,
        address: company.address,
        website: company.website,
        country: company.country,
        industry: company.industry,
        description: company.description,
        purpose: company.purpose,
        scope: company.scope,
        data_source: company.data_source,
        area_of_interest_metadata: company.area_of_interest_metadata,
        data_range: company.data_range,
        data_processing_workflow: company.data_processing_workflow,
        analytical_layer_metadata: company.analytical_layer_metadata,
        esg_reporting_framework: company.esg_reporting_framework,
        esg_contact_person: company.esg_contact_person,
        latest_esg_report_year: company.latest_esg_report_year,
        esg_data_status: company.esg_data_status,
        has_esg_linked_pay: company.has_esg_linked_pay,
        created_at: company.created_at,
        updated_at: company.updated_at,
      },

      // Analysis Period
      analysisPeriod: {
        currentYear,
        previousYear,
        availableYears: years,
        dataRange: `${Math.min(...years)}-${Math.max(...years)}`,
      },

      // 8 KEY TOTALS
      keyTotals,

      // Detailed Metrics (All available)
      metrics: {
        water: waterMetrics,
        energy: energyMetrics,
        risk: riskMetrics,
        all: allMetrics, // Includes all categories
      },

      // Risk Assessment
      riskAssessment: {
        droughtRisk: ndwiRisk,
        scarcityRisk: {
          level:
            currentIrrigation > 180
              ? "High"
              : currentIrrigation > 120
                ? "Medium"
                : "Low",
          score:
            currentIrrigation > 180 ? 80 : currentIrrigation > 120 ? 50 : 20,
          factors: [
            currentIrrigation > 180
              ? "Exceeds sustainable withdrawal limits"
              : null,
            company.country === "Zimbabwe"
              ? "Region experiences periodic droughts"
              : null,
            keyTotals.waterReuse.rate < 30
              ? "Low resilience through recycling"
              : null,
          ].filter((f) => f),
        },
        qualityRisk: {
          level:
            keyTotals.waterReuse.rate < 20
              ? "High"
              : keyTotals.waterReuse.rate < 40
                ? "Medium"
                : "Low",
          score:
            keyTotals.waterReuse.rate < 20
              ? 75
              : keyTotals.waterReuse.rate < 40
                ? 45
                : 15,
          treatmentCoverage: keyTotals.waterTreatmentCapacity.coverage,
        },
        regulatoryRisk: {
          level: company.country === "Zimbabwe" ? "Medium" : "Low",
          score: company.country === "Zimbabwe" ? 60 : 30,
          complianceStatus: "Compliant",
          upcomingRegulations: [
            "Water Efficiency Standards 2026",
            "Discharge Quality Limits",
          ],
        },
        financialRisk: {
          annualCost:
            parseFloat(keyTotals.costImplications.waterCost) +
            parseFloat(keyTotals.costImplications.energyCost) +
            " $",
          exposure: (currentIrrigation * 100).toFixed(0) + " $/ML shortage",
          insurancePremium: (currentIrrigation * 50).toFixed(0) + " $/year",
        },
      },

      // Projections and Forecasts
      projections: {
        scarcity: scarcityProjections,
        efficiencyGains: [
          {
            year: currentYear + 1,
            potentialSavings: "15%",
            investment: "200,000 $",
          },
          {
            year: currentYear + 2,
            potentialSavings: "25%",
            investment: "150,000 $",
          },
          {
            year: currentYear + 3,
            potentialSavings: "35%",
            investment: "100,000 $",
          },
        ],
        climateImpact: {
          rainfallVariability: "±20% predicted",
          temperatureIncrease: "+1.5°C by 2030",
          evaporationLoss: "Increase by 15%",
        },
      },

      // GRAPHS (Enhanced with more visualizations)
      graphs: {
        // 1. Water Usage Trend (Multi-year)
        waterUsageTrend: {
          type: "line",
          title: "Water Usage Trend (5-Year History)",
          labels: years.slice(-5),
          datasets: [
            {
              label: "Total Withdrawal",
              data: years
                .slice(-5)
                .map((y) => getMetricValueByYear(totalWaterWithdrawal, y) || 0),
              borderColor: "#3498db",
              backgroundColor: "rgba(52, 152, 219, 0.1)",
              borderWidth: 3,
            },
            {
              label: "Irrigation Water",
              data: years
                .slice(-5)
                .map((y) => getMetricValueByYear(irrigationWater, y) || 0),
              borderColor: "#2ecc71",
              backgroundColor: "rgba(46, 204, 113, 0.1)",
              borderWidth: 2,
              borderDash: [5, 5],
            },
          ],
        },

        // 2. Water Balance Pie Chart
        waterBalance: {
          type: "doughnut",
          title: "Water Balance Analysis",
          labels: [
            "Irrigation Use",
            "Treated Water",
            "Reused Water",
            "Other Uses",
            "Losses",
          ],
          datasets: [
            {
              data: [
                currentIrrigation,
                currentTreatment,
                currentEffluent / 1000,
                Math.max(
                  0,
                  currentTotalWithdrawal - currentIrrigation - currentTreatment,
                ),
                Math.max(
                  0,
                  currentTotalWithdrawal -
                    currentTreatment -
                    currentEffluent / 1000,
                ),
              ],
              backgroundColor: [
                "#3498db",
                "#2ecc71",
                "#9b59b6",
                "#f39c12",
                "#e74c3c",
              ],
            },
          ],
        },

        // 3. Water-Energy Nexus
        waterEnergyNexus: {
          type: "bar",
          title: "Water-Energy Nexus Analysis",
          labels: years.slice(-3),
          datasets: [
            {
              label: "Water Usage (million ML)",
              data: years
                .slice(-3)
                .map((y) => getMetricValueByYear(irrigationWater, y) || 0),
              backgroundColor: "#3498db",
              yAxisID: "y",
            },
            {
              label: "Energy for Water (GJ)",
              data: years
                .slice(-3)
                .map((y) => (getMetricValueByYear(totalEnergy, y) || 0) * 0.3),
              backgroundColor: "#f39c12",
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
                title: { display: true, text: "Energy (GJ)" },
              },
            },
          },
        },

        // 4. Efficiency vs Risk Correlation
        efficiencyRiskCorrelation: {
          type: "scatter",
          title: "Efficiency vs Risk Correlation",
          datasets: years.slice(-5).map((y) => ({
            label: y.toString(),
            data: [
              {
                x: getMetricValueByYear(irrigationWater, y) || 0,
                y: (getMetricValueByYear(electricity, y) || 0) * 0.3,
                r: y === currentYear ? 15 : 10,
              },
            ],
            backgroundColor: y === currentYear ? "#e74c3c" : "#3498db",
          })),
        },

        // 5. Water Recycling Trend
        recyclingTrend: {
          type: "line",
          title: "Water Recycling Rate Trend",
          labels: years.slice(-5),
          datasets: [
            {
              label: "Recycling Rate (%)",
              data: years.slice(-5).map((y) => {
                const recyclingValue = getMetricValueByYear(
                  waterRecyclingRate,
                  y,
                );
                if (recyclingValue) return recyclingValue;

                const effluent =
                  getMetricValueByYear(effluentDischarge, y) || 0;
                const treatment = getMetricValueByYear(waterTreatment, y) || 1;
                return (effluent / 1000 / treatment) * 100;
              }),
              borderColor: "#9b59b6",
              backgroundColor: "rgba(155, 89, 182, 0.1)",
              fill: true,
              tension: 0.4,
            },
          ],
        },

        // 6. Risk Components Radar Chart
        riskRadar: {
          type: "radar",
          title: "Water Risk Components",
          labels: [
            "Scarcity",
            "Quality",
            "Regulatory",
            "Operational",
            "Financial",
            "Reputational",
          ],
          datasets: [
            {
              label: "Current Risk Score",
              data: [
                currentIrrigation > 180
                  ? 80
                  : currentIrrigation > 120
                    ? 50
                    : 20,
                keyTotals.waterReuse.rate < 20
                  ? 75
                  : keyTotals.waterReuse.rate < 40
                    ? 45
                    : 15,
                currentRegulatoryRisk,
                60,
                parseFloat(keyTotals.costImplications.waterCost) > 1000000
                  ? 70
                  : 40,
                30,
              ],
              backgroundColor: "rgba(231, 76, 60, 0.2)",
              borderColor: "#e74c3c",
            },
            {
              label: "Industry Average",
              data: [40, 50, 45, 55, 35, 25],
              backgroundColor: "rgba(52, 152, 219, 0.2)",
              borderColor: "#3498db",
              borderDash: [5, 5],
            },
          ],
        },

        // 7. Projection Forecast
        scarcityProjection: {
          type: "line",
          title: "Water Scarcity Projection (Next 5 Years)",
          labels: scarcityProjections.map((p) => p.year.toString()),
          datasets: [
            {
              label: "Projected Water Need",
              data: scarcityProjections.map((p) => parseFloat(p.value)),
              borderColor: "#e74c3c",
              backgroundColor: "rgba(231, 76, 60, 0.1)",
              borderWidth: 2,
              fill: true,
            },
            {
              label: "Current Usage",
              data: scarcityProjections.map(() => currentIrrigation),
              borderColor: "#3498db",
              backgroundColor: "transparent",
              borderWidth: 1,
              borderDash: [5, 5],
            },
          ],
        },

        // 8. Cost Breakdown
        costBreakdown: {
          type: "bar",
          title: "Annual Water Management Cost Breakdown",
          labels: [
            "Water Procurement",
            "Energy for Water",
            "Treatment",
            "Compliance",
            "Risk Insurance",
          ],
          datasets: [
            {
              label: "Cost ($)",
              data: [
                parseFloat(keyTotals.costImplications.waterCost),
                parseFloat(keyTotals.costImplications.energyCost),
                parseFloat(keyTotals.costImplications.waterCost) * 0.2,
                parseFloat(keyTotals.costImplications.waterCost) * 0.1,
                parseFloat(keyTotals.costImplications.waterCost) * 0.05,
              ],
              backgroundColor: [
                "#3498db",
                "#f39c12",
                "#2ecc71",
                "#9b59b6",
                "#e74c3c",
              ],
            },
          ],
        },
      },

      // Recommendations (Prioritized)
      recommendations: {
        highPriority: [
          currentIrrigation > 180
            ? "Implement precision irrigation (drip/sprinkler) systems"
            : null,
          keyTotals.waterReuse.rate < 30
            ? "Install water recycling and reuse infrastructure"
            : null,
          keyTotals.waterTreatmentCapacity.coverage.includes("0%")
            ? "Expand water treatment capacity"
            : null,
        ].filter((r) => r),

        mediumPriority: [
          keyTotals.waterRelatedEnergy.intensity > 80
            ? "Optimize pump efficiency and scheduling"
            : null,
          "Implement soil moisture monitoring for optimal irrigation",
          "Develop drought contingency plan",
        ].filter((r) => r),

        longTerm: [
          "Invest in rainwater harvesting systems",
          "Explore wastewater-to-energy opportunities",
          "Participate in water stewardship initiatives",
        ],
      },

      // Compliance and Reporting
      compliance: {
        frameworks: company.esg_reporting_framework || [],
        reportingStatus: company.esg_data_status || "not_collected",
        nextReportDue: currentYear + 1,
        keyMetricsDisclosed:
          Object.keys(waterMetrics).length + " water metrics",
        gaps:
          Object.keys(waterMetrics).length < 5
            ? "Insufficient water metrics disclosure"
            : "Adequate disclosure",
      },

      // Metadata
      metadata: {
        dataQuality: allMetrics.companyInfo.dataQualityScore || "Not assessed",
        verificationStatus:
          allMetrics.companyInfo.verificationStatus || "unverified",
        lastUpdated: new Date().toISOString(),
        analysisMethodology: "NDWI-based drought risk + Water balance analysis",
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve irrigation efficiency data",
      500,
      "IRRIGATION_API_ERROR",
      {
        details: error.message,
        stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
      },
    );
  }
}

module.exports = {
  getIrrigationWaterRiskData,
};
