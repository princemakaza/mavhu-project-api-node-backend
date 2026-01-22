const esgDataService = require("../services/esg_data_service");
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");
const multer = require("multer");
const path = require("path");

// Configure multer for file upload
const storage = multer.memoryStorage(); // Store file in memory as buffer

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allowed file types
    const allowedTypes = /csv|excel|xlsx|xls|json/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (extname && mimetype) {
      return cb(null, true);
    } else {
      cb(new AppError("Only CSV, Excel, and JSON files are allowed", 400, "INVALID_FILE_TYPE"));
    }
  }
}).single("file"); // 'file' is the field name in form-data

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
 * NEW: Upload ESG data file (CSV/Excel/JSON)
 * POST /api/v1/esg-data/upload
 */
const uploadESGDataFile = asyncHandler(async (req, res) => {
  // Use multer middleware
  upload(req, res, async (err) => {
    if (err) {
      if (err instanceof AppError) {
        throw err;
      }
      throw new AppError(`File upload error: ${err.message}`, 400, "UPLOAD_ERROR");
    }

    // Check if file was uploaded
    if (!req.file) {
      throw new AppError("No file uploaded", 400, "NO_FILE");
    }

    // Check if company ID is provided
    if (!req.body.companyId) {
      throw new AppError("Company ID is required", 400, "MISSING_COMPANY_ID");
    }

    // Determine file type based on extension
    const originalName = req.file.originalname.toLowerCase();
    let fileType;
    
    if (originalName.endsWith('.csv')) {
      fileType = 'csv';
    } else if (originalName.endsWith('.xlsx') || originalName.endsWith('.xls')) {
      fileType = 'excel';
    } else if (originalName.endsWith('.json')) {
      fileType = 'json';
    } else {
      throw new AppError("Unsupported file format", 400, "UNSUPPORTED_FORMAT");
    }

    // Parse and process the file
    const result = await esgDataService.parseAndProcessFile(
      req.file.buffer,
      fileType,
      req.body.companyId,
      req.user._id,
      req.file.originalname
    );

    res.status(201).json({
      message: `Successfully uploaded and processed ${req.file.originalname}`,
      fileName: req.file.originalname,
      fileType: fileType,
      count: result.count,
      batchId: result.batchId,
      success: result.success
    });
  });
});

/**
 * Create ESG data (manual entry)
 * POST /api/v1/esg-data
 */
const createESGData = asyncHandler(async (req, res) => {
  requireFields(req.body, ["company", "metrics"]);

  const esgData = await esgDataService.createESGData(req.body, req.user._id);

  res.status(201).json({
    message: "ESG data created successfully",
    esgData,
  });
});

/**
 * Create bulk ESG data from file (CSV/Excel/JSON)
 * POST /api/v1/esg-data/bulk
 */
const createBulkESGData = asyncHandler(async (req, res) => {
  if (!req.body.data || !Array.isArray(req.body.data)) {
    throw new AppError("Data array is required", 400, "MISSING_FIELDS", {
      missing: ["data"],
    });
  }

  const importInfo = {
    source_file_name: req.body.fileName || "bulk_import.json",
    source_file_type: req.body.fileType || "json",
    import_batch_id: `BATCH_${Date.now()}`,
    import_notes: req.body.importNotes,
    source_file_metadata: req.body.fileMetadata || {},
    validation_status: "validated",
  };

  // Validate import data
  const validation = await esgDataService.validateImportData(
    req.body.data,
    req.body.fileType
  );

  if (!validation.isValid) {
    throw new AppError("Data validation failed", 400, "VALIDATION_FAILED", {
      errors: validation.errors,
      warnings: validation.warnings,
    });
  }

  const result = await esgDataService.createBulkESGData(
    req.body.data,
    req.user._id,
    importInfo
  );

  res.status(201).json({
    message: `Successfully imported ${result.length} ESG data records`,
    count: result.length,
    batchId: importInfo.import_batch_id,
    validation: validation,
  });
});

/**
 * Get ESG data by ID
 * GET /api/v1/esg-data/:id
 */
