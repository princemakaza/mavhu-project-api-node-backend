// routes/company_router.js
const express = require("express");
const router = express.Router();

const companyController = require("../controllers/company_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");

/**
 * @swagger
 * tags:
 *   - name: Companies
 *     description: Company registration and self-management
 *   - name: Companies Admin
 *     description: Owner-managed company administration
 *
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     ErrorResponse:
 *       type: object
 *       properties:
 *         code: { type: string, example: "BAD_REQUEST" }
 *         message: { type: string, example: "Validation failed" }
 *         details: { type: object }
 *
 *     Company:
 *       type: object
 *       properties:
 *         _id: { type: string, example: "665a8c7be4f1c23b04d12345" }
 *         name: { type: string, example: "Mavhu Logistics" }
 *         registrationNumber: { type: string, example: "REG-12345" }
 *         email: { type: string, example: "info@mavhu.com" }
 *         phone: { type: string, example: "+263771234567" }
 *         address: { type: string, example: "Harare, Zimbabwe" }
 *         website: { type: string, example: "https://mavhu.com" }
 *         country: { type: string, example: "Zimbabwe" }
 *         industry: { type: string, example: "Transport" }
 *         description: { type: string, example: "A logistics company." }
 *         createdAt: { type: string, format: date-time }
 *
 *     CompanyRegisterRequest:
 *       type: object
 *       required: [name]
 *       properties:
 *         name: { type: string, example: "Mavhu Logistics" }
 *         registrationNumber: { type: string, example: "REG-12345" }
 *         email: { type: string, example: "info@mavhu.com" }
 *         phone: { type: string, example: "+263771234567" }
 *         address: { type: string, example: "Harare, Zimbabwe" }
 *         website: { type: string, example: "https://mavhu.com" }
 *         country: { type: string, example: "Zimbabwe" }
 *         industry: { type: string, example: "Transport" }
 *         description: { type: string, example: "A logistics company." }
 *
 *     CompanyUpdateRequest:
 *       type: object
 *       properties:
 *         name: { type: string, example: "Mavhu Logistics (Pvt) Ltd" }
 *         registrationNumber: { type: string, example: "REG-99999" }
 *         email: { type: string, example: "support@mavhu.com" }
 *         phone: { type: string, example: "+263771000000" }
 *         address: { type: string, example: "Bulawayo, Zimbabwe" }
 *         website: { type: string, example: "https://mavhu.com" }
 *         country: { type: string, example: "Zimbabwe" }
 *         industry: { type: string, example: "Transport" }
 *         description: { type: string, example: "Updated description" }
 */

/**
 * @swagger
 * /api/v1/companies/register:
 *   post:
 *     tags: [Companies]
 *     summary: Public register a company (no auth) and return a token
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompanyRegisterRequest' }
 *     responses:
 *       201:
 *         description: Company registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message: { type: string }
 *                 token: { type: string }
 *                 company: { $ref: '#/components/schemas/Company' }
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/register", companyController.registerCompanyPublic);

/**
 * @swagger
 * /api/v1/companies/me:
 *   get:
 *     tags: [Companies]
 *     summary: Get my company (member token only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Company
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 company: { $ref: '#/components/schemas/Company' }
 *       401:
 *         description: Unauthorized
 *       400:
 *         description: Member not linked to a company
 */
router.get("/me", authenticate, companyController.getMyCompany);

/**
 * @swagger
 * /api/v1/companies/me:
 *   patch:
 *     tags: [Companies]
 *     summary: Update my company (member token only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompanyUpdateRequest' }
 *     responses:
 *       200:
 *         description: Updated
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (owner cannot use this)
 */
router.patch("/me", authenticate, companyController.updateMyCompany);

// ===================== OWNER / ADMIN =====================

/**
 * @swagger
 * /api/v1/companies/admin/register:
 *   post:
 *     tags: [Companies Admin]
 *     summary: Owner registers a company (owner only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompanyRegisterRequest' }
 *     responses:
 *       201:
 *         description: Company registered by owner
 *       403:
 *         description: Owner only
 */
router.post("/admin/register", authenticate, requireOwner, companyController.registerCompanyByOwner);

/**
 * @swagger
 * /api/v1/companies/admin:
 *   get:
 *     tags: [Companies Admin]
 *     summary: List companies (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: q
 *         schema: { type: string }
 *         description: Search term
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: List
 *       403:
 *         description: Owner only
 */
router.get("/admin", authenticate, requireOwner, companyController.adminListCompanies);

/**
 * @swagger
 * /api/v1/companies/admin/{id}:
 *   get:
 *     tags: [Companies Admin]
 *     summary: Get company by id (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Company
 *       404:
 *         description: Not found
 */
router.get("/admin/:id", authenticate, requireOwner, companyController.adminGetCompanyById);

/**
 * @swagger
 * /api/v1/companies/admin/{id}:
 *   patch:
 *     tags: [Companies Admin]
 *     summary: Update company by id (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/CompanyUpdateRequest' }
 *     responses:
 *       200:
 *         description: Updated
 *       404:
 *         description: Not found
 */
router.patch("/admin/:id", authenticate, requireOwner, companyController.adminUpdateCompanyById);

/**
 * @swagger
 * /api/v1/companies/admin/{id}:
 *   delete:
 *     tags: [Companies Admin]
 *     summary: Delete company by id (owner only)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *       404:
 *         description: Not found
 */
router.delete("/admin/:id", authenticate, requireOwner, companyController.adminDeleteCompanyById);

module.exports = router;
