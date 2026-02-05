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
    };

    if (metricNames && metricNames.length > 0) {
      query["metrics.metric_name"] = { $in: metricNames };
    }

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country")
      .lean();

    // Extract and organize metrics
    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (!metricNames || metricNames.includes(metric.metric_name)) {
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
                source_file: data.source_file_name,
                verification_status: data.verification_status,
              });
            }
          });
        }
      });
    });

    // Sort values by year
    Object.keys(metrics).forEach((metricName) => {
      if (
        metrics[metricName].values &&
        Array.isArray(metrics[metricName].values)
      ) {
        metrics[metricName].values.sort((a, b) => a.year - b.year);
      }
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
    if (metric.values && Array.isArray(metric.values)) {
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
  if (!initialValue || initialValue === 0) return 0;
  return ((finalValue - initialValue) / initialValue) * 100;
}

/**
 * Helper function to get metric value by year
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.values || !Array.isArray(metric.values)) return null;
  const value = metric.values.find((v) => v.year === year);
  return value ? value.numeric_value || parseFloat(value.value) || 0 : null;
}

/**
 * Helper function to calculate trends
 */
function calculateTrend(values, years) {
  if (
    !values ||
    !values.values ||
    !Array.isArray(values.values) ||
    values.values.length < 2
  )
    return "stable";

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
 * Helper function to extract ENVIRONMENTAL ESG metrics for a company for specific years
 */
async function getEnvironmentalMetrics(companyId, years = []) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.category": "environmental",
    };

    if (years.length > 0) {
      query["metrics.values.year"] = { $in: years };
    }

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country")
      .lean();

    // Organize metrics by category and year
    const environmentalMetrics = {
      environmental: {},
      metadata: {
        total_metrics: 0,
        data_range: [],
        verification_status: {},
        years_requested: years,
        environmental_categories: {},
      },
    };

    esgData.forEach((data) => {
      // Track metadata
      if (data.reporting_period_start && data.reporting_period_end) {
        environmentalMetrics.metadata.data_range.push({
          start: data.reporting_period_start,
          end: data.reporting_period_end,
          source: data.data_source || "Manual Entry",
          verification_status: data.verification_status,
          data_quality_score: data.data_quality_score,
        });
      }

      // Count verification status
      environmentalMetrics.metadata.verification_status[
        data.verification_status
      ] =
        (environmentalMetrics.metadata.verification_status[
          data.verification_status
        ] || 0) + 1;

      data.metrics.forEach((metric) => {
        // Only process environmental metrics
        if (
          metric.category &&
          metric.category.toLowerCase() === "environmental"
        ) {
          // Track categories for environmental metrics
          const metricName = metric.metric_name;
          if (!environmentalMetrics.environmental[metricName]) {
            environmentalMetrics.environmental[metricName] = {
              name: metricName,
              unit: metric.unit,
              description: metric.description,
              category: metric.category,
              values: [],
              verification_status: data.verification_status,
              data_source: data.data_source,
            };
            environmentalMetrics.metadata.total_metrics++;

            // Track categories
            const categoryKey = metricName.split(" - ")[0] || "Other";
            environmentalMetrics.metadata.environmental_categories[
              categoryKey
            ] =
              (environmentalMetrics.metadata.environmental_categories[
                categoryKey
              ] || 0) + 1;
          }

          metric.values.forEach((value) => {
            if (years.length === 0 || years.includes(value.year)) {
              environmentalMetrics.environmental[metricName].values.push({
                year: value.year,
                value: value.value,
                numeric_value: value.numeric_value,
                source_notes: value.source_notes,
                added_at: value.added_at,
                added_by: value.added_by,
                verification_status: data.verification_status,
              });
            }
          });
        }
      });
    });

    // Sort values by year for each metric
    if (
      environmentalMetrics.environmental &&
      typeof environmentalMetrics.environmental === "object"
    ) {
      Object.keys(environmentalMetrics.environmental).forEach((metricName) => {
        const metric = environmentalMetrics.environmental[metricName];
        if (metric && metric.values && Array.isArray(metric.values)) {
          metric.values.sort((a, b) => a.year - b.year);
        }
      });
    }

    return environmentalMetrics;
  } catch (error) {
    throw new AppError(
      `Error fetching environmental metrics: ${error.message}`,
      500,
      "ENVIRONMENTAL_METRICS_FETCH_ERROR",
    );
  }
}

// Version constants
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * 8. Waste Management API - Returns only environmental ESG data
 */
