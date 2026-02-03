const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const CarbonEmissionAccounting = require("../models/carbon_emission_accounting_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");


// Version constants from environment variables
const API_VERSION = process.env.API_VERSION || "1.0.0";
const CALCULATION_VERSION = process.env.CALCULATION_VERSION || "1.0.0";
const GEE_ADAPTER_VERSION = process.env.GEE_ADAPTER_VERSION || "1.0.0";



/**
 * Helper function to extract metric values by name with proper error handling
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
 * Helper function to get ALL carbon emission data for a company, then extract specific year
 */
async function getCompleteCarbonEmissionData(companyId, year) {
  try {
    const carbonData = await CarbonEmissionAccounting.findOne({
      company: companyId,
      is_active: true,
    })
      .populate("company")
      .populate("created_by", "name email")
      .populate("last_updated_by", "name email")
      .lean();

    if (!carbonData) {
      return null;
    }

    // Find the specific year data
    const yearData = carbonData.yearly_data.find((d) => d.year === year);

    if (!yearData) {
      return null;
    }

    return {
      carbonData: carbonData,
      yearData: yearData,
      summary: carbonData.summary || {},
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
 * Helper function to extract carbon metrics for compliance
 */
function extractCarbonMetrics(carbonData) {
  if (!carbonData) {
    return {
      emissions: null,
      sequestration: null,
      netBalance: null,
    };
  }

  const { yearData } = carbonData;

  return {
    emissions: {
      scope1: yearData.emissions?.scope1?.total_tco2e || 0,
      scope2: yearData.emissions?.scope2?.total_tco2e || 0,
      scope3: yearData.emissions?.scope3?.total_tco2e || 0,
      totalEmissions: yearData.emissions?.total_scope_emission_tco2e || 0,
    },
    sequestration: {
      biomass: yearData.sequestration?.annual_summary?.total_biomass_co2_t || 0,
      soc: yearData.sequestration?.annual_summary?.total_soc_co2_t || 0,
      totalSequestration:
        yearData.sequestration?.annual_summary?.sequestration_total_tco2 || 0,
    },
    netBalance: yearData.emissions?.net_total_emission_tco2e || 0,
    dataQuality: {
      completeness: yearData.data_quality?.completeness_score || 0,
      verification: yearData.data_quality?.verification_status || "unverified",
    },
  };
}

/**
 * Helper function to format complete carbon emission accounting data
 */
function formatCompleteCarbonAccounting(carbonData, year) {
  if (!carbonData) {
    return null;
  }

  const { carbonData: fullData, yearData } = carbonData;

  return {
    // Basic Information
    document_id: fullData._id,
    status: fullData.status,
    is_active: fullData.is_active,
    created_at: fullData.created_at,
    created_by: fullData.created_by,
    last_updated_at: fullData.last_updated_at,
    last_updated_by: fullData.last_updated_by,

    // Emission References
    emission_references: {
      methodology_statement:
        fullData.emission_references?.methodology_statement || "",
      emission_factors: fullData.emission_references?.emission_factors || [],
      global_warming_potentials:
        fullData.emission_references?.global_warming_potentials || {},
      conversion_factors:
        fullData.emission_references?.conversion_factors || {},
    },

    // Framework Information
    framework: fullData.framework || {},

    // Year-Specific Data
    yearly_data: {
      year: yearData.year,

      // Sequestration Data
      sequestration: {
        reporting_area_ha: yearData.sequestration?.reporting_area_ha || 0,
        soc_area_ha: yearData.sequestration?.soc_area_ha || 0,
        monthly_data: yearData.sequestration?.monthly_data || [],
        methodologies: yearData.sequestration?.methodologies || [],
        annual_summary: yearData.sequestration?.annual_summary || {},
      },

      // Emissions Data
      emissions: {
        // Scope 1 Details
        scope1: {
          sources: yearData.emissions?.scope1?.sources || [],
          total_tco2e_per_ha:
            yearData.emissions?.scope1?.total_tco2e_per_ha || 0,
          total_tco2e: yearData.emissions?.scope1?.total_tco2e || 0,
        },

        // Scope 2 Details
        scope2: {
          sources: yearData.emissions?.scope2?.sources || [],
          total_tco2e_per_ha:
            yearData.emissions?.scope2?.total_tco2e_per_ha || 0,
          total_tco2e: yearData.emissions?.scope2?.total_tco2e || 0,
        },

        // Scope 3 Details
        scope3: {
          categories: yearData.emissions?.scope3?.categories || [],
          total_tco2e_per_ha:
            yearData.emissions?.scope3?.total_tco2e_per_ha || 0,
          total_tco2e: yearData.emissions?.scope3?.total_tco2e || 0,
        },

        // Totals
        total_scope_emission_tco2e_per_ha:
          yearData.emissions?.total_scope_emission_tco2e_per_ha || 0,
        total_scope_emission_tco2e:
          yearData.emissions?.total_scope_emission_tco2e || 0,
        net_total_emission_tco2e:
          yearData.emissions?.net_total_emission_tco2e || 0,
      },

      // Data Quality
      data_quality: yearData.data_quality || {},

      // Source Information
      source_file: yearData.source_file || "",
      imported_at: yearData.imported_at || null,
      last_updated_at: yearData.last_updated_at || null,
    },

    // Aggregated Summary
    summary: fullData.summary || {},

    // Data Management
    data_management: fullData.data_management || {},
  };
}

/**
 * Helper function to calculate carbon-based recommendations
 */
function generateCarbonRecommendations(carbonMetrics, complianceScores) {
  const recommendations = {
    immediate: [],
    medium_term: [],
    long_term: [],
  };

  const { emissions, sequestration, netBalance } = carbonMetrics;

  // Immediate recommendations based on emissions
  if (emissions?.scope1 > 1000) {
    recommendations.immediate.push(
      "Implement direct emission reduction strategies (Scope 1)",
    );
  }

  if (emissions?.scope2 > 500) {
    recommendations.immediate.push(
      "Switch to renewable energy sources to reduce Scope 2 emissions",
    );
  }

  if (emissions?.scope3 > 2000) {
    recommendations.immediate.push(
      "Develop comprehensive Scope 3 emission reduction program",
    );
  }

  if (netBalance > 0) {
    recommendations.immediate.push(
      "Increase carbon sequestration activities to achieve net-zero",
    );
  }

  // Medium-term recommendations
  if (sequestration?.totalSequestration < 1000) {
    recommendations.medium_term.push(
      "Implement agroforestry and soil carbon enhancement practices",
    );
  }

  if (carbonMetrics.dataQuality?.verification !== "verified") {
    recommendations.medium_term.push(
      "Get carbon emission data externally verified",
    );
  }

  // Long-term recommendations
  recommendations.long_term.push("Develop carbon neutrality roadmap for 2030");
  recommendations.long_term.push(
    "Implement circular economy principles in supply chain",
  );

  if (complianceScores?.carbonScore < 70) {
    recommendations.long_term.push(
      "Align carbon strategy with SBTi (Science Based Targets initiative)",
    );
  }

  return recommendations;
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
function calculateTrend(values, year) {
  if (!values || values.length < 2) return "stable";

  // Get current and previous year values
  const currentValue = getMetricValueByYear(values, year);
  const prevValue = getMetricValueByYear(values, year - 1);

  if (currentValue === null || prevValue === null) return "stable";

  const change = calculatePercentageChange(prevValue, currentValue);

  if (change > 5) return "improving";
  if (change < -5) return "declining";
  return "stable";
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
    // Extract data sources that mention GRI/IFRS
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

    // Extract GRI/IFRS specific files
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

    // Extract metrics related to GRI/IFRS
    data.metrics.forEach((metric) => {
      const metricName = metric.metric_name.toLowerCase();

      // GRI/IFRS alignment metrics
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

      // Policy and certification metrics
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
    // Import audits
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

    // Data quality scores
    if (data.data_quality_score !== null) {
      auditTrails.qualityScores.push({
        data_source: data.data_source,
        quality_score: data.data_quality_score,
        verification_status: data.verification_status,
        validation_status: data.validation_status,
      });
    }
  });

  // Sort by date
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
    // Extract from data source
    if (data.data_source && data.data_source.toLowerCase().includes("policy")) {
      policies.documents.push({
        title: data.data_source,
        source: data.source_file_name,
        type: data.source_file_type,
        import_date: data.import_date,
        status: data.verification_status,
      });
    }

    // Extract from metrics
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
 * 5. Farm Management Compliance (Training + Scope 3) API
 * Now includes complete Carbon Emission Accounting data for comprehensive analysis
 */
async function getFarmComplianceData(companyId, year) {
  try {
    // Validate year parameter
    if (!year) {
      throw new AppError("Year parameter is required", 400, "YEAR_REQUIRED");
    }

    // Get company with ALL fields
    const company = await Company.findById(companyId).lean();
    if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

    // Get complete carbon emission accounting data for the year
    const completeCarbonData = await getCompleteCarbonEmissionData(
      companyId,
      year,
    );

    // Extract simplified carbon metrics for backward compatibility
    const carbonMetrics = extractCarbonMetrics(completeCarbonData);

    // Define metrics for farm compliance training and scope 3
    const metricNames = [
      // Training and Development Metrics
      "Training Hours - Total",
      "Training Hours - Farmer Training",
      "Training Hours - Safety Training",
      "Training Hours - Technical Skills",
      "Training Hours - Compliance Training",
      "Employees Trained - Total",
      "Employees Trained - Farmers",
      "Employees Trained - Supervisors",

      // Scope 3 Engagement Metrics
      "Suppliers with Code of Conduct",
      "Suppliers Audited",
      "Supplier Training Hours",
      "Supplier Non-Compliance Cases",
      "Supplier Corrective Actions",

      // GRI/IFRS Alignment Metrics
      "GRI Standards Compliance",
      "IFRS S1 Alignment",
      "IFRS S2 Alignment",
      "TCFD Recommendations Implemented",
      "SASB Standards Alignment",
      "UNSDG Goals Alignment",
      "CDP Disclosure Score",

      // Certification Metrics
      "Certifications - Active",
      "Certifications - Expired",
      "Certifications - In Progress",
      "Certification Audits Completed",
      "ISO 14001 Certification",
      "ISO 45001 Certification",
      "Fair Trade Certification",
      "Organic Certification",

      // Policy Metrics
      "Environmental Policy Implementation",
      "Social Responsibility Policy",
      "Governance Policy Compliance",
      "Code of Conduct Adherence",
      "Whistleblower Policy Effectiveness",

      // Additional Compliance Metrics
      "Regulatory Compliance Rate",
      "Internal Audit Findings",
      "Corrective Actions Implemented",
      "Risk Assessment Coverage",
    ];

    // Get metrics from database for specific year
    const metrics = await getMetricsByNames(companyId, metricNames, year);

    // Get ALL ESG data for the company with detailed population
    const allESGData = await ESGData.find({
      company: companyId,
      is_active: true,
      "metrics.values.year": year,
    })
      .populate("company")
      .populate("created_by", "name email")
      .populate("verified_by", "name email")
      .lean();

    // Extract comprehensive data
    const griIfrsData = extractGRIAndIFRSData(allESGData, year);
    const auditTrails = extractAuditTrails(allESGData);
    const policies = extractPolicyDocuments(allESGData, company);

    // Calculate compliance scores with carbon data
    const compliance = calculateComplianceScores(
      metrics,
      year,
      allESGData,
      carbonMetrics,
    );

    // Generate graphs (4 core graphs as requested)
    const graphs = generateComplianceGraphs(metrics, year, carbonMetrics);

    // Calculate scope 3 metrics
    const scope3Metrics = calculateScope3Metrics(metrics, year, allESGData);

    // Extract certifications
    const certifications = extractCertifications(allESGData, year);

    // Generate carbon-based recommendations
    const carbonRecommendations = generateCarbonRecommendations(
      carbonMetrics,
      compliance.scores,
    );

    // Format complete carbon accounting data
    const carbonAccounting = formatCompleteCarbonAccounting(
      completeCarbonData,
      year,
    );

    // Prepare comprehensive response data
    const data = {
            versions: {
        api: API_VERSION,
        calculation: CALCULATION_VERSION,
        gee_adapter: GEE_ADAPTER_VERSION,
      },

      // Company information with ALL fields
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

        // Data and metadata
        data_source: company.data_source,
        area_of_interest_metadata: company.area_of_interest_metadata,
        data_range: company.data_range,
        data_processing_workflow: company.data_processing_workflow,
        analytical_layer_metadata: company.analytical_layer_metadata,

        // ESG specific
        esg_reporting_framework: company.esg_reporting_framework,
        esg_contact_person: company.esg_contact_person,
        latest_esg_report_year: company.latest_esg_report_year,
        esg_data_status: company.esg_data_status,
        has_esg_linked_pay: company.has_esg_linked_pay,

        // Timestamps
        created_at: company.created_at,
        updated_at: company.updated_at,
      },

      reporting_year: year,
      time_period: `${year}`,

      // COMPLETE CARBON EMISSION ACCOUNTING DATA
      carbon_emission_accounting: carbonAccounting,

      // Legacy fields for backward compatibility
      carbon_emissions: carbonMetrics.emissions
        ? {
            scope1_tco2e: carbonMetrics.emissions.scope1,
            scope2_tco2e: carbonMetrics.emissions.scope2,
            scope3_tco2e: carbonMetrics.emissions.scope3,
            total_emissions_tco2e: carbonMetrics.emissions.totalEmissions,
            net_carbon_balance_tco2e: carbonMetrics.netBalance,
            data_quality: carbonMetrics.dataQuality,
          }
        : null,

      // Legacy carbon sequestration data
      carbon_sequestration: carbonMetrics.sequestration
        ? {
            biomass_co2_t: carbonMetrics.sequestration.biomass,
            soc_co2_t: carbonMetrics.sequestration.soc,
            total_sequestration_tco2:
              carbonMetrics.sequestration.totalSequestration,
            net_co2_change:
              completeCarbonData?.yearData?.sequestration?.annual_summary
                ?.net_co2_change_t || 0,
          }
        : null,

      // Metrics organized by category
      metrics: {
        training: {
          total_training_hours: getMetricValueByYear(
            metrics["Training Hours - Total"],
            year,
          ),
          farmer_training_hours: getMetricValueByYear(
            metrics["Training Hours - Farmer Training"],
            year,
          ),
          employees_trained_total: getMetricValueByYear(
            metrics["Employees Trained - Total"],
            year,
          ),
          employees_trained_farmers: getMetricValueByYear(
            metrics["Employees Trained - Farmers"],
            year,
          ),
          training_distribution: {
            farmer_training: getMetricValueByYear(
              metrics["Training Hours - Farmer Training"],
              year,
            ),
            safety_training: getMetricValueByYear(
              metrics["Training Hours - Safety Training"],
              year,
            ),
            technical_training: getMetricValueByYear(
              metrics["Training Hours - Technical Skills"],
              year,
            ),
            compliance_training: getMetricValueByYear(
              metrics["Training Hours - Compliance Training"],
              year,
            ),
          },
        },

        scope3_engagement: {
          suppliers_with_code: getMetricValueByYear(
            metrics["Suppliers with Code of Conduct"],
            year,
          ),
          suppliers_audited: getMetricValueByYear(
            metrics["Suppliers Audited"],
            year,
          ),
          supplier_training_hours: getMetricValueByYear(
            metrics["Supplier Training Hours"],
            year,
          ),
          non_compliance_cases: getMetricValueByYear(
            metrics["Supplier Non-Compliance Cases"],
            year,
          ),
          corrective_actions: getMetricValueByYear(
            metrics["Supplier Corrective Actions"],
            year,
          ),
        },

        framework_alignment: {
          gri_compliance: getMetricValueByYear(
            metrics["GRI Standards Compliance"],
            year,
          ),
          ifrs_s1_alignment: getMetricValueByYear(
            metrics["IFRS S1 Alignment"],
            year,
          ),
          ifrs_s2_alignment: getMetricValueByYear(
            metrics["IFRS S2 Alignment"],
            year,
          ),
          tcfd_implementation: getMetricValueByYear(
            metrics["TCFD Recommendations Implemented"],
            year,
          ),
          sasb_alignment: getMetricValueByYear(
            metrics["SASB Standards Alignment"],
            year,
          ),
          unsdg_alignment: getMetricValueByYear(
            metrics["UNSDG Goals Alignment"],
            year,
          ),
          cdp_score: getMetricValueByYear(
            metrics["CDP Disclosure Score"],
            year,
          ),
        },
      },

      // GRI/IFRS specific data
      gri_ifrs_data: {
        sources: griIfrsData.sources,
        alignments: griIfrsData.alignments,
        files: griIfrsData.files,
        summary: {
          total_gri_ifrs_sources: griIfrsData.sources.length,
          total_alignment_metrics: griIfrsData.alignments.length,
          average_alignment_score:
            griIfrsData.alignments.length > 0
              ? (
                  griIfrsData.alignments.reduce(
                    (sum, a) => sum + (a.numeric_value || 0),
                    0,
                  ) / griIfrsData.alignments.length
                ).toFixed(1)
              : 0,
        },
      },

      // Policies and certifications
      policies_and_certifications: {
        policies: {
          list: policies.documents,
          esg_frameworks: policies.esg_frameworks,
          compliance_status: policies.compliance_status,
          summary: {
            total_policies: policies.documents.length,
            verified_policies: policies.documents.filter((p) => p.verified)
              .length,
            active_standards: policies.standards.length,
          },
        },
        certifications: {
          list: certifications,
          summary: {
            total_certifications: certifications.length,
            active_certifications: certifications.filter(
              (c) => c.status && !c.status.toLowerCase().includes("expired"),
            ).length,
            pending_certifications: certifications.filter(
              (c) => c.status && c.status.toLowerCase().includes("progress"),
            ).length,
          },
        },
      },

      // Comprehensive audit trails
      audit_trails: {
        verifications: auditTrails.verifications,
        validations: auditTrails.validations,
        imports: auditTrails.imports,
        quality_scores: auditTrails.qualityScores,
        summary: {
          total_verifications: auditTrails.verifications.length,
          total_validations: auditTrails.validations.length,
          recent_import:
            auditTrails.imports.length > 0
              ? auditTrails.imports[0].import_date
              : null,
          average_quality_score:
            auditTrails.qualityScores.length > 0
              ? (
                  auditTrails.qualityScores.reduce(
                    (sum, q) => sum + q.quality_score,
                    0,
                  ) / auditTrails.qualityScores.length
                ).toFixed(1)
              : null,
        },
      },

      // Calculated compliance scores (including carbon)
      compliance_scores: compliance,

      // Generated graphs (4 core graphs)
      graphs: graphs,

      // Additional metrics
      scope3_analysis: scope3Metrics,

      // Data quality and verification
      data_quality: {
        verified_metrics: countVerifiedMetrics(allESGData),
        last_verification_date: getLatestVerificationDate(allESGData),
        data_coverage: calculateDataCoverage(metrics, metricNames),
        carbon_data_available: completeCarbonData !== null,
        carbon_data_quality: carbonMetrics.dataQuality?.completeness || 0,
        carbon_verification_status:
          carbonMetrics.dataQuality?.verification || "unverified",
      },

      // Trends analysis for the year
      trends: {
        training_trend: calculateTrend(metrics["Training Hours - Total"], year),
        compliance_trend: calculateTrend(
          metrics["GRI Standards Compliance"],
          year,
        ),
        scope3_trend: calculateTrend(
          metrics["Suppliers with Code of Conduct"],
          year,
        ),
        certification_trend: calculateTrend(
          metrics["Certifications - Active"],
          year,
        ),
        carbon_trend: calculateCarbonTrend(completeCarbonData, year),
      },

      // Recommendations including carbon-based insights
      recommendations: {
        immediate: [
          compliance.scores.overall < 70
            ? "Conduct comprehensive compliance gap analysis"
            : "Maintain current compliance levels",
          policies.documents.filter((p) => !p.verified).length > 0
            ? "Verify and document all policies"
            : "All policies are verified",
          auditTrails.verifications.length === 0
            ? "Schedule external audit for verification"
            : "Maintain regular audit schedule",
          ...(carbonRecommendations.immediate || []),
        ].filter((r) => r),
        medium_term: [
          "Implement automated compliance monitoring system",
          "Expand supplier code of conduct program",
          "Enhance GRI/IFRS alignment documentation",
          ...(carbonRecommendations.medium_term || []),
        ].filter((r) => r),
        long_term: [
          "Achieve full IFRS S1/S2 alignment",
          "Obtain additional industry certifications",
          "Implement integrated ESG management system",
          ...(carbonRecommendations.long_term || []),
        ].filter((r) => r),
      },

      // Carbon-specific predictions
      carbon_predictions: completeCarbonData
        ? {
            projected_emissions_next_year: calculateProjectedEmissions(
              completeCarbonData,
              year,
            ),
            carbon_neutrality_timeline: predictCarbonNeutrality(
              completeCarbonData,
              year,
            ),
            sequestration_potential: estimateSequestrationPotential(
              completeCarbonData,
              year,
            ),
            scope3_reduction_opportunities:
              identifyScope3ReductionOpportunities(carbonMetrics),
          }
        : null,

      // Metadata
      metadata: {
        
        generated_at: new Date().toISOString(),
        data_sources_count: allESGData.length,
        metrics_extracted: Object.keys(metrics).length,
        carbon_data_included: completeCarbonData !== null,
        carbon_accounting_complete: carbonAccounting !== null,
        year: year,
      },
    };

    return data;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      `Error fetching farm compliance data: ${error.message}`,
      500,
      "COMPLIANCE_DATA_FETCH_ERROR",
    );
  }
}

/**
 * Helper function to calculate compliance scores from metrics including carbon data
 */
function calculateComplianceScores(metrics, year, esgData, carbonMetrics) {
  // Get current year values
  const trainingHours =
    getMetricValueByYear(metrics["Training Hours - Total"], year) || 0;
  const employeesTrained =
    getMetricValueByYear(metrics["Employees Trained - Total"], year) || 0;
  const supplierCompliance =
    getMetricValueByYear(metrics["Suppliers with Code of Conduct"], year) || 0;
  const ifrsS1Alignment =
    getMetricValueByYear(metrics["IFRS S1 Alignment"], year) || 75;
  const ifrsS2Alignment =
    getMetricValueByYear(metrics["IFRS S2 Alignment"], year) || 70;
  const griCompliance =
    getMetricValueByYear(metrics["GRI Standards Compliance"], year) || 70;
  const tcfdImplementation =
    getMetricValueByYear(metrics["TCFD Recommendations Implemented"], year) ||
    65;

  // Calculate carbon-related scores
  let carbonScore = 50; // Default if no carbon data
  if (carbonMetrics && carbonMetrics.emissions) {
    const emissions = carbonMetrics.emissions;
    const sequestration = carbonMetrics.sequestration;

    // Score based on emission intensity (lower is better)
    const emissionIntensityScore = Math.max(
      0,
      100 - (emissions.totalEmissions / 1000) * 10,
    );

    // Score based on sequestration effectiveness
    const sequestrationScore = Math.min(
      100,
      (sequestration.totalSequestration / 1000) * 20,
    );

    // Score based on Scope 3 management
    const scope3Score =
      emissions.scope3 > 0
        ? Math.max(0, 100 - (emissions.scope3 / emissions.totalEmissions) * 100)
        : 100;

    carbonScore = Math.round(
      (emissionIntensityScore + sequestrationScore + scope3Score) / 3,
    );
  }

  // Calculate scores (normalize to percentages)
  const trainingHoursScore = Math.min((trainingHours / 40) * 100, 100);
  const trainedEmployeesScore = Math.min(employeesTrained, 100);
  const supplierComplianceScore = Math.min(supplierCompliance, 100);
  const ifrsS1Score = Math.min(ifrsS1Alignment, 100);
  const ifrsS2Score = Math.min(ifrsS2Alignment, 100);
  const griComplianceScore = Math.min(griCompliance, 100);
  const tcfdScore = Math.min(tcfdImplementation, 100);

  // Calculate data quality score from ESGData
  const dataQualityScore =
    esgData.length > 0
      ? esgData.reduce((sum, data) => sum + (data.data_quality_score || 0), 0) /
        esgData.length
      : 50;

  // Calculate verification score
  const verifiedData = esgData.filter(
    (d) =>
      d.verification_status === "verified" ||
      d.verification_status === "audited",
  );
  const verificationScore =
    esgData.length > 0 ? (verifiedData.length / esgData.length) * 100 : 0;

  // Calculate overall score (weighted average, carbon gets 20% weight)
  const overallScore = Math.round(
    trainingHoursScore * 0.08 +
      trainedEmployeesScore * 0.08 +
      supplierComplianceScore * 0.12 +
      ifrsS1Score * 0.12 +
      ifrsS2Score * 0.12 +
      griComplianceScore * 0.12 +
      tcfdScore * 0.08 +
      carbonScore * 0.2 +
      dataQualityScore * 0.04 +
      verificationScore * 0.04,
  );

  return {
    scores: {
      trainingHours: Math.round(trainingHoursScore),
      trainedEmployees: Math.round(trainedEmployeesScore),
      supplierCompliance: Math.round(supplierComplianceScore),
      ifrsS1Alignment: Math.round(ifrsS1Score),
      ifrsS2Alignment: Math.round(ifrsS2Score),
      griCompliance: Math.round(griComplianceScore),
      tcfdImplementation: Math.round(tcfdScore),
      carbonScore: carbonScore,
      dataQuality: Math.round(dataQualityScore),
      verification: Math.round(verificationScore),
      overall: overallScore,
    },
    assessmentDate: new Date().toISOString(),
    weights: {
      training: "16%",
      supplier_engagement: "12%",
      ifrs_alignment: "24%",
      gri_compliance: "12%",
      tcfd: "8%",
      carbon_performance: "20%",
      data_quality: "4%",
      verification: "4%",
    },
    rating:
      overallScore >= 90
        ? "Excellent"
        : overallScore >= 80
          ? "Good"
          : overallScore >= 70
            ? "Satisfactory"
            : overallScore >= 60
              ? "Needs Improvement"
              : "Poor",
  };
}

/**
 * Generate 4 comprehensive graphs for farm compliance including carbon data
 */
function generateComplianceGraphs(metrics, year, carbonMetrics) {
  // 1. Compliance Score Breakdown (Radar Chart)
  const complianceBreakdown = {
    type: "radar",
    title: "Compliance Performance Breakdown",
    description: "Comprehensive compliance assessment across key areas",
    labels: [
      "Training",
      "Supplier Compliance",
      "GRI Alignment",
      "IFRS S1/S2",
      "Carbon Management",
      "Data Quality",
    ],
    datasets: [
      {
        label: "Current Year Score",
        data: [
          getMetricValueByYear(metrics["Training Hours - Total"], year)
            ? 70
            : 30,
          getMetricValueByYear(
            metrics["Suppliers with Code of Conduct"],
            year,
          ) || 50,
          getMetricValueByYear(metrics["GRI Standards Compliance"], year) || 60,
          (getMetricValueByYear(metrics["IFRS S1 Alignment"], year) ||
            50 + getMetricValueByYear(metrics["IFRS S2 Alignment"], year) ||
            50) / 2,
          carbonMetrics && carbonMetrics.emissions
            ? 100 - (carbonMetrics.emissions.totalEmissions / 5000) * 100
            : 40,
          calculateDataCoverage(metrics, Object.keys(metrics)),
        ],
        backgroundColor: "rgba(52, 152, 219, 0.2)",
        borderColor: "#3498db",
        borderWidth: 2,
      },
    ],
  };

  // 2. Carbon Emission Breakdown (Doughnut Chart)
  const carbonEmissionBreakdown = {
    type: "doughnut",
    title: "Carbon Emission Breakdown by Scope",
    description: "Distribution of carbon emissions across Scope 1, 2, and 3",
    labels: ["Scope 1", "Scope 2", "Scope 3"],
    datasets: [
      {
        data: [
          carbonMetrics?.emissions?.scope1 || 0,
          carbonMetrics?.emissions?.scope2 || 0,
          carbonMetrics?.emissions?.scope3 || 0,
        ],
        backgroundColor: ["#3498db", "#2ecc71", "#e74c3c"],
        borderWidth: 1,
      },
    ],
  };

  // 3. Training vs Compliance Correlation (Bar Chart)
  const trainingComplianceCorrelation = {
    type: "bar",
    title: "Training Impact on Compliance",
    description:
      "Relationship between training investments and compliance scores",
    labels: [
      "Farmer Training",
      "Safety Training",
      "Technical Training",
      "Compliance Training",
    ],
    datasets: [
      {
        label: "Training Hours",
        data: [
          getMetricValueByYear(
            metrics["Training Hours - Farmer Training"],
            year,
          ) || 0,
          getMetricValueByYear(
            metrics["Training Hours - Safety Training"],
            year,
          ) || 0,
          getMetricValueByYear(
            metrics["Training Hours - Technical Skills"],
            year,
          ) || 0,
          getMetricValueByYear(
            metrics["Training Hours - Compliance Training"],
            year,
          ) || 0,
        ],
        backgroundColor: "rgba(52, 152, 219, 0.7)",
        borderColor: "#3498db",
        borderWidth: 1,
      },
      {
        label: "Compliance Score Impact",
        data: [
          (getMetricValueByYear(
            metrics["Training Hours - Farmer Training"],
            year,
          ) || 0) > 20
            ? 85
            : 45,
          (getMetricValueByYear(
            metrics["Training Hours - Safety Training"],
            year,
          ) || 0) > 10
            ? 80
            : 50,
          (getMetricValueByYear(
            metrics["Training Hours - Technical Skills"],
            year,
          ) || 0) > 15
            ? 75
            : 55,
          (getMetricValueByYear(
            metrics["Training Hours - Compliance Training"],
            year,
          ) || 0) > 25
            ? 90
            : 40,
        ],
        backgroundColor: "rgba(46, 204, 113, 0.7)",
        borderColor: "#2ecc71",
        borderWidth: 1,
        type: "line",
        yAxisID: "y1",
      },
    ],
    options: {
      scales: {
        y: {
          title: {
            display: true,
            text: "Training Hours",
          },
        },
        y1: {
          position: "right",
          title: {
            display: true,
            text: "Compliance Score",
          },
        },
      },
    },
  };

  // 4. ESG Framework Alignment (Horizontal Bar Chart)
  const frameworkAlignment = {
    type: "horizontalBar",
    title: "ESG Framework Alignment Scores",
    description: "Alignment with major ESG reporting frameworks",
    labels: [
      "GRI Standards",
      "IFRS S1",
      "IFRS S2",
      "TCFD",
      "SASB",
      "UNSDG",
      "CDP",
    ],
    datasets: [
      {
        label: "Alignment Score (%)",
        data: [
          getMetricValueByYear(metrics["GRI Standards Compliance"], year) || 0,
          getMetricValueByYear(metrics["IFRS S1 Alignment"], year) || 0,
          getMetricValueByYear(metrics["IFRS S2 Alignment"], year) || 0,
          getMetricValueByYear(
            metrics["TCFD Recommendations Implemented"],
            year,
          ) || 0,
          getMetricValueByYear(metrics["SASB Standards Alignment"], year) || 0,
          getMetricValueByYear(metrics["UNSDG Goals Alignment"], year) || 0,
          getMetricValueByYear(metrics["CDP Disclosure Score"], year) || 0,
        ],
        backgroundColor: [
          "#3498db",
          "#2ecc71",
          "#27ae60",
          "#f39c12",
          "#e74c3c",
          "#9b59b6",
          "#34495e",
        ],
        borderWidth: 1,
      },
    ],
  };

  return {
    complianceBreakdown,
    carbonEmissionBreakdown,
    trainingComplianceCorrelation,
    frameworkAlignment,
  };
}

/**
 * Helper function to calculate Scope 3 metrics
 */
function calculateScope3Metrics(metrics, year, esgData) {
  const suppliersWithCode = getMetricValueByYear(
    metrics["Suppliers with Code of Conduct"],
    year,
  );
  const trainedSuppliers =
    getMetricValueByYear(metrics["Supplier Training Hours"], year) > 0 ? 65 : 0;
  const auditsConducted =
    getMetricValueByYear(metrics["Suppliers Audited"], year) || 0;
  const nonCompliances =
    getMetricValueByYear(metrics["Supplier Non-Compliance Cases"], year) || 0;
  const correctiveActions =
    getMetricValueByYear(metrics["Supplier Corrective Actions"], year) || 0;

  // Calculate percentages
  const totalSuppliers = 100; // This should come from actual data
  const suppliersWithCodePercent =
    totalSuppliers > 0 ? ((suppliersWithCode || 0) / totalSuppliers) * 100 : 0;
  const trainedSuppliersPercent =
    totalSuppliers > 0 ? (trainedSuppliers / totalSuppliers) * 100 : 0;

  // Extract supplier-related ESG data
  const supplierData = esgData.filter((data) =>
    data.metrics.some(
      (metric) =>
        metric.metric_name.toLowerCase().includes("supplier") ||
        metric.metric_name.toLowerCase().includes("scope 3"),
    ),
  );

  return {
    metrics: {
      suppliersWithCode: Math.round(suppliersWithCodePercent),
      trainedSuppliers: Math.round(trainedSuppliersPercent),
      auditsConducted: auditsConducted,
      nonCompliances: nonCompliances,
      correctiveActions: correctiveActions,
      complianceRate:
        totalSuppliers > 0
          ? (
              ((totalSuppliers - nonCompliances) / totalSuppliers) *
              100
            ).toFixed(1)
          : 100,
    },
    analysis: {
      dataSources: supplierData.length,
      verifiedSupplierData: supplierData.filter(
        (d) => d.verification_status === "verified",
      ).length,
      riskLevel:
        nonCompliances > 5 ? "High" : nonCompliances > 2 ? "Medium" : "Low",
    },
  };
}

/**
 * Extract certification information from ESG data
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
function calculateDataCoverage(metrics, metricNames) {
  const availableMetrics = metricNames.filter(
    (name) => metrics[name] && metrics[name].values.length > 0,
  );
  return Math.round((availableMetrics.length / metricNames.length) * 100);
}

/**
 * Calculate carbon trend
 */
function calculateCarbonTrend(carbonData, currentYear) {
  if (!carbonData) return "stable";

  const currentEmissions =
    carbonData.yearData?.emissions?.total_scope_emission_tco2e || 0;

  // Try to get previous year data from the same carbonData document
  const prevYearData = carbonData.carbonData?.yearly_data?.find(
    (d) => d.year === currentYear - 1,
  );
  if (!prevYearData) return "stable";

  const prevEmissions = prevYearData.emissions?.total_scope_emission_tco2e || 0;

  if (prevEmissions === 0) return "stable";

  const change = ((currentEmissions - prevEmissions) / prevEmissions) * 100;

  if (change < -5) return "improving";
  if (change > 5) return "declining";
  return "stable";
}

/**
 * Calculate projected emissions for next year
 */
function calculateProjectedEmissions(carbonData, currentYear) {
  if (!carbonData || !carbonData.yearData) return null;

  const currentEmissions =
    carbonData.yearData.emissions?.total_scope_emission_tco2e || 0;

  // Simple projection: assume 5% reduction with current practices
  return {
    projected_scope1:
      carbonData.yearData.emissions?.scope1?.total_tco2e * 0.95 || 0,
    projected_scope2:
      carbonData.yearData.emissions?.scope2?.total_tco2e * 0.95 || 0,
    projected_scope3:
      carbonData.yearData.emissions?.scope3?.total_tco2e * 0.95 || 0,
    total_projected: currentEmissions * 0.95,
    reduction_percentage: 5,
    assumptions: ["Business as usual", "No major operational changes"],
  };
}

/**
 * Predict carbon neutrality timeline
 */
function predictCarbonNeutrality(carbonData, currentYear) {
  if (!carbonData || !carbonData.yearData) return null;

  const currentEmissions =
    carbonData.yearData.emissions?.total_scope_emission_tco2e || 0;
  const currentSequestration =
    carbonData.yearData.sequestration?.annual_summary
      ?.sequestration_total_tco2 || 0;
  const netBalance =
    carbonData.yearData.emissions?.net_total_emission_tco2e || currentEmissions;

  if (netBalance <= 0) {
    return {
      status: "Already Carbon Neutral",
      achieved_year: currentYear,
      current_net_balance: netBalance,
    };
  }

  // Calculate years to carbon neutrality based on 10% annual reduction
  const yearsToNeutrality = Math.ceil(Math.log(0.01) / Math.log(0.9));
  const targetYear = currentYear + yearsToNeutrality;

  return {
    status: "On Track for Carbon Neutrality",
    target_year: targetYear,
    years_remaining: yearsToNeutrality,
    required_annual_reduction: 10, // percentage
    current_net_balance: netBalance,
    assumptions: [
      "10% annual emission reduction",
      "Constant sequestration rate",
    ],
  };
}

/**
 * Estimate sequestration potential
 */
function estimateSequestrationPotential(carbonData, currentYear) {
  if (!carbonData || !carbonData.yearData) return null;

  const currentSequestration =
    carbonData.yearData.sequestration?.annual_summary
      ?.sequestration_total_tco2 || 0;
  const areaHa = carbonData.yearData.sequestration?.reporting_area_ha || 0;

  // Estimate potential based on best practices (IPCC guidelines)
  const potentialIncreasePercentage = 25; // 25% increase possible with best practices
  const potentialSequestration =
    currentSequestration * (1 + potentialIncreasePercentage / 100);

  return {
    current_sequestration_tco2: currentSequestration,
    potential_sequestration_tco2: potentialSequestration,
    increase_possible_tco2: potentialSequestration - currentSequestration,
    increase_percentage: potentialIncreasePercentage,
    area_ha: areaHa,
    sequestration_per_ha: areaHa > 0 ? currentSequestration / areaHa : 0,
    potential_per_ha: areaHa > 0 ? potentialSequestration / areaHa : 0,
    recommendations: [
      "Implement agroforestry systems",
      "Adopt conservation tillage practices",
      "Increase cover cropping",
      "Optimize fertilizer application",
    ],
  };
}

/**
 * Identify Scope 3 reduction opportunities
 */
function identifyScope3ReductionOpportunities(carbonMetrics) {
  if (!carbonMetrics || !carbonMetrics.emissions) return null;

  const scope3Emissions = carbonMetrics.emissions.scope3 || 0;
  const totalEmissions = carbonMetrics.emissions.totalEmissions || 1;
  const scope3Percentage = (scope3Emissions / totalEmissions) * 100;

  const opportunities = [];

  if (scope3Percentage > 70) {
    opportunities.push({
      priority: "High",
      area: "Supply Chain Optimization",
      potential_reduction: "20-30%",
      actions: [
        "Supplier engagement program",
        "Material substitution",
        "Transportation efficiency",
      ],
    });
  }

  if (scope3Emissions > 1000) {
    opportunities.push({
      priority: "Medium",
      area: "Product Design",
      potential_reduction: "10-15%",
      actions: [
        "Lightweight materials",
        "Extended product life",
        "Recycled content",
      ],
    });
  }

  return {
    scope3_percentage: scope3Percentage.toFixed(1),
    emission_intensity: scope3Emissions,
    reduction_opportunities: opportunities,
    estimated_total_reduction_tco2e: scope3Emissions * 0.2, // 20% reduction estimate
    timeline_months: 24,
  };
}

module.exports = {
  getFarmComplianceData,
};
