const Company = require("../models/company_model");
const AppError = require("../utils/app_error");

async function createCompany(data) {
  const { name } = data;
  if (!name)
    throw new AppError("Company name is required", 400, "MISSING_FIELDS", {
      missing: ["name"],
    });

  // Validate area_of_interest_metadata if provided
  if (data.area_of_interest_metadata) {
    validateAreaOfInterestMetadata(data.area_of_interest_metadata);
  }

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
    // New data management fields
    purpose: data.purpose,
    scope: data.scope,
    data_source: data.data_source,
    area_of_interest_metadata: data.area_of_interest_metadata,
    data_range: data.data_range,
    data_processing_workflow: data.data_processing_workflow,
    analytical_layer_metadata: data.analytical_layer_metadata,
    // ESG fields
    esg_reporting_framework: data.esg_reporting_framework,
    esg_contact_person: data.esg_contact_person,
    latest_esg_report_year: data.latest_esg_report_year,
    esg_data_status: data.esg_data_status || "not_collected",
    has_esg_linked_pay: data.has_esg_linked_pay || false,
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
    // New data management fields
    "purpose",
    "scope",
    "data_source",
    "area_of_interest_metadata",
    "data_range",
    "data_processing_workflow",
    "analytical_layer_metadata",
    // ESG fields
    "esg_reporting_framework",
    "esg_contact_person",
    "latest_esg_report_year",
    "esg_data_status",
    "has_esg_linked_pay",
  ];

  for (const f of fields) {
    if (data[f] !== undefined) update[f] = data[f];
  }

  // Validate area_of_interest_metadata if being updated
  if (update.area_of_interest_metadata) {
    validateAreaOfInterestMetadata(update.area_of_interest_metadata);
  }

  // Add updated_at timestamp
  update.updated_at = Date.now();

  const company = await Company.findByIdAndUpdate(
    companyId,
    { $set: update },
    { new: true, runValidators: true },
  );
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
    // Updated search to use area_of_interest_metadata.name
    filter.$or = [
      { name: new RegExp(q, "i") },
      { registrationNumber: new RegExp(q, "i") },
      { email: new RegExp(q, "i") },
      { phone: new RegExp(q, "i") },
      { country: new RegExp(q, "i") },
      { industry: new RegExp(q, "i") },
      { "area_of_interest_metadata.name": new RegExp(q, "i") },
      { purpose: new RegExp(q, "i") },
    ];
  }

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Company.find(filter)
      .sort({ created_at: -1 })
      .skip(skip)
      .limit(Number(limit)),
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

// Helper function to validate area_of_interest_metadata structure
function validateAreaOfInterestMetadata(metadata) {
  if (metadata.coordinates) {
    if (
      !Array.isArray(metadata.coordinates) ||
      metadata.coordinates.length === 0
    ) {
      throw new AppError(
        "area_of_interest_metadata.coordinates must be a non-empty array",
        400,
        "VALIDATION_ERROR",
      );
    }

    for (const coord of metadata.coordinates) {
      if (
        typeof coord.lat !== "number" ||
        typeof coord.lon !== "number" ||
        isNaN(coord.lat) ||
        isNaN(coord.lon)
      ) {
        throw new AppError(
          "Each coordinate must have valid lat and lon numbers",
          400,
          "VALIDATION_ERROR",
        );
      }
    }
  }
}

// New function to get company ESG summary
async function getCompanyESGSummary(companyId) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  // Note: This assumes you have an ESG data model with a getLatestESGData method
  // If not, you might need to adjust this logic
  const latestESGData = null; // Placeholder - implement based on your ESG data model

  return {
    company_id: company._id,
    company_name: company.name,
    esg_data_status: company.esg_data_status,
    latest_esg_report_year: company.latest_esg_report_year,
    has_esg_linked_pay: company.has_esg_linked_pay,
    latest_esg_data: latestESGData
      ? {
          reporting_period_start: latestESGData.reporting_period_start,
          reporting_period_end: latestESGData.reporting_period_end,
          total_metrics: latestESGData.metrics.length,
          verification_status: latestESGData.verification_status,
          last_updated: latestESGData.last_updated_at,
        }
      : null,
  };
}

// Updated function to get companies by location using area_of_interest_metadata.coordinates
async function getCompaniesByLocation(
  longitude,
  latitude,
  radiusInMeters = 10000,
) {
  if (!longitude || !latitude) {
    throw new AppError(
      "Longitude and latitude are required",
      400,
      "MISSING_FIELDS",
    );
  }

  // Convert custom coordinates to bounding box query
  const companies = await Company.find({
    "area_of_interest_metadata.coordinates": {
      $elemMatch: {
        lat: {
          $gte: latitude - radiusInMeters / 111320, // Approximate conversion: 1 degree ≈ 111.32km
          $lte: latitude + radiusInMeters / 111320,
        },
        lon: {
          $gte:
            longitude -
            radiusInMeters / (111320 * Math.cos((latitude * Math.PI) / 180)),
          $lte:
            longitude +
            radiusInMeters / (111320 * Math.cos((latitude * Math.PI) / 180)),
        },
      },
    },
  });

  return companies;
}

// Function to get companies with data for a specific year
async function getCompaniesWithDataForYear(year) {
  const companies = await Company.find();

  // Filter companies that have data for the specified year
  const filteredCompanies = companies.filter((company) => {
    if (!company.data_range) return false;

    // Parse data_range string like "2000-2025, 2023-2024"
    const ranges = company.data_range.split(",").map((range) => {
      const [start, end] = range.trim().split("-").map(Number);
      return { start: start || 0, end: end || start || 0 };
    });

    return ranges.some((range) => year >= range.start && year <= range.end);
  });

  return filteredCompanies;
}

// Function to get companies by data range
async function getCompaniesByDataRange(startYear, endYear) {
  const companies = await Company.find();

  // Filter companies whose data range overlaps with the specified range
  const filteredCompanies = companies.filter((company) => {
    if (!company.data_range) return false;

    // Parse data_range string
    const ranges = company.data_range.split(",").map((range) => {
      const [start, end] = range.trim().split("-").map(Number);
      return { start: start || 0, end: end || start || 0 };
    });

    return ranges.some(
      (range) => range.start <= endYear && range.end >= startYear,
    );
  });

  return filteredCompanies;
}

module.exports = {
  createCompany,
  getCompanyById,
  updateCompany,
  deleteCompany,
  listCompanies,
  getCompanyESGSummary,
  getCompaniesByLocation,
  getCompaniesWithDataForYear,
  getCompaniesByDataRange,
};
