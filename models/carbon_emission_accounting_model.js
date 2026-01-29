// File: models/carbonEmission.model.js
const mongoose = require("mongoose");
const { Schema } = mongoose;
// Emission Reference Sub-document
const EmissionReferenceSchema = new Schema({
  source: { type: String, required: true, trim: true },
  activity_data: { type: String, trim: true },
  default_ef_start: { type: String, trim: true },
  notes_source: { type: String, trim: true },
  emission_factor_code: { type: String, trim: true }, // e.g., EF_direct_N₂O_per_N
  emission_factor_value: { type: Number }, // Numeric value of emission factor
  emission_factor_unit: { type: String, trim: true }, // e.g., kg CO₂ / L
  gwp_value: { type: Number }, // Global Warming Potential value
  gwp_source: { type: String, trim: true }, // e.g., IPCC AR5
  conversion_factor: { type: Number }, // e.g., 44/28 for N₂O-N to N₂O
  is_active: { type: Boolean, default: true },
  created_at: { type: Date, default: Date.now },
  last_updated_at: { type: Date, default: Date.now },
});
// Sequestration Monthly Data Sub-document
const SequestrationMonthlySchema = new Schema({
  month: { type: String, required: true }, // e.g., "Jan", "Feb"
  month_number: { type: Number }, // 1-12
  year: { type: Number }, // Reference year
  ndvi_max: { type: Number },
  agb_t_per_ha: { type: Number }, // Above Ground Biomass (t/ha)
  bgb_t_per_ha: { type: Number }, // Below Ground Biomass (t/ha)
  biomass_c_t_per_ha: { type: Number }, // Biomass Carbon (tC/ha)
  biomass_co2_t_per_ha: { type: Number }, // Biomass CO₂ (tCO₂/ha)
  biomass_co2_total_t: { type: Number }, // Biomass CO₂ total (tCO₂)
  delta_biomass_co2_t: { type: Number }, // Δ Biomass CO₂
  soc_tc_per_ha: { type: Number }, // Soil Organic Carbon (tC/ha)
  soc_co2_t_per_ha: { type: Number }, // SOC CO₂ (tCO₂/ha)
  soc_co2_total_t: { type: Number }, // SOC CO₂ total (tCO₂)
  delta_soc_co2_t: { type: Number }, // Δ SOC CO₂
  net_co2_stock_t: { type: Number }, // Net CO₂ Stock (tCO₂)
  net_co2_change_t: { type: Number }, // Net CO₂ change (tCO₂)
  meaning: { type: String, trim: true }, // e.g., "Baseline", "2,775 tCO₂ emitted"
  // Additional calculated fields
  reporting_area_ha: { type: Number }, // Area used for calculations
  soc_area_ha: { type: Number }, // Area for SOC calculations
  is_baseline: { type: Boolean, default: false },
});
// Sequestration Methodology Sub-document
const SequestrationMethodologySchema = new Schema({
  component: { type: String, required: true, trim: true }, // e.g., "Satellite Vegetation Index"
  method_applied: { type: String, trim: true },
  standard_source: { type: String, trim: true },
  purpose: { type: String, trim: true },
  parameters: { type: Schema.Types.Mixed }, // Additional parameters
});
// Scope 1 Emission Source Sub-document
const Scope1EmissionSchema = new Schema({
  source: { type: String, required: true, trim: true }, // e.g., "Synthetic fertiliser"
  parameter: { type: String, trim: true }, // e.g., "N applied"
  unit: { type: String, trim: true }, // e.g., "kg N/ha/yr"
  annual_per_ha: { type: Number }, // Annual activity per hectare
  emission_factor: { type: String, trim: true }, // e.g., "EFₙ₂ₒ = 0.01 kg N₂O-N/kg N"
  ef_number: { type: Number }, // Numeric emission factor
  gwp: { type: Number }, // Global Warming Potential
  tco2e_per_ha_per_year: { type: Number }, // tCO₂e/ha/year
  methodological_justification: { type: String, trim: true },
  reference: { type: String, trim: true }, // Source reference
  calculation_notes: { type: String, trim: true },
  is_active: { type: Boolean, default: true },
});
// Scope 2 Emission Source Sub-document
const Scope2EmissionSchema = new Schema({
  source: { type: String, required: true, trim: true }, // e.g., "Electricity purchased"
  parameter: { type: String, trim: true }, // e.g., "Electricity consumption"
  unit: { type: String, trim: true }, // e.g., "kWh/ha/yr"
  annual_activity_per_ha: { type: Number },
  emission_factor: { type: String, trim: true }, // e.g., "Grid EF (kg CO₂e/kWh)"
  ef_number: { type: Number },
  tco2e_per_ha_per_year: { type: Number },
  methodological_justification: { type: String, trim: true },
  reference: { type: String, trim: true },
  calculation_notes: { type: String, trim: true },
  is_active: { type: Boolean, default: true },
});
// Scope 3 Emission Category Sub-document
const Scope3EmissionSchema = new Schema({
  category: { type: String, required: true, trim: true }, // e.g., "Purchased goods"
  parameter: { type: String, trim: true }, // e.g., "Fertiliser production"
  unit: { type: String, trim: true }, // e.g., "kg N/ha/yr"
  annual_activity_per_ha: { type: Number },
  emission_factor: { type: String, trim: true }, // e.g., "6.6 kg CO₂e/kg N"
  ef_number: { type: Number },
  tco2e_per_ha_per_year: { type: Number },
  methodological_justification: { type: String, trim: true },
  reference: { type: String, trim: true },
  calculation_notes: { type: String, trim: true },
  is_active: { type: Boolean, default: true },
});

