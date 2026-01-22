const companyService = require("../services/company_service");
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const JWT_EXPIRES_IN = "7d";

function requireFields(body, fields = []) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === "",
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
    { expiresIn: JWT_EXPIRES_IN },
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
      "INVALID_CONTEXT",
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
 * Get ESG summary for a company
 * GET /api/companies/:id/esg-summary
 */
const getCompanyESGSummary = asyncHandler(async (req, res) => {
  const summary = await companyService.getCompanyESGSummary(req.params.id);
  res.status(200).json({
    message: "ESG summary retrieved successfully",
    summary,
  });
});

/**
 * Get companies by location
 * GET /api/companies/location/search
 */
const getCompaniesByLocation = asyncHandler(async (req, res) => {
  const { longitude, latitude, radius } = req.query;

  if (!longitude || !latitude) {
    throw new AppError(
      "Longitude and latitude are required",
      400,
      "MISSING_FIELDS",
    );
  }

  const radiusInMeters = radius ? parseInt(radius) : 10000; // Default 10km radius
  const companies = await companyService.getCompaniesByLocation(
    parseFloat(longitude),
    parseFloat(latitude),
    radiusInMeters,
  );

  res.status(200).json({
    message: "Companies found near location",
    companies,
    count: companies.length,
    searchParams: {
      longitude: parseFloat(longitude),
      latitude: parseFloat(latitude),
      radius: radiusInMeters,
    },
  });
});

/**
 * Get companies with data for a specific year
 * GET /api/companies/data/year/:year
 */
const getCompaniesWithDataForYear = asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);

  if (isNaN(year) || year < 1900 || year > 2100) {
    throw new AppError(
      "Invalid year. Must be between 1900 and 2100",
      400,
      "INVALID_YEAR",
    );
  }

  const companies = await companyService.getCompaniesWithDataForYear(year);

  res.status(200).json({
    message: `Companies with data for year ${year}`,
    companies,
    count: companies.length,
    year,
  });
});

/**
 * Get companies by data range
 * GET /api/companies/data/range
 */
const getCompaniesByDataRange = asyncHandler(async (req, res) => {
  const { startYear, endYear } = req.query;

  if (!startYear || !endYear) {
    throw new AppError(
      "Start year and end year are required",
      400,
      "MISSING_FIELDS",
    );
  }

  const start = parseInt(startYear);
  const end = parseInt(endYear);

  if (isNaN(start) || isNaN(end) || start > end) {
    throw new AppError("Invalid year range", 400, "INVALID_RANGE");
  }

  const companies = await companyService.getCompaniesByDataRange(start, end);

  res.status(200).json({
    message: `Companies with data overlapping range ${start}-${end}`,
    companies,
    count: companies.length,
    range: { start, end },
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
  getCompanyESGSummary,
  getCompaniesByLocation,
  getCompaniesWithDataForYear,
  getCompaniesByDataRange,
  adminGetCompanyById,
  adminUpdateCompanyById,
  adminDeleteCompanyById,
  adminListCompanies,
};
