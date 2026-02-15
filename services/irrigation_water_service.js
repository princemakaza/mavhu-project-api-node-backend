const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const IrrigationEfficiencyData = require("../models/irrigation_eff_model");
const User = require("../models/users_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");

const API_VERSION = process.env.API_VERSION || "1.0.0";

/**
 * Get environmental metrics for a specific company and year
 */
async function getEnvironmentalMetrics(companyId, year) {
  try {
    const esgData = await ESGData.findOne({
      company: companyId,
      is_active: true,
      "metrics.values.year": year,
    })
      .populate({ path: "company" })
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .populate("verified_by", "name email")
      .populate("deleted_by", "name email")
      .lean();

    if (!esgData) {
      return {
        environmental_metrics: [],
        company: null,
        reporting_period: null,
      };
    }

    const environmentalMetrics = esgData.metrics
      .filter((metric) => metric.category === "environmental")
      .map((metric) => ({
        metric_name: metric.metric_name,
        unit: metric.unit,
        description: metric.description,
        value: metric.values.find((v) => v.year === year) || null,
        is_active: metric.is_active,
        created_by: metric.created_by,
        created_at: metric.created_at,
      }));

    return {
      environmental_metrics: environmentalMetrics,
      company: esgData.company,
      reporting_period: {
        start: esgData.reporting_period_start,
        end: esgData.reporting_period_end,
      },
      data_source: {
        source: esgData.data_source,
        file_name: esgData.source_file_name,
        file_type: esgData.source_file_type,
        import_date: esgData.import_date,
        batch_id: esgData.import_batch_id,
      },
      data_quality: {
        score: esgData.data_quality_score,
        verification_status: esgData.verification_status,
        verified_by: esgData.verified_by,
        verified_at: esgData.verified_at,
        validation_status: esgData.validation_status,
      },
      metadata: {
        created_at: esgData.created_at,
        created_by: esgData.created_by,
        last_updated_at: esgData.last_updated_at,
        last_updated_by: esgData.last_updated_by,
      },
    };
  } catch (error) {
    throw new AppError(
      `Error fetching environmental metrics: ${error.message}`,
      500,
      "ENV_METRICS_FETCH_ERROR",
    );
  }
}

/**
 * Get existing irrigation efficiency data — returns ALL documents with
 * every metric, every yearly_data entry, and every nested field untouched.
 * No active/inactive filtering on metrics, no year slicing.
 */
async function getIrrigationEfficiencyData(companyId, year = null) {
  try {
    if (!companyId) {
      throw new AppError("Company ID is required", 400, "COMPANY_ID_REQUIRED");
    }

    const data = await IrrigationEfficiencyData.find({ company: companyId })
      .sort({ version: -1 })
      .lean();

    if (!data || data.length === 0) {
      return [];
    }

    // Return everything exactly as stored — no filtering whatsoever
    return data;
  } catch (error) {
    throw new AppError(
      `Error fetching irrigation efficiency data: ${error.message}`,
      500,
      "IRRIGATION_EFFICIENCY_FETCH_ERROR",
    );
  }
}

/**
 * Extract water-related metrics for irrigation efficiency
 */
