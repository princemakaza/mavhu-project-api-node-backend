// controllers/company_controller.js
const companyService = require("../services/company_service");
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const JWT_EXPIRES_IN = "7d";

function requireFields(body, fields = []) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === ""
  );
  if (missing.length)
    throw new AppError("Missing required fields", 400, "MISSING_FIELDS", {
      missing,
    });
}

/**
 * Create a token for a company registration (public)
 * This is separate from member/owner auth tokens.
 */
function generateCompanyToken(company) {
  return jwt.sign(
    { sub: company._id.toString(), type: "company", name: company.name },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

/**
 * Public: Register company (no auth) and return token
 * POST /api/companies/register
 */
const registerCompanyPublic = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name"]);

  const company = await companyService.createCompany(req.body);
  const token = generateCompanyToken(company);

  res.status(201).json({
    message: "Company registered successfully",
    token,
    company,
  });
});

/**
 * Owner: Register company (owner side)
 * POST /api/companies/admin/register
 */
const registerCompanyByOwner = asyncHandler(async (req, res) => {
  requireFields(req.body, ["name"]);

  const company = await companyService.createCompany(req.body);

  res.status(201).json({
    message: "Company registered successfully (owner)",
    company,
  });
});

/**
 * Member (company user): Get own company
 * GET /api/companies/me
 */
const getMyCompany = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  if (req.userType === "owner") {
    throw new AppError(
      "Owner does not have a personal company context. Use /admin endpoints.",
      400,
      "INVALID_CONTEXT"
    );
  }

  const companyId = req.user.company;
  if (!companyId)
    throw new AppError("Member is not linked to a company", 400, "NO_COMPANY");

  const company = await companyService.getCompanyById(companyId);
  res.status(200).json({ company });
});

/**
 * Member (company user): Update own company
 * PATCH /api/companies/me
 */
const updateMyCompany = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  if (req.userType === "owner")
    throw new AppError("Owner cannot update company via /me", 403, "FORBIDDEN");

  const companyId = req.user.company;
  if (!companyId)
    throw new AppError("Member is not linked to a company", 400, "NO_COMPANY");

  const updated = await companyService.updateCompany(companyId, req.body);

  res.status(200).json({
    message: "Company updated successfully",
    company: updated,
  });
});

/**
 * Owner: Get company by id
 * GET /api/companies/admin/:id
 */
const adminGetCompanyById = asyncHandler(async (req, res) => {
  const company = await companyService.getCompanyById(req.params.id);
  res.status(200).json({ company });
});

/**
 * Owner: Update company by id
 * PATCH /api/companies/admin/:id
 */
const adminUpdateCompanyById = asyncHandler(async (req, res) => {
  const updated = await companyService.updateCompany(req.params.id, req.body);
  res
    .status(200)
    .json({ message: "Company updated successfully", company: updated });
});

/**
 * Owner: Delete company by id
 * DELETE /api/companies/admin/:id
 */
const adminDeleteCompanyById = asyncHandler(async (req, res) => {
  await companyService.deleteCompany(req.params.id);
  res.status(200).json({ message: "Company deleted successfully" });
});

/**
 * Owner: List companies
 * GET /api/companies/admin
 */
const adminListCompanies = asyncHandler(async (req, res) => {
  const { page, limit, q } = req.query;
  const result = await companyService.listCompanies({ page, limit, q });
  res.status(200).json(result);
});

module.exports = {
  registerCompanyPublic,
  registerCompanyByOwner,
  getMyCompany,
  updateMyCompany,
  adminGetCompanyById,
  adminUpdateCompanyById,
  adminDeleteCompanyById,
  adminListCompanies,
};