// Yearly Carbon Data Schema
const YearlyCarbonDataSchema = new Schema({
  year: { type: Number, required: true },

  // Sequestration Data
  sequestration: {
    reporting_area_ha: { type: Number }, // e.g., 190 ha for biomass
    soc_area_ha: { type: Number }, // e.g., 10916 ha for SOC
    monthly_data: [SequestrationMonthlySchema],
    methodologies: [SequestrationMethodologySchema],
    // Annual Summary
    annual_summary: {
      total_biomass_co2_t: { type: Number },
      total_soc_co2_t: { type: Number },
      net_co2_stock_t: { type: Number },
      net_co2_change_t: { type: Number },
      sequestration_total_tco2: { type: Number },
    },
  },
  // Emission Data
  emissions: {
    scope1: {
      sources: [Scope1EmissionSchema],
      total_tco2e_per_ha: { type: Number },
      total_tco2e: { type: Number },
    },
    scope2: {
      sources: [Scope2EmissionSchema],
      total_tco2e_per_ha: { type: Number },
      total_tco2e: { type: Number },
    },
    scope3: {
      categories: [Scope3EmissionSchema],
      total_tco2e_per_ha: { type: Number },
      total_tco2e: { type: Number },
    },

    // Totals
    total_scope_emission_tco2e_per_ha: { type: Number },
    total_scope_emission_tco2e: { type: Number },
    net_total_emission_tco2e: { type: Number }, // Emissions minus sequestration
  },

  // Data Quality
  data_quality: {
    completeness_score: { type: Number, min: 0, max: 100 },
    verification_status: {
      type: String,
      enum: ["unverified", "pending", "verified", "audited"],
      default: "unverified",
    },
    verified_by: { type: Schema.Types.ObjectId, ref: "User" },
    verified_at: { type: Date },
    verification_notes: { type: String, trim: true },
  },

  // Metadata
  source_file: { type: String, trim: true },
  imported_at: { type: Date, default: Date.now },
  last_updated_at: { type: Date, default: Date.now },
});

