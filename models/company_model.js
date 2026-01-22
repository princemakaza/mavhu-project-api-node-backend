const mongoose = require("mongoose");
const { Schema } = mongoose;

const CompanySchema = new Schema({
  name: { type: String, required: true, trim: true },
  registrationNumber: { type: String, trim: true },
  email: { type: String, trim: true, lowercase: true },
  phone: { type: String, trim: true },
  address: { type: String, trim: true },
  website: { type: String, trim: true },
  country: { type: String, trim: true },
  industry: { type: String, trim: true },
  description: { type: String, trim: true },
  purpose: { type: String, trim: true },
  scope: { type: String, trim: true },

  data_source: [{ type: String, trim: true }],

  /* ✅ PURE GEOJSON — NO EXTRA FIELDS */

  /* ✅ STORE METADATA SEPARATELY */
  area_of_interest_metadata: {
    name: { type: String, trim: true },
    area_covered: { type: String, trim: true },
    coordinates: [
      {
        lat: {
          type: Number,
          required: true,
        },
        lon: {
          type: Number,
          required: true,
        },
      },
    ],
  },

  data_range: { type: String, trim: true },
  data_processing_workflow: { type: String, trim: true },
  analytical_layer_metadata: { type: String, trim: true },

  esg_reporting_framework: [
    {
      type: String,
      enum: ["GRI", "SASB", "TCFD", "UNSDG", "CDP", "custom", "none"],
    },
  ],

  esg_contact_person: {
    name: { type: String, trim: true },
    email: { type: String, trim: true },
    phone: { type: String, trim: true },
  },

  latest_esg_report_year: Number,
  esg_data_status: {
    type: String,
    enum: ["not_collected", "partial", "complete", "verified"],
    default: "not_collected",
  },
  has_esg_linked_pay: { type: Boolean, default: false },

  created_at: { type: Date, default: Date.now },
  updated_at: { type: Date, default: Date.now },
});

/* ✅ REQUIRED */

module.exports = mongoose.model("Company", CompanySchema);