const getESGDataById = asyncHandler(async (req, res) => {
  const esgData = await esgDataService.getESGDataById(req.params.id);

  res.status(200).json({
    message: "ESG data retrieved successfully",
    esgData,
  });
});

/**
 * Get all ESG data for a company
 * GET /api/v1/esg-data/company/:companyId
 */
const getESGDataByCompany = asyncHandler(async (req, res) => {
  const esgData = await esgDataService.getESGDataByCompany(
    req.params.companyId
  );

  res.status(200).json({
    message: "ESG data retrieved successfully",
    count: esgData.length,
    esgData,
  });
});

/**
 * Get ESG data for a company by specific year
 * GET /api/v1/esg-data/company/:companyId/year/:year
 */
const getESGDataByCompanyAndYear = asyncHandler(async (req, res) => {
  const year = parseInt(req.params.year);
  if (isNaN(year)) {
    throw new AppError("Year must be a valid number", 400, "INVALID_YEAR");
  }

  const esgData = await esgDataService.getESGDataByCompanyAndYear(
    req.params.companyId,
    year
  );

  res.status(200).json({
    message: `ESG data for year ${year} retrieved successfully`,
    count: esgData.length,
    year,
    esgData,
  });
});

/**
 * Get ESG data for a company by category
 * GET /api/v1/esg-data/company/:companyId/category/:category
 */
const getESGDataByCompanyAndCategory = asyncHandler(async (req, res) => {
  const esgData = await esgDataService.getESGDataByCompanyAndCategory(
    req.params.companyId,
    req.params.category
  );

  res.status(200).json({
    message: `${req.params.category} ESG data retrieved successfully`,
    count: esgData.length,
    category: req.params.category,
    esgData,
  });
});

/**
 * Update ESG data
 * PATCH /api/v1/esg-data/:id
 */
const updateESGData = asyncHandler(async (req, res) => {
  const updated = await esgDataService.updateESGData(
    req.params.id,
    req.body,
    req.user._id
  );

  res.status(200).json({
    message: "ESG data updated successfully",
    esgData: updated,
  });
});

/**
 * Delete ESG data (soft delete)
 * DELETE /api/v1/esg-data/:id
 */
const deleteESGData = asyncHandler(async (req, res) => {
  const deleted = await esgDataService.deleteESGData(
    req.params.id,
    req.user._id
  );

  res.status(200).json({
    message: "ESG data deleted successfully",
    esgData: deleted,
  });
});

/**
 * Verify ESG data
 * PATCH /api/v1/esg-data/:id/verify
 */
const verifyESGData = asyncHandler(async (req, res) => {
  const verified = await esgDataService.verifyESGData(
    req.params.id,
    req.user._id,
    req.body
  );

  res.status(200).json({
    message: `ESG data ${req.body.status || "verified"} successfully`,
    esgData: verified,
  });
});

/**
 * Get ESG data statistics
 * GET /api/v1/esg-data/stats
 */
const getESGDataStats = asyncHandler(async (req, res) => {
  const stats = await esgDataService.getESGDataStats();

  res.status(200).json({
    message: "ESG data statistics retrieved successfully",
    stats,
  });
});

/**
 * Validate import data (without saving)
 * POST /api/v1/esg-data/validate-import
 */
const validateImportData = asyncHandler(async (req, res) => {
  if (!req.body.data) {
    throw new AppError(
      "Data is required for validation",
      400,
      "MISSING_FIELDS"
    );
  }

  const validation = await esgDataService.validateImportData(
    req.body.data,
    req.body.fileType || "json"
  );

  res.status(200).json({
    message: "Data validation completed",
    validation,
  });
});

module.exports = {
  createESGData,
  createBulkESGData,
  uploadESGDataFile, // NEW
  getESGDataById,
  getESGDataByCompany,
  getESGDataByCompanyAndYear,
  getESGDataByCompanyAndCategory,
  updateESGData,
  deleteESGData,
  verifyESGData,
  getESGDataStats,
  validateImportData,
};