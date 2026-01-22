// File: controllers/carbonEmissionController.js
const carbonEmissionService = require("../services/carbon_emission_service");
const { validationResult } = require("express-validator");

class CarbonEmissionController {
  /**
   * Create new carbon emission accounting
   */
  async createCarbonEmission(req, res) {
    try {
      // Validate request
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          errors: errors.array(),
        });
      }

      const carbonEmission = await carbonEmissionService.createCarbonEmission(
        req.body,
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: "Carbon emission accounting created successfully",
        data: carbonEmission,
      });
    } catch (error) {
      this.handleError(res, error, "createCarbonEmission");
    }
  }

  /**
   * Upload carbon emission file (CSV/Excel/JSON)
   */
  async uploadCarbonEmissionFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: "No file uploaded",
        });
      }

      const { companyId, year, importNotes } = req.body;

      if (!companyId) {
        return res.status(400).json({
          success: false,
          message: "Company ID is required",
        });
      }

      // Determine file type
      const fileExtension = req.file.originalname
        .split(".")
        .pop()
        .toLowerCase();
      const fileType = this.getFileType(fileExtension);

      const result = await carbonEmissionService.uploadCarbonEmissionFile(
        req.file,
        fileType,
        companyId,
        parseInt(year) || new Date().getFullYear(),
        req.user.id,
        importNotes
      );

      res.status(201).json({
        success: true,
        message: "Carbon emission file uploaded and processed successfully",
        data: result,
      });
    } catch (error) {
      this.handleError(res, error, "uploadCarbonEmissionFile");
    }
  }

  /**
   * Get carbon emission accounting by ID
   */
  async getCarbonEmissionById(req, res) {
    try {
      const { id } = req.params;
      const populate = req.query.populate ? req.query.populate.split(",") : [];

      const carbonEmission = await carbonEmissionService.getCarbonEmissionById(
        id,
        populate
      );

      res.json({
        success: true,
        data: carbonEmission,
      });
    } catch (error) {
      this.handleError(res, error, "getCarbonEmissionById");
    }
  }

  /**
   * Get carbon emission accounting by company
   */
  async getCarbonEmissionByCompany(req, res) {
    try {
      const { companyId } = req.params;
      const populate = req.query.populate ? req.query.populate.split(",") : [];

      const carbonEmission =
        await carbonEmissionService.getCarbonEmissionByCompany(
          companyId,
          populate
        );

      if (!carbonEmission) {
        return res.status(404).json({
          success: false,
          message: "Carbon emission accounting not found for this company",
        });
      }

      res.json({
        success: true,
        data: carbonEmission,
      });
    } catch (error) {
      this.handleError(res, error, "getCarbonEmissionByCompany");
    }
  }

  /**
   * Get carbon emission data by company and year
   */
  async getCarbonEmissionByCompanyAndYear(req, res) {
    try {
      const { companyId, year } = req.params;
      const yearNum = parseInt(year);

      if (isNaN(yearNum)) {
        return res.status(400).json({
          success: false,
          message: "Invalid year provided",
        });
      }

      const carbonEmission =
        await carbonEmissionService.getCarbonEmissionByCompany(companyId);

      if (!carbonEmission) {
        return res.status(404).json({
          success: false,
          message: "Carbon emission accounting not found for this company",
        });
      }

      const yearData = carbonEmission.getYearData(yearNum);

      if (!yearData) {
        return res.status(404).json({
          success: false,
          message: `No carbon emission data found for year ${year}`,
        });
      }

      res.json({
        success: true,
        data: yearData,
      });
    } catch (error) {
      this.handleError(res, error, "getCarbonEmissionByCompanyAndYear");
    }
  }

  /**
   * Add yearly data (sequestration and emissions)
   */
  async addYearlyData(req, res) {
    try {
      const { id } = req.params;
      const { year, data } = req.body;

      if (!year || !data) {
        return res.status(400).json({
          success: false,
          message: "Year and data are required",
        });
      }

      const yearlyData = {
        year: parseInt(year),
        ...data,
      };

      const updatedRecord = await carbonEmissionService.addYearlyData(
        id,
        yearlyData,
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: `Yearly data for ${year} added successfully`,
        data: updatedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "addYearlyData");
    }
  }

  /**
   * Update yearly data
   */
  async updateYearlyData(req, res) {
    try {
      const { id, year } = req.params;

      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Update data is required",
        });
      }

      const updatedRecord = await carbonEmissionService.updateYearlyData(
        id,
        parseInt(year),
        req.body,
        req.user.id
      );

      res.json({
        success: true,
        message: `Yearly data for ${year} updated successfully`,
        data: updatedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "updateYearlyData");
    }
  }

  /**
   * Add scope 1 emissions for a specific year
   */
  async addScope1Emissions(req, res) {
    try {
      const { id, year } = req.params;

      if (!req.body || !req.body.sources) {
        return res.status(400).json({
          success: false,
          message: "Scope 1 emissions data with sources is required",
        });
      }

      const updatedRecord = await carbonEmissionService.addScope1Emissions(
        id,
        parseInt(year),
        req.body,
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: `Scope 1 emissions for ${year} added successfully`,
        data: updatedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "addScope1Emissions");
    }
  }

  /**
   * Add scope 2 emissions for a specific year
   */
  async addScope2Emissions(req, res) {
    try {
      const { id, year } = req.params;

      if (!req.body || !req.body.sources) {
        return res.status(400).json({
          success: false,
          message: "Scope 2 emissions data with sources is required",
        });
      }

      const updatedRecord = await carbonEmissionService.addScope2Emissions(
        id,
        parseInt(year),
        req.body,
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: `Scope 2 emissions for ${year} added successfully`,
        data: updatedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "addScope2Emissions");
    }
  }

  /**
   * Add scope 3 emissions for a specific year
   */
  async addScope3Emissions(req, res) {
    try {
      const { id, year } = req.params;

      if (!req.body || !req.body.categories) {
        return res.status(400).json({
          success: false,
          message: "Scope 3 emissions data with categories is required",
        });
      }

      const updatedRecord = await carbonEmissionService.addScope3Emissions(
        id,
        parseInt(year),
        req.body,
        req.user.id
      );

      res.status(201).json({
        success: true,
        message: `Scope 3 emissions for ${year} added successfully`,
        data: updatedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "addScope3Emissions");
    }
  }

  /**
   * Update carbon emission accounting
   */
  async updateCarbonEmission(req, res) {
    try {
      const { id } = req.params;

      if (!req.body || Object.keys(req.body).length === 0) {
        return res.status(400).json({
          success: false,
          message: "Update data is required",
        });
      }

      const updatedRecord = await carbonEmissionService.updateCarbonEmission(
        id,
        req.body,
        req.user.id
      );

      res.json({
        success: true,
        message: "Carbon emission accounting updated successfully",
        data: updatedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "updateCarbonEmission");
    }
  }

  /**
   * Verify carbon emission data
   */
  async verifyCarbonEmission(req, res) {
    try {
      const { id } = req.params;

      const verifiedRecord = await carbonEmissionService.verifyCarbonEmission(
        id,
        req.body,
        req.user.id
      );

      res.json({
        success: true,
        message: "Carbon emission data verified successfully",
        data: verifiedRecord,
      });
    } catch (error) {
      this.handleError(res, error, "verifyCarbonEmission");
    }
  }

  /**
   * Delete carbon emission accounting
   */
  async deleteCarbonEmission(req, res) {
    try {
      const { id } = req.params;

      const result = await carbonEmissionService.deleteCarbonEmission(
        id,
        req.user.id
      );

      res.json({
        success: true,
        message: result.message,
      });
    } catch (error) {
      this.handleError(res, error, "deleteCarbonEmission");
    }
  }

  /**
   * Get carbon emission statistics
   */
  async getCarbonEmissionStats(req, res) {
    try {
      const { companyId } = req.query;

      const stats = await carbonEmissionService.getCarbonEmissionStats(
        companyId
      );

      res.json({
        success: true,
        data: stats,
      });
    } catch (error) {
      this.handleError(res, error, "getCarbonEmissionStats");
    }
  }

  /**
   * Helper method to get file type from extension
   */
  getFileType(extension) {
    const typeMap = {
      csv: "csv",
      xlsx: "excel",
      xls: "excel",
      json: "json",
    };

    return typeMap[extension] || "csv";
  }

  /**
   * Handle errors consistently
   */
  handleError(res, error, methodName) {
    console.error(`CarbonEmissionController.${methodName} error:`, error);

    // Handle specific error types
    if (error.message.includes("not found")) {
      return res.status(404).json({
        success: false,
        message: error.message,
      });
    }

    if (error.message.includes("already exists")) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    if (
      error.message.includes("Validation failed") ||
      error.message.includes("Invalid")
    ) {
      return res.status(400).json({
        success: false,
        message: error.message,
      });
    }

    // Default error response
    res.status(500).json({
      success: false,
      message: "Internal server error",
      error:
        process.env.NODE_ENV === "development"
          ? error.message
          : "An unexpected error occurred",
    });
  }
}

module.exports = new CarbonEmissionController();
