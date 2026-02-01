const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract all environmental metrics for a specific year
 */
async function getEnvironmentalMetricsByYear(companyId, year) {
  try {
    if (!year) {
      throw new AppError("Year parameter is required", 400, "YEAR_REQUIRED");
    }

    const query = {
      company: companyId,
      is_active: true,
      "metrics.category": "environmental",
      "metrics.values.year": year,
    };

    const esgData = await ESGData.find(query).lean();

    // Extract and organize environmental metrics for the specific year
    const environmentalMetrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metric.category === "environmental") {
          if (!environmentalMetrics[metric.metric_name]) {
            environmentalMetrics[metric.metric_name] = {
              id: metric._id,
              name: metric.metric_name,
              category: metric.category,
              unit: metric.unit,
              description: metric.description || "",
              values: [],
              is_active: metric.is_active,
              created_at: metric.created_at,
              created_by: metric.created_by,
            };
          }

          // Find the value for the specific year
          const yearValue = metric.values.find((v) => v.year === year);
          if (yearValue) {
            let numericValue = yearValue.numeric_value;
            if (numericValue === undefined || numericValue === null) {
              if (typeof yearValue.value === "string") {
                const parsed = parseFloat(
                  yearValue.value.replace(/[^0-9.-]+/g, ""),
                );
                numericValue = isNaN(parsed) ? 0 : parsed;
              } else if (typeof yearValue.value === "number") {
                numericValue = yearValue.value;
              } else {
                numericValue = 0;
              }
            }

            environmentalMetrics[metric.metric_name].values.push({
              year: yearValue.year,
              value: yearValue.value,
              numeric_value: numericValue,
              source_notes: yearValue.source_notes,
              added_by: yearValue.added_by,
              added_at: yearValue.added_at,
              last_updated_by: yearValue.last_updated_by,
              last_updated_at: yearValue.last_updated_at,
            });
          }
        }
      });
    });

    // Sort metrics by name
    const sortedMetrics = {};
    Object.keys(environmentalMetrics)
      .sort()
      .forEach((key) => {
        sortedMetrics[key] = environmentalMetrics[key];
      });

    return sortedMetrics;
  } catch (error) {
    throw new AppError(
      `Error fetching environmental metrics: ${error.message}`,
      500,
      "ENVIRONMENTAL_METRICS_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to get comprehensive Carbon Emission Accounting data for specific year
 */
async function getComprehensiveCarbonEmissionData(companyId, year) {
  try {
    if (!year) {
      return null;
    }

    const carbonData = await CarbonEmissionAccounting.findOne({
      company: companyId,
      is_active: true,
      status: { $in: ["draft", "under_review", "approved", "published"] },
      "yearly_data.year": year,
    })
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) {
      return null;
    }

    // Find the specific year's data
    const yearData = carbonData.yearly_data.find((data) => data.year === year);
    if (!yearData) {
      return null;
    }

    // Process the year data with detailed breakdown
    const enhancedYearData = { ...yearData };

    // Process emissions data
    if (enhancedYearData.emissions) {
      // Scope 1 details
      if (
        enhancedYearData.emissions.scope1 &&
        enhancedYearData.emissions.scope1.sources
      ) {
        enhancedYearData.emissions.scope1.detailed_sources =
          enhancedYearData.emissions.scope1.sources.map((source) => {
            const area =
              enhancedYearData.sequestration?.soc_area_ha ||
              enhancedYearData.sequestration?.reporting_area_ha ||
              1;

            return {
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
              total_tco2e:
                source.annual_per_ha && source.tco2e_per_ha_per_year
                  ? source.annual_per_ha * area * source.tco2e_per_ha_per_year
                  : null,
            };
          });

        // Calculate scope 1 total if not present
        if (!enhancedYearData.emissions.scope1.total_tco2e) {
          enhancedYearData.emissions.scope1.total_tco2e =
            enhancedYearData.emissions.scope1.detailed_sources.reduce(
              (sum, source) => sum + (source.total_tco2e || 0),
              0,
            );
        }
      }

      // Scope 2 details
      if (
        enhancedYearData.emissions.scope2 &&
        enhancedYearData.emissions.scope2.sources
      ) {
        enhancedYearData.emissions.scope2.detailed_sources =
          enhancedYearData.emissions.scope2.sources.map((source) => {
            const area =
              enhancedYearData.sequestration?.soc_area_ha ||
              enhancedYearData.sequestration?.reporting_area_ha ||
              1;

            return {
              source: source.source,
              parameter: source.parameter,
              unit: source.unit,
              annual_activity_per_ha: source.annual_activity_per_ha,
              emission_factor: source.emission_factor,
              ef_number: source.ef_number,
              tco2e_per_ha_per_year: source.tco2e_per_ha_per_year,
              methodological_justification: source.methodological_justification,
              calculation_notes: source.calculation_notes,
              total_tco2e:
                source.annual_activity_per_ha && source.tco2e_per_ha_per_year
                  ? source.annual_activity_per_ha *
                    area *
                    source.tco2e_per_ha_per_year
                  : null,
            };
          });

        // Calculate scope 2 total if not present
        if (!enhancedYearData.emissions.scope2.total_tco2e) {
          enhancedYearData.emissions.scope2.total_tco2e =
            enhancedYearData.emissions.scope2.detailed_sources.reduce(
              (sum, source) => sum + (source.total_tco2e || 0),
              0,
            );
        }
      }

      // Scope 3 details
      if (
        enhancedYearData.emissions.scope3 &&
        enhancedYearData.emissions.scope3.categories
      ) {
        enhancedYearData.emissions.scope3.detailed_categories =
          enhancedYearData.emissions.scope3.categories.map((category) => {
            const area =
              enhancedYearData.sequestration?.soc_area_ha ||
              enhancedYearData.sequestration?.reporting_area_ha ||
              1;

            return {
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
              total_tco2e:
                category.annual_activity_per_ha &&
                category.tco2e_per_ha_per_year
                  ? category.annual_activity_per_ha *
                    area *
                    category.tco2e_per_ha_per_year
                  : null,
            };
          });

        // Calculate scope 3 total if not present
        if (!enhancedYearData.emissions.scope3.total_tco2e) {
          enhancedYearData.emissions.scope3.total_tco2e =
            enhancedYearData.emissions.scope3.detailed_categories.reduce(
              (sum, category) => sum + (category.total_tco2e || 0),
              0,
            );
        }
      }

      // Calculate totals if not present
      if (!enhancedYearData.emissions.total_scope_emission_tco2e) {
        enhancedYearData.emissions.total_scope_emission_tco2e =
          (enhancedYearData.emissions.scope1?.total_tco2e || 0) +
          (enhancedYearData.emissions.scope2?.total_tco2e || 0) +
          (enhancedYearData.emissions.scope3?.total_tco2e || 0);
      }

      // Calculate net total including sequestration
      const sequestration =
        enhancedYearData.sequestration?.annual_summary
          ?.sequestration_total_tco2 || 0;
      enhancedYearData.emissions.net_total_emission_tco2e =
        enhancedYearData.emissions.total_scope_emission_tco2e - sequestration;

      // Calculate intensity metrics
      const area =
        enhancedYearData.sequestration?.soc_area_ha ||
        enhancedYearData.sequestration?.reporting_area_ha;
      if (area && area > 0) {
        enhancedYearData.emissions.intensity_metrics = {
          scope1_intensity:
            (enhancedYearData.emissions.scope1?.total_tco2e || 0) / area,
          scope2_intensity:
            (enhancedYearData.emissions.scope2?.total_tco2e || 0) / area,
          scope3_intensity:
            (enhancedYearData.emissions.scope3?.total_tco2e || 0) / area,
          total_intensity:
            enhancedYearData.emissions.total_scope_emission_tco2e / area,
        };
      }
    }

    return {
      ...carbonData,
      yearly_data: [enhancedYearData],
      year_summary: calculateCarbonYearSummary(enhancedYearData),
    };
  } catch (error) {
    console.error("Error fetching comprehensive carbon emission data:", error);
    return null;
  }
}

/**
 * Helper function to calculate carbon summary for a specific year
 */
function calculateCarbonYearSummary(yearData) {
  if (!yearData) return null;

  const emissions = yearData.emissions || {};
  const sequestration = yearData.sequestration?.annual_summary || {};
  const area =
    yearData.sequestration?.soc_area_ha ||
    yearData.sequestration?.reporting_area_ha;

  return {
    year: yearData.year,
    emissions: {
      scope1: emissions.scope1?.total_tco2e || 0,
      scope2: emissions.scope2?.total_tco2e || 0,
      scope3: emissions.scope3?.total_tco2e || 0,
      total: emissions.total_scope_emission_tco2e || 0,
      net: emissions.net_total_emission_tco2e || 0,
    },
    sequestration: {
      total: sequestration.sequestration_total_tco2 || 0,
      biomass: sequestration.total_biomass_co2_t || 0,
      soc: sequestration.total_soc_co2_t || 0,
    },
    area: area || 0,
    intensity_metrics: emissions.intensity_metrics || {},
  };
}

/**
 * Helper function to get metric value for specific year
 */
function getMetricValue(metric, year) {
  if (!metric || !metric.values || !metric.values.length) return 0;
  const value = metric.values.find((v) => v.year === year);
  if (!value) return 0;
  return value.numeric_value || parseFloat(value.value) || 0;
}

/**
 * Generate 5 accurate graphs based on actual data
 */
function generateEmissionGraphs(environmentalMetrics, carbonData, year) {
  const graphs = [];

  // Extract scope values from environmental metrics
  const scope1Metric = environmentalMetrics["GHG Scope 1 (tCO2e)"];
  const scope2Metric = environmentalMetrics["GHG Scope 2 (tCO2e)"];
  const scope3Metric = environmentalMetrics["GHG Scope 3 (tCO2e)"];

  const scope1Value = getMetricValue(scope1Metric, year);
  const scope2Value = getMetricValue(scope2Metric, year);
  const scope3Value = getMetricValue(scope3Metric, year);
  const totalValue = scope1Value + scope2Value + scope3Value;

  // 1. Total Emissions Breakdown by Scope (Pie Chart)
  if (totalValue > 0) {
    graphs.push({
      id: "scope_breakdown",
      type: "pie",
      title: `GHG Emissions by Scope - ${year}`,
      description: "Breakdown of greenhouse gas emissions by scope",
      labels: [
        "Scope 1: Direct",
        "Scope 2: Indirect Energy",
        "Scope 3: Value Chain",
      ],
      datasets: [
        {
          data: [scope1Value, scope2Value, scope3Value],
          backgroundColor: ["#e74c3c", "#3498db", "#9b59b6"],
          borderWidth: 2,
        },
      ],
      metadata: {
        total_emissions: totalValue,
        scope1_percentage: ((scope1Value / totalValue) * 100).toFixed(1),
        scope2_percentage: ((scope2Value / totalValue) * 100).toFixed(1),
        scope3_percentage: ((scope3Value / totalValue) * 100).toFixed(1),
      },
    });
  }

  // 2. Scope 1 Detailed Sources (Bar Chart)
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data[0]) {
    const yearData = carbonData.yearly_data[0];
    if (
      yearData.emissions?.scope1?.detailed_sources &&
      yearData.emissions.scope1.detailed_sources.length > 0
    ) {
      const sources = yearData.emissions.scope1.detailed_sources
        .filter((source) => source.total_tco2e && source.total_tco2e > 0)
        .sort((a, b) => (b.total_tco2e || 0) - (a.total_tco2e || 0));

      if (sources.length > 0) {
        graphs.push({
          id: "scope1_sources",
          type: "bar",
          title: `Scope 1: Direct Emissions Sources - ${year}`,
          description:
            "Breakdown of direct emissions from owned or controlled sources",
          labels: sources.map((s) => s.source),
          datasets: [
            {
              label: "tCO₂e",
              data: sources.map((s) => s.total_tco2e || 0),
              backgroundColor: "#e74c3c",
            },
          ],
          metadata: {
            total_scope1: yearData.emissions.scope1.total_tco2e || 0,
            source_count: sources.length,
          },
        });
      }
    }
  }

  // 3. Scope 3 Categories (Horizontal Bar Chart)
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data[0]) {
    const yearData = carbonData.yearly_data[0];
    if (
      yearData.emissions?.scope3?.detailed_categories &&
      yearData.emissions.scope3.detailed_categories.length > 0
    ) {
      const categories = yearData.emissions.scope3.detailed_categories
        .filter((cat) => cat.total_tco2e && cat.total_tco2e > 0)
        .sort((a, b) => (b.total_tco2e || 0) - (a.total_tco2e || 0));

      if (categories.length > 0) {
        graphs.push({
          id: "scope3_categories",
          type: "horizontalBar",
          title: `Scope 3: Value Chain Categories - ${year}`,
          description: "Breakdown of indirect value chain emissions",
          labels: categories.map((c) => c.category),
          datasets: [
            {
              label: "tCO₂e",
              data: categories.map((c) => c.total_tco2e || 0),
              backgroundColor: "#9b59b6",
            },
          ],
          metadata: {
            total_scope3: yearData.emissions.scope3.total_tco2e || 0,
            category_count: categories.length,
          },
        });
      }
    }
  }

  // 4. Emission Intensity Metrics (Bar Chart)
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data[0]) {
    const yearData = carbonData.yearly_data[0];
    const area =
      yearData.sequestration?.soc_area_ha ||
      yearData.sequestration?.reporting_area_ha;

    if (area && area > 0 && yearData.emissions) {
      const scope1Intensity =
        (yearData.emissions.scope1?.total_tco2e || 0) / area;
      const scope2Intensity =
        (yearData.emissions.scope2?.total_tco2e || 0) / area;
      const totalIntensity =
        (yearData.emissions.total_scope_emission_tco2e || 0) / area;

      graphs.push({
        id: "emission_intensity",
        type: "bar",
        title: `Emission Intensity Metrics - ${year}`,
        description: "Emissions per hectare of operational area",
        labels: ["Scope 1 Intensity", "Scope 2 Intensity", "Total Intensity"],
        datasets: [
          {
            label: "tCO₂e/ha",
            data: [scope1Intensity, scope2Intensity, totalIntensity],
            backgroundColor: ["#e74c3c", "#3498db", "#2c3e50"],
          },
        ],
        metadata: {
          area_ha: area,
          unit: "tCO₂e per hectare",
        },
      });
    }
  }

  // 5. Carbon Balance: Emissions vs Sequestration (Bar Chart)
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data[0]) {
    const yearData = carbonData.yearly_data[0];
    const emissions = yearData.emissions?.total_scope_emission_tco2e || 0;
    const sequestration =
      yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0;
    const netBalance = emissions - sequestration;

    if (emissions > 0 || sequestration > 0) {
      graphs.push({
        id: "carbon_balance",
        type: "bar",
        title: `Carbon Balance - ${year}`,
        description: "Comparison of emissions and carbon sequestration",
        labels: ["Total Emissions", "Carbon Sequestration", "Net Balance"],
        datasets: [
          {
            label: "tCO₂e",
            data: [emissions, sequestration, netBalance],
            backgroundColor: ["#e74c3c", "#27ae60", "#3498db"],
          },
        ],
        metadata: {
          net_balance: netBalance,
          is_carbon_positive: netBalance < 0,
          sequestration_ratio:
            emissions > 0 ? ((sequestration / emissions) * 100).toFixed(1) : 0,
        },
      });
    }
  }

  return graphs.slice(0, 5); // Return only first 5 graphs
}

