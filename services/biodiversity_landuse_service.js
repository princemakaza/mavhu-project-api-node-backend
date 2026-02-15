const BiodiversityLandUse = require("../models/biodiversity_and_landuse_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper: Extract metric value by year from yearly_data array
 */
function getMetricValueByYear(metric, year) {
  if (!metric || !metric.yearly_data || !Array.isArray(metric.yearly_data))
    return null;

  const entry = metric.yearly_data.find((yd) => {
    const yearStr = yd.year?.toString() || "";
    return (
      yearStr.includes(year) ||
      (yd.fiscal_year && yd.fiscal_year.toString() === year.toString())
    );
  });

  if (!entry) return null;

  if (entry.numeric_value !== undefined && entry.numeric_value !== null) {
    return entry.numeric_value;
  }
  if (typeof entry.value === "number") return entry.value;
  if (typeof entry.value === "string") {
    const parsed = parseFloat(entry.value.replace(/[^0-9.-]+/g, ""));
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

/**
 * Helper: Get all unique years from all metrics' yearly_data
 */
function getUniqueYearsFromMetrics(metrics) {
  const yearsSet = new Set();
  metrics.forEach((metric) => {
    if (metric.yearly_data) {
      metric.yearly_data.forEach((yd) => {
        if (yd.fiscal_year) yearsSet.add(yd.fiscal_year);
        else if (yd.year) {
          const yearNum = parseInt(yd.year.toString().replace(/[^0-9]/g, ""));
          if (!isNaN(yearNum)) yearsSet.add(yearNum);
        }
      });
    }
  });
  return Array.from(yearsSet).sort((a, b) => a - b);
}

/**
 * Helper: Calculate percentage change
 */
function calculatePercentageChange(initial, final) {
  if (!initial || initial === 0) return 0;
  return ((final - initial) / initial) * 100;
}

/**
 * Helper: Calculate trend for a metric over given years
 */
function calculateTrend(metric, years) {
  if (!metric || !metric.yearly_data || years.length < 2) return "stable";

  const firstYear = Math.min(...years);
  const lastYear = Math.max(...years);

  const firstValue = getMetricValueByYear(metric, firstYear);
  const lastValue = getMetricValueByYear(metric, lastYear);

  if (firstValue === null || lastValue === null) return "stable";

  const change = calculatePercentageChange(firstValue, lastValue);

  if (change > 5) return "improving";
  if (change < -5) return "declining";
  return "stable";
}

/**
 * Helper: Group metrics by category
 */
function groupMetricsByCategory(metrics) {
  const grouped = {
    agricultural_land: [],
    conservation_protected_habitat: [],
    land_tenure: [],
    restoration_deforestation: [],
    fuelwood_substitution: [],
    biodiversity_flora: [],
    biodiversity_fauna: [],
    human_wildlife_conflict: [],
    summary: [],
  };

  metrics.forEach((metric) => {
    if (grouped[metric.category]) {
      grouped[metric.category].push(metric);
    } else {
      grouped.summary.push(metric);
    }
  });

  return grouped;
}

/**
 * Helper: Generate basic visualisation data from metrics
 */
function generateGraphs(metrics, years) {
  const graphs = {};
  const currentYear = Math.max(...years);

  // --- Land Use Composition (current year) ---
  const conservationMetric = metrics.find(
    (m) =>
      m.category === "conservation_protected_habitat" &&
      m.metric_name.toLowerCase().includes("conservation area"),
  );
  const agriMetric = metrics.find(
    (m) =>
      m.category === "agricultural_land" &&
      m.metric_name.toLowerCase().includes("area"),
  );
  const totalLandMetric = metrics.find(
    (m) =>
      m.category === "summary" &&
      m.metric_name.toLowerCase().includes("total area"),
  );

  if (conservationMetric && agriMetric && totalLandMetric) {
    const consValue =
      getMetricValueByYear(conservationMetric, currentYear) || 0;
    const agriValue = getMetricValueByYear(agriMetric, currentYear) || 0;
    const totalValue = getMetricValueByYear(totalLandMetric, currentYear) || 1;
    const otherValue = Math.max(0, totalValue - consValue - agriValue);

    graphs.land_use_composition = {
      type: "doughnut",
      title: "Land Use Composition",
      description: "Distribution of land area by use type",
      labels: ["Conservation Area", "Agricultural Area", "Other Area"],
      datasets: [
        {
          data: [consValue, agriValue, otherValue],
          backgroundColor: ["#27ae60", "#f39c12", "#95a5a6"],
          borderWidth: 2,
        },
      ],
    };
  }

  // --- Forest / Tree Cover Trend ---
  const forestMetric = metrics.find(
    (m) =>
      m.category === "restoration_deforestation" &&
      (m.metric_name.toLowerCase().includes("forest") ||
        m.metric_name.toLowerCase().includes("tree cover")),
  );
  if (forestMetric && forestMetric.yearly_data?.length >= 2) {
    const sorted = [...forestMetric.yearly_data]
      .filter((yd) => yd.fiscal_year)
      .sort((a, b) => a.fiscal_year - b.fiscal_year);
    graphs.forest_area_trend = {
      type: "line",
      title: "Forest / Tree Cover Trend",
      description: "Historical changes in forest/tree cover",
      labels: sorted.map((yd) => yd.fiscal_year),
      datasets: [
        {
          label: "Area (ha)",
          data: sorted.map((yd) =>
            getMetricValueByYear(forestMetric, yd.fiscal_year),
          ),
          borderColor: "#27ae60",
          backgroundColor: "rgba(39, 174, 96, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // --- Species Count Trend ---
  const faunaMetric = metrics.find(
    (m) =>
      m.category === "biodiversity_fauna" &&
      m.metric_name.toLowerCase().includes("species"),
  );
  if (faunaMetric && faunaMetric.yearly_data?.length >= 2) {
    const sorted = [...faunaMetric.yearly_data]
      .filter((yd) => yd.fiscal_year)
      .sort((a, b) => a.fiscal_year - b.fiscal_year);
    graphs.species_count_trend = {
      type: "line",
      title: "Fauna Species Count Trend",
      description: "Changes in number of fauna species",
      labels: sorted.map((yd) => yd.fiscal_year),
      datasets: [
        {
          label: "Species Count",
          data: sorted.map((yd) =>
            getMetricValueByYear(faunaMetric, yd.fiscal_year),
          ),
          borderColor: "#3498db",
          backgroundColor: "rgba(52, 152, 219, 0.1)",
          fill: true,
          tension: 0.4,
        },
      ],
    };
  }

  // --- Trees Planted Trend ---
  const treesPlantedMetric = metrics.find(
    (m) =>
      m.category === "restoration_deforestation" &&
      m.metric_name.toLowerCase().includes("trees planted"),
  );
  if (treesPlantedMetric && treesPlantedMetric.yearly_data?.length >= 2) {
    const sorted = [...treesPlantedMetric.yearly_data]
      .filter((yd) => yd.fiscal_year)
      .sort((a, b) => a.fiscal_year - b.fiscal_year);
    graphs.trees_planted_trend = {
      type: "bar",
      title: "Trees Planted Annually",
      description: "Number of trees planted each year",
      labels: sorted.map((yd) => yd.fiscal_year),
      datasets: [
        {
          label: "Trees Planted",
          data: sorted.map((yd) =>
            getMetricValueByYear(treesPlantedMetric, yd.fiscal_year),
          ),
          backgroundColor: "#2ecc71",
        },
      ],
    };
  }

  return graphs;
}

/**
 * Helper: Calculate key statistics from metrics
 */
function calculateKeyStatistics(metrics, currentYear) {
  const stats = {
    total_conservation_area: 0,
    total_agricultural_area: 0,
    total_restored_area: 0,
    flora_species_count: 0,
    fauna_species_count: 0,
    trees_planted_cumulative: 0,
    lpg_distributions: 0,
    human_wildlife_conflicts: 0,
  };

  metrics.forEach((metric) => {
    const value = getMetricValueByYear(metric, currentYear);
    if (value === null) return;

    const name = metric.metric_name.toLowerCase();

    if (metric.category === "conservation_protected_habitat") {
      if (name.includes("conservation area") || name.includes("protected area"))
        stats.total_conservation_area += value;
    }
    if (metric.category === "agricultural_land") {
      if (name.includes("area")) stats.total_agricultural_area += value;
    }
    if (metric.category === "restoration_deforestation") {
      if (name.includes("restored area") || name.includes("rehabilitated"))
        stats.total_restored_area += value;
      if (name.includes("trees planted")) {
        stats.trees_planted_cumulative += value;
      }
    }
    if (metric.category === "biodiversity_flora") {
      if (name.includes("species")) stats.flora_species_count = value;
    }
    if (metric.category === "biodiversity_fauna") {
      if (name.includes("species")) stats.fauna_species_count = value;
    }
    if (metric.category === "fuelwood_substitution") {
      if (name.includes("lpg")) stats.lpg_distributions += value;
    }
    if (metric.category === "human_wildlife_conflict") {
      if (name.includes("incident") || name.includes("conflict"))
        stats.human_wildlife_conflicts += value;
    }
  });

  return stats;
}

/**
 * Helper: Build a flat year-indexed data view across all metrics.
 * Returns an object keyed by year, each containing all metric values for that year.
 */
function buildYearlyBreakdown(metrics, years) {
  const breakdown = {};

  years.forEach((year) => {
    breakdown[year] = {
      year,
      metrics: {},
    };

    metrics.forEach((metric) => {
      const yearlyEntry = metric.yearly_data?.find((yd) => {
        const yearStr = yd.year?.toString() || "";
        return (
          yearStr.includes(year) ||
          (yd.fiscal_year && yd.fiscal_year.toString() === year.toString())
        );
      });

      if (yearlyEntry) {
        const key = `${metric.category}__${metric.metric_name}`;
        breakdown[year].metrics[key] = {
          category: metric.category,
          subcategory: metric.subcategory || null,
          metric_name: metric.metric_name,
          description: metric.description || null,
          // Raw year entry (fully populated with added_by / last_updated_by)
          year_label: yearlyEntry.year,
          fiscal_year: yearlyEntry.fiscal_year || null,
          value: yearlyEntry.value,
          numeric_value:
            yearlyEntry.numeric_value !== undefined
              ? yearlyEntry.numeric_value
              : null,
          unit: yearlyEntry.unit || null,
          source: yearlyEntry.source || null,
          notes: yearlyEntry.notes || null,
          added_by: yearlyEntry.added_by || null,
          added_at: yearlyEntry.added_at || null,
          last_updated_by: yearlyEntry.last_updated_by || null,
          last_updated_at: yearlyEntry.last_updated_at || null,
        };
      }
    });
  });

  return breakdown;
}

/**
 * Main function: Get Biodiversity & Land Use Integrity data from dedicated model
 */
async function getBiodiversityLandUseData(
  companyId,
  year = null,
  startYear = null,
  endYear = null,
) {
  try {
    // Year validation
    if (!year && (!startYear || !endYear)) {
      throw new AppError(
        "Year or year range is required",
        400,
        "YEAR_REQUIRED",
      );
    }

    // -----------------------------------------------------------------------
    // Fetch the most recent active biodiversity record for the company.
    // Populate ALL nested ObjectId references so the raw document is fully
    // resolved before we hand it back to the caller.
    // -----------------------------------------------------------------------
    const biodiversityRecord = await BiodiversityLandUse.findOne({
      company: companyId,
      is_active: true,
    })
      // Top-level refs
      .populate("company") // full Company document
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .populate("verified_by", "name email")
      .populate("deleted_by", "name email")
      .populate("previous_version") // full previous BiodiversityLandUse doc

      // Metric-level refs
      .populate("metrics.created_by", "name email")

      // YearlyData refs (nested inside metrics)
      .populate("metrics.yearly_data.added_by", "name email")
      .populate("metrics.yearly_data.last_updated_by", "name email")

      // SingleValue nested ref
      .populate("metrics.single_value.added_by", "name email")

      .lean();

    if (!biodiversityRecord) {
      throw new AppError(
        "No biodiversity and land use data found for this company",
        404,
        "BIODIVERSITY_DATA_NOT_FOUND",
      );
    }

    // Company is already populated via .populate("company"), but fall back to a
    // direct lookup if the populate somehow returned only the ObjectId.
    const company =
      biodiversityRecord.company &&
      typeof biodiversityRecord.company === "object"
        ? biodiversityRecord.company
        : await Company.findById(companyId).lean();

    if (!company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    // -----------------------------------------------------------------------
    // Determine target years for filtering
    // -----------------------------------------------------------------------
    let targetYears = [];
    if (year) {
      targetYears = [year];
    } else if (startYear && endYear) {
      targetYears = Array.from(
        { length: endYear - startYear + 1 },
        (_, i) => startYear + i,
      );
    }

    // Use all metrics from the record
    let metrics = biodiversityRecord.metrics || [];

    // Filter metrics to only those with data in target years
    if (targetYears.length > 0) {
      metrics = metrics.filter((metric) => {
        if (!metric.yearly_data) return false;
        return metric.yearly_data.some((yd) => {
          const yearNum =
            yd.fiscal_year ||
            parseInt(yd.year.toString().replace(/[^0-9]/g, ""));
          return targetYears.includes(yearNum);
        });
      });
    }

    // Get all available years from filtered metrics
    const years = getUniqueYearsFromMetrics(metrics);
    if (years.length === 0) {
      throw new AppError(
        "No land use data available for the requested period",
        404,
        "NO_LAND_USE_DATA",
      );
    }

    const currentYear = Math.max(...years);
    const baselineYear = Math.min(...years);

    // Group metrics by category for easier access
    const groupedMetrics = groupMetricsByCategory(metrics);

    // Calculate key statistics
    const keyStats = calculateKeyStatistics(metrics, currentYear);

    // Generate graphs
    const graphs = generateGraphs(metrics, years);

    // Build flat year-by-year breakdown (new: one entry per year)
    const yearlyBreakdown = buildYearlyBreakdown(metrics, years);

    // -----------------------------------------------------------------------
    // Build response
    // -----------------------------------------------------------------------
    const response = {
      metadata: {
        api_version: API_VERSION,
        calculation_version: CALCULATION_VERSION,
        gee_adapter_version: GEE_ADAPTER_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "biodiversity_land_use",
        company_id: companyId,
        period_requested: year ? `${year}` : `${startYear}-${endYear}`,
        data_sources: ["BiodiversityLandUse"],
        record_id: biodiversityRecord._id,
        record_version: biodiversityRecord.version,
      },

      // Full company object (all fields – fully populated)
      company: company,

      reporting_period: {
        data_period_start: biodiversityRecord.data_period_start,
        data_period_end: biodiversityRecord.data_period_end,
        current_year: currentYear,
        baseline_year: baselineYear,
        analysis_years: years,
        period_covered: `${Math.min(...years)}-${Math.max(...years)}`,
        data_completeness: `${metrics.length} metrics available`,
      },

      // -----------------------------------------------------------------------
      // NEW: Flat year-indexed breakdown of every metric value
      // Each key is a fiscal year (e.g. 2025); the value contains all metric
      // readings for that year with full populated user refs.
      // -----------------------------------------------------------------------
      yearly_data_by_year: yearlyBreakdown,

      // Original source and import information
      source_information: {
        original_source: biodiversityRecord.original_source,
        source_files: biodiversityRecord.source_files,
        import_source: biodiversityRecord.import_source,
        source_file_name: biodiversityRecord.source_file_name,
        source_file_metadata: biodiversityRecord.source_file_metadata,
        import_batch_id: biodiversityRecord.import_batch_id,
        import_date: biodiversityRecord.import_date,
        import_notes: biodiversityRecord.import_notes,
      },

      // Data quality and verification
      data_quality: {
        quality_score: biodiversityRecord.data_quality_score,
        verification_status: biodiversityRecord.verification_status,
        verified_by: biodiversityRecord.verified_by,
        verified_at: biodiversityRecord.verified_at,
        verification_notes: biodiversityRecord.verification_notes,
        validation_status: biodiversityRecord.validation_status,
        validation_errors: biodiversityRecord.validation_errors,
        validation_notes: biodiversityRecord.validation_notes,
      },

      // Summary statistics
      summary_statistics: {
        ...biodiversityRecord.summary_stats,
        ...keyStats, // fresh calculations override stored stats
      },
      // GRI references
      gri_references: biodiversityRecord.gri_references || [],
      // Metrics grouped by category (full details, all refs populated)
      metrics_by_category: groupedMetrics,
      // All raw metrics (flat array, all refs populated)
      all_metrics: metrics,
      // Graphs and visualizations
      graphs: graphs,
      // Key performance indicators (simplified view)
      key_performance_indicators: {
        conservation_area: keyStats.total_conservation_area,
        agricultural_area: keyStats.total_agricultural_area,
        restored_area: keyStats.total_restored_area,
        flora_species: keyStats.flora_species_count,
        fauna_species: keyStats.fauna_species_count,
        trees_planted_cumulative: keyStats.trees_planted_cumulative,
        lpg_distributions: keyStats.lpg_distributions,
        human_wildlife_conflicts: keyStats.human_wildlife_conflicts,
      },
      // Audit trail (all refs populated)
      audit: {
        created_at: biodiversityRecord.created_at,
        created_by: biodiversityRecord.created_by,
        last_updated_at: biodiversityRecord.last_updated_at,
        last_updated_by: biodiversityRecord.last_updated_by,
        version: biodiversityRecord.version,
        previous_version: biodiversityRecord.previous_version, // fully populated doc
        deleted_at: biodiversityRecord.deleted_at,
        deleted_by: biodiversityRecord.deleted_by,
        is_active: biodiversityRecord.is_active,
      },
    };

    return response;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      "Failed to retrieve biodiversity and land use data",
      500,
      "BIODIVERSITY_LAND_USE_API_ERROR",
      { details: error.message },
    );
  }
}

module.exports = {
  getBiodiversityLandUseData,
};