function extractWaterMetrics(environmentalMetrics, year, userId) {
  const metrics = [];
  const userId_ = userId || new mongoose.Types.ObjectId();

  const waterMetricMappings = [
    {
      sourceName: "Water Usage - Irrigation Water Usage (million ML)",
      category: "irrigation_water",
      subcategory: "total",
      metricName: "Total Irrigation Water (million ML)",
      description: "Total irrigation water usage in million megaliters",
      unit: "million ML",
    },
    {
      sourceName: "Water Usage - Water treatment (million ML)",
      category: "water_treatment",
      subcategory: "total",
      metricName: "Water Treatment (million ML)",
      description: "Water treatment volume in million megaliters",
      unit: "million ML",
    },
    {
      sourceName: "Effluent Discharged (million ML)",
      category: "effluent_discharged",
      subcategory: "total",
      metricName: "Effluent Discharged (million ML)",
      description: "Total effluent discharged in million megaliters",
      unit: "million ML",
    },
    {
      sourceName: "Water Sources",
      category: "water_sources",
      subcategory: "all",
      metricName: "Water Sources",
      description: "List of water sources used by the company",
      unit: "count",
    },
    {
      sourceName: "Water Usage - Water per Hectare (ML/ha)",
      category: "water_per_hectare",
      subcategory: "company_estates",
      metricName: "Water per Hectare (ML/ha)",
      description: "Water usage per hectare",
      unit: "ML/ha",
    },
  ];

  waterMetricMappings.forEach((mapping) => {
    const sourceMetric = environmentalMetrics.find(
      (m) => m.metric_name === mapping.sourceName,
    );

    if (sourceMetric && sourceMetric.value) {
      const value = sourceMetric.value;
      const numericVal = value.numeric_value || parseFloat(value.value) || 0;

      if (mapping.category === "water_sources") {
        metrics.push({
          category: mapping.category,
          subcategory: mapping.subcategory,
          metric_name: mapping.metricName,
          description: mapping.description,
          data_type: "list",
          yearly_data: [],
          single_value: null,
          list_data: [
            {
              item: value.source_notes || "Water Source",
              count: 1,
              details: `From ESG data for year ${value.year}`,
              source: "ESG Data Import",
              added_at: new Date(),
            },
          ],
          summary_value: {
            key_metric: "total_water_sources",
            latest_value: 1,
            trend: "stable",
            notes: `Water source from ESG data for ${value.year}`,
            as_of_date: new Date(),
          },
          is_active: true,
          created_by: userId_,
          created_at: new Date(),
          last_updated_by: userId_,
        });
      } else {
        metrics.push({
          category: mapping.category,
          subcategory: mapping.subcategory,
          metric_name: mapping.metricName,
          description: mapping.description,
          data_type: "yearly_series",
          yearly_data: [
            {
              year: value.year.toString(),
              fiscal_year: value.year,
              value: value.value,
              numeric_value: numericVal,
              unit: mapping.unit,
              source: value.source_notes || "ESG Data Import",
              notes: `Imported from ESG data for ${value.year}`,
              added_by: userId_,
              added_at: new Date(),
              last_updated_by: userId_,
              last_updated_at: new Date(),
            },
          ],
          single_value: null,
          list_data: [],
          summary_value: null,
          is_active: true,
          created_by: userId_,
          created_at: new Date(),
          last_updated_by: userId_,
        });
      }
    }
  });

  return metrics;
}

/**
 * Calculate water risk analysis
 */
function calculateWaterRisk(waterMetrics, year) {
  const analysis = {
    irrigation_water: { value: null, trend: "unknown" },
    treatment_water: { value: null, trend: "unknown" },
    total_water_usage: null,
    shortage_risk: {
      level: "low",
      probability: 0.2,
      factors: [],
      mitigation: [],
    },
    savings_potential: null,
  };

  waterMetrics.forEach((metric) => {
    if (
      metric.category === "irrigation_water" &&
      metric.yearly_data.length > 0
    ) {
      analysis.irrigation_water.value = metric.yearly_data[0].numeric_value;
    }
    if (
      metric.category === "water_treatment" &&
      metric.yearly_data.length > 0
    ) {
      analysis.treatment_water.value = metric.yearly_data[0].numeric_value;
    }
  });

  if (analysis.irrigation_water.value && analysis.treatment_water.value) {
    analysis.total_water_usage =
      analysis.irrigation_water.value + analysis.treatment_water.value;
  }

  if (analysis.total_water_usage) {
    if (analysis.total_water_usage > 10) {
      analysis.shortage_risk = {
        level: "high",
        probability: 0.7,
        factors: ["High water consumption exceeding sustainable levels"],
        mitigation: [
          "Implement water rationing",
          "Invest in alternative sources",
        ],
      };
    } else if (analysis.total_water_usage > 5) {
      analysis.shortage_risk = {
        level: "medium",
        probability: 0.4,
        factors: ["Moderate water consumption approaching limits"],
        mitigation: ["Optimize irrigation schedules", "Improve recycling"],
      };
    }
  }

  if (analysis.irrigation_water.value) {
    analysis.savings_potential = analysis.irrigation_water.value * 0.15;
  }

  return analysis;
}

/**
 * Generate graphs for visualization
 */
function generateGraphs(environmentalMetrics, waterAnalysis, year) {
  const graphs = {};

  const irrigationMetric = environmentalMetrics.find(
    (m) =>
      m.metric_name === "Water Usage - Irrigation Water Usage (million ML)",
  );

  if (irrigationMetric && irrigationMetric.value) {
    graphs.water_usage = {
      type: "bar",
      title: "Water Usage",
      description: `Water usage for year ${year}`,
      labels: [year.toString()],
      datasets: [
        {
          label: "Irrigation Water (million ML)",
          data: [irrigationMetric.value.numeric_value || 0],
        },
      ],
    };
  }

  if (waterAnalysis.shortage_risk) {
    graphs.risk_assessment = {
      type: "radar",
      title: "Water Risk Assessment",
      labels: ["Shortage Risk", "Efficiency", "Infrastructure"],
      datasets: [
        {
          label: "Risk Level",
          data: [
            waterAnalysis.shortage_risk.level === "high"
              ? 100
              : waterAnalysis.shortage_risk.level === "medium"
                ? 60
                : 30,
            50,
            40,
          ],
        },
      ],
    };
  }

  return graphs;
}

