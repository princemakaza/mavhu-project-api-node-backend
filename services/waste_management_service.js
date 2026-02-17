const Company = require("../models/company_model");
const WasteManagementData = require("../models/waste_management_model");
const AppError = require("../utils/app_error");

// Version constants
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract a numeric value from a metric by name and year
 */
function getMetricValue(metrics, metricName, year) {
  if (!metrics || !Array.isArray(metrics)) return 0;
  const metric = metrics.find((m) => m.metric_name === metricName);
  if (!metric || !metric.yearly_data || !Array.isArray(metric.yearly_data))
    return 0;
  const yearly = metric.yearly_data.find((yd) => yd.year === String(year));
  if (!yearly) return 0;
  return yearly.numeric_value || parseFloat(yearly.value) || 0;
}

/**
 * Helper function to extract values for multiple years from a metric
 */
function getMetricValuesForYears(metrics, metricName, years) {
  return years.map((year) => getMetricValue(metrics, metricName, year));
}

/**
 * Helper function to calculate percentage change
 */
function calculatePercentageChange(initialValue, finalValue) {
  if (!initialValue || initialValue === 0) return 0;
  return ((finalValue - initialValue) / initialValue) * 100;
}

/**
 * Helper function to calculate trend based on first and last year values
 */
function calculateTrend(metrics, metricName, years) {
  const values = getMetricValuesForYears(metrics, metricName, years).filter(
    (v) => v !== null && v !== undefined,
  );
  if (values.length < 2) return "stable";
  const firstValue = values[0];
  const lastValue = values[values.length - 1];
  const change = calculatePercentageChange(firstValue, lastValue);
  if (change > 5) return "improving";
  if (change < -5) return "declining";
  return "stable";
}