/**
 * Calculate 5 key emission metrics for the year
 */
function calculateKeyEmissionMetrics(environmentalMetrics, carbonData, year) {
  const scope1Metric = environmentalMetrics["GHG Scope 1 (tCO2e)"];
  const scope2Metric = environmentalMetrics["GHG Scope 2 (tCO2e)"];
  const scope3Metric = environmentalMetrics["GHG Scope 3 (tCO2e)"];

  const scope1Value = getMetricValue(scope1Metric, year);
  const scope2Value = getMetricValue(scope2Metric, year);
  const scope3Value = getMetricValue(scope3Metric, year);
  const totalValue = scope1Value + scope2Value + scope3Value;

  let carbonDataMetrics = {};
  if (carbonData && carbonData.yearly_data && carbonData.yearly_data[0]) {
    const yearData = carbonData.yearly_data[0];
    carbonDataMetrics = {
      scope1_detailed: yearData.emissions?.scope1?.total_tco2e || scope1Value,
      scope2_detailed: yearData.emissions?.scope2?.total_tco2e || scope2Value,
      scope3_detailed: yearData.emissions?.scope3?.total_tco2e || scope3Value,
      total_detailed:
        yearData.emissions?.total_scope_emission_tco2e || totalValue,
      sequestration:
        yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
      net_balance: yearData.emissions?.net_total_emission_tco2e || totalValue,
      area_ha:
        yearData.sequestration?.soc_area_ha ||
        yearData.sequestration?.reporting_area_ha ||
        0,
    };
  }

  return {
    total_ghg_emissions: {
      value: carbonDataMetrics.total_detailed || totalValue,
      unit: "tCO₂e",
      description: "Total greenhouse gas emissions for the year",
      scope1: scope1Value,
      scope2: scope2Value,
      scope3: scope3Value,
    },
    net_carbon_balance: {
      value: carbonDataMetrics.net_balance || totalValue,
      unit: "tCO₂e",
      description: "Net emissions after carbon sequestration",
      emissions: carbonDataMetrics.total_detailed || totalValue,
      sequestration: carbonDataMetrics.sequestration || 0,
      is_positive: (carbonDataMetrics.net_balance || totalValue) > 0,
    },
    carbon_intensity: {
      value:
        carbonDataMetrics.area_ha > 0
          ? (carbonDataMetrics.total_detailed || totalValue) /
            carbonDataMetrics.area_ha
          : 0,
      unit: "tCO₂e/ha",
      description: "Emissions per hectare of operational area",
      area_ha: carbonDataMetrics.area_ha,
    },
    scope_composition: {
      scope1_percentage: totalValue > 0 ? (scope1Value / totalValue) * 100 : 0,
      scope2_percentage: totalValue > 0 ? (scope2Value / totalValue) * 100 : 0,
      scope3_percentage: totalValue > 0 ? (scope3Value / totalValue) * 100 : 0,
      unit: "%",
      description: "Percentage distribution of emissions by scope",
    },
    sequestration_capacity: {
      value: carbonDataMetrics.sequestration || 0,
      unit: "tCO₂",
      description: "Total carbon sequestered during the year",
      sequestration_rate:
        carbonDataMetrics.area_ha > 0
          ? (carbonDataMetrics.sequestration || 0) / carbonDataMetrics.area_ha
          : 0,
      sequestration_unit: "tCO₂/ha",
    },
  };
}

