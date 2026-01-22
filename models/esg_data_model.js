// File: models/esgData.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;

// Sub-document for individual metric values per year
const MetricValueSchema = new Schema({
  year: { type: Number, required: true },
  value: { type: Schema.Types.Mixed }, // Can be String, Number, Boolean, etc.
  numeric_value: { type: Number, sparse: true }, // Optional numeric representation for calculations
  source_notes: { type: String, trim: true },
  added_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  added_at: { type: Date, default: Date.now },
  last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  last_updated_at: { type: Date, default: Date.now }
});

// Sub-document for metric categories (Environmental, Social, Governance)
const ESGItemSchema = new Schema({
  category: {
    type: String,
    enum: ["environmental", "social", "governance"],
    required: true
  },
  metric_name: { type: String, required: true, trim: true },
  unit: { type: String, trim: true }, // e.g., "tCO2e", "tons", "MWH", "members", "US$m"
  description: { type: String, trim: true }, // Optional description of the metric
  values: [MetricValueSchema], // Array of year-wise values
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true }
});

// Main ESG Data Model
const ESGDataSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true
  },
  reporting_period_start: { type: Number }, // Starting year of data (e.g., 2022)
  reporting_period_end: { type: Number }, // Ending year of data (e.g., 2025)
  
  // Data import source information
  data_source: { type: String, trim: true }, // e.g., "HVE Integrated Report 2025"
  source_file_name: { type: String, trim: true }, // Original file name (e.g., "ESG_Metrics_Hippo_Valley_Tongaat_2022-2025.xlsx")
  source_file_type: { 
    type: String, 
    enum: ["csv", "excel", "json", "manual", "api"], 
    default: "manual" 
  },
  source_file_metadata: { type: Schema.Types.Mixed }, // Additional file metadata (size, sheets, etc.)
  
  // Import tracking
  import_batch_id: { type: String, trim: true }, // Unique ID for tracking batch imports
  import_date: { type: Date, default: Date.now },
  import_notes: { type: String, trim: true }, // Notes about the import
  
  // Data quality
  data_quality_score: { type: Number, min: 0, max: 100, default: null },
  verification_status: {
    type: String,
    enum: ["unverified", "pending", "verified", "audited"],
    default: "unverified"
  },
  verified_by: { type: Schema.Types.ObjectId, ref: "User" },
  verified_at: { type: Date },
  
  // Data validation
  validation_status: {
    type: String,
    enum: ["not_validated", "validating", "validated", "failed_validation"],
    default: "not_validated"
  },
  validation_errors: [{ 
    metric_name: String,
    year: Number,
    error_message: String,
    field: String
  }],
  validation_notes: { type: String, trim: true },
  
  // Metrics data
  metrics: [ESGItemSchema], // All ESG metrics for this company
  
  // Timestamps and audit
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  last_updated_at: { type: Date, default: Date.now },
  last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },
  
  // Soft delete
  is_active: { type: Boolean, default: true },
  deleted_at: { type: Date },
  deleted_by: { type: Schema.Types.ObjectId, ref: "User" }
});

// Index for efficient querying
ESGDataSchema.index({ company: 1, "reporting_period_end": -1 });
ESGDataSchema.index({ company: 1, "metrics.category": 1 });
ESGDataSchema.index({ company: 1, "metrics.metric_name": 1 });
ESGDataSchema.index({ source_file_name: 1 });
ESGDataSchema.index({ import_batch_id: 1 });
ESGDataSchema.index({ "validation_status": 1 });
ESGDataSchema.index({ created_at: -1 });

// Method to check if data was imported from file
ESGDataSchema.methods.wasImportedFromFile = function() {
  return this.source_file_type !== "manual";
};

// Method to get import source info
ESGDataSchema.methods.getImportSource = function() {
  if (this.wasImportedFromFile()) {
    return {
      file_name: this.source_file_name,
      file_type: this.source_file_type,
      imported_on: this.import_date,
      batch_id: this.import_batch_id
    };
  }
  return {
    source: "manual_entry",
    entered_by: this.created_by,
    entered_on: this.created_at
  };
};

module.exports = mongoose.model("ESGData", ESGDataSchema);