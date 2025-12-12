// services/user_service.js
const bcrypt = require("bcryptjs");
const User = require("../models/users_model");
const emailService = require("../utils/user_email_utils");

const SALT_ROUNDS = 10;

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}
async function createUser({ full_name, email, phone, password, roles }) {
  const normalizedEmail = email.toLowerCase();

  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    const error = new Error("Email already in use");
    error.statusCode = 400;
    throw error;
  }

  let password_hash = undefined;
  if (password) {
    password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  }

  const user = new User({
    full_name,
    email: normalizedEmail,
    phone,
    password_hash,
    roles: roles && roles.length ? roles : undefined,
    status: "active",
    email_verified: true,
  });

  await user.save();
  return user;
}

/**
 * 🔥 Registration with email OTP
 */
async function registerUserWithEmailOtp({ full_name, email, phone, password }) {
  const normalizedEmail = email.toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });

  if (existingUser) {
    if (existingUser.status === "pending" && !existingUser.email_verified) {
      const otp = generateOtp();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

      existingUser.full_name = full_name;
      existingUser.phone = phone;
      if (password) {
        existingUser.password_hash = await bcrypt.hash(password, SALT_ROUNDS);
      }
      existingUser.email_verification_otp = otp;
      existingUser.email_verification_expires_at = expiresAt;

      await existingUser.save();

      await emailService.sendVerificationEmail({
        to: normalizedEmail,
        fullName: full_name,
        otp: otp,
      });

      return existingUser;
    }

    const error = new Error("Email already in use");
    error.statusCode = 400;
    throw error;
  }

  let password_hash = undefined;
  if (password) {
    password_hash = await bcrypt.hash(password, SALT_ROUNDS);
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  const user = new User({
    full_name,
    email: normalizedEmail,
    phone,
    password_hash,
    roles: undefined,
    status: "pending",
    email_verified: false,
    email_verification_otp: otp,
    email_verification_expires_at: expiresAt,
  });

  await user.save();

  await emailService.sendVerificationEmail({
    to: normalizedEmail,
    fullName: full_name,
    otp: otp,
  });

  return user;
}

/**
 * 🔥 Verify registration OTP and activate account
 */
async function verifyEmailOtp({ email, otp }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (user.email_verified && user.status === "active") {
    const error = new Error("Email already verified");
    error.statusCode = 400;
    throw error;
  }

  if (!user.email_verification_otp || !user.email_verification_expires_at) {
    const error = new Error("No OTP found, please request a new one");
    error.statusCode = 400;
    throw error;
  }

  if (user.email_verification_otp !== otp) {
    const error = new Error("Invalid OTP");
    error.statusCode = 400;
    throw error;
  }

  if (user.email_verification_expires_at < new Date()) {
    const error = new Error("OTP has expired");
    error.statusCode = 400;
    throw error;
  }

  user.email_verified = true;
  user.status = "active";
  user.email_verification_otp = undefined;
  user.email_verification_expires_at = undefined;

  await user.save();
  return user;
}

/**
 * 🔥 Send OTP for account deletion
 */
async function sendDeleteAccountOtp(userId) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  user.delete_account_otp = otp;
  user.delete_account_otp_expires_at = expiresAt;
  await user.save();

  await emailService.sendDeleteAccountEmail({
    to: user.email,
    fullName: user.full_name,
    otp: otp,
  });

  return true;
}

/**
 * 🔥 Verify delete-account OTP and delete user
 */
async function verifyDeleteAccountOtpAndDelete(userId, otp) {
  const user = await User.findById(userId);

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.delete_account_otp || !user.delete_account_otp_expires_at) {
    const error = new Error("No OTP found, please request a new one");
    error.statusCode = 400;
    throw error;
  }

  if (user.delete_account_otp !== otp) {
    const error = new Error("Invalid OTP");
    error.statusCode = 400;
    throw error;
  }

  if (user.delete_account_otp_expires_at < new Date()) {
    const error = new Error("OTP has expired");
    error.statusCode = 400;
    throw error;
  }

  user.delete_account_otp = undefined;
  user.delete_account_otp_expires_at = undefined;
  await user.save();

  await deleteUser(userId);
  return true;
}

/**
 * 🔥 Forgot password – request OTP
 */
async function requestPasswordResetOtp(email) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail });

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000);

  user.reset_password_otp = otp;
  user.reset_password_expires_at = expiresAt;
  await user.save();

  // You need this function in user_email_utils.js
  await emailService.sendPasswordResetEmail({
    to: user.email,
    fullName: user.full_name,
    otp: otp,
  });

  return true;
}