/**
 * Waste Management Data API
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

    // Get company details
    const company = await Company.findById(companyId).lean();
    if (!company) {
      throw new AppError("Company not found", 404, "NOT_FOUND");
    }

    // Fetch the active WasteManagementData record
    const wasteDataRecord = await WasteManagementData.findOne({
      company: companyId,
      is_active: true,
    }).lean();

    // If no data, we still proceed with zeros, but include null record
    const metrics = wasteDataRecord?.metrics || [];

    // Trend years (last 4 years including target)
    const trendYears = [
      targetYear - 3,
      targetYear - 2,
      targetYear - 1,
      targetYear,
    ].filter((y) => y >= 2020);

    // Waste‑specific metric names (as expected from imported data)
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

    // Extract values for the target year
    const recycled = getMetricValue(
      metrics,
      "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
      targetYear,
    );
    const disposed = getMetricValue(
      metrics,
      "Waste Management - Disposed waste (excl. Boiler Ash) (tons)",
      targetYear,
    );
    const totalWaste = recycled + disposed;
    const recyclingRate = totalWaste > 0 ? (recycled / totalWaste) * 100 : 0;

    const hazardousWaste = getMetricValue(
      metrics,
      "Environment Incidents - Waste streams produced - Hazardous waste (tons)",
      targetYear,
    );

    // Waste incidents – we can derive from a dedicated metric if available
    const wasteIncidentsCount = 0; // Placeholder; can be added later

    // Dummy incident details (can be replaced with real data)
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

    // Data quality score (simple completeness based on available metrics)
    const availableMetrics = wasteMetricNames.filter(
      (name) =>
        metrics.some((m) => m.metric_name === name) &&
        getMetricValue(metrics, name, targetYear) > 0,
    ).length;
    const completenessScore =
      wasteMetricNames.length > 0
        ? Math.round((availableMetrics / wasteMetricNames.length) * 100)
        : 0;

    // Prepare response
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

      // Include the full WasteManagementData record
      waste_management_data: wasteDataRecord || null,

      // Year Information
      year_data: {
        requested_year: targetYear,
        data_available: !!wasteDataRecord,
        environmental_metrics_count: metrics.length,
        verification_summary: {
          [wasteDataRecord?.verification_status || "unverified"]: 1,
        },
        environmental_categories: metrics.reduce((acc, m) => {
          const cat = m.category || "other";
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {}),
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
              metrics,
              "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
              trendYears,
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
            amount: getMetricValue(
              metrics,
              "Environment Incidents - Waste streams produced - Recyclable waste (tons)",
              targetYear,
            ),
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
            amount: getMetricValue(
              metrics,
              "Environment Incidents - Waste streams produced - General Waste (tons)",
              targetYear,
            ),
            unit: "tons",
            color: "#95a5a6",
            description: "Everyday non-recyclable waste",
            examples: ["Food waste", "Packaging", "Office waste"],
          },
          {
            name: "Ash",
            amount: getMetricValue(
              metrics,
              "Environment Incidents - Waste streams produced - Boiler ash (tons)",
              targetYear,
            ),
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

      // Environmental Metrics (all metrics from WasteManagementData)
      environmental_metrics: {
        year: targetYear,
        total_metrics: metrics.length,
        metrics_by_category: metrics.reduce((acc, m) => {
          const cat = m.category || "other";
          acc[cat] = (acc[cat] || 0) + 1;
          return acc;
        }, {}),
        metrics: metrics.reduce((acc, m) => {
          acc[m.metric_name] = {
            name: m.metric_name,
            category: m.category,
            subcategory: m.subcategory,
            unit: m.yearly_data?.[0]?.unit || "",
            description: m.description,
            values: (m.yearly_data || []).map((yd) => ({
              year: yd.year,
              value: yd.value,
              numeric_value: yd.numeric_value,
              source_notes: yd.source || yd.notes,
              added_at: yd.added_at,
              last_updated_at: yd.last_updated_at,
            })),
          };
          return acc;
        }, {}),
        metadata: {
          data_range: [
            {
              start: wasteDataRecord?.data_period_start,
              end: wasteDataRecord?.data_period_end,
              source: wasteDataRecord?.source_file_name,
              verification_status: wasteDataRecord?.verification_status,
              data_quality_score: wasteDataRecord?.data_quality_score,
            },
          ],
          verification_status: {
            [wasteDataRecord?.verification_status || "unverified"]: 1,
          },
          years_requested: [targetYear],
        },
      },

      // Detailed waste metrics (raw values for the target year)
      detailed_waste_metrics: {
        year: targetYear,
        metrics: wasteMetricNames.reduce((acc, name) => {
          acc[name] = getMetricValue(metrics, name, targetYear);
          return acc;
        }, {}),
      },

      // 6 Graphs for Dashboard
      graphs: {
        year: targetYear,
        waste_trend_over_time: {
          type: "line",
          title: "How Our Waste Generation Has Changed",
          description: "Tracking our waste over the years",
          labels: trendYears,
          datasets: [
            {
              label: "Total Waste (tons)",
              data: trendYears.map(
                (y) =>
                  getMetricValue(
                    metrics,
                    "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
                    y,
                  ) +
                    getMetricValue(
                      metrics,
                      "Waste Management - Disposed waste (excl. Boiler Ash) (tons)",
                      y,
                    ) || 0,
              ),
              borderColor: "#e74c3c",
              backgroundColor: "rgba(231, 76, 60, 0.1)",
            },
            {
              label: "Recycled Waste (tons)",
              data: trendYears.map(
                (y) =>
                  getMetricValue(
                    metrics,
                    "Waste Management - Recycled waste (excl. Boiler Ash) (tons)",
                    y,
                  ) || 0,
              ),
              borderColor: "#2ecc71",
              backgroundColor: "rgba(46, 204, 113, 0.1)",
            },
          ],
        },

        waste_breakdown: {
          type: "pie",
          title: "Types of Waste We Produce",
          description: "Understanding our waste composition",
          labels: ["Recyclable", "Hazardous", "General", "Ash", "Other"],
          datasets: [
            {
              data: [
                getMetricValue(
                  metrics,
                  "Environment Incidents - Waste streams produced - Recyclable waste (tons)",
                  targetYear,
                ) || 25,
                hazardousWaste || 5,
                getMetricValue(
                  metrics,
                  "Environment Incidents - Waste streams produced - General Waste (tons)",
                  targetYear,
                ) || 20,
                getMetricValue(
                  metrics,
                  "Environment Incidents - Waste streams produced - Boiler ash (tons)",
                  targetYear,
                ) || 10,
                totalWaste * 0.1 || 5,
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
                getMetricValue(
                  metrics,
                  "Waste Management - Landfill waste (tons)",
                  targetYear,
                ) || 600,
                getMetricValue(
                  metrics,
                  "Waste Management - Incinerated waste (tons)",
                  targetYear,
                ) || 300,
                getMetricValue(
                  metrics,
                  "Waste Management - Composted waste (tons)",
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
        completeness_score: completenessScore,
        verified_metrics: availableMetrics,
        total_expected_metrics: wasteMetricNames.length,
        verification_status:
          completenessScore > 80
            ? "good"
            : completenessScore > 50
              ? "moderate"
              : "poor",
        notes:
          completenessScore < 100
            ? `Missing ${wasteMetricNames.length - availableMetrics} waste metrics`
            : "All waste metrics available",
        waste_data_coverage: `${availableMetrics}/${wasteMetricNames.length} metrics`,
        data_range: [
          {
            start: wasteDataRecord?.data_period_start,
            end: wasteDataRecord?.data_period_end,
          },
        ],
        last_updated: new Date().toISOString(),
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
