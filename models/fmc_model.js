const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub‑document for year‑wise data points
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
  }, // Parsed numeric representation
  unit: {
    type: String,
    trim: true,
  }, // e.g., "hours"
  source: {
    type: String,
    trim: true,
    required: true,
  }, // Original source citation
  notes: {
    type: String,
    trim: true,
  }, // Additional context
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

// Sub‑document for metric categories
const ComplianceMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
  
  },
  subcategory: {
    type: String,
    trim: true,
  }, // optional, e.g., "total", "by_department"
  metric_name: {
    type: String,
    required: true,
    trim: true,
  }, // e.g., "Executive Training Hours"
  description: {
    type: String,
    trim: true,
  }, // Optional description
  data_type: {
    type: String,
    enum: ["yearly_series", "single_value", "list", "summary"],
    default: "yearly_series",
  },
  // For yearly time series data
  yearly_data: [YearlyDataSchema],
  // For single value metrics (e.g., total employees trained)
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
  // For list data (e.g., training focus areas, delivery methods)
  list_data: [
    {
      item: String,
      count: Number, // optional, e.g., number of sessions
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

// Main Farm Management Compliance Data Model
const FarmManagementComplianceSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },

  // Data coverage period
  data_period_start: {
    type: String,
  }, // e.g., "2022"
  data_period_end: {
    type: String,
  }, // e.g., "2025"

  // Original source information
  original_source: {
    type: String,
    trim: true,
  }, // e.g., "Farm Management Compliance Report 2025"
  source_files: [
    {
      name: String,
      year: String,
      pages: String,
      type: {
        type: String,

      },
    },
  ],

  // Import tracking
  import_source: {
    type: String,
    enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
    default: "manual",
  },
  source_file_name: {
    type: String,
    trim: true,
  },
  source_file_metadata: {
    type: Schema.Types.Mixed,
  },
  import_batch_id: {
    type: String,
    trim: true,
  },
  import_date: {
    type: Date,
    default: Date.now,
  },
  import_notes: {
    type: String,
    trim: true,
  },

  // Data quality and verification
  data_quality_score: {
    type: Number,
    min: 0,
    max: 100,
    default: null,
  },
  verification_status: {
    type: String,
    enum: ["unverified", "pending_review", "verified", "audited", "disputed"],
    default: "unverified",
  },
  verified_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
  verified_at: {
    type: Date,
  },
  verification_notes: {
    type: String,
    trim: true,
  },

  // Data validation
  validation_status: {
    type: String,
    default: "not_validated",
  },
  validation_errors: [
    {
      metric_name: String,
      year: String,
      error_message: String,
      field: String,
      severity: {
        type: String,
      },
    },
  ],
  validation_notes: {
    type: String,
    trim: true,
  },

  // Metrics data organized by categories
  metrics: [ComplianceMetricSchema],

  // Summary statistics (auto-calculated or manually set)
  summary_stats: {
    total_executive_hours: { type: Number, default: 0 },
    total_senior_management_hours: { type: Number, default: 0 },
    total_other_employees_hours: { type: Number, default: 0 },
    avg_executive_hours: { type: Number, default: 0 },
    avg_senior_management_hours: { type: Number, default: 0 },
    avg_other_employees_hours: { type: Number, default: 0 },
    training_focus_areas_count: { type: Number, default: 0 },
    training_delivery_methods_count: { type: Number, default: 0 },
    compliance_programs_count: { type: Number, default: 0 },
    last_updated: Date,
  },

  // GRI / Sustainability standards compliance (optional)
  gri_references: [
    {
      standard: String, // e.g., "GRI 404-1"
      metric_name: String,
      compliance_status: {
        type: String,

      },
      reporting_year: String,
    },
  ],

  // Forecast and risk related fields (for future extension)
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
      risk_category: String, // e.g., "regulatory", "safety", "compliance"
      description: String,
      likelihood: String, // "low", "medium", "high"
      impact: String,
      mitigation: String,
      as_of_date: Date,
    },
  ],

  // Timestamps and audit trail
  created_at: {
    type: Date,
    default: Date.now,
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  last_updated_at: {
    type: Date,
    default: Date.now,
  },
  last_updated_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },

  // Versioning
  version: {
    type: Number,
    default: 1,
  },
  previous_version: {
    type: Schema.Types.ObjectId,
    ref: "FarmManagementCompliance",
  },
  restored_from: {
    type: Schema.Types.ObjectId,
    ref: "FarmManagementCompliance",
  },
  restore_notes: {
    type: String,
  },

  // Soft delete
  is_active: {
    type: Boolean,
    default: true,
  },
  deleted_at: {
    type: Date,
  },
  deleted_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
  },
});

// Indexes for efficient querying
FarmManagementComplianceSchema.index({ company: 1, is_active: -1 });
FarmManagementComplianceSchema.index({ company: 1, data_period_end: -1 });
FarmManagementComplianceSchema.index({ company: 1, "metrics.category": 1 });
FarmManagementComplianceSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model(
  "FarmManagementCompliance",
  FarmManagementComplianceSchema,
);
