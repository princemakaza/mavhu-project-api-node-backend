const mongoose = require("mongoose");
const { Schema: Schema2 } = mongoose;

const ApiPermissionsSchema = new Schema2(
  {
    company: {
      type: Schema2.Types.ObjectId,
      ref: "Company",
      required: true,
      unique: true,
    },
    soilHealthCarbon: { type: Boolean, default: false },
    cropYieldForecastRisk: { type: Boolean, default: false },
    ghgEmissions: { type: Boolean, default: false },
    biodiversityLandUse: { type: Boolean, default: false },
    irrigationWater: { type: Boolean, default: false },
    farmManagementCompliance: { type: Boolean, default: false },
    energyConsumptionRenewables: { type: Boolean, default: false },
    wasteManagement: { type: Boolean, default: false },
    workforceDiversity: { type: Boolean, default: false },
    healthSafety: { type: Boolean, default: false },
    governanceBoardMetrics: { type: Boolean, default: false },
    communityEngagement: { type: Boolean, default: false },
    overallESGScore: { type: Boolean, default: false },
    createdBy: { type: Schema2.Types.ObjectId, ref: "User" },
    updatedBy: { type: Schema2.Types.ObjectId, ref: "User" },
  },
  {
    timestamps: true, // Adds createdAt and updatedAt automatically
  },
);

module.exports = mongoose.model("ApiPermissions", ApiPermissionsSchema);
