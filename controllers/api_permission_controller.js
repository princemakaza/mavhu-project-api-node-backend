const permissionsService = require("../services/api_permission_service");
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");

/**
 * Helper to check if user is owner or member of the company.
 * For member endpoints, ensures the company ID matches the user's company.
 */
function authorizeCompanyAccess(req, companyId) {
  if (req.userType === "owner") return true; // owner can access any company
  if (req.userType === "member") {
    if (req.user.company?.toString() !== companyId) {
      throw new AppError(
        "You can only access your own company's permissions",
        403,
        "FORBIDDEN",
      );
    }
    return true;
  }
  throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
}

/**
 * POST /api/permissions/company/:companyId
 * Create permissions for a company (owner only)
 */
const createPermissions = asyncHandler(async (req, res) => {
  if (req.userType !== "owner") {
    throw new AppError("Only owners can create permissions", 403, "FORBIDDEN");
  }

  const { companyId } = req.params;
  const permissions = await permissionsService.createPermissions(
    companyId,
    req.body,
    req.user._id,
  );

  res.status(201).json({
    message: "Permissions created successfully",
    permissions,
  });
});

/**
 * GET /api/permissions/company/:companyId
 * Get permissions for a company (owner or member of that company)
 */
const getPermissions = asyncHandler(async (req, res) => {
  const { companyId } = req.params;
  authorizeCompanyAccess(req, companyId);

  const permissions =
    await permissionsService.getPermissionsByCompany(companyId);
  res.status(200).json({ permissions });
});

/**
 * PATCH /api/permissions/company/:companyId
 * Update permissions for a company (owner only)
 */
const updatePermissions = asyncHandler(async (req, res) => {
  if (req.userType !== "owner") {
    throw new AppError("Only owners can update permissions", 403, "FORBIDDEN");
  }

  const { companyId } = req.params;
  const permissions = await permissionsService.updatePermissions(
    companyId,
    req.body,
    req.user._id,
  );

  res.status(200).json({
    message: "Permissions updated successfully",
    permissions,
  });
});

/**
 * DELETE /api/permissions/company/:companyId
 * Delete permissions for a company (owner only)
 */
const deletePermissions = asyncHandler(async (req, res) => {
  if (req.userType !== "owner") {
    throw new AppError("Only owners can delete permissions", 403, "FORBIDDEN");
  }

  const { companyId } = req.params;
  await permissionsService.deletePermissions(companyId);

  res.status(200).json({ message: "Permissions deleted successfully" });
});

/**
 * GET /api/permissions/admin
 * List all permissions (owner only) with pagination and search
 */
const listAllPermissions = asyncHandler(async (req, res) => {
  if (req.userType !== "owner") {
    throw new AppError(
      "Only owners can list all permissions",
      403,
      "FORBIDDEN",
    );
  }

  const { page, limit, q } = req.query;
  const result = await permissionsService.listPermissions({ page, limit, q });

  res.status(200).json(result);
});

module.exports = {
  createPermissions,
  getPermissions,
  updatePermissions,
  deletePermissions,
  listAllPermissions,
};
