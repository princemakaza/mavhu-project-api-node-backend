// services/company_service.js
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");

async function createCompany(data) {
  const { name } = data;
  if (!name) throw new AppError("Company name is required", 400, "MISSING_FIELDS", { missing: ["name"] });

  const company = await Company.create({
    name: data.name,
    registrationNumber: data.registrationNumber,
    email: data.email,
    phone: data.phone,
    address: data.address,
    website: data.website,
    country: data.country,
    industry: data.industry,
    description: data.description,
  });

  return company;
}

async function getCompanyById(companyId) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");
  return company;
}

async function updateCompany(companyId, data) {
  const update = {};
  const fields = [
    "name",
    "registrationNumber",
    "email",
    "phone",
    "address",
    "website",
    "country",
    "industry",
    "description",
  ];

  for (const f of fields) {
    if (data[f] !== undefined) update[f] = data[f];
  }

  const company = await Company.findByIdAndUpdate(companyId, { $set: update }, { new: true, runValidators: true });
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");
  return company;
}

async function deleteCompany(companyId) {
  const deleted = await Company.findByIdAndDelete(companyId);
  if (!deleted) throw new AppError("Company not found", 404, "NOT_FOUND");
  return true;
}

async function listCompanies({ page = 1, limit = 20, q } = {}) {
  const filter = {};

  if (q) {
    // simple search across common fields
    filter.$or = [
      { name: new RegExp(q, "i") },
      { registrationNumber: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
      { phone: new RegExp(q, "i") },
      { country: new RegExp(q, "i") },
      { industry: new RegExp(q, "i") },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Company.find(filter).sort({ createdAt: -1 }).skip(skip).limit(Number(limit)),
    Company.countDocuments(filter),
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
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  listCompanies,
};
