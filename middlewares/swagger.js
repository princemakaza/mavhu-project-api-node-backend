const swaggerJsdoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "MAvHU Project – ESG APIs",
      version: "1.0.0",
      description:
        "APIs for managing companies and their members for ESG (Environmental, Social, and Governance) data collection and reporting. " +
        "This platform allows corporate organisations to register, manage users, and securely access ESG-related services.",
    },
    servers: [
      {
        url: "http://44.223.50.135:8080",
        description: "AWS server",
      },
      {
        url: "https://mavhu-project-api-node-backend.onrender.com",
        description: "Local server",
      },
      {
        url: "http://localhost:8080",
        description: "Local server",
      },
    ],
    components: {
      schemas: {
        User: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "665a8c7be4f1c23b04d12345",
            },

            email: {
              type: "string",
              example: "john@example.com",
            },

            phone: {
              type: "string",
              nullable: true,
              example: "+263771234567",
            },

            // select:false in mongoose -> should NOT be returned by API.
            // If you accept passwords on create/register, document it separately (password),
            // not as password_hash. But to match schema, we keep it writeOnly.
            password_hash: {
              type: "string",
              description: "Hashed password (not returned in API responses)",
              example: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
              writeOnly: true,
            },

            full_name: {
              type: "string",
              example: "John Doe",
            },

            status: {
              type: "string",
              enum: ["pending", "active", "suspended", "deleted"],
              example: "pending",
            },

            email_verified: {
              type: "boolean",
              example: false,
            },

            email_verification_otp: {
              type: "string",
              description:
                "OTP for verifying email (not returned in API responses)",
              example: "123456",
              writeOnly: true,
            },

            email_verification_expires_at: {
              type: "string",
              format: "date-time",
              description: "Expiry time for email verification OTP",
              example: "2025-02-10T08:15:00Z",
              writeOnly: true,
            },

            delete_account_otp: {
              type: "string",
              description:
                "OTP for deleting account (not returned in API responses)",
              example: "654321",
              writeOnly: true,
            },

            delete_account_otp_expires_at: {
              type: "string",
              format: "date-time",
              description: "Expiry time for delete-account OTP",
              example: "2025-02-10T08:15:00Z",
              writeOnly: true,
            },

            reset_password_otp: {
              type: "string",
              description:
                "OTP for resetting password (not returned in API responses)",
              example: "789012",
              writeOnly: true,
            },

            reset_password_expires_at: {
              type: "string",
              format: "date-time",
              description: "Expiry time for reset-password OTP",
              example: "2025-02-10T08:20:00Z",
              writeOnly: true,
            },

            auth_providers: {
              type: "array",
              default: [],
              items: {
                $ref: "#/components/schemas/AuthProvider",
              },
            },

            created_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
            },

            updated_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T10:15:00Z",
            },
          },

          required: [
            "email",
            "full_name",
            "status",
            "email_verified",
            "auth_providers",
          ],
        },
        Company: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "665a8c7be4f1c23b04d12345",
            },

            name: {
              type: "string",
              example: "Tongaat Hulett Zimbabwe Limited",
            },

            registrationNumber: {
              type: "string",
              nullable: true,
              example: "THZ-190055",
            },

            email: {
              type: "string",
              nullable: true,
              example: "info@tongaat.co.zw",
            },

            phone: {
              type: "string",
              nullable: true,
              example: "+263242700111",
            },

            address: {
              type: "string",
              nullable: true,
              example: "Tongaat Hulett House, Cleveland Road, Harare, Zimbabwe",
            },

            website: {
              type: "string",
              nullable: true,
              example: "https://www.tongaat.co.zw",
            },

            country: {
              type: "string",
              nullable: true,
              example: "Zimbabwe",
            },

            industry: {
              type: "string",
              nullable: true,
              example: "Agriculture & Sugar Production",
            },

            description: {
              type: "string",
              nullable: true,
              example:
                "A leading sugar producer in Zimbabwe with extensive sugar cane plantations and milling operations.",
            },

            purpose: {
              type: "string",
              nullable: true,
              example:
                "Environmental, agricultural, and climate-risk monitoring to support ESG reporting.",
            },

            scope: {
              type: "string",
              nullable: true,
              example:
                "Estate-level and regional monitoring focused on Hippo Valley production areas.",
            },

            data_source: {
              type: "array",
              nullable: true,
              items: { type: "string" },
              example: [
                "Sentinel-2 MSI Satellite Imagery",
                "Copernicus Programme (ESA)",
              ],
            },

            /* ✅ UPDATED FIELD */
            area_of_interest_metadata: {
              type: "object",
              nullable: true,
              properties: {
                name: {
                  type: "string",
                  example: "Hippo Valley Production Region",
                },
                area_covered: {
                  type: "string",
                  example:
                    "Approximately 7,800–8,200 hectares of sugarcane estates in the Hippo Valley, Zimbabwe",
                },
                coordinates: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      lat: {
                        type: "number",
                        example: -21.0445339555829,
                      },
                      lon: {
                        type: "number",
                        example: 31.61226252350302,
                      },
                    },
                    required: ["lat", "lon"],
                  },
                },
              },
              example: {
                name: "Hippo Valley Production Region",
                area_covered:
                  "Approximately 7,800–8,200 hectares of sugarcane estates in the Hippo Valley, Zimbabwe",
                coordinates: [
                  { lat: -21.0445339555829, lon: 31.61226252350302 },
                  { lat: -21.04455504096563, lon: 31.61125204294745 },
                ],
              },
            },

            data_range: {
              type: "string",
              nullable: true,
              example: "January 2020 – October 2025",
            },

            data_processing_workflow: {
              type: "string",
              nullable: true,
              example:
                "Sentinel-2 Level-2A ingestion → AOI filtering → Cloud masking → Monthly compositing → Index calculation",
            },

            analytical_layer_metadata: {
              type: "string",
              nullable: true,
              example:
                "NDVI, NDWI, NDBI, SAVI, MSAVI, GNDVI derived monthly at 10m spatial resolution",
            },

            esg_reporting_framework: {
              type: "array",
              nullable: true,
              items: {
                type: "string",
                enum: ["GRI", "SASB", "TCFD", "UNSDG", "CDP", "custom", "none"],
              },
              example: ["TCFD", "UNSDG"],
            },

            esg_contact_person: {
              type: "object",
              nullable: true,
              properties: {
                name: {
                  type: "string",
                  example: "ESG & Sustainability Office",
                },
                email: { type: "string", example: "info@tongaat.co.zw" },
                phone: { type: "string", example: "+263242700111" },
              },
            },

            latest_esg_report_year: {
              type: "integer",
              nullable: true,
              example: 2025,
            },

            esg_data_status: {
              type: "string",
              enum: ["not_collected", "partial", "complete", "verified"],
              default: "not_collected",
              example: "partial",
            },

            has_esg_linked_pay: {
              type: "boolean",
              default: false,
              example: false,
            },

            created_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
            },

            updated_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-12T14:30:00Z",
            },
          },

          required: ["name"],
        },
        Member: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "665a8c7be4f1c23b04d12345",
            },

            company: {
              type: "string",
              description: "Company ID",
              example: "665a8c7be4f1c23b04d99999",
            },

            firstName: {
              type: "string",
              example: "John",
            },

            lastName: {
              type: "string",
              example: "Doe",
            },

            email: {
              type: "string",
              example: "john@example.com",
              description: "Unique member email",
            },

            title: {
              type: "string",
              nullable: true,
              example: "Operations Manager",
            },

            role: {
              type: "string",
              enum: ["admin", "member"],
              example: "member",
            },

            department: {
              type: "string",
              nullable: true,
              example: "Operations",
            },

            phone: {
              type: "string",
              nullable: true,
              example: "+263771234567",
            },

            password_hash: {
              type: "string",
              description: "Hashed password (not returned in API responses)",
              example: "$2a$10$abcdefghijklmnopqrstuvwxyz0123456789ABCDE",
              writeOnly: true,
            },

            status: {
              type: "string",
              enum: ["active", "inactive"],
              example: "active",
            },

            joinedAt: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
            },
          },

          required: [
            "company",
            "firstName",
            "lastName",
            "email",
            "role",
            "status",
          ],
        },
        CarbonEmissionAccounting: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d0e",
              description:
                "Unique identifier for carbon emission accounting record",
            },
            company: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
              description:
                "Reference to the Company this carbon data belongs to",
            },

            // Emission References
            emission_references: {
              type: "object",
              properties: {
                methodology_statement: {
                  type: "string",
                  example:
                    "In developing MAvHU's ESG Framework, all carbon sequestration and GHG emission calculations are grounded in internationally recognized methodologies...",
                  description: "Methodology description from reference data",
                },
                emission_factors: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/EmissionReference",
                  },
                },
                global_warming_potentials: {
                  type: "object",
                  properties: {
                    n2o_gwp: {
                      type: "number",
                      example: 298,
                      description:
                        "Global Warming Potential for N₂O (IPCC AR5)",
                    },
                    ch4_gwp: {
                      type: "number",
                      example: 28,
                      description:
                        "Global Warming Potential for CH₄ (IPCC AR5)",
                    },
                    source: {
                      type: "string",
                      example: "IPCC AR5",
                      description: "Source of GWP values",
                    },
                  },
                },
                conversion_factors: {
                  type: "object",
                  properties: {
                    n2o_n_to_n2o: {
                      type: "number",
                      example: 1.5714285714,
                      description:
                        "Conversion factor from N₂O-N to N₂O (44/28)",
                    },
                    carbon_to_co2: {
                      type: "number",
                      example: 3.6666666667,
                      description:
                        "Conversion factor from carbon to CO₂ (44/12)",
                    },
                    carbon_fraction: {
                      type: "number",
                      example: 0.47,
                      description: "IPCC default carbon fraction for biomass",
                    },
                  },
                },
              },
            },

            // Yearly Data
            yearly_data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/YearlyCarbonData",
              },
            },

            // Summary
            summary: {
              type: "object",
              properties: {
                total_reporting_area_ha: {
                  type: "number",
                  example: 10916,
                  description: "Total reporting area in hectares",
                },
                average_sequestration_tco2_per_year: {
                  type: "number",
                  example: -1430866.045,
                  description: "Average annual carbon sequestration in tCO₂",
                },
                average_emissions_tco2e_per_year: {
                  type: "number",
                  example: 703163.45575,
                  description: "Average annual emissions in tCO₂e",
                },
                net_carbon_balance_tco2e: {
                  type: "number",
                  example: 3030299.9113,
                  description:
                    "Cumulative net carbon balance (emissions - sequestration)",
                },
                carbon_intensity_tco2e_per_ha: {
                  type: "number",
                  example: 65.56,
                  description: "Carbon intensity per hectare",
                },
                baseline_year: {
                  type: "integer",
                  example: 2022,
                  description: "Baseline year for calculations",
                },
                current_year: {
                  type: "integer",
                  example: 2023,
                  description: "Most recent year of data",
                },
              },
            },

            // Framework
            framework: {
              type: "object",
              properties: {
                sequestration_methodology: {
                  type: "string",
                  example:
                    "IPCC 2006 Guidelines and 2019 Refinement for AFOLU sector",
                  description:
                    "Methodology used for sequestration calculations",
                },
                emission_methodology: {
                  type: "string",
                  example: "Greenhouse Gas Protocol Corporate Standard",
                  description: "Methodology used for emission calculations",
                },
                data_sources: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: {
                        type: "string",
                        example: "Sentinel-2 Satellite Imagery",
                      },
                      type: {
                        type: "string",
                        enum: [
                          "satellite",
                          "ground_measurement",
                          "model",
                          "database",
                        ],
                        example: "satellite",
                      },
                      description: {
                        type: "string",
                        example:
                          "NDVI and biomass estimation from ESA Copernicus Sentinel-2",
                      },
                    },
                  },
                },
                calculation_approach: {
                  type: "string",
                  example: "activity-data × emission-factor approach",
                  description: "Primary calculation approach",
                },
              },
            },

            // Data Management
            data_management: {
              type: "object",
              properties: {
                import_history: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      file_name: {
                        type: "string",
                        example:
                          "Carbon emission accounting - 2022 sequestration.csv",
                      },
                      file_type: {
                        type: "string",
                        enum: ["csv", "excel", "json"],
                        example: "csv",
                      },
                      import_date: {
                        type: "string",
                        format: "date-time",
                        example: "2024-01-15T10:30:00.000Z",
                      },
                      records_added: { type: "number", example: 12 },
                      records_updated: { type: "number", example: 0 },
                      imported_by: {
                        type: "string",
                        example: "507f1f77bcf86cd799439012",
                        description: "User ID who performed the import",
                      },
                    },
                  },
                },
                last_calculated_at: {
                  type: "string",
                  format: "date-time",
                  example: "2024-01-15T10:30:00.000Z",
                },
                calculation_version: {
                  type: "string",
                  example: "1.0.0",
                  description: "Version of calculation methodology",
                },
                validation_status: {
                  type: "string",
                  enum: ["not_validated", "validating", "validated", "errors"],
                  example: "validated",
                },
              },
            },

            // Audit Trail
            created_at: {
              type: "string",
              format: "date-time",
              example: "2024-01-15T10:30:00.000Z",
            },
            created_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who created the record",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2024-01-15T10:30:00.000Z",
            },
            last_updated_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who last updated the record",
            },

            // Status
            status: {
              type: "string",
              enum: [
                "draft",
                "under_review",
                "approved",
                "published",
                "archived",
              ],
              example: "approved",
              description:
                "Current status of the carbon emission accounting record",
            },
            is_active: {
              type: "boolean",
              example: true,
              description: "Whether the record is active or soft-deleted",
            },
          },

          required: ["company", "created_by"],
          description:
            "Carbon Emission Accounting model containing all carbon sequestration and emission data",
        },

        EmissionReference: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d0f",
            },
            source: {
              type: "string",
              example: "Direct N₂O from fertiliser (cropland)",
              description: "Emission source description",
            },
            activity_data: {
              type: "string",
              example: "kg N applied",
              description: "Unit of activity data",
            },
            default_ef_start: {
              type: "string",
              example: "0.01 kg N₂O-N / kg N applied (Tier-1)",
              description: "Default emission factor description",
            },
            notes_source: {
              type: "string",
              example:
                "IPCC 2006 Chap 11. Convert N₂O-N→N₂O by ×44/28. (ipcc-nggip.iges.or.jp)",
              description: "Reference source and notes",
            },
            emission_factor_code: {
              type: "string",
              example: "EF_direct_N₂O_per_N",
              description: "Code for referencing emission factor",
            },
            emission_factor_value: {
              type: "number",
              example: 0.01,
              description: "Numeric value of emission factor",
            },
            emission_factor_unit: {
              type: "string",
              example: "kg N₂O-N per kg N",
              description: "Unit of emission factor",
            },
            gwp_value: {
              type: "number",
              example: 298,
              description: "Global Warming Potential value",
            },
            gwp_source: {
              type: "string",
              example: "IPCC AR5",
              description: "Source of GWP value",
            },
            conversion_factor: {
              type: "number",
              example: 1.5714285714,
              description: "Conversion factor if applicable",
            },
            is_active: {
              type: "boolean",
              example: true,
            },
            created_at: {
              type: "string",
              format: "date-time",
              example: "2024-01-15T10:30:00.000Z",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2024-01-15T10:30:00.000Z",
            },
          },
        },
        BiodiversityLandUse: {
          type: "object",
          description:
            "Biodiversity and Land Use data model containing all conservation, agricultural, species, and habitat metrics organized by category",
          required: ["company", "created_by"],
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d0e",
              description:
                "Unique identifier for the biodiversity and land use record",
            },
            company: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
              description:
                "Reference to the Company this biodiversity data belongs to",
            },

            // Data Coverage Period
            data_period_start: {
              type: "string",
              example: "FY22",
              description:
                "Start of the data coverage period (e.g. 'FY22' or '31.03.2022')",
            },
            data_period_end: {
              type: "string",
              example: "FY25",
              description:
                "End of the data coverage period (e.g. 'FY25' or '31.03.2025')",
            },

            // Source Information
            original_source: {
              type: "string",
              example: "HVE Integrated Report 2025",
              description: "Human-readable name of the original data source",
            },
            source_files: {
              type: "array",
              description:
                "List of source documents from which data was extracted",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    example: "HVE Integrated Report 2025",
                  },
                  year: {
                    type: "string",
                    example: "2025",
                  },
                  pages: {
                    type: "string",
                    example: "p.15, p.44, p.120",
                  },
                  type: {
                    type: "string",
                    enum: [
                      "annual_report",
                      "integrated_report",
                      "sustainability_report",
                      "other",
                    ],
                    example: "integrated_report",
                  },
                },
              },
            },

            // Import Tracking
            import_source: {
              type: "string",
              enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
              example: "json",
              description: "Method or format through which data was imported",
            },
            source_file_name: {
              type: "string",
              example: "HVE_Biodiversity_Land_Use_Data.csv",
              description: "Name of the source file used in the import",
            },
            source_file_metadata: {
              type: "object",
              description:
                "Arbitrary metadata attached to the source file (free-form)",
              example: { sheet: "Biodiversity & Land Use Data", rows: 74 },
            },
            import_batch_id: {
              type: "string",
              example: "json_import_1716000000000_a1b2c3d4e",
              description: "Unique batch identifier generated at import time",
            },
            import_date: {
              type: "string",
              format: "date-time",
              example: "2025-05-18T08:00:00.000Z",
              description: "Timestamp when data was imported",
            },
            import_notes: {
              type: "string",
              example:
                "Converted from HVE Biodiversity & Land Use CSV. Annual Reports 2022–2025.",
              description: "Free-text notes recorded at import time",
            },

            // Data Quality & Verification
            data_quality_score: {
              type: "number",
              minimum: 0,
              maximum: 100,
              nullable: true,
              example: 85,
              description:
                "Quality score from 0–100 assigned to this data record",
            },
            verification_status: {
              type: "string",
              enum: [
                "unverified",
                "pending_review",
                "verified",
                "audited",
                "disputed",
              ],
              example: "unverified",
              description: "Current verification state of the record",
            },
            verified_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID of the person who verified the record",
            },
            verified_at: {
              type: "string",
              format: "date-time",
              example: "2025-05-20T09:00:00.000Z",
              description: "Timestamp when the record was verified",
            },
            verification_notes: {
              type: "string",
              example: "Cross-checked against published integrated report PDF.",
              description: "Notes left by the verifier",
            },

            // Data Validation
            validation_status: {
              type: "string",
              enum: [
                "not_validated",
                "validating",
                "validated",
                "failed_validation",
              ],
              example: "not_validated",
              description: "Current state of automated data validation",
            },
            validation_errors: {
              type: "array",
              description: "List of validation errors found during processing",
              items: {
                type: "object",
                properties: {
                  metric_name: {
                    type: "string",
                    example: "Area Under Cane",
                  },
                  year: {
                    type: "string",
                    example: "FY25",
                  },
                  error_message: {
                    type: "string",
                    example:
                      "Numeric value could not be parsed from source string",
                  },
                  field: {
                    type: "string",
                    example: "numeric_value",
                  },
                  severity: {
                    type: "string",
                    enum: ["warning", "error", "critical"],
                    example: "warning",
                  },
                },
              },
            },
            validation_notes: {
              type: "string",
              example: "Minor unit inconsistency in LPG rows — kg vs tonnes.",
              description: "Free-text notes on overall validation outcome",
            },

            // Metrics
            metrics: {
              type: "array",
              description:
                "All biodiversity and land use metrics organised by category",
              items: {
                $ref: "#/components/schemas/BiodiversityMetric",
              },
            },

            // Summary Statistics
            summary_stats: {
              type: "object",
              description:
                "Auto-calculated or manually set aggregate figures across all metrics",
              properties: {
                total_conservation_area: {
                  type: "number",
                  example: 14158,
                  description:
                    "Total conservation/protected habitat area in hectares",
                },
                total_agricultural_area: {
                  type: "number",
                  example: 10636,
                  description: "Total agricultural land area in hectares",
                },
                total_surveyed_area: {
                  type: "number",
                  example: 17644,
                  description: "Total formally surveyed land area in hectares",
                },
                total_trees_planted: {
                  type: "number",
                  example: 22200,
                  description: "Cumulative or latest-year trees planted",
                },
                total_lpg_distributed: {
                  type: "number",
                  example: 141408,
                  description:
                    "Total LPG distributed in kg (latest reporting year)",
                },
                flora_species_count: {
                  type: "number",
                  example: 130,
                  description: "Total number of recorded plant species",
                },
                fauna_species_count: {
                  type: "number",
                  example: 124,
                  description:
                    "Total number of recorded animal species (mammals + birds + fish etc.)",
                },
                last_updated: {
                  type: "string",
                  format: "date-time",
                  example: "2025-05-18T08:00:00.000Z",
                  description:
                    "Timestamp when summary stats were last recalculated",
                },
              },
            },

            // GRI References
            gri_references: {
              type: "array",
              description:
                "GRI Standards compliance tracking entries linked to specific metrics",
              items: {
                type: "object",
                properties: {
                  standard: {
                    type: "string",
                    example: "GRI 304-4",
                    description:
                      "GRI standard identifier (e.g. 'GRI 304-4', 'GRI 101-7')",
                  },
                  metric_name: {
                    type: "string",
                    example: "Flora and Fauna Species Data",
                    description:
                      "Name of the metric this GRI reference applies to",
                  },
                  compliance_status: {
                    type: "string",
                    enum: [
                      "compliant",
                      "partially_compliant",
                      "non_compliant",
                      "not_applicable",
                    ],
                    example: "partially_compliant",
                  },
                  reporting_year: {
                    type: "string",
                    example: "FY25",
                  },
                },
              },
            },

            // Audit Trail
            created_at: {
              type: "string",
              format: "date-time",
              example: "2025-05-18T08:00:00.000Z",
            },
            created_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who created the record",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2025-05-18T08:00:00.000Z",
            },
            last_updated_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who last updated the record",
            },

            // Versioning
            version: {
              type: "number",
              example: 1,
              description:
                "Incremental version number; increases on each import/update cycle",
            },
            previous_version: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d0d",
              description:
                "Reference to the prior version of this record (if any)",
            },

            // Soft Delete
            is_active: {
              type: "boolean",
              example: true,
              description: "False when the record has been soft-deleted",
            },
            deleted_at: {
              type: "string",
              format: "date-time",
              example: "2025-06-01T12:00:00.000Z",
              description: "Timestamp of soft deletion (null when active)",
            },
            deleted_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who soft-deleted the record",
            },
          },
        },

        // ─── Sub-schemas ──────────────────────────────────────────────────────────────

        BiodiversityMetric: {
          type: "object",
          description:
            "A single biodiversity or land use metric, grouped by category",
          required: ["category", "metric_name", "created_by"],
          properties: {
            category: {
              type: "string",
              enum: [
                "agricultural_land",
                "conservation_protected_habitat",
                "land_tenure",
                "restoration_deforestation",
                "fuelwood_substitution",
                "biodiversity_flora",
                "biodiversity_fauna",
                "human_wildlife_conflict",
                "summary",
              ],
              example: "agricultural_land",
              description: "Top-level category this metric belongs to",
            },
            subcategory: {
              type: "string",
              example: "cane",
              description:
                "Optional subcategory (e.g. 'cane', 'orchards', 'mammals', 'birds')",
            },
            metric_name: {
              type: "string",
              example: "Area Under Cane",
              description: "Human-readable name of the metric",
            },
            description: {
              type: "string",
              example:
                "Annual trend of area under sugarcane cultivation in hectares",
            },
            data_type: {
              type: "string",
              enum: ["yearly_series", "single_value", "list", "summary"],
              example: "yearly_series",
              description:
                "Determines which data field is populated for this metric",
            },
            yearly_data: {
              type: "array",
              description:
                "Time-series data points — populated when data_type is 'yearly_series'",
              items: {
                $ref: "#/components/schemas/YearlyBiodiversityData",
              },
            },
            single_value: {
              type: "object",
              description:
                "Single point-in-time value — populated when data_type is 'single_value'",
              properties: {
                value: {
                  example: "16,802 ha",
                  description: "Raw value (string or number)",
                },
                numeric_value: {
                  type: "number",
                  example: 16802,
                },
                unit: {
                  type: "string",
                  example: "ha",
                },
                source: {
                  type: "string",
                  example: "Annual Report 2024, PDF p.45",
                },
                notes: {
                  type: "string",
                  example: "Approximately 95% of total surveyed area",
                },
                as_of_date: {
                  type: "string",
                  format: "date-time",
                  example: "2024-03-31T00:00:00.000Z",
                },
                added_by: {
                  type: "string",
                  example: "507f1f77bcf86cd799439012",
                },
                added_at: {
                  type: "string",
                  format: "date-time",
                  example: "2025-05-18T08:00:00.000Z",
                },
              },
            },
            list_data: {
              type: "array",
              description:
                "Inventory-style list — populated when data_type is 'list'",
              items: {
                type: "object",
                properties: {
                  item: {
                    type: "string",
                    example: "Plant species recorded",
                  },
                  count: {
                    type: "number",
                    example: 130,
                  },
                  details: {
                    type: "string",
                    example: "Includes Mopane woodland and others",
                  },
                  source: {
                    type: "string",
                    example: "Annual Report 2023, PDF p.15",
                  },
                  added_at: {
                    type: "string",
                    format: "date-time",
                    example: "2025-05-18T08:00:00.000Z",
                  },
                },
              },
            },
            summary_value: {
              type: "object",
              description:
                "Summary / KPI snapshot — populated when data_type is 'summary'",
              properties: {
                key_metric: {
                  type: "string",
                  example: "Area under cane",
                },
                latest_value: {
                  example: "10,625 ha (FY25)",
                  description: "Latest known value (string or number)",
                },
                trend: {
                  type: "string",
                  example: "↓ from 10,916 ha (FY22)",
                },
                notes: {
                  type: "string",
                  example: "Slight decline over four-year reporting period",
                },
                as_of_date: {
                  type: "string",
                  format: "date-time",
                  example: "2025-03-31T00:00:00.000Z",
                },
              },
            },
            is_active: {
              type: "boolean",
              example: true,
            },
            created_at: {
              type: "string",
              format: "date-time",
              example: "2025-05-18T08:00:00.000Z",
            },
            created_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who created this metric entry",
            },
          },
        },

        YearlyBiodiversityData: {
          type: "object",
          description:
            "A single year's data point within a yearly_series biodiversity metric",
          required: ["year", "source", "added_by"],
          properties: {
            year: {
              type: "string",
              example: "31.03.2025 (FY25)",
              description: "Year label as it appears in the source document",
            },
            fiscal_year: {
              type: "number",
              example: 2025,
              description: "Numeric fiscal year extracted from the year label",
            },
            value: {
              example: 10625,
              description:
                "Raw value — may be a string, number, or nested object",
            },
            numeric_value: {
              type: "number",
              example: 10625,
              description: "Numeric representation of value (if parseable)",
            },
            unit: {
              type: "string",
              example: "ha",
              description:
                "Unit of measurement (e.g. 'ha', 'kg', 'trees', 'km')",
            },
            source: {
              type: "string",
              example: "HVE Integrated Report 2025, PDF p.120",
              description: "Original source citation for this data point",
            },
            notes: {
              type: "string",
              example: "FY26 target: 30,000 trees",
              description: "Additional context or caveats",
            },
            added_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who added this data point",
            },
            added_at: {
              type: "string",
              format: "date-time",
              example: "2025-05-18T08:00:00.000Z",
            },
            last_updated_by: {
              type: "string",
              example: "507f1f77bcf86cd799439012",
              description: "User ID who last updated this data point",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2025-05-18T08:00:00.000Z",
            },
          },
        },

        SequestrationMonthly: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d13",
            },
            month: {
              type: "string",
              example: "Jan",
              description: "Month name",
            },
            month_number: {
              type: "integer",
              example: 1,
              description: "Month number (1-12)",
            },
            year: {
              type: "integer",
              example: 2024,
              description: "Year of data",
            },
            ndvi_max: {
              type: "number",
              example: 0.712928414,
              description: "Maximum NDVI value for the month",
            },
            agb_t_per_ha: {
              type: "number",
              example: 22.5041,
              description: "Above Ground Biomass (t/ha)",
            },
            bgb_t_per_ha: {
              type: "number",
              example: 5.401,
              description: "Below Ground Biomass (t/ha)",
            },
            biomass_c_t_per_ha: {
              type: "number",
              example: 13.1154,
              description: "Biomass Carbon (tC/ha)",
            },
            biomass_co2_t_per_ha: {
              type: "number",
              example: 48.1335,
              description: "Biomass CO₂ (tCO₂/ha)",
            },
            biomass_co2_total_t: {
              type: "number",
              example: 516424,
              description: "Total Biomass CO₂ for reporting area (tCO₂)",
            },
            delta_biomass_co2_t: {
              type: "number",
              example: -2402,
              description: "Change in biomass CO₂ from baseline",
            },
            soc_tc_per_ha: {
              type: "number",
              example: 57.6191,
              description: "Soil Organic Carbon (tC/ha)",
            },
            soc_co2_t_per_ha: {
              type: "number",
              example: 211.46,
              description: "SOC CO₂ (tCO₂/ha)",
            },
            soc_co2_total_t: {
              type: "number",
              example: 2268776.24,
              description: "Total SOC CO₂ for SOC area (tCO₂)",
            },
            delta_soc_co2_t: {
              type: "number",
              example: -5153.074,
              description: "Change in SOC CO₂ from baseline",
            },
            net_co2_stock_t: {
              type: "number",
              example: 2785200.66,
              description: "Net CO₂ Stock (tCO₂)",
            },
            net_co2_change_t: {
              type: "number",
              example: -7555.324,
              description: "Net CO₂ change from baseline",
            },
            meaning: {
              type: "string",
              example: "Baseline",
              description: "Interpretation of the data",
            },
            reporting_area_ha: {
              type: "number",
              example: 10729,
              description: "Reporting area in hectares",
            },
            soc_area_ha: {
              type: "number",
              example: 10729,
              description: "SOC calculation area in hectares",
            },
            is_baseline: {
              type: "boolean",
              example: true,
              description: "Whether this is the baseline month",
            },
          },
        },

        SequestrationMethodology: {
          type: "object",
          properties: {
            component: {
              type: "string",
              example: "Satellite Vegetation Index",
              description: "Component of methodology",
            },
            method_applied: {
              type: "string",
              example:
                "NDVI = (NIR − Red)/(NIR + Red) using Sentinel-2 Bands 8 & 4",
              description: "Method applied",
            },
            standard_source: {
              type: "string",
              example: "ESA Copernicus / NASA Remote Sensing Standards",
              description: "Standard or source of methodology",
            },
            purpose: {
              type: "string",
              example: "Vegetation greenness measurement",
              description: "Purpose of the methodology",
            },
          },
        },

        Scope1Emission: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d17",
            },
            source: {
              type: "string",
              example: "Synthetic fertiliser",
              description: "Emission source",
            },
            parameter: {
              type: "string",
              example: "N applied",
              description: "Parameter measured",
            },
            unit: {
              type: "string",
              example: "kg N/ha/yr",
              description: "Unit of measurement",
            },
            annual_per_ha: {
              type: "number",
              example: 1450,
              description: "Annual activity per hectare",
            },
            emission_factor: {
              type: "string",
              example: "EFₙ₂ₒ = 0.01 kg N₂O-N/kg N",
              description: "Emission factor description",
            },
            ef_number: {
              type: "number",
              example: 0.01,
              description: "Numeric emission factor",
            },
            gwp: {
              type: "number",
              example: 265,
              description: "Global Warming Potential",
            },
            tco2e_per_ha_per_year: {
              type: "number",
              example: 6.038214286,
              description: "tCO₂e per hectare per year",
            },
            methodological_justification: {
              type: "string",
              example:
                "IPCC Tier 1 assumes 1% of applied N is emitted as N₂O-N. Conversion from N₂O-N to N₂O uses molecular weight ratio (44/28). GWP per IPCC AR5.",
              description: "Methodological justification",
            },
            reference: {
              type: "string",
              example:
                "IPCC 2006 Vol.4 Ch.11 Eq.11.1; IPCC 2019 Refinement. https://www.ipcc-nggip.iges.or.jp/public/2006gl/vol4.html",
              description: "Reference source",
            },
            calculation_notes: {
              type: "string",
              example:
                "Emission factors are commonly expressed in kilograms of gas or kilograms of CO₂-equivalent per unit of activity...",
              description: "Additional calculation notes",
            },
            is_active: {
              type: "boolean",
              example: true,
            },
          },
        },

        Scope2Emission: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d19",
            },
            source: {
              type: "string",
              example: "Electricity purchased",
              description: "Emission source",
            },
            parameter: {
              type: "string",
              example: "Electricity consumption",
              description: "Parameter measured",
            },
            unit: {
              type: "string",
              example: "kWh/ha/yr",
              description: "Unit of measurement",
            },
            annual_activity_per_ha: {
              type: "number",
              example: 4500,
              description: "Annual activity per hectare",
            },
            emission_factor: {
              type: "string",
              example: "Grid EF (kg CO₂e/kWh)",
              description: "Emission factor description",
            },
            ef_number: {
              type: "number",
              example: 0.82,
              description: "Numeric emission factor",
            },
            tco2e_per_ha_per_year: {
              type: "number",
              example: 3.69,
              description: "tCO₂e per hectare per year",
            },
            methodological_justification: {
              type: "string",
              example:
                "Location-based Scope 2 method required by GHG Protocol when supplier-specific factors or RECs are unavailable.",
              description: "Methodological justification",
            },
            reference: {
              type: "string",
              example:
                "GHG Protocol Scope 2 Guidance (2015). https://ghgprotocol.org/scope-2-guidance",
              description: "Reference source",
            },
            calculation_notes: {
              type: "string",
              example: null,
              description: "Additional calculation notes",
            },
            is_active: {
              type: "boolean",
              example: true,
            },
          },
        },

        Scope3Emission: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d1a",
            },
            category: {
              type: "string",
              example: "Purchased goods",
              description: "Scope 3 category",
            },
            parameter: {
              type: "string",
              example: "Fertiliser production",
              description: "Parameter measured",
            },
            unit: {
              type: "string",
              example: "kg N/ha/yr",
              description: "Unit of measurement",
            },
            annual_activity_per_ha: {
              type: "number",
              example: 1450,
              description: "Annual activity per hectare",
            },
            emission_factor: {
              type: "string",
              example: "6.6 kg CO₂e/kg N",
              description: "Emission factor description",
            },
            ef_number: {
              type: "number",
              example: 6.6,
              description: "Numeric emission factor",
            },
            tco2e_per_ha_per_year: {
              type: "number",
              example: 9.57,
              description: "tCO₂e per hectare per year",
            },
            methodological_justification: {
              type: "string",
              example:
                "Cradle-to-gate fertiliser production emissions from LCA databases.",
              description: "Methodological justification",
            },
            reference: {
              type: "string",
              example: "ecoinvent v3; FAO (2017); GHG Protocol Scope 3 Cat.1.",
              description: "Reference source",
            },
            calculation_notes: {
              type: "string",
              example: null,
              description: "Additional calculation notes",
            },
            is_active: {
              type: "boolean",
              example: true,
            },
          },
        },

        YearlyCarbonData: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "652a1b2c3d4e5f6a7b8c9d12",
            },
            year: {
              type: "integer",
              example: 2024,
              description: "Year of data",
            },

            // Sequestration
            sequestration: {
              type: "object",
              properties: {
                reporting_area_ha: {
                  type: "number",
                  example: 10729,
                  description: "Reporting area for biomass calculations",
                },
                soc_area_ha: {
                  type: "number",
                  example: 10729,
                  description: "Area for SOC calculations",
                },
                monthly_data: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/SequestrationMonthly",
                  },
                },
                methodologies: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/SequestrationMethodology",
                  },
                },
                annual_summary: {
                  type: "object",
                  properties: {
                    total_biomass_co2_t: {
                      type: "number",
                      example: 5214678,
                      description: "Total annual biomass CO₂",
                    },
                    total_soc_co2_t: {
                      type: "number",
                      example: 22458765.4,
                      description: "Total annual SOC CO₂",
                    },
                    net_co2_stock_t: {
                      type: "number",
                      example: 27673443.4,
                      description: "Net CO₂ stock",
                    },
                    net_co2_change_t: {
                      type: "number",
                      example: -137581.02,
                      description: "Net CO₂ change from baseline",
                    },
                    sequestration_total_tco2: {
                      type: "number",
                      example: -137581.02,
                      description:
                        "Total sequestration (negative = sequestration)",
                    },
                  },
                },
              },
            },

            // Emissions
            emissions: {
              type: "object",
              properties: {
                scope1: {
                  type: "object",
                  properties: {
                    sources: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Scope1Emission",
                      },
                    },
                    total_tco2e_per_ha: {
                      type: "number",
                      example: 7.900704286,
                      description: "Total Scope 1 emissions per hectare",
                    },
                    total_tco2e: {
                      type: "number",
                      example: 84725.44,
                      description: "Total Scope 1 emissions",
                    },
                  },
                },
                scope2: {
                  type: "object",
                  properties: {
                    sources: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Scope2Emission",
                      },
                    },
                    total_tco2e_per_ha: {
                      type: "number",
                      example: 3.69,
                      description: "Total Scope 2 emissions per hectare",
                    },
                    total_tco2e: {
                      type: "number",
                      example: 39582.01,
                      description: "Total Scope 2 emissions",
                    },
                  },
                },
                scope3: {
                  type: "object",
                  properties: {
                    categories: {
                      type: "array",
                      items: {
                        $ref: "#/components/schemas/Scope3Emission",
                      },
                    },
                    total_tco2e_per_ha: {
                      type: "number",
                      example: 53.381664,
                      description: "Total Scope 3 emissions per hectare",
                    },
                    total_tco2e: {
                      type: "number",
                      example: 572780.09,
                      description: "Total Scope 3 emissions",
                    },
                  },
                },
                total_scope_emission_tco2e_per_ha: {
                  type: "number",
                  example: 64.97236829,
                  description: "Total emissions per hectare (Scope 1+2+3)",
                },
                total_scope_emission_tco2e: {
                  type: "number",
                  example: 697088.5393,
                  description: "Total emissions (Scope 1+2+3)",
                },
                net_total_emission_tco2e: {
                  type: "number",
                  example: 834669.5393,
                  description:
                    "Net total emissions (emissions - sequestration)",
                },
              },
            },

            // Data Quality
            data_quality: {
              type: "object",
              properties: {
                completeness_score: {
                  type: "number",
                  minimum: 0,
                  maximum: 100,
                  example: 95,
                  description: "Data completeness score",
                },
                verification_status: {
                  type: "string",
                  enum: ["unverified", "pending", "verified", "audited"],
                  example: "verified",
                  description: "Verification status",
                },
                verified_by: {
                  type: "string",
                  example: "507f1f77bcf86cd799439013",
                  description: "User ID who verified the data",
                },
                verified_at: {
                  type: "string",
                  format: "date-time",
                  example: "2024-01-20T14:30:00.000Z",
                  description: "Timestamp of verification",
                },
                verification_notes: {
                  type: "string",
                  example: "Data verified against source files and methodology",
                  description: "Notes about verification",
                },
              },
            },

            // Metadata
            source_file: {
              type: "string",
              example: "Carbon emission accounting - 2023 Sequestration.csv",
              description: "Source file name",
            },
            imported_at: {
              type: "string",
              format: "date-time",
              example: "2024-01-15T10:30:00.000Z",
              description: "Timestamp of import",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2024-01-15T10:30:00.000Z",
              description: "Timestamp of last update",
            },
          },
        },

        // Request/Response schemas
        CarbonEmissionCreateRequest: {
          type: "object",
          required: ["company"],
          properties: {
            company: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            emission_references: {
              type: "object",
              properties: {
                methodology_statement: { type: "string" },
                emission_factors: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/EmissionReference",
                  },
                },
              },
            },
            yearly_data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/YearlyCarbonData",
              },
            },
            status: {
              type: "string",
              enum: [
                "draft",
                "under_review",
                "approved",
                "published",
                "archived",
              ],
              example: "draft",
            },
          },
        },

        YearlyDataAddRequest: {
          type: "object",
          required: ["year", "data"],
          properties: {
            year: {
              type: "integer",
              example: 2024,
            },
            data: {
              $ref: "#/components/schemas/YearlyCarbonData",
            },
          },
        },

        Scope1EmissionsRequest: {
          type: "object",
          required: ["sources"],
          properties: {
            sources: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Scope1Emission",
              },
            },
            total_tco2e_per_ha: {
              type: "number",
              example: 7.900704286,
            },
            total_tco2e: {
              type: "number",
              example: 86229.98,
            },
          },
        },

        Scope2EmissionsRequest: {
          type: "object",
          required: ["sources"],
          properties: {
            sources: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Scope2Emission",
              },
            },
            total_tco2e_per_ha: {
              type: "number",
              example: 3.69,
            },
            total_tco2e: {
              type: "number",
              example: 40280.4,
            },
          },
        },

        Scope3EmissionsRequest: {
          type: "object",
          required: ["categories"],
          properties: {
            categories: {
              type: "array",
              items: {
                $ref: "#/components/schemas/Scope3Emission",
              },
            },
            total_tco2e_per_ha: {
              type: "number",
              example: 53.381664,
            },
            total_tco2e: {
              type: "number",
              example: 582728.94,
            },
          },
        },

        FileUploadRequest: {
          type: "object",
          required: ["file", "companyId"],
          properties: {
            file: {
              type: "string",
              format: "binary",
              description:
                "CSV, Excel, or JSON file containing carbon emission data",
            },
            companyId: {
              type: "string",
              example: "507f1f77bcf86cd799439011",
            },
            year: {
              type: "integer",
              example: 2024,
              description: "Year the data belongs to",
            },
            importNotes: {
              type: "string",
              example: "Uploaded from annual sustainability report",
            },
          },
        },

        VerificationRequest: {
          type: "object",
          properties: {
            status: {
              type: "string",
              enum: [
                "draft",
                "under_review",
                "approved",
                "published",
                "archived",
              ],
              example: "approved",
            },
            validation_status: {
              type: "string",
              enum: ["not_validated", "validating", "validated", "errors"],
              example: "validated",
            },
            data_quality_score: {
              type: "number",
              minimum: 0,
              maximum: 100,
              example: 95,
            },
            verification_notes: {
              type: "string",
              example: "Data verified by sustainability team",
            },
          },
        },

        EnergyConsumptionData: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "665b9c9fe4f1c23b04d67890",
            },

            company: {
              type: "string",
              description: "Company ID reference",
              example: "665a8c7be4f1c23b04d12345",
            },

            // -----------------------
            // Data Coverage Period
            // -----------------------
            data_period_start: {
              type: "string",
              nullable: true,
              example: "2022",
            },
            data_period_end: {
              type: "string",
              nullable: true,
              example: "2025",
            },

            // -----------------------
            // Original Source Information
            // -----------------------
            original_source: {
              type: "string",
              nullable: true,
              example: "HVE Integrated Report 2025",
            },
            source_files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    example: "Sustainability_Report_2024.pdf",
                  },
                  year: {
                    type: "string",
                    example: "2024",
                  },
                  pages: {
                    type: "string",
                    example: "45-48",
                  },
                  type: {
                    type: "string",
                    enum: [
                      "annual_report",
                      "integrated_report",
                      "sustainability_report",
                      "other",
                    ],
                    example: "sustainability_report",
                  },
                },
              },
            },

            // -----------------------
            // Import Tracking
            // -----------------------
            import_source: {
              type: "string",
              enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
              default: "manual",
              example: "excel",
            },
            source_file_name: {
              type: "string",
              nullable: true,
              example: "Energy_Metrics_2022_2025.xlsx",
            },
            source_file_metadata: {
              type: "object",
              nullable: true,
              example: {
                size: "1.5MB",
                sheets: ["Bagasse Usage", "Coal Consumption", "Electricity"],
                last_modified: "2025-02-15",
              },
            },
            import_batch_id: {
              type: "string",
              nullable: true,
              example: "BATCH-ENERGY-2025-001",
            },
            import_date: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
            },
            import_notes: {
              type: "string",
              nullable: true,
              example: "Imported from audited annual energy report",
            },

            // -----------------------
            // Data Quality & Verification
            // -----------------------
            data_quality_score: {
              type: "number",
              minimum: 0,
              maximum: 100,
              nullable: true,
              example: 92,
            },
            verification_status: {
              type: "string",
              enum: [
                "unverified",
                "pending_review",
                "verified",
                "audited",
                "disputed",
              ],
              default: "unverified",
              example: "verified",
            },
            verified_by: {
              type: "string",
              nullable: true,
              example: "665a9d2fe4f1c23b04d99999",
            },
            verified_at: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: "2025-03-01T10:15:00Z",
            },
            verification_notes: {
              type: "string",
              nullable: true,
              example: "Verified against source documents",
            },

            // -----------------------
            // Validation
            // -----------------------
            validation_status: {
              type: "string",
              enum: [
                "not_validated",
                "validating",
                "validated",
                "failed_validation",
              ],
              default: "not_validated",
              example: "validated",
            },
            validation_errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  metric_name: {
                    type: "string",
                    example: "coal_consumption",
                  },
                  year: {
                    type: "string",
                    example: "2023",
                  },
                  error_message: {
                    type: "string",
                    example: "Value exceeds expected range",
                  },
                  field: {
                    type: "string",
                    example: "numeric_value",
                  },
                  severity: {
                    type: "string",
                    enum: ["warning", "error", "critical"],
                    example: "error",
                  },
                },
              },
            },
            validation_notes: {
              type: "string",
              nullable: true,
              example: "All metrics validated successfully",
            },

            // -----------------------
            // Energy Metrics
            // -----------------------
            metrics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: [
                      "bagasse_usage",
                      "coal_consumption",
                      "electricity_generated",
                      "electricity_purchased",
                      "electricity_exported",
                      "solar_power_usage",
                      "fuel_consumption",
                      "solar_infrastructure",
                      "year_over_year_change",
                      "forecast",
                      "risk",
                    ],
                    example: "bagasse_usage",
                  },
                  subcategory: {
                    type: "string",
                    nullable: true,
                    example: "inside_company_diesel",
                  },
                  metric_name: {
                    type: "string",
                    example: "Bagasse Consumption",
                  },
                  description: {
                    type: "string",
                    nullable: true,
                    example: "Total bagasse used for cogeneration",
                  },
                  data_type: {
                    type: "string",
                    enum: ["yearly_series", "single_value", "list", "summary"],
                    default: "yearly_series",
                    example: "yearly_series",
                  },
                  yearly_data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        year: {
                          type: "string",
                          example: "2023→2024",
                        },
                        fiscal_year: {
                          type: "number",
                          nullable: true,
                          example: 2023,
                        },
                        value: {
                          type: "string",
                          example: "1,245,000",
                        },
                        numeric_value: {
                          type: "number",
                          nullable: true,
                          example: 1245000,
                        },
                        unit: {
                          type: "string",
                          example: "tons",
                        },
                        source: {
                          type: "string",
                          example: "Annual Report 2024",
                        },
                        notes: {
                          type: "string",
                          nullable: true,
                          example: "Includes all processing units",
                        },
                        added_by: {
                          type: "string",
                          example: "665a9d2fe4f1c23b04d11111",
                        },
                        added_at: {
                          type: "string",
                          format: "date-time",
                          example: "2025-02-01T09:00:00Z",
                        },
                        last_updated_by: {
                          type: "string",
                          nullable: true,
                          example: "665a9d2fe4f1c23b04d22222",
                        },
                        last_updated_at: {
                          type: "string",
                          format: "date-time",
                          example: "2025-02-05T14:30:00Z",
                        },
                      },
                      required: ["year", "source", "added_by"],
                    },
                  },
                  single_value: {
                    type: "object",
                    properties: {
                      value: {
                        type: "string",
                        example: "250",
                      },
                      numeric_value: {
                        type: "number",
                        nullable: true,
                        example: 250,
                      },
                      unit: {
                        type: "string",
                        example: "units",
                      },
                      source: {
                        type: "string",
                        example: "Site survey 2025",
                      },
                      notes: {
                        type: "string",
                        nullable: true,
                        example: "Total solar geysers installed",
                      },
                      as_of_date: {
                        type: "string",
                        format: "date-time",
                        example: "2025-01-15T00:00:00Z",
                      },
                      added_by: {
                        type: "string",
                        example: "665a9d2fe4f1c23b04d33333",
                      },
                    },
                  },
                  list_data: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        item: {
                          type: "string",
                          example: "Solar Panel Array - Building A",
                        },
                        count: {
                          type: "number",
                          example: 150,
                        },
                        details: {
                          type: "string",
                          example: "300W monocrystalline panels",
                        },
                        source: {
                          type: "string",
                          example: "Maintenance log",
                        },
                        added_at: {
                          type: "string",
                          format: "date-time",
                          example: "2025-02-10T11:00:00Z",
                        },
                      },
                    },
                  },
                  summary_value: {
                    type: "object",
                    properties: {
                      key_metric: {
                        type: "string",
                        example: "Total Renewable Energy",
                      },
                      latest_value: {
                        type: "string",
                        example: "3,450 MWh",
                      },
                      trend: {
                        type: "string",
                        example: "+12.5% vs previous year",
                      },
                      notes: {
                        type: "string",
                        nullable: true,
                        example: "Includes solar and bagasse",
                      },
                      as_of_date: {
                        type: "string",
                        format: "date-time",
                        example: "2025-02-28T00:00:00Z",
                      },
                    },
                  },
                  is_active: {
                    type: "boolean",
                    default: true,
                    example: true,
                  },
                  created_at: {
                    type: "string",
                    format: "date-time",
                    example: "2025-02-01T08:00:00Z",
                  },
                  created_by: {
                    type: "string",
                    example: "665a9d2fe4f1c23b04d44444",
                  },
                  updated_at: {
                    type: "string",
                    format: "date-time",
                    nullable: true,
                    example: "2025-02-12T14:30:00Z",
                  },
                  last_updated_by: {
                    type: "string",
                    nullable: true,
                    example: "665a9d2fe4f1c23b04d55555",
                  },
                },
                required: ["category", "metric_name", "created_by"],
              },
            },

            // -----------------------
            // Summary Statistics
            // -----------------------
            summary_stats: {
              type: "object",
              properties: {
                total_bagasse_usage: {
                  type: "number",
                  default: 0,
                  example: 2500000,
                },
                total_coal_consumption: {
                  type: "number",
                  default: 0,
                  example: 500000,
                },
                total_electricity_generated: {
                  type: "number",
                  default: 0,
                  example: 850000,
                },
                total_electricity_purchased: {
                  type: "number",
                  default: 0,
                  example: 150000,
                },
                total_electricity_exported: {
                  type: "number",
                  default: 0,
                  example: 75000,
                },
                total_solar_power_usage: {
                  type: "number",
                  default: 0,
                  example: 45000,
                },
                total_fuel_consumption_inside: {
                  type: "number",
                  default: 0,
                  example: 120000,
                },
                total_fuel_consumption_outside: {
                  type: "number",
                  default: 0,
                  example: 30000,
                },
                average_solar_generation: {
                  type: "number",
                  default: 0,
                  example: 3750,
                },
                last_updated: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-28T15:00:00Z",
                },
              },
            },

            // -----------------------
            // GRI References
            // -----------------------
            gri_references: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  standard: {
                    type: "string",
                    example: "GRI 302: Energy 2016",
                  },
                  metric_name: {
                    type: "string",
                    example: "Energy consumption within the organization",
                  },
                  compliance_status: {
                    type: "string",
                    enum: [
                      "compliant",
                      "partially_compliant",
                      "non_compliant",
                      "not_applicable",
                    ],
                    example: "compliant",
                  },
                  reporting_year: {
                    type: "string",
                    example: "2024",
                  },
                },
              },
            },

            // -----------------------
            // Forecast & Risk
            // -----------------------
            forecast_data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  forecast_year: {
                    type: "string",
                    example: "2026",
                  },
                  metric_name: {
                    type: "string",
                    example: "total_electricity_generated",
                  },
                  predicted_value: {
                    type: "number",
                    example: 950000,
                  },
                  confidence_interval: {
                    type: "string",
                    example: "±5%",
                  },
                  methodology: {
                    type: "string",
                    example: "Linear regression based on historical data",
                  },
                  created_at: {
                    type: "string",
                    format: "date-time",
                    example: "2025-02-15T10:00:00Z",
                  },
                  created_by: {
                    type: "string",
                    example: "665a9d2fe4f1c23b04d66666",
                  },
                },
              },
            },
            risk_assessment: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  risk_category: {
                    type: "string",
                    example: "Regulatory Compliance",
                  },
                  description: {
                    type: "string",
                    example: "Potential carbon tax implementation",
                  },
                  likelihood: {
                    type: "string",
                    example: "Medium",
                  },
                  impact: {
                    type: "string",
                    example: "High",
                  },
                  mitigation: {
                    type: "string",
                    example: "Increase renewable energy investment",
                  },
                  as_of_date: {
                    type: "string",
                    format: "date-time",
                    example: "2025-02-01T00:00:00Z",
                  },
                },
              },
            },

            // -----------------------
            // Audit & Soft Delete
            // -----------------------
            created_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-01T08:00:00Z",
            },
            created_by: {
              type: "string",
              example: "665a9d2fe4f1c23b04d77777",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-28T14:30:00Z",
            },
            last_updated_by: {
              type: "string",
              nullable: true,
              example: "665a9d2fe4f1c23b04d88888",
            },

            // -----------------------
            // Versioning
            // -----------------------
            version: {
              type: "number",
              default: 1,
              example: 2,
            },
            previous_version: {
              type: "string",
              nullable: true,
              example: "665b9c9fe4f1c23b04d66666",
            },
            restored_from: {
              type: "string",
              nullable: true,
              example: "665b9c9fe4f1c23b04d55555",
            },
            restore_notes: {
              type: "string",
              nullable: true,
              example: "Restored from version 1 after data correction",
            },

            // -----------------------
            // Soft Delete
            // -----------------------
            is_active: {
              type: "boolean",
              default: true,
              example: true,
            },
            deleted_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            deleted_by: {
              type: "string",
              nullable: true,
            },
          },

          required: ["company", "created_by"],
        },

        EnergyConsumptionDataResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Energy consumption data created successfully",
            },
            data: {
              $ref: "#/components/schemas/EnergyConsumptionData",
            },
          },
        },

        EnergyConsumptionDataListResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Energy consumption data retrieved successfully",
            },
            data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/EnergyConsumptionData",
              },
            },
            pagination: {
              type: "object",
              properties: {
                total: {
                  type: "integer",
                  example: 100,
                },
                page: {
                  type: "integer",
                  example: 1,
                },
                limit: {
                  type: "integer",
                  example: 10,
                },
                pages: {
                  type: "integer",
                  example: 10,
                },
              },
            },
          },
        },

        EnergyConsumptionDataUpdateResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Energy consumption data updated successfully",
            },
            data: {
              $ref: "#/components/schemas/EnergyConsumptionData",
            },
          },
        },

        EnergyConsumptionDataDeleteResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Energy consumption data deleted successfully",
            },
            data: {
              type: "object",
              nullable: true,
              example: null,
            },
          },
        },

        EnergyConsumptionDataBulkResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Bulk operation completed successfully",
            },
            data: {
              type: "object",
              properties: {
                created: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/EnergyConsumptionData",
                  },
                },
                updated: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/EnergyConsumptionData",
                  },
                },
                failed: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: {
                        type: "integer",
                        example: 3,
                      },
                      error: {
                        type: "string",
                        example: "Invalid data format",
                      },
                    },
                  },
                },
                summary: {
                  type: "object",
                  properties: {
                    total_processed: {
                      type: "integer",
                      example: 50,
                    },
                    success_count: {
                      type: "integer",
                      example: 48,
                    },
                    failure_count: {
                      type: "integer",
                      example: 2,
                    },
                  },
                },
              },
            },
          },
        },

        EnergyConsumptionDataValidationResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data validation completed",
            },
            data: {
              type: "object",
              properties: {
                validation_status: {
                  type: "string",
                  enum: [
                    "not_validated",
                    "validating",
                    "validated",
                    "failed_validation",
                  ],
                  example: "validated",
                },
                validation_errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      metric_name: {
                        type: "string",
                        example: "coal_consumption",
                      },
                      year: {
                        type: "string",
                        example: "2023",
                      },
                      error_message: {
                        type: "string",
                        example: "Value exceeds expected range",
                      },
                      field: {
                        type: "string",
                        example: "numeric_value",
                      },
                      severity: {
                        type: "string",
                        enum: ["warning", "error", "critical"],
                        example: "error",
                      },
                    },
                  },
                },
                validation_notes: {
                  type: "string",
                  example: "3 warnings found, no critical errors",
                },
                data_quality_score: {
                  type: "number",
                  example: 85,
                },
              },
            },
          },
        },

        EnergyConsumptionDataVerifyResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data verification completed",
            },
            data: {
              type: "object",
              properties: {
                verification_status: {
                  type: "string",
                  enum: [
                    "unverified",
                    "pending_review",
                    "verified",
                    "audited",
                    "disputed",
                  ],
                  example: "verified",
                },
                verified_by: {
                  type: "string",
                  example: "665a9d2fe4f1c23b04d99999",
                },
                verified_at: {
                  type: "string",
                  format: "date-time",
                  example: "2025-03-01T10:15:00Z",
                },
                verification_notes: {
                  type: "string",
                  example: "Data verified against source documents",
                },
              },
            },
          },
        },

        EnergyConsumptionDataSummaryResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Summary statistics retrieved successfully",
            },
            data: {
              type: "object",
              properties: {
                company: {
                  type: "string",
                  example: "665a8c7be4f1c23b04d12345",
                },
                reporting_period: {
                  type: "object",
                  properties: {
                    start: {
                      type: "string",
                      example: "2022",
                    },
                    end: {
                      type: "string",
                      example: "2025",
                    },
                  },
                },
                summary_stats: {
                  type: "object",
                  properties: {
                    total_bagasse_usage: {
                      type: "number",
                      example: 2500000,
                    },
                    total_coal_consumption: {
                      type: "number",
                      example: 500000,
                    },
                    total_electricity_generated: {
                      type: "number",
                      example: 850000,
                    },
                    total_electricity_purchased: {
                      type: "number",
                      example: 150000,
                    },
                    total_electricity_exported: {
                      type: "number",
                      example: 75000,
                    },
                    total_solar_power_usage: {
                      type: "number",
                      example: 45000,
                    },
                    total_fuel_consumption_inside: {
                      type: "number",
                      example: 120000,
                    },
                    total_fuel_consumption_outside: {
                      type: "number",
                      example: 30000,
                    },
                    average_solar_generation: {
                      type: "number",
                      example: 3750,
                    },
                  },
                },
                metrics_count: {
                  type: "integer",
                  example: 15,
                },
                data_quality_score: {
                  type: "number",
                  example: 92,
                },
                verification_status: {
                  type: "string",
                  example: "verified",
                },
                last_updated: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-28T14:30:00Z",
                },
              },
            },
          },
        },

        EnergyConsumptionDataErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Failed to process energy consumption data",
            },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "VALIDATION_ERROR",
                },
                details: {
                  type: "string",
                  example: "Required field 'metric_name' is missing",
                },
                field_errors: {
                  type: "object",
                  example: {
                    "metrics[0].yearly_data[0].value": "Value is required",
                    "metrics[0].category": "Invalid category value",
                  },
                },
              },
            },
          },
        },

        EnergyConsumptionDataImportResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data imported successfully",
            },
            data: {
              type: "object",
              properties: {
                import_batch_id: {
                  type: "string",
                  example: "BATCH-ENERGY-2025-001",
                },
                import_source: {
                  type: "string",
                  enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
                  example: "excel",
                },
                source_file_name: {
                  type: "string",
                  example: "Energy_Metrics_2022_2025.xlsx",
                },
                records_imported: {
                  type: "integer",
                  example: 250,
                },
                metrics_created: {
                  type: "integer",
                  example: 15,
                },
                yearly_data_points: {
                  type: "integer",
                  example: 75,
                },
                validation_summary: {
                  type: "object",
                  properties: {
                    passed: {
                      type: "integer",
                      example: 245,
                    },
                    warnings: {
                      type: "integer",
                      example: 5,
                    },
                    errors: {
                      type: "integer",
                      example: 0,
                    },
                  },
                },
                import_date: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-10T08:00:00Z",
                },
              },
            },
          },
        },

        WorkforceDiversityDataResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Workforce diversity data created successfully",
            },
            data: {
              $ref: "#/components/schemas/WorkforceDiversityData",
            },
          },
        },

        WorkforceDiversityDataListResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Workforce diversity data retrieved successfully",
            },
            data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/WorkforceDiversityData",
              },
            },
            pagination: {
              type: "object",
              properties: {
                total: {
                  type: "integer",
                  example: 100,
                },
                page: {
                  type: "integer",
                  example: 1,
                },
                limit: {
                  type: "integer",
                  example: 10,
                },
                pages: {
                  type: "integer",
                  example: 10,
                },
              },
            },
          },
        },

        WorkforceDiversityDataUpdateResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Workforce diversity data updated successfully",
            },
            data: {
              $ref: "#/components/schemas/WorkforceDiversityData",
            },
          },
        },

        WorkforceDiversityDataDeleteResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Workforce diversity data deleted successfully",
            },
            data: {
              type: "object",
              nullable: true,
              example: null,
            },
          },
        },

        WorkforceDiversityDataBulkResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Bulk operation completed successfully",
            },
            data: {
              type: "object",
              properties: {
                created: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/WorkforceDiversityData",
                  },
                },
                updated: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/WorkforceDiversityData",
                  },
                },
                failed: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: {
                        type: "integer",
                        example: 3,
                      },
                      error: {
                        type: "string",
                        example: "Invalid data format",
                      },
                    },
                  },
                },
                summary: {
                  type: "object",
                  properties: {
                    total_processed: {
                      type: "integer",
                      example: 50,
                    },
                    success_count: {
                      type: "integer",
                      example: 48,
                    },
                    failure_count: {
                      type: "integer",
                      example: 2,
                    },
                  },
                },
              },
            },
          },
        },

        WorkforceDiversityDataValidationResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data validation completed",
            },
            data: {
              type: "object",
              properties: {
                validation_status: {
                  type: "string",
                  enum: [
                    "not_validated",
                    "validating",
                    "validated",
                    "failed_validation",
                  ],
                  example: "validated",
                },
                validation_errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      metric_name: {
                        type: "string",
                        example: "female_employees",
                      },
                      year: {
                        type: "string",
                        example: "2023",
                      },
                      error_message: {
                        type: "string",
                        example: "Value exceeds total employees",
                      },
                      field: {
                        type: "string",
                        example: "numeric_value",
                      },
                      severity: {
                        type: "string",
                        enum: ["warning", "error", "critical"],
                        example: "error",
                      },
                    },
                  },
                },
                validation_notes: {
                  type: "string",
                  example: "2 warnings found, no critical errors",
                },
                data_quality_score: {
                  type: "number",
                  example: 88,
                },
              },
            },
          },
        },

        WorkforceDiversityDataVerifyResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data verification completed",
            },
            data: {
              type: "object",
              properties: {
                verification_status: {
                  type: "string",
                  enum: [
                    "unverified",
                    "pending_review",
                    "verified",
                    "audited",
                    "disputed",
                  ],
                  example: "verified",
                },
                verified_by: {
                  type: "string",
                  example: "665a9d2fe4f1c23b04d99999",
                },
                verified_at: {
                  type: "string",
                  format: "date-time",
                  example: "2025-03-01T10:15:00Z",
                },
                verification_notes: {
                  type: "string",
                  example: "Data verified against HR records",
                },
              },
            },
          },
        },

        WorkforceDiversityDataSummaryResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Summary statistics retrieved successfully",
            },
            data: {
              type: "object",
              properties: {
                company: {
                  type: "string",
                  example: "665a8c7be4f1c23b04d12345",
                },
                reporting_period: {
                  type: "object",
                  properties: {
                    start: {
                      type: "string",
                      example: "2022",
                    },
                    end: {
                      type: "string",
                      example: "2025",
                    },
                  },
                },
                summary_stats: {
                  type: "object",
                  properties: {
                    total_female_employees: {
                      type: "number",
                      example: 1250,
                    },
                    total_male_employees: {
                      type: "number",
                      example: 1750,
                    },
                    total_female_recruits: {
                      type: "number",
                      example: 150,
                    },
                    total_male_recruits: {
                      type: "number",
                      example: 175,
                    },
                    average_female_representation: {
                      type: "number",
                      example: 41.7,
                    },
                    average_turnover_rate: {
                      type: "number",
                      example: 12.5,
                    },
                  },
                },
                metrics_count: {
                  type: "integer",
                  example: 18,
                },
                diversity_breakdown: {
                  type: "object",
                  example: {
                    female_leadership: "35%",
                    male_leadership: "65%",
                    under_30: "22%",
                    "30_to_50": "58%",
                    over_50: "20%",
                  },
                },
                data_quality_score: {
                  type: "number",
                  example: 94,
                },
                verification_status: {
                  type: "string",
                  example: "verified",
                },
                last_updated: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-28T14:30:00Z",
                },
              },
            },
          },
        },

        WorkforceDiversityDataErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Failed to process workforce diversity data",
            },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "VALIDATION_ERROR",
                },
                details: {
                  type: "string",
                  example: "Required field 'metric_name' is missing",
                },
                field_errors: {
                  type: "object",
                  example: {
                    "metrics[0].yearly_data[0].value": "Value is required",
                    "metrics[0].category": "Invalid category value",
                  },
                },
              },
            },
          },
        },

        WorkforceDiversityDataImportResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data imported successfully",
            },
            data: {
              type: "object",
              properties: {
                import_batch_id: {
                  type: "string",
                  example: "BATCH-WORKFORCE-2025-001",
                },
                import_source: {
                  type: "string",
                  enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
                  example: "excel",
                },
                source_file_name: {
                  type: "string",
                  example: "Workforce_Metrics_2022_2025.xlsx",
                },
                records_imported: {
                  type: "integer",
                  example: 180,
                },
                metrics_created: {
                  type: "integer",
                  example: 12,
                },
                yearly_data_points: {
                  type: "integer",
                  example: 48,
                },
                demographic_breakdown: {
                  type: "object",
                  example: {
                    gender_data_points: 24,
                    age_data_points: 18,
                    diversity_initiatives: 6,
                  },
                },
                validation_summary: {
                  type: "object",
                  properties: {
                    passed: {
                      type: "integer",
                      example: 175,
                    },
                    warnings: {
                      type: "integer",
                      example: 5,
                    },
                    errors: {
                      type: "integer",
                      example: 0,
                    },
                  },
                },
                import_date: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-10T08:00:00Z",
                },
              },
            },
          },
        },

        HealthSafetyDataResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Health & safety data created successfully",
            },
            data: {
              $ref: "#/components/schemas/HealthSafetyData",
            },
          },
        },

        HealthSafetyDataListResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Health & safety data retrieved successfully",
            },
            data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/HealthSafetyData",
              },
            },
            pagination: {
              type: "object",
              properties: {
                total: {
                  type: "integer",
                  example: 75,
                },
                page: {
                  type: "integer",
                  example: 1,
                },
                limit: {
                  type: "integer",
                  example: 10,
                },
                pages: {
                  type: "integer",
                  example: 8,
                },
              },
            },
          },
        },

        HealthSafetyDataUpdateResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Health & safety data updated successfully",
            },
            data: {
              $ref: "#/components/schemas/HealthSafetyData",
            },
          },
        },

        HealthSafetyDataDeleteResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Health & safety data deleted successfully",
            },
            data: {
              type: "object",
              nullable: true,
              example: null,
            },
          },
        },

        HealthSafetyDataBulkResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Bulk operation completed successfully",
            },
            data: {
              type: "object",
              properties: {
                created: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/HealthSafetyData",
                  },
                },
                updated: {
                  type: "array",
                  items: {
                    $ref: "#/components/schemas/HealthSafetyData",
                  },
                },
                failed: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      index: {
                        type: "integer",
                        example: 3,
                      },
                      error: {
                        type: "string",
                        example: "Invalid data format",
                      },
                    },
                  },
                },
                summary: {
                  type: "object",
                  properties: {
                    total_processed: {
                      type: "integer",
                      example: 40,
                    },
                    success_count: {
                      type: "integer",
                      example: 38,
                    },
                    failure_count: {
                      type: "integer",
                      example: 2,
                    },
                  },
                },
              },
            },
          },
        },

        HealthSafetyDataValidationResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data validation completed",
            },
            data: {
              type: "object",
              properties: {
                validation_status: {
                  type: "string",
                  enum: [
                    "not_validated",
                    "validating",
                    "validated",
                    "failed_validation",
                  ],
                  example: "validated",
                },
                validation_errors: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      metric_name: {
                        type: "string",
                        example: "malaria_cases",
                      },
                      year: {
                        type: "string",
                        example: "2023",
                      },
                      error_message: {
                        type: "string",
                        example: "Value missing for Q4",
                      },
                      field: {
                        type: "string",
                        example: "yearly_data",
                      },
                      severity: {
                        type: "string",
                        enum: ["warning", "error", "critical"],
                        example: "warning",
                      },
                    },
                  },
                },
                validation_notes: {
                  type: "string",
                  example: "1 warning found, no critical errors",
                },
                data_quality_score: {
                  type: "number",
                  example: 95,
                },
              },
            },
          },
        },

        HealthSafetyDataVerifyResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data verification completed",
            },
            data: {
              type: "object",
              properties: {
                verification_status: {
                  type: "string",
                  enum: [
                    "unverified",
                    "pending_review",
                    "verified",
                    "audited",
                    "disputed",
                  ],
                  example: "verified",
                },
                verified_by: {
                  type: "string",
                  example: "665a9d2fe4f1c23b04d99999",
                },
                verified_at: {
                  type: "string",
                  format: "date-time",
                  example: "2025-03-01T10:15:00Z",
                },
                verification_notes: {
                  type: "string",
                  example: "Data verified against occupational health records",
                },
              },
            },
          },
        },

        HealthSafetyDataSummaryResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Summary statistics retrieved successfully",
            },
            data: {
              type: "object",
              properties: {
                company: {
                  type: "string",
                  example: "665a8c7be4f1c23b04d12345",
                },
                reporting_period: {
                  type: "object",
                  properties: {
                    start: {
                      type: "string",
                      example: "2022",
                    },
                    end: {
                      type: "string",
                      example: "2025",
                    },
                  },
                },
                summary_stats: {
                  type: "object",
                  properties: {
                    total_lti: {
                      type: "number",
                      example: 12,
                    },
                    total_fatalities: {
                      type: "number",
                      example: 0,
                    },
                    malaria_cases_2025: {
                      type: "number",
                      example: 23,
                    },
                    hiv_prevalence_2025: {
                      type: "number",
                      example: 2.5,
                    },
                    new_hiv_cases_2025: {
                      type: "number",
                      example: 3,
                    },
                    vct_uptake_2025: {
                      type: "number",
                      example: 450,
                    },
                    hospital_beds: {
                      type: "number",
                      example: 25,
                    },
                    total_health_professionals: {
                      type: "number",
                      example: 35,
                    },
                    doctors: {
                      type: "number",
                      example: 8,
                    },
                    medical_support_staff: {
                      type: "number",
                      example: 27,
                    },
                  },
                },
                metrics_count: {
                  type: "integer",
                  example: 22,
                },
                health_indicators: {
                  type: "object",
                  example: {
                    lti_frequency_rate: "0.85",
                    severity_rate: "22.5",
                    occupational_disease_cases: 5,
                    medical_evacuations: 3,
                  },
                },
                data_quality_score: {
                  type: "number",
                  example: 96,
                },
                verification_status: {
                  type: "string",
                  example: "verified",
                },
                last_updated: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-28T14:30:00Z",
                },
              },
            },
          },
        },

        HealthSafetyDataErrorResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: false,
            },
            message: {
              type: "string",
              example: "Failed to process health & safety data",
            },
            error: {
              type: "object",
              properties: {
                code: {
                  type: "string",
                  example: "VALIDATION_ERROR",
                },
                details: {
                  type: "string",
                  example: "Required field 'metric_name' is missing",
                },
                field_errors: {
                  type: "object",
                  example: {
                    "metrics[0].category": "Invalid category value",
                    "metrics[0].yearly_data[0].numeric_value":
                      "Must be a positive number",
                  },
                },
              },
            },
          },
        },

        HealthSafetyDataImportResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Data imported successfully",
            },
            data: {
              type: "object",
              properties: {
                import_batch_id: {
                  type: "string",
                  example: "BATCH-HEALTHSAFETY-2025-001",
                },
                import_source: {
                  type: "string",
                  enum: ["csv", "excel", "manual", "api", "pdf_extraction"],
                  example: "excel",
                },
                source_file_name: {
                  type: "string",
                  example: "Health_Safety_Metrics_2022_2025.xlsx",
                },
                records_imported: {
                  type: "integer",
                  example: 165,
                },
                metrics_created: {
                  type: "integer",
                  example: 14,
                },
                yearly_data_points: {
                  type: "integer",
                  example: 56,
                },
                health_metrics_breakdown: {
                  type: "object",
                  example: {
                    lti_metrics: 32,
                    health_services: 18,
                    certifications: 3,
                    training_hours: 12,
                  },
                },
                validation_summary: {
                  type: "object",
                  properties: {
                    passed: {
                      type: "integer",
                      example: 162,
                    },
                    warnings: {
                      type: "integer",
                      example: 3,
                    },
                    errors: {
                      type: "integer",
                      example: 0,
                    },
                  },
                },
                import_date: {
                  type: "string",
                  format: "date-time",
                  example: "2025-02-10T08:00:00Z",
                },
              },
            },
          },
        },

        CarbonEmissionResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Carbon emission accounting created successfully",
            },
            data: {
              $ref: "#/components/schemas/CarbonEmissionAccounting",
            },
          },
        },

        FileUploadResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "File uploaded and processed successfully",
            },
            data: {
              type: "object",
              properties: {
                batchId: {
                  type: "string",
                  example: "123e4567-e89b-12d3-a456-426614174000",
                },
                fileName: {
                  type: "string",
                  example:
                    "Carbon emission accounting - 2023 Sequestration.csv",
                },
                fileType: {
                  type: "string",
                  example: "csv",
                },
                recordsProcessed: {
                  type: "integer",
                  example: 12,
                },
                carbonEmissionId: {
                  type: "string",
                  example: "652a1b2c3d4e5f6a7b8c9d0e",
                },
                year: {
                  type: "string",
                  example: "2024",
                },
              },
            },
          },
        },
        ESGData: {
          type: "object",
          properties: {
            _id: {
              type: "string",
              example: "665b9c9fe4f1c23b04d67890",
            },

            company: {
              type: "string",
              description: "Company ID reference",
              example: "665a8c7be4f1c23b04d12345",
            },

            reporting_period_start: {
              type: "integer",
              nullable: true,
              example: 2022,
            },
            reporting_period_end: {
              type: "integer",
              nullable: true,
              example: 2025,
            },

            // -----------------------
            // Data Source Information
            // -----------------------
            data_source: {
              type: "string",
              nullable: true,
              example: "HVE Integrated Report 2025",
            },
            source_file_name: {
              type: "string",
              nullable: true,
              example: "ESG_Metrics_2022_2025.xlsx",
            },
            source_file_type: {
              type: "string",
              enum: ["csv", "excel", "json", "manual", "api"],
              default: "manual",
              example: "excel",
            },
            source_file_metadata: {
              type: "object",
              nullable: true,
              example: {
                size: "2MB",
                sheets: ["Environmental", "Social", "Governance"],
              },
            },

            // -----------------------
            // Import Tracking
            // -----------------------
            import_batch_id: {
              type: "string",
              nullable: true,
              example: "BATCH-ESG-2025-001",
            },
            import_date: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
            },
            import_notes: {
              type: "string",
              nullable: true,
              example: "Imported from audited annual ESG report",
            },

            // -----------------------
            // Data Quality & Verification
            // -----------------------
            data_quality_score: {
              type: "number",
              minimum: 0,
              maximum: 100,
              nullable: true,
              example: 87,
            },
            verification_status: {
              type: "string",
              enum: ["unverified", "pending", "verified", "audited"],
              default: "unverified",
              example: "verified",
            },
            verified_by: {
              type: "string",
              nullable: true,
              example: "665a9d2fe4f1c23b04d99999",
            },
            verified_at: {
              type: "string",
              format: "date-time",
              nullable: true,
              example: "2025-03-01T10:15:00Z",
            },

            // -----------------------
            // Validation
            // -----------------------
            validation_status: {
              type: "string",
              enum: [
                "not_validated",
                "validating",
                "validated",
                "failed_validation",
              ],
              default: "not_validated",
              example: "validated",
            },
            validation_errors: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  metric_name: {
                    type: "string",
                    example: "Scope 1 Emissions",
                  },
                  year: {
                    type: "integer",
                    example: 2023,
                  },
                  error_message: {
                    type: "string",
                    example: "Value cannot be negative",
                  },
                  field: {
                    type: "string",
                    example: "numeric_value",
                  },
                },
              },
            },
            validation_notes: {
              type: "string",
              nullable: true,
              example: "All metrics validated successfully",
            },

            // -----------------------
            // ESG Metrics
            // -----------------------
            metrics: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  category: {
                    type: "string",
                    enum: ["environmental", "social", "governance"],
                    example: "environmental",
                  },
                  metric_name: {
                    type: "string",
                    example: "Scope 1 GHG Emissions",
                  },
                  unit: {
                    type: "string",
                    nullable: true,
                    example: "tCO2e",
                  },
                  description: {
                    type: "string",
                    nullable: true,
                    example: "Direct greenhouse gas emissions",
                  },
                  is_active: {
                    type: "boolean",
                    default: true,
                    example: true,
                  },
                  values: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        year: {
                          type: "integer",
                          example: 2024,
                        },
                        value: {
                          type: "string",
                          example: "1,245",
                        },
                        numeric_value: {
                          type: "number",
                          nullable: true,
                          example: 1245,
                        },
                        source_notes: {
                          type: "string",
                          nullable: true,
                          example: "Audited sustainability report",
                        },
                        added_by: {
                          type: "string",
                          example: "665a9d2fe4f1c23b04d11111",
                        },
                        added_at: {
                          type: "string",
                          format: "date-time",
                          example: "2025-02-01T09:00:00Z",
                        },
                        last_updated_by: {
                          type: "string",
                          nullable: true,
                          example: "665a9d2fe4f1c23b04d22222",
                        },
                        last_updated_at: {
                          type: "string",
                          format: "date-time",
                          example: "2025-02-05T14:30:00Z",
                        },
                      },
                      required: ["year", "added_by"],
                    },
                  },
                  created_at: {
                    type: "string",
                    format: "date-time",
                    example: "2025-02-01T08:00:00Z",
                  },
                  created_by: {
                    type: "string",
                    example: "665a9d2fe4f1c23b04d33333",
                  },
                },
                required: ["category", "metric_name", "created_by"],
              },
            },

            // -----------------------
            // Audit & Soft Delete
            // -----------------------
            created_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-01T08:00:00Z",
            },
            created_by: {
              type: "string",
              example: "665a9d2fe4f1c23b04d44444",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-12T14:30:00Z",
            },
            last_updated_by: {
              type: "string",
              nullable: true,
              example: "665a9d2fe4f1c23b04d55555",
            },
            is_active: {
              type: "boolean",
              default: true,
              example: true,
            },
            deleted_at: {
              type: "string",
              format: "date-time",
              nullable: true,
            },
            deleted_by: {
              type: "string",
              nullable: true,
            },
          },

          required: ["company", "created_by"],
        },
        YearlyData: {
          type: "object",
          properties: {
            year: {
              type: "string",
              example: "2023",
            },
            fiscal_year: {
              type: "number",
              example: 2023,
            },
            value: {
              type: "string",
              example: "1.2",
            },
            numeric_value: {
              type: "number",
              example: 1.2,
            },
            unit: {
              type: "string",
              example: "million ML",
            },
            source: {
              type: "string",
              example: "Integrated Report 2023",
            },
            notes: {
              type: "string",
            },
            added_by: {
              type: "string",
              example: "userObjectId",
            },
            added_at: {
              type: "string",
              format: "date-time",
            },
            last_updated_by: {
              type: "string",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
            },
          },
        },

        IrrigationMetric: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "irrigation_water",
                "water_per_hectare",
                "effluent_discharged",
                "water_treatment",
                "water_sources",
                "forecast",
                "risk",
              ],
            },
            subcategory: {
              type: "string",
            },
            metric_name: {
              type: "string",
            },
            description: {
              type: "string",
            },
            data_type: {
              type: "string",
              enum: ["yearly_series", "single_value", "list", "summary"],
            },
            yearly_data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/YearlyData",
              },
            },
            single_value: {
              type: "object",
              properties: {
                value: { type: "string" },
                numeric_value: { type: "number" },
                unit: { type: "string" },
                source: { type: "string" },
                notes: { type: "string" },
                as_of_date: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            list_data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  count: { type: "number" },
                  details: { type: "string" },
                  source: { type: "string" },
                  added_at: {
                    type: "string",
                    format: "date-time",
                  },
                },
              },
            },
            summary_value: {
              type: "object",
              properties: {
                key_metric: { type: "string" },
                latest_value: { type: "string" },
                trend: { type: "string" },
                notes: { type: "string" },
                as_of_date: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            is_active: {
              type: "boolean",
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            created_by: {
              type: "string",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
            last_updated_by: {
              type: "string",
            },
          },
        },
        IrrigationEfficiencyData: {
          type: "object",
          properties: {
            company: {
              type: "string",
              example: "companyObjectId",
            },
            data_period_start: {
              type: "string",
              example: "2022",
            },
            data_period_end: {
              type: "string",
              example: "2025",
            },
            original_source: {
              type: "string",
            },
            source_files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  year: { type: "string" },
                  pages: { type: "string" },
                  type: {
                    type: "string",
                    enum: [
                      "annual_report",
                      "integrated_report",
                      "sustainability_report",
                      "other",
                    ],
                  },
                },
              },
            },
            import_source: {
              type: "string",
            },
            source_file_name: {
              type: "string",
            },
            data_quality_score: {
              type: "number",
            },
            verification_status: {
              type: "string",
              enum: [
                "unverified",
                "pending_review",
                "verified",
                "audited",
                "disputed",
              ],
            },
            validation_status: {
              type: "string",
            },
            metrics: {
              type: "array",
              items: {
                $ref: "#/components/schemas/IrrigationMetric",
              },
            },
            summary_stats: {
              type: "object",
              properties: {
                total_irrigation_water: { type: "number" },
                avg_water_per_hectare: { type: "number" },
                total_effluent_discharged: { type: "number" },
                avg_water_treatment: { type: "number" },
                water_sources_count: { type: "number" },
                last_updated: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            created_by: {
              type: "string",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
            },
            version: {
              type: "number",
            },
            is_active: {
              type: "boolean",
            },
          },
        },
        IrrigationEfficiencyResponse: {
          type: "object",
          properties: {
            success: {
              type: "boolean",
              example: true,
            },
            message: {
              type: "string",
              example: "Irrigation efficiency data created successfully",
            },
            data: {
              $ref: "#/components/schemas/IrrigationEfficiencyData",
            },
          },
        },
        AuthProvider: {
          type: "object",
          properties: {
            provider: {
              type: "string",
              enum: ["google", "apple", "email"],
              example: "email",
            },
            provider_user_id: {
              type: "string",
              example: "google-oauth2|112233445566",
            },
            added_at: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
            },
          },
          required: ["provider", "provider_user_id"],
        },
        ComplianceMetric: {
          type: "object",
          properties: {
            category: {
              type: "string",
              enum: [
                "training_hours_executive",
                "training_hours_senior_management",
                "training_hours_other_employees",
                "training_focus_areas",
                "training_delivery_methods",
                "compliance_programs",
                "forecast",
                "risk",
              ],
            },
            subcategory: {
              type: "string",
            },
            metric_name: {
              type: "string",
              example: "Executive Training Hours",
            },
            description: {
              type: "string",
            },
            data_type: {
              type: "string",
              enum: ["yearly_series", "single_value", "list", "summary"],
            },
            yearly_data: {
              type: "array",
              items: {
                $ref: "#/components/schemas/YearlyData",
              },
            },
            single_value: {
              type: "object",
              properties: {
                value: { type: "string" },
                numeric_value: { type: "number" },
                unit: { type: "string" },
                source: { type: "string" },
                notes: { type: "string" },
                as_of_date: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            list_data: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  item: { type: "string" },
                  count: { type: "number" },
                  details: { type: "string" },
                  source: { type: "string" },
                  added_at: {
                    type: "string",
                    format: "date-time",
                  },
                },
              },
            },
            summary_value: {
              type: "object",
              properties: {
                key_metric: { type: "string" },
                latest_value: { type: "string" },
                trend: { type: "string" },
                notes: { type: "string" },
                as_of_date: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            is_active: {
              type: "boolean",
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            created_by: {
              type: "string",
            },
            updated_at: {
              type: "string",
              format: "date-time",
            },
            last_updated_by: {
              type: "string",
            },
          },
        },
        FarmManagementCompliance: {
          type: "object",
          properties: {
            company: {
              type: "string",
              example: "companyObjectId",
            },
            data_period_start: {
              type: "string",
              example: "2022",
            },
            data_period_end: {
              type: "string",
              example: "2025",
            },
            original_source: {
              type: "string",
            },
            source_files: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string" },
                  year: { type: "string" },
                  pages: { type: "string" },
                  type: {
                    type: "string",
                    enum: [
                      "annual_report",
                      "integrated_report",
                      "sustainability_report",
                      "other",
                    ],
                  },
                },
              },
            },
            import_source: {
              type: "string",
            },
            data_quality_score: {
              type: "number",
            },
            verification_status: {
              type: "string",
              enum: [
                "unverified",
                "pending_review",
                "verified",
                "audited",
                "disputed",
              ],
            },
            validation_status: {
              type: "string",
            },
            metrics: {
              type: "array",
              items: {
                $ref: "#/components/schemas/ComplianceMetric",
              },
            },
            summary_stats: {
              type: "object",
              properties: {
                total_executive_hours: { type: "number" },
                total_senior_management_hours: { type: "number" },
                total_other_employees_hours: { type: "number" },
                avg_executive_hours: { type: "number" },
                avg_senior_management_hours: { type: "number" },
                avg_other_employees_hours: { type: "number" },
                training_focus_areas_count: { type: "number" },
                training_delivery_methods_count: { type: "number" },
                compliance_programs_count: { type: "number" },
                last_updated: {
                  type: "string",
                  format: "date-time",
                },
              },
            },
            created_at: {
              type: "string",
              format: "date-time",
            },
            created_by: {
              type: "string",
            },
            last_updated_at: {
              type: "string",
              format: "date-time",
            },
            version: {
              type: "number",
            },
            is_active: {
              type: "boolean",
            },
          },
        },
        Error: {
          type: "object",
          properties: {
            message: {
              type: "string",
              example: "Error message",
            },
            error: {
              type: "string",
              example: "Detailed error description",
            },
          },
        },
      },

      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
    },
    security: [
      {
        bearerAuth: [],
      },
    ],
    tags: [
      {
        name: "Users",
        description: "Operations related to users",
      },
      {
        name: "Companies",
        description: "Operations related to companies",
      },
      {
        name: "Members",
        description: "Operations related to company members",
      },
    ],
  },
  apis: [
    "./routers/user_router.js", // adjust path if needed
    "./routers/company_router.js", // adjust path if needed
    "./routers/member_router.js", // adjust path if needed
    "./routers/esg_data_router.js", // adjust path if needed
    "./routers/esg_dashboard_router.js", // adjust path if needed
    "./routers/carbon_emission_router.js", // adjust path if needed
    "./routers/biodiversity_data_router.js", // adjust path if needed
    "./routers/crop_yield_router.js", // adjust path if needed
    "./routers/irrigation_eff_router.js", // adjust path if needed
    "./routers/fmc_router.js", // adjust path if needed
    "./routers/energy_consumption_router.js", // adjust path if needed
    "./routers/waste_management_router.js", // adjust path if needed
    "./routers/workforce_diversity_router.js", // adjust path if needed
    "./routers/health_safety_router.js", // adjust path if needed
    "./routers/governance_board_router.js", // adjust path if needed
    "./routers/community_engagement_router.js", // adjust path if needed
    "./routers/overall_esg_router.js", // adjust path if needed
  ],
};

const specs = swaggerJsdoc(options);

module.exports = (app) => {
  app.use(
    "/api-docs",
    swaggerUi.serve,
    swaggerUi.setup(specs, {
      explorer: true,
      swaggerOptions: {
        validatorUrl: null,
        persistAuthorization: true,
      },
    }),
  );
};
