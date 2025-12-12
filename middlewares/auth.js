// File: auth.js
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const Member = require("../models/member_model");    // adjust path
const User = require("../models/users_model");     
const JWT_SECRET = process.env.JWT_SECRET || "change-this-secret";
const JWT_EXPIRES_IN = "7d";
function generateMemberToken(member) {
  return jwt.sign(
    {
      sub: member._id.toString(),
      type: "member",                 // identify token type
      role: member.role,
      company: member.company,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}
function generateOwnerToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      type: "owner",                  // identify token as owner
      email: user.email,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

const generateToken = generateMemberToken;
async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header || !header.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Unauthorized: No token" });
    }

    const token = header.split(" ")[1];

    let decoded;
    try {
      decoded = jwt.verify(token, JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ message: "Invalid or expired token" });
    }

    const { sub, type } = decoded;

    let userDoc = null;
    let userType = type;

    if (type === "owner") {
      // Load system owner user
      userDoc = await User.findById(sub);
      if (!userDoc || userDoc.status === "deleted" || userDoc.status === "suspended") {
        return res.status(401).json({ message: "Owner user not found or inactive" });
      }
    } else {
      // Default to member
      userDoc = await Member.findById(sub);
      if (!userDoc || userDoc.status === "inactive") {
        return res.status(401).json({ message: "Member not found or inactive" });
      }
      userType = "member";
    }

    req.user = userDoc;
    req.userType = userType; // "owner" or "member"

    next();
  } catch (err) {
    console.error("Auth error:", err);
    res.status(500).json({ message: "Server error" });
  }
}
function requireRole(role) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Not authenticated" });
    }

    // System owner bypasses role checks
    if (req.userType === "owner") {
      return next();
    }

    // Otherwise check member role
    if (req.user.role !== role) {
      return res.status(403).json({ message: "Forbidden: insufficient role" });
    }

    next();
  };
}

/**
 * Optional: ensure ONLY owner can access a route
 */
function requireOwner(req, res, next) {
  if (!req.user || req.userType !== "owner") {
    return res.status(403).json({ message: "Forbidden: owner only" });
  }
  next();
}
async function hashPassword(plainPassword) {
  const saltRounds = 10;
  return bcrypt.hash(plainPassword, saltRounds);
}
async function verifyPassword(plainPassword, hashedPassword) {
  return bcrypt.compare(plainPassword, hashedPassword);
}

module.exports = {
  generateToken,        // alias for generateMemberToken
  generateMemberToken,
  generateOwnerToken,
  authenticate,
  requireRole,
  requireOwner,
  hashPassword,
  verifyPassword,
};
