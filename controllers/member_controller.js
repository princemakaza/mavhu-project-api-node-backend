// controllers/member_controller.js
const asyncHandler = require("../utils/async_handler");
const AppError = require("../utils/app_error");
const memberService = require("../services/member_service");
const { generateMemberToken } = require("../middlewares/auth");

function requireFields(body, fields = []) {
  const missing = fields.filter(
    (f) => body?.[f] === undefined || body?.[f] === ""
  );
  if (missing.length)
    throw new AppError("Missing required fields", 400, "MISSING_FIELDS", {
      missing,
    });
}

/**
 * Public: Member login
 * POST /api/members/login
 */
const login = asyncHandler(async (req, res) => {
  requireFields(req.body, ["email", "password"]);

  const member = await memberService.loginMember(req.body);
  const token = generateMemberToken(member);

  res.status(200).json({
    message: "Login successful",
    token,
    member,
  });
});

/**
 * Company-side: Create member for own company
 * POST /api/members
 * Auth required: member token; must be admin to add members
 */
const createForMyCompany = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");
  if (req.userType !== "member")
    throw new AppError("Forbidden", 403, "FORBIDDEN");

  // Only company admin can add members
  if (req.user.role !== "admin")
    throw new AppError("Forbidden: admin only", 403, "FORBIDDEN");

  requireFields(req.body, ["firstName", "lastName", "email", "password"]);

  const member = await memberService.createMember({
    companyId: req.user.company,
    ...req.body,
  });

  res.status(201).json({
    message: "Member created successfully",
    member,
  });
});

/**
 * Owner-side: Create member for any company
 * POST /api/members/admin
 */
const createByOwner = asyncHandler(async (req, res) => {
  if (!req.user || req.userType !== "owner")
    throw new AppError("Forbidden: owner only", 403, "FORBIDDEN");

  requireFields(req.body, [
    "companyId",
    "firstName",
    "lastName",
    "email",
    "password",
  ]);

  const member = await memberService.createMember({
    companyId: req.body.companyId,
    ...req.body,
  });

  res.status(201).json({
    message: "Member created successfully (owner)",
    member,
  });
});

/**
 * List members
 * - Owner can list any company with query companyId
 * - Company member can list only their company
 * GET /api/members
 */
const list = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const { status, role, page, limit, companyId } = req.query;

  let effectiveCompanyId = companyId;

  if (req.userType === "member") {
    effectiveCompanyId = req.user.company;
  }

  const result = await memberService.listMembers({
    companyId: effectiveCompanyId,
    status,
    role,
    page,
    limit,
  });

  res.status(200).json(result);
});

/**
 * Get member by id
 * - Owner can fetch any member
 * - Company member can fetch only within their company
 * GET /api/members/:id
 */
const getById = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const member = await memberService.getMemberById(req.params.id);

  if (
    req.userType === "member" &&
    member.company.toString() !== req.user.company.toString()
  ) {
    throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  res.status(200).json({ member });
});

/**
 * Update member
 * - Owner can update any
 * - Company admin can update within their company
 * PATCH /api/members/:id
 */
const update = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const member = await memberService.getMemberById(req.params.id);

  if (req.userType === "member") {
    if (req.user.role !== "admin")
      throw new AppError("Forbidden: admin only", 403, "FORBIDDEN");
    if (member.company.toString() !== req.user.company.toString())
      throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const updated = await memberService.updateMember(req.params.id, req.body);

  res.status(200).json({
    message: "Member updated successfully",
    member: updated,
  });
});

/**
 * Deactivate member (soft deactivate)
 * - Owner can deactivate any
 * - Company admin can deactivate within their company
 * POST /api/members/:id/deactivate
 */
const deactivate = asyncHandler(async (req, res) => {
  if (!req.user) throw new AppError("Unauthorized", 401, "UNAUTHORIZED");

  const member = await memberService.getMemberById(req.params.id);

  if (req.userType === "member") {
    if (req.user.role !== "admin")
      throw new AppError("Forbidden: admin only", 403, "FORBIDDEN");
    if (member.company.toString() !== req.user.company.toString())
      throw new AppError("Forbidden", 403, "FORBIDDEN");
  }

  const updated = await memberService.deactivateMember(req.params.id);

  res.status(200).json({
    message: "Member deactivated successfully",
    member: updated,
  });
});

module.exports = {
  login,
  createForMyCompany,
  createByOwner,
  list,
  getById,
  update,
  deactivate,
};
