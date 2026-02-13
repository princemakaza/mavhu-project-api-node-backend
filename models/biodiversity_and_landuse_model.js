// File: models/biodiversityLandUse.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for year-wise data points
const YearlyDataSchema = new Schema({
  year: { 
    type: String, 
    required: true,
    trim: true 
  }, // e.g., "FY25", "31.03.2025 (FY25)"
  fiscal_year: { 
    type: Number, 
    sparse: true 
  }, // Extracted year e.g., 2025
  value: { 
    type: Schema.Types.Mixed 
  }, // Can be String, Number, or Object
  numeric_value: { 
    type: Number, 
    sparse: true 
  }, // Optional numeric representation
  unit: { 
    type: String, 
    trim: true 
  }, // e.g., "ha", "kg", "trees", "species count"
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
const BiodiversityMetricSchema = new Schema({
  category: {
    type: String,
    required: true,
    trim: true,
    enum: [
      "agricultural_land",
      "conservation_protected_habitat", 
      "land_tenure",
      "restoration_deforestation",
      "fuelwood_substitution",
      "biodiversity_flora",
      "biodiversity_fauna",
      "human_wildlife_conflict",
      "summary"
    ]
  },
  subcategory: { 
    type: String, 
    trim: true 
  }, // e.g., "cane", "orchards", "mammals", "birds"
  metric_name: { 
    type: String, 
    required: true, 
    trim: true 
  }, // e.g., "Area Under Cane", "Trees Planted"
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
  // For single value metrics (e.g., conservation area)
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
  // For list data (e.g., species inventory)
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
  }
});

// Main Biodiversity & Land Use Data Model
const BiodiversityLandUseSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true
  },
  
  // Data coverage period
  data_period_start: { 
    type: String 
  }, // e.g., "FY22" or "31.03.2022"
  data_period_end: { 
    type: String 
  }, // e.g., "FY25" or "31.03.2025"
  
  // Original source information
  original_source: { 
    type: String, 
    trim: true 
  }, // e.g., "HVE Integrated Report 2025"
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
  
  // Metrics data organized by sections from CSV
  metrics: [BiodiversityMetricSchema],
  
  // Summary statistics (can be auto-calculated)
  summary_stats: {
    total_conservation_area: { type: Number, default: 0 },
    total_agricultural_area: { type: Number, default: 0 },
    total_surveyed_area: { type: Number, default: 0 },
    total_trees_planted: { type: Number, default: 0 },
    total_lpg_distributed: { type: Number, default: 0 },
    flora_species_count: { type: Number, default: 0 },
    fauna_species_count: { type: Number, default: 0 },
    last_updated: Date
  },
  
  // GRI Standards compliance tracking
  gri_references: [{
    standard: String, // e.g., "GRI 304-4"
    metric_name: String,
    compliance_status: {
      type: String,
      enum: ["compliant", "partially_compliant", "non_compliant", "not_applicable"]
    },
    reporting_year: String
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
    ref: "BiodiversityLandUse" 
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
BiodiversityLandUseSchema.index({ company: 1, "data_period_end": -1 });
BiodiversityLandUseSchema.index({ company: 1, "metrics.category": 1 });
BiodiversityLandUseSchema.index({ company: 1, "metrics.metric_name": 1 });

module.exports = mongoose.model("BiodiversityLandUse", BiodiversityLandUseSchema);