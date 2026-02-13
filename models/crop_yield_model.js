const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for year-wise data points
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
  }, // Parsed numeric representation
  unit: { 
    type: String, 
    trim: true 
  }, // e.g., "tons", "tons/ha", "ha", "%"
  source: { 
    type: String, 
    trim: true,
    required: true 
  }, // Original source citation
  notes: { 
    type: String, 
    trim: true 
  }, // Additional context
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

// Sub-document for metric categories
const CropYieldMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "cane_harvested",
      "sugar_production", 
      "sugar_cane_yield",
      "area_under_cane",
      "year_over_year_change",
      "forecast",      // for future extension
      "risk"           // for future extension
    ]
  },
  subcategory: { 
    type: String, 
    trim: true 
  }, // e.g., "company_estates", "private_farmers", "total", "molasses", "cane_to_sugar_ratio"
  metric_name: { 
    type: String, 
    required: true, 
    trim: true 
  }, // e.g., "Company's Own Estates (tons)", "Cane to Sugar Ratio (%)"
  description: { 
    type: String, 
    trim: true 
  }, // Optional description
  data_type: {
    type: String,
    enum: ["yearly_series", "single_value", "list", "summary"],
    default: "yearly_series"
  },
  // For yearly time series data
  yearly_data: [YearlyDataSchema],
  // For single value metrics (e.g., total area)
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
  // For list data (not commonly used in crop yield, but kept for extensibility)
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

// Main Crop Yield & Risk Data Model
const CropYieldDataSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true
  },
  
  // Data coverage period
  data_period_start: { 
    type: String 
  }, // e.g., "2022" or "FY22"
  data_period_end: { 
    type: String 
  }, // e.g., "2025" or "FY25"
  
  // Original source information
  original_source: { 
    type: String, 
    trim: true 
  }, // e.g., "Hippo Valley Estates Integrated Report 2025"
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
  source_file_name: { 
    type: String, 
    trim: true 
  },
  source_file_metadata: { 
    type: Schema.Types.Mixed 
  },
  import_batch_id: { 
    type: String, 
    trim: true 
  },
  import_date: { 
    type: Date, 
    default: Date.now 
  },
  import_notes: { 
    type: String, 
    trim: true 
  },
  
  // Data quality and verification
  data_quality_score: { 
    type: Number, 
    min: 0, 
    max: 100, 
    default: null 
  },
  verification_status: {
    type: String,
    enum: ["unverified", "pending_review", "verified", "audited", "disputed"],
    default: "unverified"
  },
  verified_by: { 
    type: Schema.Types.ObjectId, 
    ref: "User" 
  },
  verified_at: { 
    type: Date 
  },
  verification_notes: { 
    type: String, 
    trim: true 
  },
  
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
    severity: {
      type: String,
      enum: ["warning", "error", "critical"]
    }
  }],
  validation_notes: { 
    type: String, 
    trim: true 
  },
  
  // Metrics data organized by categories
  metrics: [CropYieldMetricSchema],
  
  // Summary statistics (auto-calculated or manually set)
  summary_stats: {
    total_cane_harvested_company: { type: Number, default: 0 },
    total_cane_harvested_private: { type: Number, default: 0 },
    total_cane_milled: { type: Number, default: 0 },
    total_sugar_produced_company: { type: Number, default: 0 },
    total_molasses_produced: { type: Number, default: 0 },
    average_cane_to_sugar_ratio: { type: Number, default: 0 },
    average_company_yield: { type: Number, default: 0 },
    average_private_yield: { type: Number, default: 0 },
    total_area_under_cane: { type: Number, default: 0 },
    last_updated: Date
  },
  
  // GRI / Sustainability standards compliance (optional)
  gri_references: [{
    standard: String, // e.g., "GRI 13-5"
    metric_name: String,
    compliance_status: {
      type: String,
      enum: ["compliant", "partially_compliant", "non_compliant", "not_applicable"]
    },
    reporting_year: String
  }],
  
  // Forecast and risk related fields (for future extension)
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
    risk_category: String, // e.g., "climate", "market", "pest"
    description: String,
    likelihood: String, // "low", "medium", "high"
    impact: String,
    mitigation: String,
    as_of_date: Date
  }],
  
  // Timestamps and audit trail
  created_at: { 
    type: Date, 
    default: Date.now 
  },
  created_by: { 
    type: Schema.Types.ObjectId, 
    ref: "User", 
    required: true 
  },
  last_updated_at: { 
    type: Date, 
    default: Date.now 
  },
  last_updated_by: { 
    type: Schema.Types.ObjectId, 
    ref: "User" 
  },
  
  // Versioning
  version: { 
    type: Number, 
    default: 1 
  },
  previous_version: { 
    type: Schema.Types.ObjectId, 
    ref: "CropYieldData" 
  },
  restored_from: { 
    type: Schema.Types.ObjectId, 
    ref: "CropYieldData" 
  },
  restore_notes: { 
    type: String 
  },
  
  // Soft delete
  is_active: { 
    type: Boolean, 
    default: true 
  },
  deleted_at: { 
    type: Date 
  },
  deleted_by: { 
    type: Schema.Types.ObjectId, 
    ref: "User" 
  }
});

// Indexes for efficient querying
CropYieldDataSchema.index({ company: 1, is_active: -1 });
CropYieldDataSchema.index({ company: 1, "data_period_end": -1 });
CropYieldDataSchema.index({ company: 1, "metrics.category": 1 });
CropYieldDataSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model("CropYieldData", CropYieldDataSchema);