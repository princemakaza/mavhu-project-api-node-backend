const ESGData = require("../models/esg_data_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");
const mongoose = require("mongoose");
const { parse } = require("csv-parse/sync");
const xlsx = require("xlsx");

async function createESGData(data, userId) {
  const { company, reporting_period_start, reporting_period_end, metrics } = data;

  // Validate required fields
  if (!company) throw new AppError("Company is required", 400, "MISSING_FIELDS", { missing: ["company"] });
  if (!metrics || !Array.isArray(metrics) || metrics.length === 0) {
    throw new AppError("At least one metric is required", 400, "MISSING_FIELDS", { missing: ["metrics"] });
  }

  // Check if company exists
  const companyExists = await Company.findById(company);
  if (!companyExists) throw new AppError("Company not found", 404, "NOT_FOUND");

  // Prepare metrics with user info
  const preparedMetrics = metrics.map(metric => ({
    ...metric,
    created_by: userId,
    values: metric.values.map(value => ({
      ...value,
      added_by: userId,
    }))
  }));

  const esgData = await ESGData.create({
    ...data,
    metrics: preparedMetrics,
    created_by: userId,
    last_updated_by: userId,
  });

  // Update company's latest ESG report year
  if (reporting_period_end) {
    await Company.findByIdAndUpdate(company, {
      latest_esg_report_year: reporting_period_end,
      esg_data_status: "partial"
    });
  }

  return esgData;
}

async function createBulkESGData(dataArray, userId, importInfo = {}) {
  if (!Array.isArray(dataArray) || dataArray.length === 0) {
    throw new AppError("Data array is required and cannot be empty", 400, "INVALID_DATA");
  }

  const companyIds = [...new Set(dataArray.map(item => item.company))];
  
  // Verify all companies exist
  const companies = await Company.find({ _id: { $in: companyIds } });
  const existingCompanyIds = companies.map(c => c._id.toString());
  const missingCompanies = companyIds.filter(id => !existingCompanyIds.includes(id));
  
  if (missingCompanies.length > 0) {
    throw new AppError(`Companies not found: ${missingCompanies.join(", ")}`, 404, "COMPANIES_NOT_FOUND");
  }

  // Prepare data with user info
  const preparedData = dataArray.map(data => ({
    ...data,
    ...importInfo,
    metrics: data.metrics.map(metric => ({
      ...metric,
      created_by: userId,
      values: metric.values.map(value => ({
        ...value,
        added_by: userId,
      }))
    })),
    created_by: userId,
    last_updated_by: userId,
  }));

  const result = await ESGData.insertMany(preparedData);

  // Update each company's latest ESG report year
  for (const data of dataArray) {
    if (data.reporting_period_end) {
      await Company.findByIdAndUpdate(data.company, {
        latest_esg_report_year: data.reporting_period_end,
        esg_data_status: "partial"
      });
    }
  }

  return result;
}

