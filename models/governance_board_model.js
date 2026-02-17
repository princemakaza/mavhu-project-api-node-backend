const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for a single metric entry
const GovernanceMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "board_composition",
      "director_fees",
      "governance_framework",
      "governance_policies",
      "forecast",
      "risk",
    ],
  },
  subcategory: {
    type: String,
    trim: true,
  },
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
  yearly_data: [
    {
      year: String,
      fiscal_year: Number,
      value: Schema.Types.Mixed,
      numeric_value: Number,
      unit: String,
      source: String,
      notes: String,
      added_by: { type: Schema.Types.ObjectId, ref: "User" },
      added_at: { type: Date, default: Date.now },
      last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },
      last_updated_at: { type: Date, default: Date.now },
    },
  ],
  // For single value
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
  // ✅ UPDATED: Flexible list_data that stores objects as-is
  list_data: [
    {
      type: Schema.Types.Mixed, // ✅ Accepts any object structure
      default: {},
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

// Main Governance & Board Metrics Data Model
const GovernanceBoardDataSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },

  data_period_start: { type: String },
  data_period_end: { type: String },

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

  data_quality_score: { type: Number, min: 0, max: 100, default: null },
  verification_status: {
    type: String,
    enum: ["unverified", "pending_review", "verified", "audited", "disputed"],
    default: "unverified",
  },
  verified_by: { type: Schema.Types.ObjectId, ref: "User" },
  verified_at: { type: Date },
  verification_notes: { type: String, trim: true },

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

  metrics: [GovernanceMetricSchema],

  summary_stats: {
    total_directors: { type: Number, default: 0 },
    independent_directors: { type: Number, default: 0 },
    executive_directors: { type: Number, default: 0 },
    board_meeting_fee_chairman: { type: String },
    board_meeting_fee_ned: { type: String },
    committee_fee_chairman: { type: String },
    committee_fee_ned: { type: String },
    last_updated: Date,
  },

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

  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  last_updated_at: { type: Date, default: Date.now },
  last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },

  version: { type: Number, default: 1 },
  previous_version: { type: Schema.Types.ObjectId, ref: "GovernanceBoardData" },
  restored_from: { type: Schema.Types.ObjectId, ref: "GovernanceBoardData" },
  restore_notes: { type: String },

  is_active: { type: Boolean, default: true },
  deleted_at: { type: Date },
  deleted_by: { type: Schema.Types.ObjectId, ref: "User" },
});

// Indexes
GovernanceBoardDataSchema.index({ company: 1, is_active: -1 });
GovernanceBoardDataSchema.index({ company: 1, data_period_end: -1 });
GovernanceBoardDataSchema.index({ company: 1, "metrics.category": 1 });
GovernanceBoardDataSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model(
  "GovernanceBoardData",
  GovernanceBoardDataSchema,
);
