// routes/user_router.js
const express = require("express");
const router = express.Router();

const userController = require("../controllers/user_controller");
const { authenticate, requireOwner } = require("../middlewares/auth");

/**
 * @swagger
 * tags:
 *   - name: Users
 *     description: User registration, profile, OTP flows
 *   - name: Users Admin
 *     description: Owner/admin user management
 */

/**
 * @swagger
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
 *         message:
 *           type: string
 *     RegisterRequest:
 *       type: object
 *       required: [full_name, email, password]
 *       properties:
 *         full_name: { type: string, example: "Prince Makaza" }
 *         email: { type: string, example: "prince@example.com" }
 *         phone: { type: string, example: "+263771234567" }
 *         password: { type: string, example: "StrongPass123!" }
 *     VerifyEmailOtpRequest:
 *       type: object
 *       required: [email, otp]
 *       properties:
 *         email: { type: string, example: "prince@example.com" }
 *         otp: { type: string, example: "123456" }
 *     LoginRequest:
 *       type: object
 *       required: [email, password]
 *       properties:
 *         email: { type: string, example: "prince@example.com" }
 *         password: { type: string, example: "StrongPass123!" }
 *     ForgotPasswordRequestOtp:
 *       type: object
 *       required: [email]
 *       properties:
 *         email: { type: string, example: "prince@example.com" }
 *     ForgotPasswordResetRequest:
 *       type: object
 *       required: [email, otp, newPassword]
 *       properties:
 *         email: { type: string, example: "prince@example.com" }
 *         otp: { type: string, example: "123456" }
 *         newPassword: { type: string, example: "NewStrongPass123!" }
 *     DeleteAccountVerifyRequest:
 *       type: object
 *       required: [otp]
 *       properties:
 *         otp: { type: string, example: "123456" }
 *     AdminCreateUserRequest:
 *       type: object
 *       required: [full_name, email]
 *       properties:
 *         full_name: { type: string, example: "Admin Created User" }
 *         email: { type: string, example: "newuser@example.com" }
 *         phone: { type: string, example: "+263771234567" }
 *         password: { type: string, example: "StrongPass123!" }
 *         roles:
 *           type: array
 *           items: { type: string }
 *           example: ["manager"]
 *     AdminUpdateUserRequest:
 *       type: object
 *       properties:
 *         full_name: { type: string, example: "Updated Name" }
 *         phone: { type: string, example: "+263771234567" }
 *         roles:
 *           type: array
 *           items: { type: string }
 *           example: ["manager", "staff"]
 *         status:
 *           type: string
 *           enum: [pending, active, suspended, deleted]
 */

// ===================== PUBLIC ROUTES =====================

/**
 * @swagger
 * /api/v1/users/register:
 *   post:
 *     tags: [Users]
 *     summary: Register user with email OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/RegisterRequest' }
 *     responses:
 *       201:
 *         description: OTP sent
 *       400:
 *         description: Bad request
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/register", userController.register);

/**
 * @swagger
 * /api/v1/users/verify-email-otp:
 *   post:
 *     tags: [Users]
 *     summary: Verify email OTP and activate user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/VerifyEmailOtpRequest' }
 *     responses:
 *       200:
 *         description: Email verified and account activated
 *       400:
 *         description: Invalid OTP / expired OTP
 *         content:
 *           application/json:
 *             schema: { $ref: '#/components/schemas/ErrorResponse' }
 */
router.post("/verify-email-otp", userController.verifyEmailOtp);

/**
 * @swagger
 * /api/v1/users/forgot-password/request-otp:
 *   post:
 *     tags: [Users]
 *     summary: Request OTP for password reset
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ForgotPasswordRequestOtp' }
 *     responses:
 *       200:
 *         description: OTP sent
 *       404:
 *         description: User not found
 */
router.post(
  "/forgot-password/request-otp",
  userController.requestPasswordResetOtp
);

/**
 * @swagger
 * /api/v1/users/forgot-password/reset:
 *   post:
 *     tags: [Users]
 *     summary: Reset password using OTP
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/ForgotPasswordResetRequest' }
 *     responses:
 *       200:
 *         description: Password reset successful
 *       400:
 *         description: Invalid OTP / expired OTP
 */
router.post("/forgot-password/reset", userController.resetPasswordWithOtp);