/**
 * Main function: Get Irrigation Efficiency & Water Risk Data
 */
async function getIrrigationEfficiencyAndWaterRisk(
  companyId,
  year = null,
  userId = null,
) {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    if (!companyId) {
      throw new AppError("Company ID is required", 400, "MISSING_COMPANY_ID");
    }

    const targetYear = year || new Date().getFullYear();

    const envData = await getEnvironmentalMetrics(companyId, targetYear);

    if (!envData.company) {
      throw new AppError("Company not found", 404, "COMPANY_NOT_FOUND");
    }

    const existingIrrigationData = await getIrrigationEfficiencyData(
      companyId,
      targetYear,
    );

    const waterMetrics = extractWaterMetrics(
      envData.environmental_metrics,
      targetYear,
      userId,
    );

    const waterRisk = calculateWaterRisk(waterMetrics, targetYear);

    const graphs = generateGraphs(
      envData.environmental_metrics,
      waterRisk,
      targetYear,
    );

    const response = {
      metadata: {
        api_version: API_VERSION,
        generated_at: new Date().toISOString(),
        endpoint: "irrigation_efficiency_water_risk",
        company_id: companyId,
        year: targetYear,
      },
      company: envData.company,
      environmental_metrics: envData.environmental_metrics.map((metric) => ({
        metric_name: metric.metric_name,
        unit: metric.unit,
        description: metric.description,
        value: metric.value
          ? {
              year: metric.value.year,
              value: metric.value.value,
              numeric_value: metric.value.numeric_value,
              source_notes: metric.value.source_notes,
              added_by: metric.value.added_by,
              added_at: metric.value.added_at,
            }
          : null,
      })),
      water_metrics: waterMetrics,
      existing_irrigation_efficiency_data: existingIrrigationData,
      water_risk_analysis: {
        irrigation_water: waterRisk.irrigation_water,
        treatment_water: waterRisk.treatment_water,
        total_water_usage: waterRisk.total_water_usage,
        shortage_risk: waterRisk.shortage_risk,
        savings_potential: waterRisk.savings_potential,
      },
      graphs: graphs,
      data_quality: {
        score: envData.data_quality?.score || 0,
        verification_status:
          envData.data_quality?.verification_status || "unverified",
        validation_status:
          envData.data_quality?.validation_status || "not_validated",
        metrics_count: envData.environmental_metrics.length,
        water_metrics_count: waterMetrics.length,
      },
      summary: {
        key_findings: [
          waterRisk.irrigation_water.value
            ? `Irrigation water usage: ${waterRisk.irrigation_water.value} million ML`
            : "Irrigation water data not available",
          waterRisk.treatment_water.value
            ? `Water treatment: ${waterRisk.treatment_water.value} million ML`
            : "Water treatment data not available",
          `Water shortage risk: ${waterRisk.shortage_risk.level}`,
          waterRisk.savings_potential
            ? `Potential savings: ${waterRisk.savings_potential.toFixed(2)} million ML`
            : "Savings potential not calculated",
        ],
        recommendations: [
          {
            category: "Water Management",
            actions:
              waterRisk.shortage_risk.mitigation.length > 0
                ? waterRisk.shortage_risk.mitigation
                : [
                    "Implement water monitoring",
                    "Conduct water audit",
                    "Develop conservation plan",
                  ],
            priority:
              waterRisk.shortage_risk.level === "high" ? "High" : "Medium",
          },
          {
            category: "Data Collection",
            actions: [
              "Continue regular water usage monitoring",
              "Document conservation measures",
              envData.environmental_metrics.length < 5
                ? "Collect more water metrics"
                : "Maintain current data collection",
            ],
            priority:
              waterRisk.shortage_risk.level === "high" ? "High" : "Medium",
          },
        ],
      },
    };

    await session.commitTransaction();
    session.endSession();

    return response;
  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(
      `Failed to retrieve irrigation efficiency data: ${error.message}`,
      500,
      "IRRIGATION_EFFICIENCY_API_ERROR",
    );
  }
}

module.exports = {
  getIrrigationEfficiencyAndWaterRisk,
};
