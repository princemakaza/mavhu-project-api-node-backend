// routes/member_router.js
const express = require("express");
const router = express.Router();

const memberController = require("../controllers/member_controller");
const { authenticate } = require("../middlewares/auth");

/**
 * @swagger
 * tags:
 *   - name: Members
 *     description: Company members (login + management)
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
 *         message: { type: string, example: "Missing required fields" }
 *         details: { type: object }
 *
 *     Member:
 *       type: object
 *       properties:
 *         _id: { type: string, example: "665a8c7be4f1c23b04d12345" }
 *         company: { type: string, example: "665a8c7be4f1c23b04d99999" }
 *         firstName: { type: string, example: "John" }
 *         lastName: { type: string, example: "Doe" }
 *         email: { type: string, example: "john@example.com" }
 *         title: { type: string, example: "Operations Manager" }
 *         role: { type: string, enum: ["admin", "member"], example: "member" }
 *         department: { type: string, example: "Operations" }
 *         phone: { type: string, example: "+263771234567" }
 *         status: { type: string, enum: ["active", "inactive"], example: "active" }
 *         joinedAt: { type: string, format: date-time }
 *
 *     MemberLoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email: { type: string, example: "john@example.com" }
 *         password: { type: string, example: "StrongPass123!" }
 *
 *     MemberCreateRequest:
 *       type: object
 *       required: [firstName, lastName, email, password]
 *       properties:
 *         firstName: { type: string, example: "John" }
 *         lastName: { type: string, example: "Doe" }
 *         email: { type: string, example: "john@example.com" }
 *         password: { type: string, example: "StrongPass123!" }
 *         title: { type: string, example: "Manager" }
 *         role: { type: string, enum: ["admin", "member"], example: "member" }
 *         department: { type: string, example: "Finance" }
 *         phone: { type: string, example: "+263771234567" }
 *
 *     MemberCreateByOwnerRequest:
 *       allOf:
 *         - $ref: '#/components/schemas/MemberCreateRequest'
 *         - type: object
 *           required: [companyId]
 *           properties:
 *             companyId: { type: string, example: "665a8c7be4f1c23b04d99999" }
 *
 *     MemberUpdateRequest:
 *       type: object
 *       properties:
 *         firstName: { type: string }
 *         lastName: { type: string }
 *         title: { type: string }
 *         role: { type: string, enum: ["admin", "member"] }
 *         department: { type: string }
 *         phone: { type: string }
 *         status: { type: string, enum: ["active", "inactive"] }
 */

/**
 * @swagger
 * /api/v1/members/login:
 *   post:
 *     tags: [Members]
 *     summary: Member login (returns JWT token)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MemberLoginRequest' }
 *     responses:
 *       200:
 *         description: Login success
 *       401:
 *         description: Invalid credentials
 */
router.post("/login", memberController.login);

/**
 * @swagger
 * /api/v1/members:
 *   post:
 *     tags: [Members]
 *     summary: Company admin creates a member for their own company
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MemberCreateRequest' }
 *     responses:
 *       201:
 *         description: Member created
 *       403:
 *         description: Admin only
 */
router.post("/", authenticate, memberController.createForMyCompany);

/**
 * @swagger
 * /api/v1/members/admin:
 *   post:
 *     tags: [Members]
 *     summary: Owner creates a member for any company
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/MemberCreateByOwnerRequest' }
 *     responses:
 *       201:
 *         description: Member created by owner
 *       403:
 *         description: Owner only
 */
router.post("/admin", authenticate, memberController.createByOwner);

/**
 * @swagger
 * /api/v1/members:
 *   get:
 *     tags: [Members]
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: companyId
 *         schema: { type: string }
 *         description: Owner only - filter by company
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: ["active", "inactive"] }
 *       - in: query
 *         name: role
 *         schema: { type: string, enum: ["admin", "member"] }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: Members list
 */
router.get("/", authenticate, memberController.list);

/**
 * @swagger
 * /api/v1/members/{id}:
 *   get:
 *     tags: [Members]
 *     summary: Get a member by ID (owner any, company only within company)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Member
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.get("/:id", authenticate, memberController.getById);

/**
 * @swagger
 * /api/v1/members/{id}:
 *   patch:
 *     tags: [Members]
 *     summary: Update a member (owner any, company admin within company)
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
 *           schema: { $ref: '#/components/schemas/MemberUpdateRequest' }
 *     responses:
 *       200:
 *         description: Updated
 *       403:
 *         description: Forbidden
 */
router.patch("/:id", authenticate, memberController.update);

/**
 * @swagger
 * /api/v1/members/{id}/deactivate:
 *   post:
 *     tags: [Members]
 *     summary: Deactivate a member (owner any, company admin within company)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deactivated
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.post("/:id/deactivate", authenticate, memberController.deactivate);

module.exports = router;
