const mongoose = require("mongoose");

const AuthProviderSchema = new mongoose.Schema(
  {
    provider: {
      type: String,
      enum: ["google", "apple", "email"],
      required: true,
    },
    provider_user_id: { type: String, required: true },
    added_at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const UserSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    phone: { type: String, unique: true, sparse: true, trim: true },
    password_hash: { type: String, select: false }, // omit if using external auth only

    full_name: { type: String, required: true},
    status: {
      type: String,
      enum: ["pending", "active", "suspended", "deleted"],
      default: "pending",
    },

    // Email verification
    email_verified: { type: Boolean, default: false },
    email_verification_otp: { type: String },
    email_verification_expires_at: { type: Date },

    // OTP for account deletion
    delete_account_otp: { type: String },
    delete_account_otp_expires_at: { type: Date },

    // 🔥 NEW: OTP for password reset
    reset_password_otp: { type: String },
    reset_password_expires_at: { type: Date },

    auth_providers: { type: [AuthProviderSchema], default: [] },
  },
  { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

module.exports = mongoose.model("User", UserSchema);