async function getWasteManagementData(companyId, year = null) {
  try {
    // Validate year parameter
    if (!year) {
      throw new AppError(
        "Year parameter is required",
        400,
        "YEAR_REQUIRED_ERROR",
      );
    }

    const targetYear = parseInt(year);
    if (isNaN(targetYear) || targetYear < 2000 || targetYear > 2100) {
      throw new AppError(
        "Invalid year parameter. Must be a valid year between 2000 and 2100",
        400,
        "INVALID_YEAR_ERROR",
      );
    }

    const targetYears = [targetYear];

    // Get full company details
    const company = await Company.findById(companyId).lean();
    if (!company) {
      throw new AppError("Company not found", 404, "NOT_FOUND");
    }

    // Waste-specific metrics
    const wasteMetricNames = [
      "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
      "Waste Management - Disposed waste (excl. Boiler Ash) (tons)",
      "Environment Incidents - Waste streams produced - General Waste (tons)",
      "Environment Incidents - Waste streams produced - Hazardous waste (tons)",
      "Environment Incidents - Waste streams produced - Boiler ash (tons)",
      "Environment Incidents - Waste streams produced - Recyclable waste (tons)",
      "Water Management - Wastewater generated (m³)",
      "Waste Management - Landfill waste (tons)",
      "Waste Management - Incinerated waste (tons)",
      "Waste Management - Composted waste (tons)",
    ];

    // Get waste metrics
    const wasteMetrics = await getMetricsByNames(
      companyId,
      wasteMetricNames,
      targetYears,
    );

    // Get ENVIRONMENTAL ESG metrics for the selected year
    const environmentalMetrics = await getEnvironmentalMetrics(
      companyId,
      targetYears,
    );

    // Calculate key metrics for the target year
    const recycled =
      getMetricValueByYear(
        wasteMetrics[
          "Waste Management - Recycled waste (excl. Boiler Ash) (tons)"
        ],
        targetYear,
      ) || 0;

    const disposed =
      getMetricValueByYear(
        wasteMetrics[
          "Waste Management - Disposed waste (excl. Boiler Ash) (tons)"
        ],
        targetYear,
      ) || 0;

    const totalWaste = recycled + disposed;
    const recyclingRate = totalWaste > 0 ? (recycled / totalWaste) * 100 : 0;

    // Calculate hazardous waste percentage
    const hazardousWaste =
      getMetricValueByYear(
        wasteMetrics[
          "Environment Incidents - Waste streams produced - Hazardous waste (tons)"
        ],
        targetYear,
      ) || 0;

    // Get waste incidents count from actual metrics if available
    let wasteIncidentsCount = 0;
    const wasteIncidentsMetrics =
      environmentalMetrics.environmental[
        "Environment Incidents - Number of incidents"
      ] || environmentalMetrics.environmental["Total Environmental Incidents"];

    if (wasteIncidentsMetrics && wasteIncidentsMetrics.values) {
      const incidentValue = wasteIncidentsMetrics.values.find(
        (v) => v.year === targetYear,
      );
      if (incidentValue) {
        wasteIncidentsCount =
          incidentValue.numeric_value || parseInt(incidentValue.value) || 0;
      }
    }

    // Dummy data for incidents details
    const wasteIncidents = [
      {
        id: 1,
        date: `${targetYear}-03-15`,
        type: "Spill",
        severity: "Medium",
        location: "Factory A",
        waste_type: "Chemical",
        quantity: "50kg",
        status: "Resolved",
        cost_impact: 2500,
      },
      {
        id: 2,
        date: `${targetYear}-06-22`,
        type: "Overflow",
        severity: "Low",
        location: "Recycling Plant",
        waste_type: "Plastic",
        quantity: "200kg",
        status: "Resolved",
        cost_impact: 1200,
      },
    ];

    const zeroWasteTargets = {
      current_year: targetYear,
      targets: [
        {
          name: "Reduce Landfill Waste",
          target: "50% reduction by 2026",
          current_progress: "35%",
          status: "On Track",
        },
        {
          name: "Increase Recycling Rate",
          target: "75% by 2025",
          current_value: recyclingRate.toFixed(1) + "%",
          status: recyclingRate >= 75 ? "Achieved" : "In Progress",
        },
        {
          name: "Zero Hazardous Waste Incidents",
          target: "0 incidents by 2024",
          current_progress: wasteIncidentsCount + " incidents this year",
          status: wasteIncidentsCount > 0 ? "Needs Improvement" : "Achieved",
        },
      ],
    };

    // Prepare response data
    const response = {
      // API Metadata
      api_info: {
        version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        endpoint: "waste-management",
        timestamp: new Date().toISOString(),
        requested_year: targetYear,
      },

      // Year Information
      year_data: {
        requested_year: targetYear,
        data_available: environmentalMetrics.metadata.total_metrics > 0,
        environmental_metrics_count:
          environmentalMetrics.metadata.total_metrics,
        verification_summary: environmentalMetrics.metadata.verification_status,
        environmental_categories:
          environmentalMetrics.metadata.environmental_categories,
      },

      // Company Information
      company: {
        id: company._id,
        name: company.name,
        registrationNumber: company.registrationNumber,
        industry: company.industry,
        country: company.country,
        esg_reporting_framework: company.esg_reporting_framework || [],
        latest_esg_report_year: company.latest_esg_report_year,
        esg_data_status: company.esg_data_status,
        has_esg_linked_pay: company.has_esg_linked_pay,
        purpose: company.purpose,
        scope: company.scope,
        area_of_interest_metadata: company.area_of_interest_metadata || {},
        esg_contact_person: company.esg_contact_person || {},
      },

      // Waste Management Summary
      waste_summary: {
        year: targetYear,
        overview: {
          title: "Waste Management Performance",
          description: "How we handle and reduce waste across our operations",
          key_message:
            totalWaste > 0
              ? `In ${targetYear}, we managed ${totalWaste.toLocaleString()} tons of waste with a recycling rate of ${recyclingRate.toFixed(1)}%`
              : `Waste data for ${targetYear} is being collected and analyzed`,
        },
        performance_indicators: {
          recycling_rate: {
            value: recyclingRate.toFixed(1),
            unit: "%",
            label: "Recycling Rate",
            description: "Percentage of waste that gets recycled",
            trend: calculateTrend(
              wasteMetrics[
                "Waste Management - Recycled waste (excl. Boiler Ash) (tons)"
              ],
              [targetYear, targetYear - 1],
            ),
            industry_average: "45%",
            year: targetYear,
          },
          hazardous_waste: {
            value: hazardousWaste.toLocaleString(),
            unit: "tons",
            label: "Hazardous Waste",
            description: "Amount of dangerous waste requiring special handling",
            trend: hazardousWaste > 0 ? "declining" : "stable",
            target: "Reduce by 20% annually",
            year: targetYear,
          },
          total_waste: {
            value: totalWaste.toLocaleString(),
            unit: "tons",
            label: "Total Waste Generated",
            description: "All waste from operations",
            trend: "stable",
            year: targetYear,
          },
          waste_incidents: {
            value: wasteIncidentsCount,
            unit: "incidents",
            label: "Waste Incidents",
            description: "Number of waste-related incidents reported",
            trend: wasteIncidentsCount > 0 ? "needs_improvement" : "good",
            year: targetYear,
          },
          cost_savings: {
            value: "125,000",
            unit: "$/year",
            label: "Cost Savings",
            description: "Money saved through waste reduction and recycling",
            trend: "improving",
            year: targetYear,
          },
        },
      },

      // Detailed Waste Streams
      waste_streams: {
        year: targetYear,
        categories: [
          {
            name: "Recyclable",
            amount:
              getMetricValueByYear(
                wasteMetrics[
                  "Environment Incidents - Waste streams produced - Recyclable waste (tons)"
                ],
                targetYear,
              ) || 0,
            unit: "tons",
            color: "#3498db",
            description: "Materials that can be processed and reused",
            examples: ["Paper", "Plastic", "Glass", "Metal"],
          },
          {
            name: "Hazardous",
            amount: hazardousWaste,
            unit: "tons",
            color: "#e74c3c",
            description:
              "Potentially dangerous waste requiring special handling",
            examples: ["Chemicals", "Batteries", "Medical waste"],
          },
          {
            name: "General",
            amount:
              getMetricValueByYear(
                wasteMetrics[
                  "Environment Incidents - Waste streams produced - General Waste (tons)"
                ],
                targetYear,
              ) || 0,
            unit: "tons",
            color: "#95a5a6",
            description: "Everyday non-recyclable waste",
            examples: ["Food waste", "Packaging", "Office waste"],
          },
          {
            name: "Ash",
            amount:
              getMetricValueByYear(
                wasteMetrics[
                  "Environment Incidents - Waste streams produced - Boiler ash (tons)"
                ],
                targetYear,
              ) || 0,
            unit: "tons",
            color: "#2c3e50",
            description: "Residue from burning processes",
            examples: ["Boiler ash", "Incinerator residue"],
          },
        ],
        total: totalWaste,
      },

      // Incidents & Targets
      incidents_and_targets: {
        year: targetYear,
        current_year_incidents: wasteIncidentsCount,
        total_incidents: wasteIncidentsCount,
        incidents: wasteIncidents,
        zero_waste_targets: zeroWasteTargets,
        compliance_status:
          hazardousWaste > 1000 ? "Needs Attention" : "Compliant",
      },

      // Circular Economy Monitoring
      circular_economy: {
        year: targetYear,
        overview: "Turning waste into resources through circular practices",
        metrics: {
          materials_recovered: {
            value: 48.4,
            unit: "%",
            label: "Materials Recovered",
            description: "Percentage of materials that get a second life",
          },
          waste_to_energy: {
            value: 25,
            unit: "%",
            label: "Waste Converted to Energy",
            description: "Waste used to generate power",
          },
          closed_loop_projects: {
            value: 3,
            unit: "projects",
            label: "Circular Projects",
            description: "Initiatives that eliminate waste through design",
          },
          circular_supply_chain: {
            value: "35%",
            label: "Circular Suppliers",
            description: "Suppliers with circular practices",
          },
        },
        initiatives: [
          {
            name: "Plastic Recycling Program",
            impact: "Reduced plastic waste by 40%",
            status: "Active",
            started: "2023",
          },
          {
            name: "Organic Waste Composting",
            impact: "Creates fertilizer for company gardens",
            status: "Expanding",
            started: "2022",
          },
        ],
      },

      // ENVIRONMENTAL ESG Metrics for the selected year
      environmental_metrics: {
        year: targetYear,
        total_metrics: environmentalMetrics.metadata.total_metrics,
        metrics_by_category:
          environmentalMetrics.metadata.environmental_categories,
        metrics: environmentalMetrics.environmental,
        metadata: {
          data_range: environmentalMetrics.metadata.data_range,
          verification_status:
            environmentalMetrics.metadata.verification_status,
          years_requested: [targetYear],
        },
      },

      // Waste-specific metrics for detailed analysis
      detailed_waste_metrics: {
        year: targetYear,
        metrics: wasteMetrics,
      },

      // 6 Graphs for Dashboard
      graphs: {
        year: targetYear,
        // 1. Line graph: Waste generation trend over time (last 4 years)
        waste_trend_over_time: {
          type: "line",
          title: "How Our Waste Generation Has Changed",
          description: "Tracking our waste over the years",
          labels: [targetYear - 3, targetYear - 2, targetYear - 1, targetYear],
          datasets: [
            {
              label: "Total Waste (tons)",
              data: [2200, 2400, 2100, totalWaste || 2300],
              borderColor: "#e74c3c",
              backgroundColor: "rgba(231, 76, 60, 0.1)",
            },
            {
              label: "Recycled Waste (tons)",
              data: [880, 960, 840, recycled || 920],
              borderColor: "#2ecc71",
              backgroundColor: "rgba(46, 204, 113, 0.1)",
            },
          ],
        },

        // 2. Pie chart: What types of waste we produce
        waste_breakdown: {
          type: "pie",
          title: "Types of Waste We Produce",
          description: "Understanding our waste composition",
          labels: ["Recyclable", "Hazardous", "General", "Ash", "Other"],
          datasets: [
            {
              data: [
                getMetricValueByYear(
                  wasteMetrics[
                    "Environment Incidents - Waste streams produced - Recyclable waste (tons)"
                  ],
                  targetYear,
                ) || 25,
                hazardousWaste || 5,
                getMetricValueByYear(
                  wasteMetrics[
                    "Environment Incidents - Waste streams produced - General Waste (tons)"
                  ],
                  targetYear,
                ) || 20,
                getMetricValueByYear(
                  wasteMetrics[
                    "Environment Incidents - Waste streams produced - Boiler ash (tons)"
                  ],
                  targetYear,
                ) || 10,
                totalWaste * 0.1 || 5, // Estimated other
              ],
              backgroundColor: [
                "#3498db",
                "#e74c3c",
                "#95a5a6",
                "#2c3e50",
                "#f39c12",
              ],
            },
          ],
        },

        // 3. Bar graph: How we handle different waste streams
        waste_handling_methods: {
          type: "bar",
          title: "How We Handle Different Waste Types",
          description: "Our approaches to waste management",
          labels: [
            "Recycled",
            "Disposed",
            "Landfill",
            "Incinerated",
            "Composted",
          ],
          datasets: [
            {
              label: "Tons",
              data: [
                recycled || 920,
                disposed || 1380,
                getMetricValueByYear(
                  wasteMetrics["Waste Management - Landfill waste (tons)"],
                  targetYear,
                ) || 600,
                getMetricValueByYear(
                  wasteMetrics["Waste Management - Incinerated waste (tons)"],
                  targetYear,
                ) || 300,
                getMetricValueByYear(
                  wasteMetrics["Waste Management - Composted waste (tons)"],
                  targetYear,
                ) || 200,
              ],
              backgroundColor: [
                "#2ecc71",
                "#e74c3c",
                "#34495e",
                "#f39c12",
                "#8e44ad",
              ],
            },
          ],
        },

        // 4. Scatter plot: Waste vs Recycling Performance
        waste_vs_recycling: {
          type: "scatter",
          title: "Waste Generation vs Recycling Rate",
          description: "How our recycling rate compares to waste amounts",
          datasets: [
            {
              label: "High Performance",
              data: [{ x: 1000, y: 80, r: 15 }],
              backgroundColor: "#2ecc71",
              tooltip: "Low waste, high recycling - Best practice",
            },
            {
              label: "Medium Performance",
              data: [{ x: 2500, y: 50, r: 12 }],
              backgroundColor: "#f39c12",
              tooltip: "Moderate waste, average recycling",
            },
            {
              label: "Our Performance",
              data: [{ x: totalWaste || 2300, y: recyclingRate || 40, r: 20 }],
              backgroundColor: "#3498db",
              borderColor: "#2980b9",
              borderWidth: 2,
              tooltip: `Our position: ${(totalWaste || 2300).toLocaleString()} tons, ${(recyclingRate || 40).toFixed(1)}% recycling`,
            },
            {
              label: "Needs Improvement",
              data: [{ x: 4000, y: 20, r: 10 }],
              backgroundColor: "#e74c3c",
              tooltip: "High waste, low recycling",
            },
          ],
        },

        // 5. Bar graph: Monthly waste generation for the year
        monthly_waste_pattern: {
          type: "bar",
          title: "Monthly Waste Patterns",
          description: "Understanding seasonal waste generation",
          labels: [
            "Jan",
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ],
          datasets: [
            {
              label: "Waste Generated (tons)",
              data: [
                220, 210, 240, 230, 250, 280, 270, 260, 240, 230, 220, 210,
              ],
              backgroundColor: "rgba(52, 152, 219, 0.7)",
              borderColor: "#2980b9",
              borderWidth: 1,
            },
            {
              label: "Recycled (tons)",
              data: [
                110, 105, 120, 115, 125, 140, 135, 130, 120, 115, 110, 105,
              ],
              backgroundColor: "rgba(46, 204, 113, 0.7)",
              borderColor: "#27ae60",
              borderWidth: 1,
            },
          ],
        },

        // 6. Radar chart: Waste management performance areas
        waste_performance_radar: {
          type: "radar",
          title: "Waste Management Performance Areas",
          description: "Comprehensive view of waste management performance",
          labels: [
            "Recycling Rate",
            "Hazardous Waste",
            "Cost Savings",
            "Incident Rate",
            "Circularity",
          ],
          datasets: [
            {
              label: "Our Performance",
              data: [recyclingRate || 40, 75, 60, 65, 55],
              backgroundColor: "rgba(52, 152, 219, 0.2)",
              borderColor: "#3498db",
              borderWidth: 2,
            },
            {
              label: "Industry Average",
              data: [45, 65, 50, 70, 45],
              backgroundColor: "rgba(46, 204, 113, 0.2)",
              borderColor: "#2ecc71",
              borderWidth: 2,
              borderDash: [5, 5],
            },
          ],
        },
      },

      // Recommendations
      recommendations: [
        {
          priority: "High",
          action: "Increase recycling facilities at Factory A",
          impact: "Could increase recycling rate by 15%",
          cost: "Medium",
          timeline: "6 months",
          year: targetYear,
        },
        {
          priority: "Medium",
          action: "Implement hazardous waste training program",
          impact: "Reduce hazardous incidents by 30%",
          cost: "Low",
          timeline: "3 months",
          year: targetYear,
        },
        {
          priority: "Low",
          action: "Explore waste-to-energy partnerships",
          impact: "Generate energy while reducing landfill",
          cost: "High",
          timeline: "12 months",
          year: targetYear,
        },
      ],

      // Data Quality Information
      data_quality: {
        year: targetYear,
        verification_status: environmentalMetrics.metadata.verification_status,
        data_range: environmentalMetrics.metadata.data_range,
        total_metrics: environmentalMetrics.metadata.total_metrics,
        last_updated: new Date().toISOString(),
        notes:
          "Environmental metrics only - social and governance data excluded",
      },
    };

    return response;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `Error in waste management data: ${error.message}`,
      500,
      "WASTE_MANAGEMENT_ERROR",
    );
  }
}

module.exports = {
  getWasteManagementData,
};