/**
 * 🔥 Forgot password – verify OTP and set new password
 */
async function resetPasswordWithOtp({ email, otp, newPassword }) {
  const normalizedEmail = email.toLowerCase();
  const user = await User.findOne({ email: normalizedEmail }).select(
    "+password_hash"
  );

  if (!user) {
    const error = new Error("User not found");
    error.statusCode = 404;
    throw error;
  }

  if (!user.reset_password_otp || !user.reset_password_expires_at) {
    const error = new Error("No OTP found, please request a new one");
    error.statusCode = 400;
    throw error;
  }

  if (user.reset_password_otp !== otp) {
    const error = new Error("Invalid OTP");
    error.statusCode = 400;
    throw error;
  }

  if (user.reset_password_expires_at < new Date()) {
    const error = new Error("OTP has expired");
    error.statusCode = 400;
    throw error;
  }

  const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);

  user.password_hash = password_hash;
  user.reset_password_otp = undefined;
  user.reset_password_expires_at = undefined;

  await user.save();

  return user;
}

/**
 * Find user by email (without password_hash)
 */
async function getUserByEmail(email) {
  return User.findOne({ email: email.toLowerCase() });
}

/**
 * Find user by email including password_hash
 */
async function getUserByEmailWithPassword(email) {
  return User.findOne({ email: email.toLowerCase() }).select("+password_hash");
}

/**
 * Validate user password
 */
async function validatePassword(user, password) {
  if (!user.password_hash) return false;
  return bcrypt.compare(password, user.password_hash);
}


// 🔥 Login with email + password (only if email is verified)
async function loginUserWithEmailPassword({ email, password }) {
  const normalizedEmail = email.toLowerCase();

  // Include password_hash because it's select:false in schema
  const user = await User.findOne({ email: normalizedEmail }).select("+password_hash");

  if (!user) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  // Must be verified + active
  if (!user.email_verified || user.status !== "active") {
    const error = new Error("Email not verified. Please verify OTP to activate account.");
    error.statusCode = 403;
    throw error;
  }

  // Must have a password (email/password login only)
  if (!user.password_hash) {
    const error = new Error("Password login not available for this account");
    error.statusCode = 400;
    throw error;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    const error = new Error("Invalid email or password");
    error.statusCode = 401;
    throw error;
  }

  // Remove password_hash before returning user object
  user.password_hash = undefined;

  return user;
}


/**
 * Get user by ID
 */
async function getUserById(userId) {
  return User.findById(userId);
}

/**
 * List users with optional filters & pagination
 */
async function listUsers({ status, role, page = 1, limit = 20 } = {}) {
  const filter = {};

  if (status) {
    filter.status = status;
  }

  if (role) {
    filter.roles = role; // match anyone with that role in roles[]
  }

  const skip = (page - 1) * limit;

  const [users, total] = await Promise.all([
    User.find(filter).skip(skip).limit(limit).sort({ created_at: -1 }),
    User.countDocuments(filter),
  ]);

  return {
    users,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

/**
 * Update currently authenticated user's profile
 */
async function updateOwnProfile(userId, data) {
  const { full_name, phone } = data;

  const update = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (phone !== undefined) update.phone = phone;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true }
  );

  return user;
}

/**
 * Admin/manager: update user fields (including roles, status)
 */
async function updateUserByAdmin(userId, data) {
  const { full_name, phone, roles, status } = data;

  const update = {};
  if (full_name !== undefined) update.full_name = full_name;
  if (phone !== undefined) update.phone = phone;
  if (Array.isArray(roles) && roles.length > 0) update.roles = roles;
  if (status !== undefined) update.status = status;

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: update },
    { new: true }
  );

  return user;
}

/**
 * Change user status
 */
async function changeUserStatus(userId, status) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { status } },
    { new: true }
  );

  return user;
}

/**
 * Delete user (hard delete)
 */
async function deleteUser(userId) {
  return User.findByIdAndDelete(userId);
}

module.exports = {
  loginUserWithEmailPassword,
  createUser,
  registerUserWithEmailOtp,
  verifyEmailOtp,
  getUserByEmail,
  getUserByEmailWithPassword,
  validatePassword,
  getUserById,
  listUsers,
  updateOwnProfile,
  updateUserByAdmin,
  changeUserStatus,
  deleteUser,
  sendDeleteAccountOtp,
  verifyDeleteAccountOtpAndDelete,
  requestPasswordResetOtp,
  resetPasswordWithOtp,
};
