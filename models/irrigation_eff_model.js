const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub‑document for year‑wise data points
const YearlyDataSchema = new Schema({
  year: {
    type: String,
    required: true,
    trim: true,
  }, // e.g., "2022", "2023", "2022→2023"
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
  }, // e.g., "million ML", "ML/ha", "thousand ML"
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
const IrrigationMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "irrigation_water", // Total Irrigation Water
      "water_per_hectare", // Water per Hectare
      "effluent_discharged", // Effluent Discharged
      "water_treatment", // Water Treatment for Chiredzi
      "water_sources", // List of water sources
      "forecast", // for future extension
      "risk", // for future extension
    ],
  },
  subcategory: {
    type: String,
    trim: true,
  }, // e.g., "total", "company_estates", "private_farmers"
  metric_name: {
    type: String,
    required: true,
    trim: true,
  }, // e.g., "Total Irrigation Water (million ML)"
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
  // For single value metrics (e.g., total reservoir capacity)
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
  // For list data (e.g., water sources)
  list_data: [
    {
      item: String,
      count: Number, // optional, e.g., number of sources
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

// Main Irrigation Efficiency & Water Risk Data Model
const IrrigationEfficiencyDataSchema = new Schema({
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
  }, // e.g., "Irrigation Efficiency Report 2025"
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
    enum: ["not_validated", "validating", "validated", "failed_validation"],
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
        enum: ["warning", "error", "critical"],
      },
    },
  ],
  validation_notes: {
    type: String,
    trim: true,
  },

  // Metrics data organized by categories
  metrics: [IrrigationMetricSchema],

  // Summary statistics (auto-calculated or manually set)
  summary_stats: {
    total_irrigation_water: { type: Number, default: 0 },
    avg_water_per_hectare: { type: Number, default: 0 },
    total_effluent_discharged: { type: Number, default: 0 },
    avg_water_treatment: { type: Number, default: 0 },
    water_sources_count: { type: Number, default: 0 },
    last_updated: Date,
  },

  // GRI / Sustainability standards compliance (optional)
  gri_references: [
    {
      standard: String, // e.g., "GRI 303-3"
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
      risk_category: String, // e.g., "drought", "regulatory", "infrastructure"
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
    ref: "IrrigationEfficiencyData",
  },
  restored_from: {
    type: Schema.Types.ObjectId,
    ref: "IrrigationEfficiencyData",
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
IrrigationEfficiencyDataSchema.index({ company: 1, is_active: -1 });
IrrigationEfficiencyDataSchema.index({ company: 1, data_period_end: -1 });
IrrigationEfficiencyDataSchema.index({ company: 1, "metrics.category": 1 });
IrrigationEfficiencyDataSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model(
  "IrrigationEfficiencyData",
  IrrigationEfficiencyDataSchema,
);
