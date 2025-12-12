// services/member_service.js
const bcrypt = require("bcryptjs");
const Member = require("../models/member_model");
const Company = require("../models/company_model");
const AppError = require("../utils/app_error");

const SALT_ROUNDS = 10;

async function createMember({
  companyId,
  firstName,
  lastName,
  email,
  title,
  role,
  department,
  phone,
  password,
}) {
  if (!companyId)
    throw new AppError("Company is required", 400, "MISSING_FIELDS", {
      missing: ["companyId"],
    });
  if (!firstName || !lastName || !email) {
    throw new AppError("Missing required fields", 400, "MISSING_FIELDS", {
      missing: ["firstName", "lastName", "email"],
    });
  }

  const company = await Company.findById(companyId);
  if (!company) throw new AppError("Company not found", 404, "NOT_FOUND");

  const normalizedEmail = email.toLowerCase();

  // If email is unique globally this works. If not unique, adapt to {email, company}.
  const existing = await Member.findOne({ email: normalizedEmail });
  if (existing)
    throw new AppError("Email already in use", 409, "DUPLICATE_EMAIL");

  if (!password)
    throw new AppError("Password is required", 400, "MISSING_FIELDS", {
      missing: ["password"],
    });

  const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

  const member = await Member.create({
    company: companyId,
    firstName,
    lastName,
    email: normalizedEmail,
    title,
    role: role || "member",
    department,
    phone,
    status: "active",
    joinedAt: new Date(),
    password_hash,
  });

  return member;
}

async function loginMember({ email, password }) {
  if (!email || !password)
    throw new AppError(
      "Email and password are required",
      400,
      "MISSING_FIELDS",
      { missing: ["email", "password"] }
    );

  const normalizedEmail = email.toLowerCase();

  const member = await Member.findOne({ email: normalizedEmail }).select(
    "+password_hash"
  );
  if (!member)
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");

  if (member.status !== "active")
    throw new AppError("Member account is inactive", 403, "INACTIVE_ACCOUNT");

  const ok = await bcrypt.compare(password, member.password_hash || "");
  if (!ok)
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");

  // return without password_hash
  member.password_hash = undefined;
  return member;
}

async function getMemberById(memberId) {
  const member = await Member.findById(memberId);
  if (!member) throw new AppError("Member not found", 404, "NOT_FOUND");
  return member;
}

async function listMembers({
  companyId,
  status,
  role,
  page = 1,
  limit = 20,
} = {}) {
  const filter = {};
  if (companyId) filter.company = companyId;
  if (status) filter.status = status;
  if (role) filter.role = role;

  const skip = (Number(page) - 1) * Number(limit);

  const [items, total] = await Promise.all([
    Member.find(filter).sort({ joinedAt: -1 }).skip(skip).limit(Number(limit)),
    Member.countDocuments(filter),
  ]);

  return {
    items,
    total,
    page: Number(page),
    limit: Number(limit),
    totalPages: Math.ceil(total / Number(limit)),
  };
}

async function updateMember(memberId, data) {
  const allowed = [
    "firstName",
    "lastName",
    "title",
    "role",
    "department",
    "phone",
    "status",
  ];
  const update = {};

  for (const key of allowed) {
    if (data[key] !== undefined) update[key] = data[key];
  }

  const updated = await Member.findByIdAndUpdate(
    memberId,
    { $set: update },
    { new: true, runValidators: true }
  );
  if (!updated) throw new AppError("Member not found", 404, "NOT_FOUND");

  return updated;
}

async function deactivateMember(memberId) {
  const updated = await Member.findByIdAndUpdate(
    memberId,
    { $set: { status: "inactive" } },
    { new: true }
  );
  if (!updated) throw new AppError("Member not found", 404, "NOT_FOUND");
  return updated;
}

module.exports = {
  createMember,
  loginMember,
  getMemberById,
  listMembers,
  updateMember,
  deactivateMember,
};
