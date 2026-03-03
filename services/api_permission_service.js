const ApiPermissions = require("../models/api_permissions_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");

/**
 * Create permissions for a company.
 * @param {string} companyId
 * @param {Object} data - contains any of the permission booleans
 * @param {string} userId - user creating the record
 * @returns {Promise<Object>} created permissions document
 */
async function createPermissions(companyId, data, userId) {
  // Ensure company exists
  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  // Check if permissions already exist for this company
  const existing = await ApiPermissions.findOne({ company: companyId });
  if (existing) {
    throw new AppError(
      "Permissions already exist for this company",
      400,
      "DUPLICATE_ENTRY",
    );
  }

  // Build permissions object: only allow boolean fields from data
  const permissionFields = [
    "soilHealthCarbon",
    "cropYieldForecastRisk",
    "ghgEmissions",
    "biodiversityLandUse",
    "irrigationWater",
    "farmManagementCompliance",
    "energyConsumptionRenewables",
    "wasteManagement",
    "workforceDiversity",
    "healthSafety",
    "governanceBoardMetrics",
    "communityEngagement",
    "overallESGScore",
  ];

  const permissionsData = {};
  for (const field of permissionFields) {
    if (data[field] !== undefined) {
      permissionsData[field] = Boolean(data[field]);
    }
  }

  const permissions = await ApiPermissions.create({
    company: companyId,
    ...permissionsData,
    createdBy: userId,
    updatedBy: userId,
  });

  return permissions;
}

/**
 * Get permissions by company ID.
 * @param {string} companyId
 * @returns {Promise<Object>} permissions document
 */
async function getPermissionsByCompany(companyId) {
  const permissions = await ApiPermissions.findOne({ company: companyId })
    .populate("company", "name registrationNumber email")
    .populate("createdBy", "full_name email")
    .populate("updatedBy", "full_name email");

  if (!permissions) {
    throw new AppError(
      "Permissions not found for this company",
      404,
      "NOT_FOUND",
    );
  }
  return permissions;
}

/**
 * Update permissions for a company.
 * @param {string} companyId
 * @param {Object} updates - contains any of the permission booleans
 * @param {string} userId - user performing the update
 * @returns {Promise<Object>} updated permissions document
 */
async function updatePermissions(companyId, updates, userId) {
  const permissionFields = [
    "soilHealthCarbon",
    "cropYieldForecastRisk",
    "ghgEmissions",
    "biodiversityLandUse",
    "irrigationWater",
    "farmManagementCompliance",
    "energyConsumptionRenewables",
    "wasteManagement",
    "workforceDiversity",
    "healthSafety",
    "governanceBoardMetrics",
    "communityEngagement",
    "overallESGScore",
  ];

  // Build $set object only for provided fields
  const setFields = {};
  for (const field of permissionFields) {
    if (updates[field] !== undefined) {
      setFields[field] = Boolean(updates[field]);
    }
  }
  setFields.updatedBy = userId;

  const permissions = await ApiPermissions.findOneAndUpdate(
    { company: companyId },
    { $set: setFields },
    { new: true, runValidators: true },
  )
    .populate("company", "name registrationNumber email")
    .populate("createdBy", "full_name email")
    .populate("updatedBy", "full_name email");

  if (!permissions) {
    throw new AppError(
      "Permissions not found for this company",
      404,
      "NOT_FOUND",
    );
  }
  return permissions;
}

/**
 * Delete permissions for a company.
 * @param {string} companyId
 * @returns {Promise<boolean>}
 */
async function deletePermissions(companyId) {
  const result = await ApiPermissions.findOneAndDelete({ company: companyId });
  if (!result) {
    throw new AppError(
      "Permissions not found for this company",
      404,
      "NOT_FOUND",
    );
  }
  return true;
}

/**
 * List all permissions with pagination and optional company search.
 * @param {Object} options
 * @param {number} options.page
 * @param {number} options.limit
 * @param {string} options.q - search term for company name
 * @returns {Promise<Object>} paginated result
 */
async function listPermissions({ page = 1, limit = 20, q } = {}) {
  const skip = (Number(page) - 1) * Number(limit);

  // Build filter for populated company search
  let filter = {};
  if (q) {
    // Use aggregation to match company name via $lookup
    // Or we can first find companies matching q and then filter permissions by company IDs
    const companies = await Company.find({
      name: new RegExp(q, "i"),
    }).select("_id");
    const companyIds = companies.map((c) => c._id);
    filter.company = { $in: companyIds };
  }

  const [items, total] = await Promise.all([
    ApiPermissions.find(filter)
      .populate("company", "name registrationNumber email country industry")
      .populate("createdBy", "full_name email")
      .populate("updatedBy", "full_name email")
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit)),
    ApiPermissions.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
}

module.exports = {
  createPermissions,
  getPermissionsByCompany,
  updatePermissions,
  deletePermissions,
  listPermissions,
};
