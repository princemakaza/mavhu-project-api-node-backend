const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const FarmManagementCompliance = require("../models/fmc_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");

// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";

/**
 * Helper function to extract metric values by name from ESGData
 */
async function getMetricsByNames(companyId, metricNames, year = null) {
  try {
    const query = {
      company: companyId,
      is_active: true,
      "metrics.metric_name": { $in: metricNames },
    };

    if (year) {
      query["metrics.values.year"] = year;
    }

    const esgData = await ESGData.find(query)
      .populate("company", "name industry country")
      .lean();

    const metrics = {};

    esgData.forEach((data) => {
      data.metrics.forEach((metric) => {
        if (metricNames.includes(metric.metric_name)) {
          if (!metrics[metric.metric_name]) {
            metrics[metric.metric_name] = {
              name: metric.metric_name,
              category: metric.category,
              unit: metric.unit,
              values: [],
            };
          }

          metric.values.forEach((value) => {
            if (!year || value.year === year) {
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
 * Helper function to get farm compliance metrics from the new model
 * Returns all metrics present in the document for the requested year,
 * with all user references fully populated.
 */
async function getFarmComplianceMetrics(companyId, year) {
  try {
    const farmComplianceDoc = await FarmManagementCompliance.findOne({
      company: companyId,
      is_active: true,
      $or: [
        {
          data_period_start: { $lte: year.toString() },
          data_period_end: { $gte: year.toString() },
        },
        { data_period_start: null, data_period_end: null },
      ],
    })
      // Fully populate top-level user references (all fields)
      .populate("created_by")
      .populate("last_updated_by")
      .populate("verified_by")
      // Populate nested user references inside each metric's yearly_data
      .populate({
        path: "metrics.yearly_data.added_by",
        // Remove select to include all fields, or specify needed fields:
        // select: "name email role"
      })
      .populate({
        path: "metrics.yearly_data.last_updated_by",
      })
      .lean();

    if (!farmComplianceDoc) {
      return { metrics: {}, document: null };
    }

    const metrics = {};

    farmComplianceDoc.metrics.forEach((metric) => {
      const yearData = metric.yearly_data.find(
        (yd) => yd.year === year.toString(),
      );
      if (yearData) {
        metrics[metric.metric_name] = {
          category: metric.category,
          subcategory: metric.subcategory,
          unit: yearData.unit || metric.unit,
          value: yearData.value,
          numeric_value: yearData.numeric_value,
          source: yearData.source,
          notes: yearData.notes,
          added_at: yearData.added_at,
          added_by: yearData.added_by, // now fully populated
          last_updated_by: yearData.last_updated_by, // fully populated
        };
      }
      // Optionally handle single_value, list_data, summary_value if they have a year association
      // For now we only include yearly_data as requested
    });

    return { metrics, document: farmComplianceDoc };
  } catch (error) {
    throw new AppError(
      `Error fetching farm compliance metrics: ${error.message}`,
      500,
      "FARM_COMPLIANCE_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to get carbon emission data (only scope 3 used for compliance)
 */
async function getCarbonEmissionData(companyId, year) {
  try {
    const carbonData = await CarbonEmissionAccounting.findOne({
      company: companyId,
      is_active: true,
    })
      .populate("company")
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) return null;

    const yearData = carbonData.yearly_data.find((d) => d.year === year);
    if (!yearData) return null;

    return {
      scope3: {
        categories: yearData.emissions?.scope3?.categories || [],
        total_tco2e_per_ha: yearData.emissions?.scope3?.total_tco2e_per_ha || 0,
        total_tco2e: yearData.emissions?.scope3?.total_tco2e || 0,
      },
      sequestration: {
        total_tco2:
          yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
      },
      netBalance: yearData.emissions?.net_total_emission_tco2e || 0,
      dataQuality: {
        completeness: yearData.data_quality?.completeness_score || 0,
        verification:
          yearData.data_quality?.verification_status || "unverified",
      },
      fullYearData: yearData,
      document: carbonData,
    };
  } catch (error) {
    throw new AppError(
      `Error fetching carbon emission data: ${error.message}`,
      500,
      "CARBON_DATA_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to calculate percentage change
 */
function calculatePercentageChange(initialValue, finalValue) {
  if (!initialValue || initialValue === 0) return 0;
  return ((finalValue - initialValue) / initialValue) * 100;
}

/**
 * Helper function to get metric value by year from metrics object
 */
function getMetricValue(metrics, metricName, year) {
  const metric = metrics[metricName];
  if (!metric) return null;
  return metric.numeric_value !== undefined
    ? metric.numeric_value
    : metric.value
      ? parseFloat(metric.value) || 0
      : null;
}

/**
 * Extract GRI/IFRS alignment data from ESGData
 */
function extractGRIAndIFRSData(esgData, currentYear) {
  const griIfrsData = {
    sources: [],
    alignments: [],
    files: [],
    policies: [],
    certifications: [],
  };

  esgData.forEach((data) => {
    if (
      data.data_source &&
      (data.data_source.toLowerCase().includes("gri") ||
        data.data_source.toLowerCase().includes("ifrs") ||
        data.data_source.toLowerCase().includes("hippo valley"))
    ) {
      griIfrsData.sources.push({
        source: data.data_source,
        file_name: data.source_file_name,
        file_type: data.source_file_type,
        import_date: data.import_date,
        verification_status: data.verification_status,
      });
    }

    if (
      data.source_file_name &&
      (data.source_file_name.toLowerCase().includes("gri") ||
        data.source_file_name.toLowerCase().includes("ifrs"))
    ) {
      griIfrsData.files.push({
        file_name: data.source_file_name,
        file_type: data.source_file_type,
        import_date: data.import_date,
        verification_status: data.verification_status,
        data_quality_score: data.data_quality_score,
      });
    }

    data.metrics.forEach((metric) => {
      const metricName = metric.metric_name.toLowerCase();

      if (
        metricName.includes("gri") ||
        metricName.includes("ifrs") ||
        metricName.includes("tcfd") ||
        metricName.includes("alignment") ||
        metricName.includes("compliance")
      ) {
        const yearValue = metric.values.find((v) => v.year === currentYear);
        if (yearValue) {
          griIfrsData.alignments.push({
            metric_name: metric.metric_name,
            category: metric.category,
            value: yearValue.value,
            numeric_value: yearValue.numeric_value,
            source_notes: yearValue.source_notes,
            unit: metric.unit,
          });
        }
      }

      if (
        metricName.includes("policy") ||
        metricName.includes("certif") ||
        metricName.includes("standard") ||
        metricName.includes("framework")
      ) {
        const yearValue = metric.values.find((v) => v.year === currentYear);
        if (yearValue) {
          if (metricName.includes("policy")) {
            griIfrsData.policies.push({
              name: metric.metric_name,
              category: metric.category,
              status: yearValue.value,
              description: metric.description,
              verified:
                data.verification_status === "verified" ||
                data.verification_status === "audited",
            });
          } else if (metricName.includes("certif")) {
            griIfrsData.certifications.push({
              name: metric.metric_name,
              category: metric.category,
              status: yearValue.value,
              description: metric.description,
              verified:
                data.verification_status === "verified" ||
                data.verification_status === "audited",
            });
          }
        }
      }
    });
  });

  return griIfrsData;
}

/**
 * Extract comprehensive audit trails from ESGData
 */
function extractAuditTrails(esgData) {
  const auditTrails = {
    verifications: [],
    validations: [],
    imports: [],
    qualityScores: [],
  };

  esgData.forEach((data) => {
    if (data.import_date) {
      auditTrails.imports.push({
        batch_id: data.import_batch_id,
        source_file: data.source_file_name,
        file_type: data.source_file_type,
        import_date: data.import_date,
        metrics_imported: data.metrics.length,
        import_notes: data.import_notes,
      });
    }

    if (data.data_quality_score !== null) {
      auditTrails.qualityScores.push({
        data_source: data.data_source,
        quality_score: data.data_quality_score,
        verification_status: data.verification_status,
        validation_status: data.validation_status,
      });
    }
  });

  auditTrails.verifications.sort(
    (a, b) => new Date(b.verified_at) - new Date(a.verified_at),
  );
  auditTrails.imports.sort(
    (a, b) => new Date(b.import_date) - new Date(a.import_date),
  );

  return auditTrails;
}

/**
 * Extract policy documentation from ESGData
 */
function extractPolicyDocuments(esgData, company) {
  const policies = {
    esg_frameworks: company.esg_reporting_framework || [],
    documents: [],
    standards: [],
    compliance_status: {},
  };

  esgData.forEach((data) => {
    if (data.data_source && data.data_source.toLowerCase().includes("policy")) {
      policies.documents.push({
        title: data.data_source,
        source: data.source_file_name,
        type: data.source_file_type,
        import_date: data.import_date,
        status: data.verification_status,
      });
    }

    data.metrics.forEach((metric) => {
      const metricName = metric.metric_name.toLowerCase();

      if (metricName.includes("policy") || metricName.includes("standard")) {
        const yearValue = metric.values.sort((a, b) => b.year - a.year)[0];
        if (yearValue) {
          if (metricName.includes("policy")) {
            policies.documents.push({
              title: metric.metric_name,
              description: metric.description,
              category: metric.category,
              status: yearValue.value,
              year: yearValue.year,
              verified: data.verification_status === "verified",
            });
          } else if (metricName.includes("standard")) {
            policies.standards.push({
              name: metric.metric_name,
              description: metric.description,
              compliance_level: yearValue.value,
              year: yearValue.year,
            });
          }
        }
      }
    });
  });

  return policies;
}

/**
 * Extract certifications from ESGData
 */
function extractCertifications(esgData, year) {
  const certifications = [];

  esgData.forEach((data) => {
    data.metrics.forEach((metric) => {
      if (
        metric.metric_name.toLowerCase().includes("certification") ||
        metric.metric_name.toLowerCase().includes("certified") ||
        metric.metric_name.toLowerCase().includes("iso") ||
        metric.metric_name.toLowerCase().includes("standard")
      ) {
        const yearValue = metric.values.find((v) => v.year === year);
        if (yearValue) {
          certifications.push({
            name: metric.metric_name,
            category: metric.category,
            year: year,
            status: yearValue.value,
            numeric_value: yearValue.numeric_value,
            source_notes: yearValue.source_notes,
            unit: metric.unit,
            description: metric.description,
            verified:
              data.verification_status === "verified" ||
              data.verification_status === "audited",
            data_source: data.data_source,
            file_source: data.source_file_name,
          });
        }
      }
    });
  });

  return certifications;
}

/**
 * Count verified metrics
 */
function countVerifiedMetrics(esgData) {
  let count = 0;
  esgData.forEach((data) => {
    if (
      data.verification_status === "verified" ||
      data.verification_status === "audited"
    ) {
      count += data.metrics.length;
    }
  });
  return count;
}

/**
 * Get latest verification date
 */
function getLatestVerificationDate(esgData) {
  let latestDate = null;
  esgData.forEach((data) => {
    if (data.verified_at && (!latestDate || data.verified_at > latestDate)) {
      latestDate = data.verified_at;
    }
  });
  return latestDate;
}

/**
 * Calculate data coverage percentage
 */
function calculateDataCoverage(availableMetrics, expectedMetricNames) {
  const availableCount = expectedMetricNames.filter(
    (name) =>
      availableMetrics[name] && availableMetrics[name].values?.length > 0,
  ).length;
  return expectedMetricNames.length > 0
    ? Math.round((availableCount / expectedMetricNames.length) * 100)
    : 0;
}

/**
 * Calculate compliance scores based on actual data
 */
function calculateComplianceScores(
  farmMetrics,
  frameworkMetrics,
  carbonData,
  year,
) {
  // Training scores
  const totalTrainingHours =
    getMetricValue(farmMetrics, "Training Hours - Total", year) || 0;
  const farmerTrainingHours =
    getMetricValue(farmMetrics, "Training Hours - Farmer Training", year) || 0;
  const employeesTrained =
    getMetricValue(farmMetrics, "Employees Trained - Total", year) || 0;

  // Scope 3 engagement scores
  const suppliersWithCode =
    getMetricValue(farmMetrics, "Suppliers with Code of Conduct", year) || 0;
  const suppliersAudited =
    getMetricValue(farmMetrics, "Suppliers Audited", year) || 0;
  const nonComplianceCases =
    getMetricValue(farmMetrics, "Supplier Non-Compliance Cases", year) || 0;

  // Framework alignment scores
  const griCompliance =
    getMetricValue(frameworkMetrics, "GRI Standards Compliance", year) || 0;
  const ifrsS1 =
    getMetricValue(frameworkMetrics, "IFRS S1 Alignment", year) || 0;
  const ifrsS2 =
    getMetricValue(frameworkMetrics, "IFRS S2 Alignment", year) || 0;
  const tcfd =
    getMetricValue(
      frameworkMetrics,
      "TCFD Recommendations Implemented",
      year,
    ) || 0;

  // Carbon score (only scope 3)
  const scope3Emissions = carbonData?.scope3?.total_tco2e || 0;
  const carbonScore =
    scope3Emissions > 0 ? Math.max(0, 100 - (scope3Emissions / 100) * 10) : 100;

  // Normalize scores (assuming reasonable max benchmarks)
  const trainingHoursScore = Math.min((totalTrainingHours / 100) * 100, 100);
  const trainedEmployeesScore = Math.min(employeesTrained, 100);
  const supplierCodeScore = Math.min((suppliersWithCode / 100) * 100, 100);
  const supplierAuditScore =
    suppliersAudited > 0 ? Math.min((suppliersAudited / 50) * 100, 100) : 0;
  const nonComplianceScore =
    nonComplianceCases === 0 ? 100 : Math.max(0, 100 - nonComplianceCases * 10);

  const frameworkAvg = (griCompliance + ifrsS1 + ifrsS2 + tcfd) / 4;

  const overallScore = Math.round(
    trainingHoursScore * 0.1 +
      trainedEmployeesScore * 0.1 +
      supplierCodeScore * 0.15 +
      supplierAuditScore * 0.1 +
      nonComplianceScore * 0.1 +
      frameworkAvg * 0.2 +
      carbonScore * 0.15 +
      10,
  );

  return {
    scores: {
      trainingHours: Math.round(trainingHoursScore),
      trainedEmployees: Math.round(trainedEmployeesScore),
      supplierCodeAdoption: Math.round(supplierCodeScore),
      supplierAudits: Math.round(supplierAuditScore),
      nonCompliance: Math.round(nonComplianceScore),
      frameworkAlignment: Math.round(frameworkAvg),
      carbonScope3: Math.round(carbonScore),
      overall: Math.min(overallScore, 100),
    },
    assessmentDate: new Date().toISOString(),
    rating:
      overallScore >= 90
        ? "Excellent"
        : overallScore >= 75
          ? "Good"
          : overallScore >= 60
            ? "Satisfactory"
            : overallScore >= 40
              ? "Needs Improvement"
              : "Poor",
  };
}

/**
 * Generate at least 5 graphs based on actual data
 */
function generateComplianceGraphs(
  farmMetrics,
  frameworkMetrics,
  carbonData,
  year,
) {
  // Graph 1: Training Hours Distribution
  const trainingHours = {
    type: "bar",
    title: "Training Hours by Category",
    description: "Breakdown of training hours for the selected year",
    labels: [
      "Farmer Training",
      "Safety Training",
      "Technical Skills",
      "Compliance Training",
    ],
    datasets: [
      {
        label: "Training Hours",
        data: [
          getMetricValue(
            farmMetrics,
            "Training Hours - Farmer Training",
            year,
          ) || 0,
          getMetricValue(
            farmMetrics,
            "Training Hours - Safety Training",
            year,
          ) || 0,
          getMetricValue(
            farmMetrics,
            "Training Hours - Technical Skills",
            year,
          ) || 0,
          getMetricValue(
            farmMetrics,
            "Training Hours - Compliance Training",
            year,
          ) || 0,
        ],
        backgroundColor: "#3498db",
      },
    ],
  };

  // Graph 2: Scope 3 Engagement Metrics
  const scope3Engagement = {
    type: "bar",
    title: "Supplier Engagement Metrics",
    description: "Key indicators for Scope 3 supplier management",
    labels: [
      "Suppliers with Code",
      "Suppliers Audited",
      "Non-Compliance Cases",
      "Corrective Actions",
    ],
    datasets: [
      {
        label: "Count",
        data: [
          getMetricValue(farmMetrics, "Suppliers with Code of Conduct", year) ||
            0,
          getMetricValue(farmMetrics, "Suppliers Audited", year) || 0,
          getMetricValue(farmMetrics, "Supplier Non-Compliance Cases", year) ||
            0,
          getMetricValue(farmMetrics, "Supplier Corrective Actions", year) || 0,
        ],
        backgroundColor: "#e74c3c",
      },
    ],
  };

  // Graph 3: Scope 3 Emissions by Category (from carbon data)
  const scope3Categories = carbonData?.scope3?.categories || [];
  const scope3ByCategory = {
    type: "pie",
    title: "Scope 3 Emissions by Category",
    description: "Breakdown of Scope 3 emissions sources",
    labels: scope3Categories.map((c) => c.category || "Unknown"),
    datasets: [
      {
        data: scope3Categories.map((c) => c.tco2e_per_ha_per_year || 0),
        backgroundColor: [
          "#2ecc71",
          "#f39c12",
          "#9b59b6",
          "#3498db",
          "#e67e22",
          "#1abc9c",
        ],
      },
    ],
  };

  // Graph 4: Framework Alignment Scores
  const frameworkAlignment = {
    type: "horizontalBar",
    title: "ESG Framework Alignment",
    description: "Alignment scores with major reporting frameworks",
    labels: ["GRI", "IFRS S1", "IFRS S2", "TCFD"],
    datasets: [
      {
        label: "Alignment Score (%)",
        data: [
          getMetricValue(frameworkMetrics, "GRI Standards Compliance", year) ||
            0,
          getMetricValue(frameworkMetrics, "IFRS S1 Alignment", year) || 0,
          getMetricValue(frameworkMetrics, "IFRS S2 Alignment", year) || 0,
          getMetricValue(
            frameworkMetrics,
            "TCFD Recommendations Implemented",
            year,
          ) || 0,
        ],
        backgroundColor: "#27ae60",
      },
    ],
  };

  // Graph 5: Compliance Score Radar
  const trainingHoursScore = Math.min(
    ((getMetricValue(farmMetrics, "Training Hours - Total", year) || 0) / 100) *
      100,
    100,
  );
  const supplierCodeScore = Math.min(
    ((getMetricValue(farmMetrics, "Suppliers with Code of Conduct", year) ||
      0) /
      100) *
      100,
    100,
  );
  const griScore =
    getMetricValue(frameworkMetrics, "GRI Standards Compliance", year) || 0;
  const ifrsAvg =
    ((getMetricValue(frameworkMetrics, "IFRS S1 Alignment", year) || 0) +
      (getMetricValue(frameworkMetrics, "IFRS S2 Alignment", year) || 0)) /
    2;
  const carbonScore = carbonData?.scope3?.total_tco2e
    ? Math.max(0, 100 - (carbonData.scope3.total_tco2e / 100) * 10)
    : 0;

  const complianceRadar = {
    type: "radar",
    title: "Compliance Performance Radar",
    description: "Overall compliance across key dimensions",
    labels: [
      "Training",
      "Supplier Code",
      "GRI Alignment",
      "IFRS Alignment",
      "Carbon (Scope 3)",
    ],
    datasets: [
      {
        label: "Score (%)",
        data: [
          Math.round(trainingHoursScore),
          Math.round(supplierCodeScore),
          Math.round(griScore),
          Math.round(ifrsAvg),
          Math.round(carbonScore),
        ],
        backgroundColor: "rgba(52, 152, 219, 0.2)",
        borderColor: "#2980b9",
      },
    ],
  };

  return {
    trainingHours,
    scope3Engagement,
    scope3ByCategory,
    frameworkAlignment,
    complianceRadar,
  };
}

/**
 * Generate recommendations based on actual data
 */
function generateRecommendations(
  farmMetrics,
  frameworkMetrics,
  carbonData,
  year,
) {
  const recommendations = {
    immediate: [],
    medium_term: [],
    long_term: [],
  };

  const totalTrainingHours =
    getMetricValue(farmMetrics, "Training Hours - Total", year) || 0;
  if (totalTrainingHours < 50) {
    recommendations.immediate.push(
      "Increase total training hours to at least 50 per year.",
    );
  } else if (totalTrainingHours < 100) {
    recommendations.medium_term.push(
      "Expand training programs to reach 100+ hours annually.",
    );
  }

  const farmerTraining =
    getMetricValue(farmMetrics, "Training Hours - Farmer Training", year) || 0;
  if (farmerTraining < 20) {
    recommendations.immediate.push(
      "Prioritize farmer-specific training to improve Scope 3 engagement.",
    );
  }

  const suppliersWithCode =
    getMetricValue(farmMetrics, "Suppliers with Code of Conduct", year) || 0;
  if (suppliersWithCode < 80) {
    recommendations.immediate.push(
      "Increase supplier code of conduct adoption to at least 80%.",
    );
  }

  const nonCompliance =
    getMetricValue(farmMetrics, "Supplier Non-Compliance Cases", year) || 0;
  if (nonCompliance > 5) {
    recommendations.medium_term.push(
      "Investigate root causes of supplier non-compliance and implement corrective action plans.",
    );
  }

  const griScore =
    getMetricValue(frameworkMetrics, "GRI Standards Compliance", year) || 0;
  if (griScore < 70) {
    recommendations.medium_term.push(
      "Enhance GRI Standards compliance by conducting a gap analysis.",
    );
  }

  const ifrsS1 =
    getMetricValue(frameworkMetrics, "IFRS S1 Alignment", year) || 0;
  const ifrsS2 =
    getMetricValue(frameworkMetrics, "IFRS S2 Alignment", year) || 0;
  if (ifrsS1 < 50 || ifrsS2 < 50) {
    recommendations.long_term.push(
      "Develop a roadmap for full IFRS S1/S2 alignment within 3 years.",
    );
  }

  if (carbonData && carbonData.scope3.total_tco2e > 1000) {
    recommendations.medium_term.push(
      "Implement supplier engagement programs to reduce Scope 3 emissions.",
    );
    recommendations.long_term.push(
      "Set science-based targets for Scope 3 emission reductions.",
    );
  }

  if (
    recommendations.immediate.length === 0 &&
    recommendations.medium_term.length === 0 &&
    recommendations.long_term.length === 0
  ) {
    recommendations.immediate.push("_______________________________");
    recommendations.medium_term.push("_______________________________");
    recommendations.long_term.push("_______________________________");
  }

  return recommendations;
}

/**
 * Main function: Get Farm Management Compliance Data (Training + Scope 3)
 */
async function getFarmComplianceData(companyId, year) {
  try {
    if (!year) {
      throw new AppError("Year parameter is required", 400, "YEAR_REQUIRED");
    }

    const company = await Company.findById(companyId).lean();
    if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

    const { metrics: farmMetrics, document: farmComplianceDoc } =
      await getFarmComplianceMetrics(companyId, year);

    const carbonData = await getCarbonEmissionData(companyId, year);

    const frameworkMetricNames = [
      "GRI Standards Compliance",
      "IFRS S1 Alignment",
      "IFRS S2 Alignment",
      "TCFD Recommendations Implemented",
      "SASB Standards Alignment",
      "UNSDG Goals Alignment",
      "CDP Disclosure Score",
    ];
    const frameworkMetrics = await getMetricsByNames(
      companyId,
      frameworkMetricNames,
      year,
    );

    const allESGData = await ESGData.find({
      company: companyId,
      is_active: true,
      "metrics.values.year": year,
    })
      .populate("company")
      .populate("created_by", "name email")
      .populate("verified_by", "name email")
      .lean();

    const griIfrsData = extractGRIAndIFRSData(allESGData, year);
    const auditTrails = extractAuditTrails(allESGData);
    const policies = extractPolicyDocuments(allESGData, company);
    const certifications = extractCertifications(allESGData, year);

    const complianceScores = calculateComplianceScores(
      farmMetrics,
      frameworkMetrics,
      carbonData,
      year,
    );
    const graphs = generateComplianceGraphs(
      farmMetrics,
      frameworkMetrics,
      carbonData,
      year,
    );
    const recommendations = generateRecommendations(
      farmMetrics,
      frameworkMetrics,
      carbonData,
      year,
    );

    // Build response
    const response = {
      versions: {
        api: API_VERSION,
        calculation: CALCULATION_VERSION,
        gee_adapter: GEE_ADAPTER_VERSION,
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
      time_period: `${year}`,

      // Farm compliance data from new model
      farm_compliance_doc: farmComplianceDoc, // Include full document for reference, with all fields and populated user references
      farm_compliance: {
        document_id: farmComplianceDoc?._id || null,
        data_period: farmComplianceDoc
          ? {
              start: farmComplianceDoc.data_period_start,
              end: farmComplianceDoc.data_period_end,
            }
          : null,

        // All metrics for the selected year (keyed by metric name)
        all_metrics: farmMetrics, // Each entry contains category, subcategory, unit, value, numeric_value, source, notes, added_at, added_by, last_updated_by

        // Backward compatibility: training and scope3 engagement
        metrics: {
          training: {
            total_training_hours: getMetricValue(
              farmMetrics,
              "Training Hours - Total",
              year,
            ),
            farmer_training_hours: getMetricValue(
              farmMetrics,
              "Training Hours - Farmer Training",
              year,
            ),
            safety_training_hours: getMetricValue(
              farmMetrics,
              "Training Hours - Safety Training",
              year,
            ),
            technical_training_hours: getMetricValue(
              farmMetrics,
              "Training Hours - Technical Skills",
              year,
            ),
            compliance_training_hours: getMetricValue(
              farmMetrics,
              "Training Hours - Compliance Training",
              year,
            ),
            employees_trained_total: getMetricValue(
              farmMetrics,
              "Employees Trained - Total",
              year,
            ),
            employees_trained_farmers: getMetricValue(
              farmMetrics,
              "Employees Trained - Farmers",
              year,
            ),
          },
          scope3_engagement: {
            suppliers_with_code: getMetricValue(
              farmMetrics,
              "Suppliers with Code of Conduct",
              year,
            ),
            suppliers_audited: getMetricValue(
              farmMetrics,
              "Suppliers Audited",
              year,
            ),
            supplier_training_hours: getMetricValue(
              farmMetrics,
              "Supplier Training Hours",
              year,
            ),
            non_compliance_cases: getMetricValue(
              farmMetrics,
              "Supplier Non-Compliance Cases",
              year,
            ),
            corrective_actions: getMetricValue(
              farmMetrics,
              "Supplier Corrective Actions",
              year,
            ),
          },
        },

        // Other document fields
        summary_stats: farmComplianceDoc?.summary_stats || null,
        gri_references: farmComplianceDoc?.gri_references || [],
        forecast_data: farmComplianceDoc?.forecast_data || [],
        risk_assessment: farmComplianceDoc?.risk_assessment || [],

        // Import and metadata
        import_info: farmComplianceDoc
          ? {
              import_source: farmComplianceDoc.import_source,
              source_file_name: farmComplianceDoc.source_file_name,
              import_date: farmComplianceDoc.import_date,
              data_quality_score: farmComplianceDoc.data_quality_score,
              verification_status: farmComplianceDoc.verification_status,
            }
          : null,

        metadata: farmComplianceDoc
          ? {
              version: farmComplianceDoc.version,
              created_at: farmComplianceDoc.created_at,
              created_by: farmComplianceDoc.created_by, // fully populated
              last_updated_at: farmComplianceDoc.last_updated_at,
              last_updated_by: farmComplianceDoc.last_updated_by, // fully populated
              verified_at: farmComplianceDoc.verified_at,
              verified_by: farmComplianceDoc.verified_by, // fully populated
              verification_notes: farmComplianceDoc.verification_notes,
              validation_status: farmComplianceDoc.validation_status,
            }
          : null,
      },

      // Carbon data (only scope 3)
      carbon_scope3: carbonData
        ? {
            total_tco2e: carbonData.scope3.total_tco2e,
            total_tco2e_per_ha: carbonData.scope3.total_tco2e_per_ha,
            categories: carbonData.scope3.categories.map((c) => ({
              category: c.category,
              parameter: c.parameter,
              unit: c.unit,
              annual_activity_per_ha: c.annual_activity_per_ha,
              emission_factor: c.emission_factor,
              ef_number: c.ef_number,
              tco2e_per_ha_per_year: c.tco2e_per_ha_per_year,
            })),
            sequestration_total_tco2: carbonData.sequestration.total_tco2,
            net_balance_tco2e: carbonData.netBalance,
            data_quality: carbonData.dataQuality,
          }
        : null,

      // Framework alignment from ESGData
      framework_alignment: {
        gri_compliance: getMetricValue(
          frameworkMetrics,
          "GRI Standards Compliance",
          year,
        ),
        ifrs_s1_alignment: getMetricValue(
          frameworkMetrics,
          "IFRS S1 Alignment",
          year,
        ),
        ifrs_s2_alignment: getMetricValue(
          frameworkMetrics,
          "IFRS S2 Alignment",
          year,
        ),
        tcfd_implementation: getMetricValue(
          frameworkMetrics,
          "TCFD Recommendations Implemented",
          year,
        ),
        sasb_alignment: getMetricValue(
          frameworkMetrics,
          "SASB Standards Alignment",
          year,
        ),
        unsdg_alignment: getMetricValue(
          frameworkMetrics,
          "UNSDG Goals Alignment",
          year,
        ),
        cdp_score: getMetricValue(
          frameworkMetrics,
          "CDP Disclosure Score",
          year,
        ),
      },

      gri_ifrs_data: griIfrsData,
      policies_and_certifications: {
        policies: policies.documents,
        certifications: certifications,
        summary: {
          total_policies: policies.documents.length,
          total_certifications: certifications.length,
        },
      },
      audit_trails: auditTrails,
      compliance_scores: complianceScores,
      graphs: graphs,
      data_quality: {
        verified_metrics: countVerifiedMetrics(allESGData),
        last_verification_date: getLatestVerificationDate(allESGData),
        data_coverage: calculateDataCoverage(
          { ...farmMetrics, ...frameworkMetrics },
          [...Object.keys(farmMetrics), ...frameworkMetricNames],
        ),
        carbon_data_available: carbonData !== null,
      },
      recommendations: recommendations,
      metadata: {
        generated_at: new Date().toISOString(),
        data_sources: {
          farm_compliance: farmComplianceDoc ? 1 : 0,
          esg_data: allESGData.length,
          carbon_data: carbonData ? 1 : 0,
        },
        year: year,
      },
    };

    return response;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Error fetching farm compliance data: ${error.message}`,
      500,
      "COMPLIANCE_DATA_FETCH_ERROR",
    );
  }
}

module.exports = {
  getFarmComplianceData,
};