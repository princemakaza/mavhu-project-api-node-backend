// controllers/user_controller.js
const userService = require("../services/user_service");
const asyncHandler = require("../utils/async_handler");
const { AppError } = require("../utils/error_handler");
const logger = require("../utils/logger"); // Assuming you have a logger utility
const { generateOwnerToken } = require("../middlewares/auth");

// Helpers (optional) to validate required fields early with 400
function requireFields(body, fields = []) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === ""
  );
  if (missing.length) {
    throw new AppError("Missing required fields", 400, "MISSING_FIELDS", {
      missing,
    });
  }
}

// Helper function to handle and log errors
function handleError(error, operation, userId = null) {
  const errorInfo = {
    operation,
    userId,
    error: error.message,
    stack: error.stack,
    code: error.code || 'UNKNOWN_ERROR',
    timestamp: new Date().toISOString()
  };
  
  logger.error(`Error in ${operation}:`, errorInfo);
  
  // Return error response structure
  return {
    success: false,
    error: error.message || 'An unexpected error occurred',
    code: error.code || 'INTERNAL_SERVER_ERROR',
    details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    timestamp: errorInfo.timestamp
  };
}

/**
 * POST /api/users/register
 */
const register = asyncHandler(async (req, res) => {
  try {
    requireFields(req.body, ["full_name", "email", "password"]);

    const { full_name, email, phone, password } = req.body;

    const user = await userService.registerUserWithEmailOtp({
      full_name,
      email,
      phone,
      password,
    });

    res.status(201).json({
      success: true,
      message: "OTP sent to email. Please verify to activate account.",
      user: {
        _id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        email_verified: user.email_verified,
        created_at: user.created_at,
      },
    });
  } catch (error) {
    const errorResponse = handleError(error, 'User Registration');
    res.status(error.statusCode || 500).json(errorResponse);
  }
});


/**
 * POST /api/users/login
 */
const login = asyncHandler(async (req, res) => {
  try {
    requireFields(req.body, ["email", "password"]);

    const { email, password } = req.body;

    const user = await userService.loginUserWithEmailPassword({ email, password });

    // Create JWT for owner user
    const token = generateOwnerToken(user);

    res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        email_verified: user.email_verified,
      },
    });
  } catch (error) {
    const errorResponse = handleError(error, "User Login");
    res.status(error.statusCode || 500).json(errorResponse);
  }
});


/**
 * POST /api/users/verify-email-otp
 */
const verifyEmailOtp = asyncHandler(async (req, res) => {
  try {
    requireFields(req.body, ["email", "otp"]);

    const { email, otp } = req.body;

    const user = await userService.verifyEmailOtp({ email, otp });

    res.status(200).json({
      success: true,
      message: "Email verified. Account activated.",
      user: {
        _id: user._id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        status: user.status,
        email_verified: user.email_verified,
      },
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Email OTP Verification');
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

/**
 * GET /api/users/me
 */
const getMe = asyncHandler(async (req, res) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    res.status(200).json({
      success: true,
      userType: req.userType,
      user: req.user,
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Get User Profile', req.user?._id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

/**
 * PATCH /api/users/me
 */
const updateMe = asyncHandler(async (req, res) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    const updated = await userService.updateOwnProfile(req.user._id, req.body);

    res.status(200).json({
      success: true,
      message: "Profile updated",
      user: updated,
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Update User Profile', req.user?._id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

/**
 * POST /api/users/forgot-password/request-otp
 */
const requestPasswordResetOtp = asyncHandler(async (req, res) => {
  try {
    requireFields(req.body, ["email"]);

    await userService.requestPasswordResetOtp(req.body.email);

    res.status(200).json({
      success: true,
      message: "Password reset OTP sent to email",
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Request Password Reset OTP');
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

/**
 * POST /api/users/forgot-password/reset
 */
const resetPasswordWithOtp = asyncHandler(async (req, res) => {
  try {
    requireFields(req.body, ["email", "otp", "newPassword"]);

    const { email, otp, newPassword } = req.body;

    const user = await userService.resetPasswordWithOtp({
      email,
      otp,
      newPassword,
    });

    res.status(200).json({
      success: true,
      message: "Password reset successful",
      user: {
        _id: user._id,
        email: user.email,
        full_name: user.full_name,
        status: user.status,
      },
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Reset Password with OTP');
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

/**
 * POST /api/users/delete-account/request-otp
 */
const sendDeleteAccountOtp = asyncHandler(async (req, res) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

    await userService.sendDeleteAccountOtp(req.user._id);

    res.status(200).json({
      success: true,
      message: "Delete account OTP sent to email",
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Send Delete Account OTP', req.user?._id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

/**
 * POST /api/users/delete-account/verify-and-delete
 */
const verifyDeleteAccountOtpAndDelete = asyncHandler(async (req, res) => {
  try {
    if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
    requireFields(req.body, ["otp"]);

    await userService.verifyDeleteAccountOtpAndDelete(req.user._id, req.body.otp);

    res.status(200).json({
      success: true,
      message: "Account deleted",
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Verify Delete Account OTP', req.user?._id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

// ===================== ADMIN / OWNER ROUTES =====================

const adminCreateUser = asyncHandler(async (req, res) => {
  try {
    requireFields(req.body, ["full_name", "email"]);

    const user = await userService.createUser(req.body);

    res.status(201).json({
      success: true,
      message: "User created",
      user,
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Admin Create User');
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

const adminListUsers = asyncHandler(async (req, res) => {
  try {
    const { status, role, page, limit } = req.query;

    const result = await userService.listUsers({
      status,
      role,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });

    res.status(200).json({
      success: true,
      ...result
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Admin List Users');
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

const adminGetUserById = asyncHandler(async (req, res) => {
  try {
    const user = await userService.getUserById(req.params.id);
    if (!user) throw new AppError("User not found", 404, "NOT_FOUND");

    res.status(200).json({
      success: true,
      user
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Admin Get User By ID', req.params.id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

const adminUpdateUser = asyncHandler(async (req, res) => {
  try {
    const updated = await userService.updateUserByAdmin(req.params.id, req.body);
    if (!updated) throw new AppError("User not found", 404, "NOT_FOUND");

    res.status(200).json({
      success: true,
      message: "User updated",
      user: updated,
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Admin Update User', req.params.id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

const adminDeleteUser = asyncHandler(async (req, res) => {
  try {
    const deleted = await userService.deleteUser(req.params.id);
    if (!deleted) throw new AppError("User not found", 404, "NOT_FOUND");

    res.status(200).json({
      success: true,
      message: "User deleted"
    });
  } catch (error) {
    const errorResponse = handleError(error, 'Admin Delete User', req.params.id);
    res.status(error.statusCode || 500).json(errorResponse);
  }
});

module.exports = {
  register,
  verifyEmailOtp,
  getMe,
  updateMe,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
  sendDeleteAccountOtp,
  verifyDeleteAccountOtpAndDelete,
  adminCreateUser,
  adminListUsers,
  adminGetUserById,
  adminUpdateUser,
  adminDeleteUser,
  login
};