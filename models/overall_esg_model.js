const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for a single yearly data point
const YearlyDataSchema = new Schema({
  year: {
    type: String,
    required: true,
    trim: true,
  }, // e.g., "2022", "2023"
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
  }, // e.g., "tons", "MWH", "kWh", "employees", "injuries", "deaths", "%", "hours"
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
const OverallESGMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "environmental",
      "social",
      "governance",
      "highlights",
      "forecast",
      "risk",
    ],
  },
  subcategory: {
    type: String,
    trim: true,
  }, // e.g., "bagasse_usage", "female_employees", "board_independence"
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
  // For yearly time series (environmental, social)
  yearly_data: [YearlyDataSchema],
  // For single value (governance items)
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
  // For list data (highlights bullet points)
  list_data: [
    {
      item: String,
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

// Main Overall ESG Score Data Model
const OverallESGDataSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },

  // Data coverage period (based on years present)
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
  metrics: [OverallESGMetricSchema],

  // Summary statistics (optional)
  summary_stats: {
    total_coal_consumption_2025: { type: Number, default: 0 },
    total_solar_usage_2025: { type: Number, default: 0 },
    female_employees_2025: { type: Number, default: 0 },
    lti_2025: { type: Number, default: 0 },
    fatalities_2025: { type: Number, default: 0 },
    female_representation_new_hires_2025: { type: String },
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
  previous_version: { type: Schema.Types.ObjectId, ref: "OverallESGData" },
  restored_from: { type: Schema.Types.ObjectId, ref: "OverallESGData" },
  restore_notes: { type: String },

  // Soft delete
  is_active: { type: Boolean, default: true },
  deleted_at: { type: Date },
  deleted_by: { type: Schema.Types.ObjectId, ref: "User" },
});

// Indexes
OverallESGDataSchema.index({ company: 1, is_active: -1 });
OverallESGDataSchema.index({ company: 1, data_period_end: -1 });
OverallESGDataSchema.index({ company: 1, "metrics.category": 1 });
OverallESGDataSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model("OverallESGData", OverallESGDataSchema);
