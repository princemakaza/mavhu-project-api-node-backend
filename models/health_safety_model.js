const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for a single yearly data point
const YearlyDataSchema = new Schema({
  year: {
    type: String,
    required: true,
    trim: true,
  }, // e.g., "2022", "2023", "2024", "2025"
  fiscal_year: {
    type: Number,
    sparse: true,
  }, // Extracted year e.g., 2022
  value: {
    type: Schema.Types.Mixed,
  }, // Original value (string or number)
  numeric_value: {
    type: Number,
    sparse: true,
  }, // Parsed numeric value
  unit: {
    type: String,
    trim: true,
  }, // e.g., "injuries", "rate", "deaths", "cases", "%", "beds", "professionals"
  source: {
    type: String,
    trim: true,
    required: true,
  },
  notes: {
    type: String,
    trim: true,
  },
  added_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  added_at: {
    type: Date,
    default: Date.now,
  },
  last_updated_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  last_updated_at: {
    type: Date,
    default: Date.now,
  },
});

// Sub-document for a single metric entry
const HealthSafetyMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "lti_metrics",
      "health_services",
      "certifications",
      "training_hours",
      "forecast",
      "risk",
    ],
  },
  subcategory: {
    type: String,
    trim: true,
  }, // e.g., "lost_time_injuries", "lti_frequency_rate", "fatalities", "malaria_cases", "hiv_prevalence", "new_hiv_cases", "vct_uptake", "hospital_beds", "health_professionals", "doctors", "medical_support_staff"
  metric_name: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    trim: true,
  },
  data_type: {
    type: String,
    enum: ["yearly_series", "single_value", "list", "summary"],
    default: "yearly_series",
  },
  // For yearly time series
  yearly_data: [YearlyDataSchema],
  // For single value (e.g., certification name)
  single_value: {
    value: Schema.Types.Mixed,
    numeric_value: Number,
    unit: String,
    source: String,
    notes: String,
    as_of_date: Date,
    added_by: Schema.Types.ObjectId,
    added_at: { type: Date, default: Date.now },
  },
  // For list data (e.g., list of certifications, training hours bullet points)
  list_data: [
    {
      item: String,
      count: Number,
      details: String,
      source: String,
      added_at: { type: Date, default: Date.now },
    },
  ],
  // For summary metrics
  summary_value: {
    key_metric: String,
    latest_value: Schema.Types.Mixed,
    trend: String,
    notes: String,
    as_of_date: Date,
  },
  is_active: {
    type: Boolean,
    default: true,
  },
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  updated_at: {
    type: Date,
  },
  last_updated_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
});

// Main Health & Safety Data Model
const HealthSafetyDataSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },

  // Data coverage period
  data_period_start: { type: String },
  data_period_end: { type: String },

  // Original source information
  original_source: { type: String, trim: true },
  source_files: [
    {
      name: String,
      year: String,
      pages: String,
      type: {
        type: String,
        enum: [
          "annual_report",
          "integrated_report",
          "sustainability_report",
          "other",
        ],
      },
    },
  ],

  // Import tracking
  import_source: {
    type: String,
    enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
    default: "manual",
  },
  source_file_name: { type: String, trim: true },
  source_file_metadata: { type: Schema.Types.Mixed },
  import_batch_id: { type: String, trim: true },
  import_date: { type: Date, default: Date.now },
  import_notes: { type: String, trim: true },

  // Data quality and verification
  data_quality_score: { type: Number, min: 0, max: 100, default: null },
  verification_status: {
    type: String,
    enum: ["unverified", "pending_review", "verified", "audited", "disputed"],
    default: "unverified",
  },
  verified_by: { type: Schema.Types.ObjectId, ref: "User" },
  verified_at: { type: Date },
  verification_notes: { type: String, trim: true },

  // Data validation
  validation_status: {
    type: String,
    enum: ["not_validated", "validating", "validated", "failed_validation"],
    default: "not_validated",
  },
  validation_errors: [
    {
      metric_name: String,
      year: String,
      error_message: String,
      field: String,
      severity: { type: String, enum: ["warning", "error", "critical"] },
    },
  ],
  validation_notes: { type: String, trim: true },

  // Metrics data
  metrics: [HealthSafetyMetricSchema],

  // Summary statistics (auto‑calculated or manually set)
  summary_stats: {
    total_lti: { type: Number, default: 0 },
    total_fatalities: { type: Number, default: 0 },
    malaria_cases_2025: { type: Number, default: 0 },
    hiv_prevalence_2025: { type: Number, default: 0 },
    new_hiv_cases_2025: { type: Number, default: 0 },
    vct_uptake_2025: { type: Number, default: 0 },
    hospital_beds: { type: Number, default: 0 },
    total_health_professionals: { type: Number, default: 0 },
    doctors: { type: Number, default: 0 },
    medical_support_staff: { type: Number, default: 0 },
    last_updated: Date,
  },

  // GRI / Sustainability references (optional)
  gri_references: [
    {
      standard: String,
      metric_name: String,
      compliance_status: {
        type: String,
        enum: [
          "compliant",
          "partially_compliant",
          "non_compliant",
          "not_applicable",
        ],
      },
      reporting_year: String,
    },
  ],

  // Forecast and risk (future extension)
  forecast_data: [
    {
      forecast_year: String,
      metric_name: String,
      predicted_value: Number,
      confidence_interval: String,
      methodology: String,
      created_at: { type: Date, default: Date.now },
      created_by: { type: Schema.Types.ObjectId, ref: "User" },
    },
  ],
  risk_assessment: [
    {
      risk_category: String,
      description: String,
      likelihood: String,
      impact: String,
      mitigation: String,
      as_of_date: Date,
    },
  ],

  // Timestamps and audit
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  last_updated_at: { type: Date, default: Date.now },
  last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },

  // Versioning
  version: { type: Number, default: 1 },
  previous_version: { type: Schema.Types.ObjectId, ref: "HealthSafetyData" },
  restored_from: { type: Schema.Types.ObjectId, ref: "HealthSafetyData" },
  restore_notes: { type: String },

  // Soft delete
  is_active: { type: Boolean, default: true },
  deleted_at: { type: Date },
  deleted_by: { type: Schema.Types.ObjectId, ref: "User" },
});

// Indexes
HealthSafetyDataSchema.index({ company: 1, is_active: -1 });
HealthSafetyDataSchema.index({ company: 1, data_period_end: -1 });
HealthSafetyDataSchema.index({ company: 1, "metrics.category": 1 });
HealthSafetyDataSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model("HealthSafetyData", HealthSafetyDataSchema);