// ===================== AUTH ROUTES =====================

/**
 * @swagger
 * /api/v1/users/me:
 *   get:
 *     tags: [Users]
 *     summary: Get current authenticated user (owner or member)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Current user
 *       401:
 *         description: Unauthorized
 */
router.get("/me", authenticate, userController.getMe);

/**
 * @swagger
 * /api/v1/users/me:
 *   patch:
 *     tags: [Users]
 *     summary: Update current authenticated user's profile
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               full_name: { type: string, example: "Prince Makaza" }
 *               phone: { type: string, example: "+263771234567" }
 *     responses:
 *       200:
 *         description: Updated profile
 *       401:
 *         description: Unauthorized
 */
router.patch("/me", authenticate, userController.updateMe);

/**
 * @swagger
 * /api/v1/users/delete-account/request-otp:
 *   post:
 *     tags: [Users]
 *     summary: Send OTP for account deletion (to email)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: OTP sent
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/delete-account/request-otp",
  authenticate,
  userController.sendDeleteAccountOtp
);

/**
 * @swagger
 * /api/v1/users/delete-account/verify-and-delete:
 *   post:
 *     tags: [Users]
 *     summary: Verify delete-account OTP and delete account
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/DeleteAccountVerifyRequest' }
 *     responses:
 *       200:
 *         description: Account deleted
 *       400:
 *         description: Invalid OTP / expired OTP
 *       401:
 *         description: Unauthorized
 */
router.post(
  "/delete-account/verify-and-delete",
  authenticate,
  userController.verifyDeleteAccountOtpAndDelete
);

// ===================== OWNER / ADMIN ROUTES =====================

/**
 * @swagger
 * /api/v1/users/admin/create:
 *   post:
 *     tags: [Users Admin]
 *     summary: Owner creates a user (no OTP)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/AdminCreateUserRequest' }
 *     responses:
 *       201:
 *         description: User created
 *       403:
 *         description: Owner only
 */
router.post(
  "/admin/create",
  authenticate,
  requireOwner,
  userController.adminCreateUser
);

/**
 * @swagger
 * /api/v1/users/admin/list:
 *   get:
 *     tags: [Users Admin]
 *     summary: Owner lists users (filters + pagination)
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema: { type: string, enum: [pending, active, suspended, deleted] }
 *       - in: query
 *         name: role
 *         schema: { type: string }
 *       - in: query
 *         name: page
 *         schema: { type: integer, example: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, example: 20 }
 *     responses:
 *       200:
 *         description: User list
 *       403:
 *         description: Owner only
 */
router.get(
  "/admin/list",
  authenticate,
  requireOwner,
  userController.adminListUsers
);

/**
 * @swagger
 * /api/v1/users/admin/{id}:
 *   get:
 *     tags: [Users Admin]
 *     summary: Owner gets a user by ID
 *     security:
 *       - BearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: User
 *       404:
 *         description: Not found
 */
router.get(
  "/admin/:id",
  authenticate,
  requireOwner,
  userController.adminGetUserById
);

/**
 * @swagger
 * /api/v1/users/login:
 *   post:
 *     tags: [Users]
 *     summary: Login user with email and password (requires verified email)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema: { $ref: '#/components/schemas/LoginRequest' }
 *     responses:
 *       200:
 *         description: Login successful (returns JWT token)
 *       401:
 *         description: Invalid credentials
 *       403:
 *         description: Email not verified
 */
router.post("/login", userController.login);

/**
 * @swagger
 * /api/v1/users/admin/{id}:
 *   patch:
 *     tags: [Users Admin]
 *     summary: Owner updates a user (roles/status/profile)
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
 *           schema: { $ref: '#/components/schemas/AdminUpdateUserRequest' }
 *     responses:
 *       200:
 *         description: User updated
 *       404:
 *         description: Not found
 */
router.patch(
  "/admin/:id",
  authenticate,
  requireOwner,
  userController.adminUpdateUser
);

/**
 * @swagger
 * /api/v1/users/admin/{id}:
 *   delete:
 *     tags: [Users Admin]
 *     summary: Owner deletes a user (hard delete)
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
router.delete(
  "/admin/:id",
  authenticate,
  requireOwner,
  userController.adminDeleteUser
);

module.exports = router;
