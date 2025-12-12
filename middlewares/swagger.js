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
              example: "Mavhu Logistics",
            },

            registrationNumber: {
              type: "string",
              nullable: true,
              example: "REG-12345",
            },

            email: {
              type: "string",
              nullable: true,
              example: "info@mavhu.com",
            },

            phone: {
              type: "string",
              nullable: true,
              example: "+263771234567",
            },

            address: {
              type: "string",
              nullable: true,
              example: "123 Samora Machel Ave, Harare",
            },

            website: {
              type: "string",
              nullable: true,
              example: "https://mavhu.com",
            },

            country: {
              type: "string",
              nullable: true,
              example: "Zimbabwe",
            },

            industry: {
              type: "string",
              nullable: true,
              example: "Transport & Logistics",
            },

            description: {
              type: "string",
              nullable: true,
              example: "A logistics and delivery company.",
            },

            createdAt: {
              type: "string",
              format: "date-time",
              example: "2025-02-10T08:00:00Z",
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
    })
  );
};