/**
 * Main GHG Emissions API - Returns data for specific year only
 */
async function getGHGEmissionsData(companyId, year = null) {
  try {
    if (!year) {
      throw new AppError("Year parameter is required", 400, "YEAR_REQUIRED");
    }

    // Get complete company data
    const company = await Company.findById(companyId).lean();
    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // Get all environmental metrics for the specific year
    const environmentalMetrics = await getEnvironmentalMetricsByYear(
      companyId,
      year,
    );

    // Get comprehensive carbon emission data for the specific year
    const carbonData = await getComprehensiveCarbonEmissionData(
      companyId,
      year,
    );

    // Calculate key metrics
    const keyMetrics = calculateKeyEmissionMetrics(
      environmentalMetrics,
      carbonData,
      year,
    );

    // Generate graphs
    const graphs = generateEmissionGraphs(
      environmentalMetrics,
      carbonData,
      year,
    );

    // Prepare carbon emission accounting data
    const carbonEmissionAccounting = carbonData
      ? {
          id: carbonData._id,
          framework: carbonData.framework,
          methodology: carbonData.emission_references?.methodology_statement,
          year_summary: carbonData.year_summary,
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
              sources: yearData.emissions?.scope1?.detailed_sources || [],
              intensity:
                yearData.emissions?.intensity_metrics?.scope1_intensity,
            },
            scope2: {
              total_tco2e: yearData.emissions?.scope2?.total_tco2e,
              sources: yearData.emissions?.scope2?.detailed_sources || [],
              intensity:
                yearData.emissions?.intensity_metrics?.scope2_intensity,
            },
            scope3: {
              total_tco2e: yearData.emissions?.scope3?.total_tco2e,
              categories: yearData.emissions?.scope3?.detailed_categories || [],
              intensity:
                yearData.emissions?.intensity_metrics?.scope3_intensity,
            },
            sequestration: {
              total_tco2:
                yearData.sequestration?.annual_summary
                  ?.sequestration_total_tco2,
              biomass_co2:
                yearData.sequestration?.annual_summary?.total_biomass_co2_t,
              soc_co2: yearData.sequestration?.annual_summary?.total_soc_co2_t,
              area_ha:
                yearData.sequestration?.soc_area_ha ||
                yearData.sequestration?.reporting_area_ha,
              monthly_data: yearData.sequestration?.monthly_data || [],
              methodologies: yearData.sequestration?.methodologies || [],
            },
            totals: {
              total_emissions: yearData.emissions?.total_scope_emission_tco2e,
              net_emissions: yearData.emissions?.net_total_emission_tco2e,
              total_intensity:
                yearData.emissions?.intensity_metrics?.total_intensity,
            },
            data_quality: yearData.data_quality,
          })),
          summary: carbonData.summary,
          data_management: carbonData.data_management,
          status: carbonData.status,
          is_active: carbonData.is_active,
          created_at: carbonData.created_at,
          created_by: carbonData.created_by,
          last_updated_at: carbonData.last_updated_at,
          last_updated_by: carbonData.last_updated_by,
        }
      : null;

    const data = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "ghg_emissions",
        company_id: companyId,
        year: year,
        data_sources: carbonData
          ? ["ESGData", "CarbonEmissionAccounting"]
          : ["ESGData"],
      },
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
      reporting_year: year,
      environmental_metrics: environmentalMetrics,
      key_metrics: keyMetrics,
      carbon_emission_accounting: carbonEmissionAccounting,
      graphs: graphs,
      data_availability: {
        environmental_metrics_count: Object.keys(environmentalMetrics).length,
        carbon_accounting_available: !!carbonData,
        carbon_data_quality: carbonData?.yearly_data[0]?.data_quality || {},
      },
      summary: {
        total_emissions: keyMetrics.total_ghg_emissions.value,
        net_balance: keyMetrics.net_carbon_balance.value,
        carbon_intensity: keyMetrics.carbon_intensity.value,
        sequestration_capacity: keyMetrics.sequestration_capacity.value,
        has_detailed_carbon_data: !!carbonData,
        environmental_metrics_total: Object.keys(environmentalMetrics).length,
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

module.exports = {
  getGHGEmissionsData,
};