// NEW FUNCTION: Parse uploaded file
async function parseAndProcessFile(fileBuffer, fileType, companyId, userId, originalFileName) {
  try {
    let parsedData;
    
    switch (fileType) {
      case "csv":
        parsedData = parseCSV(fileBuffer);
        break;
      case "excel":
        parsedData = parseExcel(fileBuffer);
        break;
      case "json":
        parsedData = parseJSON(fileBuffer);
        break;
      default:
        throw new AppError("Unsupported file type", 400, "INVALID_FILE_TYPE");
    }

    // Transform parsed data to match our schema
    const transformedData = transformParsedData(parsedData, companyId, originalFileName);
    
    // Create import batch info
    const importBatchId = `FILE_UPLOAD_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const importInfo = {
      source_file_name: originalFileName,
      source_file_type: fileType,
      import_batch_id: importBatchId,
      import_date: new Date(),
      validation_status: "validated",
    };

    // Use existing bulk create function
    const result = await createBulkESGData(transformedData, userId, importInfo);
    
    return {
      success: true,
      count: result.length,
      batchId: importBatchId,
      data: result
    };
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`File processing failed: ${error.message}`, 500, "FILE_PROCESSING_ERROR");
  }
}

// Helper function to parse CSV
function parseCSV(fileBuffer) {
  try {
    const csvContent = fileBuffer.toString('utf-8');
    
    // Split content by lines and filter out empty lines
    const lines = csvContent.split('\n').filter(line => line.trim() !== '');
    
    if (lines.length < 2) {
      throw new AppError("CSV file is empty or has no valid data", 400, "EMPTY_FILE");
    }
    
    // Find the header row (look for row containing "Metric" and "2022")
    let headerIndex = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('Metric') && (lines[i].includes('2022') || lines[i].includes('2023') || lines[i].includes('2024') || lines[i].includes('2025'))) {
        headerIndex = i;
        break;
      }
    }
    
    if (headerIndex === -1) {
      throw new AppError("Could not find header row in CSV", 400, "INVALID_CSV_FORMAT");
    }
    
    // Extract header and data rows
    const headerRow = lines[headerIndex];
    const dataRows = lines.slice(headerIndex + 1);
    
    // Parse CSV with proper header
    const records = parse([headerRow, ...dataRows].join('\n'), {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true
    });
    
    if (!records || records.length === 0) {
      throw new AppError("CSV file has no data rows", 400, "NO_DATA_ROWS");
    }
    
    return records;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`CSV parsing error: ${error.message}`, 400, "CSV_PARSING_ERROR");
  }
}

// Helper function to parse Excel
function parseExcel(fileBuffer) {
  try {
    const workbook = xlsx.read(fileBuffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Convert to JSON
    const records = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,
      defval: "",
      header: 1
    });
    
    if (!records || records.length === 0) {
      throw new AppError("Excel file is empty or has no valid data", 400, "EMPTY_FILE");
    }
    
    // Find header row
    let headerRowIndex = -1;
    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      if (row && row[0] && (row[0].toString().includes('Metric') || row[0].toString().includes('metric'))) {
        headerRowIndex = i;
        break;
      }
    }
    
    if (headerRowIndex === -1) {
      throw new AppError("Could not find header row in Excel file", 400, "INVALID_EXCEL_FORMAT");
    }
    
    // Extract headers and data
    const headers = records[headerRowIndex];
    const dataRows = records.slice(headerRowIndex + 1);
    
    // Convert to array of objects
    const formattedRecords = dataRows.map(row => {
      const obj = {};
      headers.forEach((header, index) => {
        if (header !== undefined && header !== null) {
          obj[header] = row[index] !== undefined ? row[index] : '';
        }
      });
      return obj;
    }).filter(obj => Object.keys(obj).length > 0 && obj[headers[0]]); // Filter out empty rows
    
    return formattedRecords;
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }
    throw new AppError(`Excel parsing error: ${error.message}`, 400, "EXCEL_PARSING_ERROR");
  }
}

// Helper function to parse JSON
function parseJSON(fileBuffer) {
  try {
    const jsonString = fileBuffer.toString('utf-8');
    const parsed = JSON.parse(jsonString);
    
    if (!parsed || (Array.isArray(parsed) && parsed.length === 0)) {
      throw new AppError("JSON file is empty or has no valid data", 400, "EMPTY_FILE");
    }
    
    // Handle both array and single object
    return Array.isArray(parsed) ? parsed : [parsed];
  } catch (error) {
    throw new AppError(`JSON parsing error: ${error.message}`, 400, "JSON_PARSING_ERROR");
  }
}

// Helper function to transform parsed data
function transformParsedData(parsedRecords, companyId, fileName) {
  const metrics = [];
  
  // Determine category from file name
  let category = "environmental"; // Default
  const fileNameLower = fileName.toLowerCase();
  if (fileNameLower.includes('social')) {
    category = "social";
  } else if (fileNameLower.includes('governance')) {
    category = "governance";
  }
  
  // Process each record
  for (const record of parsedRecords) {
    // Find metric name field (could be 'Metric', 'metric_name', etc.)
    let metricName = null;
    const possibleMetricFields = ['Metric', 'metric_name', 'metric', 'Indicator', 'indicator'];
    
    for (const field of possibleMetricFields) {
      if (record[field] !== undefined && record[field] !== null && record[field].toString().trim() !== '') {
        metricName = record[field].toString().trim();
        break;
      }
    }
    
    if (!metricName) {
      // Try to find any field that looks like a metric name (not a year or source)
      for (const key in record) {
        if (key && !key.match(/^\d{4}$/) && key.toLowerCase() !== 'source notes' && 
            key.toLowerCase() !== 'source_notes' && key.toLowerCase() !== 'notes') {
          const value = record[key];
          if (value && value.toString().trim() !== '') {
            metricName = value.toString().trim();
            break;
          }
        }
      }
    }
    
    if (!metricName) continue;
    
    const values = [];
    
    // Look for year columns (2022, 2023, 2024, 2025)
    const years = ["2022", "2023", "2024", "2025"];
    years.forEach(year => {
      const yearValue = record[year];
      if (yearValue !== undefined && yearValue !== null && yearValue.toString().trim() !== '') {
        const strValue = yearValue.toString().trim();
        let numericValue = null;
        
        // Try to parse as number
        if (!isNaN(strValue) && strValue !== '') {
          numericValue = parseFloat(strValue);
        }
        
        // Get source notes
        let sourceNotes = '';
        const possibleSourceFields = ['Source Notes', 'source_notes', 'Source_Notes', 'notes', 'Notes'];
        for (const field of possibleSourceFields) {
          if (record[field]) {
            sourceNotes = record[field].toString().trim();
            break;
          }
        }
        
        values.push({
          year: parseInt(year),
          value: strValue,
          numeric_value: numericValue,
          source_notes: sourceNotes
        });
      }
    });
    
    if (values.length > 0) {
      // Extract unit from metric name if present in parentheses
      let unit = "";
      const unitMatch = metricName.match(/\((.*?)\)/);
      if (unitMatch && unitMatch[1]) {
        unit = unitMatch[1].trim();
      }
      
      // Clean metric name (remove unit from name if present)
      const cleanMetricName = metricName.replace(/\(.*?\)/g, '').trim();
      
      metrics.push({
        category,
        metric_name: cleanMetricName,
        unit: unit || null,
        description: null, // Can be added later
        values
      });
    }
  }
  
  if (metrics.length === 0) {
    console.log("Debug - No metrics found. First few records:", parsedRecords.slice(0, 3));
    throw new AppError("No valid metrics found in the file. Please check the file format.", 400, "NO_VALID_DATA");
  }
  
  // Determine reporting period from data
  const allYears = metrics.flatMap(m => m.values.map(v => v.year));
  if (allYears.length === 0) {
    throw new AppError("Could not determine reporting period from data", 400, "NO_VALID_YEARS");
  }
  
  const reportingPeriodStart = Math.min(...allYears);
  const reportingPeriodEnd = Math.max(...allYears);
  
  // Extract data source from first record if available
  let dataSource = "Uploaded file";
  const firstRecord = parsedRecords[0];
  if (firstRecord) {
    const sourceFields = ['Source Notes', 'source_notes', 'Source_Notes'];
    for (const field of sourceFields) {
      if (firstRecord[field]) {
        dataSource = firstRecord[field].toString().trim();
        break;
      }
    }
  }
  
  return [{
    company: companyId,
    reporting_period_start: reportingPeriodStart,
    reporting_period_end: reportingPeriodEnd,
    data_source: dataSource,
    source_file_name: fileName,
    metrics
  }];
}

async function getESGDataById(esgDataId) {
  const esgData = await ESGData.findById(esgDataId)
    .populate("company", "name registrationNumber industry")
    .populate("created_by", "full_name email")
    .populate("last_updated_by", "full_name email")
    .populate("verified_by", "full_name email");

  if (!esgData) throw new AppError("ESG data not found", 404, "NOT_FOUND");
  return esgData;
}

async function getESGDataByCompany(companyId) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  const esgData = await ESGData.find({ company: companyId, is_active: true })
    .populate("company", "name registrationNumber industry")
    .populate("created_by", "full_name email")
    .sort({ reporting_period_end: -1 });

  return esgData;
}

async function getESGDataByCompanyAndYear(companyId, year) {
  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  const esgData = await ESGData.find({
    company: companyId,
    is_active: true,
    $or: [
      { reporting_period_start: { $lte: year } },
      { reporting_period_end: { $gte: year } }
    ]
  })
  .populate("company", "name registrationNumber industry")
  .populate("created_by", "full_name email");

  // Filter to include only metrics that have data for the specified year
  const filteredData = esgData.map(data => ({
    ...data.toObject(),
    metrics: data.metrics.filter(metric => 
      metric.values.some(value => value.year === year)
    )
  })).filter(data => data.metrics.length > 0);

  return filteredData;
}

async function getESGDataByCompanyAndCategory(companyId, category) {
  const validCategories = ["environmental", "social", "governance"];
  if (!validCategories.includes(category)) {
    throw new AppError("Invalid category. Must be: environmental, social, or governance", 400, "INVALID_CATEGORY");
  }

  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  const esgData = await ESGData.find({
    company: companyId,
    is_active: true,
    "metrics.category": category
  })
  .populate("company", "name registrationNumber industry")
  .populate("created_by", "full_name email")
  .sort({ reporting_period_end: -1 });

  // Filter to include only metrics of the specified category
  const filteredData = esgData.map(data => ({
    ...data.toObject(),
    metrics: data.metrics.filter(metric => metric.category === category)
  })).filter(data => data.metrics.length > 0);

  return filteredData;
}

async function updateESGData(esgDataId, updateData, userId) {
  const update = { ...updateData };
  
  // Add update tracking
  update.last_updated_at = Date.now();
  update.last_updated_by = userId;

  // If updating metrics, ensure created_by is set for new metrics
  if (update.metrics && Array.isArray(update.metrics)) {
    update.metrics = update.metrics.map(metric => ({
      ...metric,
      last_updated_by: userId,
      // Update values with last_updated_by
      values: metric.values.map(value => ({
        ...value,
        last_updated_by: userId,
        last_updated_at: Date.now()
      }))
    }));
  }

  const esgData = await ESGData.findByIdAndUpdate(
    esgDataId,
    { $set: update },
    { new: true, runValidators: true }
  )
  .populate("company", "name registrationNumber industry")
  .populate("last_updated_by", "full_name email");

  if (!esgData) throw new AppError("ESG data not found", 404, "NOT_FOUND");

  return esgData;
}

async function deleteESGData(esgDataId, userId) {
  const esgData = await ESGData.findById(esgDataId);
  if (!esgData) throw new AppError("ESG data not found", 404, "NOT_FOUND");

  // Soft delete
  esgData.is_active = false;
  esgData.deleted_at = Date.now();
  esgData.deleted_by = userId;
  esgData.last_updated_at = Date.now();
  esgData.last_updated_by = userId;

  await esgData.save();

  return esgData;
}

async function verifyESGData(esgDataId, userId, verificationData = {}) {
  const esgData = await ESGData.findById(esgDataId);
  if (!esgData) throw new AppError("ESG data not found", 404, "NOT_FOUND");

  esgData.verification_status = verificationData.status || "verified";
  esgData.verified_by = userId;
  esgData.verified_at = Date.now();
  esgData.last_updated_at = Date.now();
  esgData.last_updated_by = userId;

  if (verificationData.data_quality_score !== undefined) {
    esgData.data_quality_score = verificationData.data_quality_score;
  }

  if (verificationData.notes) {
    esgData.validation_notes = verificationData.notes;
  }

  await esgData.save();

  // Update company's ESG data status if verified
  if (esgData.verification_status === "verified" || esgData.verification_status === "audited") {
    await Company.findByIdAndUpdate(esgData.company, {
      esg_data_status: "verified"
    });
  }

  return esgData;
}

async function getESGDataStats() {
  const stats = await ESGData.aggregate([
    { $match: { is_active: true } },
    {
      $group: {
        _id: null,
        totalEntries: { $sum: 1 },
        totalCompanies: { $addToSet: "$company" },
        avgDataQualityScore: { $avg: "$data_quality_score" },
        byCategory: {
          $push: "$metrics.category"
        }
      }
    },
    {
      $project: {
        totalEntries: 1,
        totalCompanies: { $size: "$totalCompanies" },
        avgDataQualityScore: { $round: ["$avgDataQualityScore", 2] },
        verificationStatus: {
          $cond: [{ $eq: ["$totalEntries", 0] }, [], {
            $let: {
              vars: {
                statuses: ["unverified", "pending", "verified", "audited"]
              },
              in: {
                $map: {
                  input: "$$statuses",
                  as: "status",
                  in: {
                    status: "$$status",
                    count: { $size: { $filter: { input: "$verification_status", as: "s", cond: { $eq: ["$$s", "$$status"] } } } }
                  }
                }
              }
            }
          }]
        }
      }
    }
  ]);

  return stats[0] || {
    totalEntries: 0,
    totalCompanies: 0,
    avgDataQualityScore: null,
    verificationStatus: []
  };
}

async function validateImportData(importData, fileType) {
  const errors = [];
  const warnings = [];

  if (fileType === "csv" || fileType === "excel") {
    // Basic validation for CSV/Excel structure
    if (!importData || !Array.isArray(importData)) {
      errors.push("Invalid data format. Expected array of objects.");
    }

    importData.forEach((item, index) => {
      if (!item.company) {
        errors.push(`Row ${index + 1}: Company ID is required`);
      }
      if (!item.metrics || !Array.isArray(item.metrics)) {
        errors.push(`Row ${index + 1}: Metrics array is required`);
      }
    });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    totalRecords: importData?.length || 0
  };
}

module.exports = {
  createESGData,
  createBulkESGData,
  parseAndProcessFile,
  getESGDataById,
  getESGDataByCompany,
  getESGDataByCompanyAndYear,
  getESGDataByCompanyAndCategory,
  updateESGData,
  deleteESGData,
  verifyESGData,
  getESGDataStats,
  validateImportData
};