// Main Carbon Emission Accounting Model
const CarbonEmissionAccountingSchema = new Schema({
  company: {
    type: Schema.Types.ObjectId,
    ref: "Company",
    required: true,
    index: true,
  },

  // Reference Data (from Carbon emission accounting - Reference.csv)
  emission_references: {
    methodology_statement: { type: String, trim: true }, // First paragraph about methodology
    emission_factors: [EmissionReferenceSchema],
    global_warming_potentials: {
      n2o_gwp: { type: Number, default: 0 }, // IPCC AR5
      ch4_gwp: { type: Number}, // IPCC AR5
      source: { type: String },
    },
    conversion_factors: {
      n2o_n_to_n2o: { type: Number, default: 0},
      carbon_to_co2: { type: Number, default: 0 },
      carbon_fraction: { type: Number, default: 0 },
    },
  },
  // Yearly Carbon Data
  yearly_data: [YearlyCarbonDataSchema],
  // Aggregated Summary
  summary: {
    total_reporting_area_ha: { type: Number },
    average_sequestration_tco2_per_year: { type: Number },
    average_emissions_tco2e_per_year: { type: Number },
    net_carbon_balance_tco2e: { type: Number }, // Cumulative
    carbon_intensity_tco2e_per_ha: { type: Number },
    baseline_year: { type: Number },
    current_year: { type: Number },
  },
  // Methodological Framework
  framework: {
    sequestration_methodology: {
      type: String,
      default: "IPCC 2006 Guidelines and 2019 Refinement for AFOLU sector",
    },
    emission_methodology: {
      type: String,
      default: "Greenhouse Gas Protocol Corporate Standard",
    },
    data_sources: [
      {
        name: { type: String, trim: true },
        type: {
          type: String,
          enum: ["satellite", "ground_measurement", "model", "database"],
        },
        description: { type: String, trim: true },
      },
    ],
    calculation_approach: {
      type: String,
      default: "activity-data × emission-factor approach",
    },
  },
  // Data Management
  data_management: {
    import_history: [
      {
        file_name: { type: String, trim: true },
        file_type: { type: String, enum: ["csv", "excel", "json"] },
        import_date: { type: Date },
        records_added: { type: Number },
        records_updated: { type: Number },
        imported_by: { type: Schema.Types.ObjectId, ref: "User" },
      },
    ],
    last_calculated_at: { type: Date },
    calculation_version: { type: String, trim: true },
    validation_status: {
      type: String,
      enum: ["not_validated", "validating", "validated", "errors"],
      default: "not_validated",
    },
    validation_errors: [
      {
        year: { type: Number },
        component: { type: String },
        error_message: { type: String },
        severity: { type: String, enum: ["low", "medium", "high"] },
      },
    ],
  },

  // Audit Trail
  created_at: { type: Date, default: Date.now },
  created_by: { type: Schema.Types.ObjectId, ref: "User", required: true },
  last_updated_at: { type: Date, default: Date.now },
  last_updated_by: { type: Schema.Types.ObjectId, ref: "User" },

  // Status
  status: {
    type: String,
    enum: ["draft", "under_review", "approved", "published", "archived"],
    default: "draft",
  },
  is_active: { type: Boolean, default: true },
});

// Indexes
CarbonEmissionAccountingSchema.index({ company: 1, "yearly_data.year": -1 });
CarbonEmissionAccountingSchema.index({ "yearly_data.year": 1 });
CarbonEmissionAccountingSchema.index({ status: 1 });
CarbonEmissionAccountingSchema.index({ created_at: -1 });

// Methods
CarbonEmissionAccountingSchema.methods.getYearData = function (year) {
  return this.yearly_data.find((data) => data.year === year);
};

CarbonEmissionAccountingSchema.methods.getLatestYear = function () {
  if (this.yearly_data.length === 0) return null;
  return Math.max(...this.yearly_data.map((d) => d.year));
};

CarbonEmissionAccountingSchema.methods.getEmissionFactor = function (code) {
  return this.emission_references.emission_factors.find(
    (ef) => ef.emission_factor_code === code
  );
};

CarbonEmissionAccountingSchema.methods.calculateSummary = function () {
  const years = this.yearly_data.map((d) => d.year);
  const emissions = this.yearly_data.map(
    (d) => d.emissions.total_scope_emission_tco2e || 0
  );
  const sequestration = this.yearly_data.map(
    (d) => d.sequestration.annual_summary?.sequestration_total_tco2 || 0
  );

  this.summary = {
    baseline_year: Math.min(...years),
    current_year: Math.max(...years),
    average_emissions_tco2e_per_year:
      emissions.reduce((a, b) => a + b, 0) / emissions.length,
    average_sequestration_tco2_per_year:
      sequestration.reduce((a, b) => a + b, 0) / sequestration.length,
    net_carbon_balance_tco2e:
      emissions.reduce((a, b) => a + b, 0) -
      sequestration.reduce((a, b) => a + b, 0),
  };

  return this.summary;
};

// Virtual for total area
CarbonEmissionAccountingSchema.virtual("total_area_ha").get(function () {
  const latestYear = this.getYearData(this.getLatestYear());
  return latestYear?.sequestration?.soc_area_ha || 0;
});


module.exports = mongoose.model(
  "CarbonEmissionAccounting",
  CarbonEmissionAccountingSchema
);
