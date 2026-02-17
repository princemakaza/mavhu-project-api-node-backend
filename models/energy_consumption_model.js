const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for a single yearly data point
const YearlyDataSchema = new Schema({
  year: {
    type: String,
    required: true,
    trim: true
  }, // e.g., "2022", "2023", "2022→2023"
  fiscal_year: {
    type: Number,
    sparse: true
  }, // Extracted year e.g., 2022
  value: {
    type: Schema.Types.Mixed
  }, // Original value (string or number)
  numeric_value: {
    type: Number,
    sparse: true
  }, // Parsed numeric value
  unit: {
    type: String,
    trim: true
  }, // e.g., "tons", "MWH", "kWh", "litres"
  source: {
    type: String,
    trim: true,
    required: true
  },
  notes: {
    type: String,
    trim: true
  },
  added_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  added_at: {
    type: Date,
    default: Date.now
  },
  last_updated_by: {
    type: Schema.Types.ObjectId,
    ref: "User"
  },
  last_updated_at: {
    type: Date,
    default: Date.now
  }
});

// Sub-document for a single metric entry
const EnergyMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "bagasse_usage",
      "coal_consumption",
      "electricity_generated",
      "electricity_purchased",
      "electricity_exported",
      "solar_power_usage",
      "fuel_consumption",
      "solar_infrastructure",
      "year_over_year_change",
      "forecast",
      "risk"
    ]
  },
  subcategory: {
    type: String,
    trim: true
  }, // e.g., "inside_company_diesel", "outside_company_petrol", "solar_geysers", "solar_systems"
  metric_name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  data_type: {
    type: String,
    enum: ["yearly_series", "single_value", "list", "summary"],
    default: "yearly_series"
  },
  // For yearly time series
  yearly_data: [YearlyDataSchema],
  // For single value (e.g., total solar geysers)
  single_value: {
    value: Schema.Types.Mixed,
    numeric_value: Number,
    unit: String,
    source: String,
    notes: String,
    as_of_date: Date,
    added_by: Schema.Types.ObjectId,
    added_at: { type: Date, default: Date.now }
  },
  // For list data (e.g., list of solar installations)
  list_data: [{
    item: String,
    count: Number,
    details: String,
    source: String,
    added_at: { type: Date, default: Date.now }
  }],
  // For summary metrics
  summary_value: {
    key_metric: String,
    latest_value: Schema.Types.Mixed,
    trend: String,
    notes: String,
    as_of_date: Date
  },
  is_active: {
    type: Boolean,
    default: true
  },
  created_at: {
    type: Date,
    default: Date.now
  },
  created_by: {
    type: Schema.Types.ObjectId,
    ref: "User",
    required: true
  },
  updated_at: {
    type: Date
  },
  last_updated_by: {
    type: Schema.Types.ObjectId,
    ref: "User"
  }
});

// Main Energy Consumption & Renewables Data Model
const EnergyConsumptionDataSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true
  },

  // Data coverage period
  data_period_start: { type: String },
  data_period_end: { type: String },

  // Original source information
  original_source: { type: String, trim: true },
  source_files: [{
    name: String,
    year: String,
    pages: String,
    type: {
      type: String,
      enum: ["annual_report", "integrated_report", "sustainability_report", "other"]
    }
  }],

  // Import tracking
  import_source: {
    type: String,
    enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
    default: "manual"
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
    default: "unverified"
  },
  verified_by: { type: Schema.Types.ObjectId, ref: "User" },
  verified_at: { type: Date },
  verification_notes: { type: String, trim: true },

  // Data validation
  validation_status: {
    type: String,
    enum: ["not_validated", "validating", "validated", "failed_validation"],
    default: "not_validated"
  },
  validation_errors: [{
    metric_name: String,
    year: String,
    error_message: String,
    field: String,
    severity: { type: String, enum: ["warning", "error", "critical"] }
  }],
  validation_notes: { type: String, trim: true },

  // Metrics data
  metrics: [EnergyMetricSchema],

  // Summary statistics (auto‑calculated or manually set)
  summary_stats: {
    total_bagasse_usage: { type: Number, default: 0 },
    total_coal_consumption: { type: Number, default: 0 },
    total_electricity_generated: { type: Number, default: 0 },
    total_electricity_purchased: { type: Number, default: 0 },
    total_electricity_exported: { type: Number, default: 0 },
    total_solar_power_usage: { type: Number, default: 0 },
    total_fuel_consumption_inside: { type: Number, default: 0 },
    total_fuel_consumption_outside: { type: Number, default: 0 },
    average_solar_generation: { type: Number, default: 0 },
    last_updated: Date
  },

  // GRI / Sustainability references (optional)
  gri_references: [{
    standard: String,
    metric_name: String,
    compliance_status: {
      type: String,
      enum: ["compliant", "partially_compliant", "non_compliant", "not_applicable"]
    },
    reporting_year: String
  }],

  // Forecast and risk (future extension)
  forecast_data: [{
    forecast_year: String,
    metric_name: String,
    predicted_value: Number,
    confidence_interval: String,
    methodology: String,
    created_at: { type: Date, default: Date.now },
    created_by: { type: Schema.Types.ObjectId, ref: "User" }
  }],
  risk_assessment: [{
    risk_category: String,
    description: String,
    likelihood: String,
    impact: String,
    mitigation: String,
    as_of_date: Date
  }],

  // Timestamps and audit
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  last_updated_at: { type: Date, default: Date.now },
  last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },

  // Versioning
  version: { type: Number, default: 1 },
  previous_version: { type: Schema.Types.ObjectId, ref: "EnergyConsumptionData" },
  restored_from: { type: Schema.Types.ObjectId, ref: "EnergyConsumptionData" },
  restore_notes: { type: String },

  // Soft delete
  is_active: { type: Boolean, default: true },
  deleted_at: { type: Date },
  deleted_by: { type: Schema.Types.ObjectId, ref: "User" }
});

// Indexes
EnergyConsumptionDataSchema.index({ company: 1, is_active: -1 });
EnergyConsumptionDataSchema.index({ company: 1, "data_period_end": -1 });
EnergyConsumptionDataSchema.index({ company: 1, "metrics.category": 1 });
EnergyConsumptionDataSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model("EnergyConsumptionData", EnergyConsumptionDataSchema);