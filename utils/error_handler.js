// utils/error_handler.js
const AppError = require("./app_error");
function normalizeError(err) {
  if (err instanceof AppError) return err;
  if (err && typeof err.statusCode === "number") {
    return new AppError(
      err.message || "Request failed",
      err.statusCode,
      err.code || httpToCode(err.statusCode),
      err.details || null
    );
  }
  if (err?.name === "ValidationError") {
    const details = Object.values(err.errors || {}).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    return new AppError("Validation failed", 422, "VALIDATION_ERROR", details);
  }

  // Mongoose cast error (bad ObjectId etc.) => 400
  if (err?.name === "CastError") {
    return new AppError("Invalid identifier format", 400, "INVALID_ID", {
      path: err.path,
      value: err.value,
    });
  }

  // Mongo duplicate key => 409
  if (err?.code === 11000) {
    const fields = Object.keys(err.keyValue || {});
    return new AppError(
      "Duplicate value for unique field",
      409,
      "DUPLICATE_KEY",
      { fields, keyValue: err.keyValue }
    );
  }

  // JWT errors (if they bubble up) => 401
  if (err?.name === "JsonWebTokenError") {
    return new AppError("Invalid token", 401, "INVALID_TOKEN");
  }
  if (err?.name === "TokenExpiredError") {
    return new AppError("Token expired", 401, "TOKEN_EXPIRED");
  }
  return new AppError("Server error", 500, "SERVER_ERROR");
}

function httpToCode(status) {
  switch (status) {
    case 400: return "BAD_REQUEST";
    case 401: return "UNAUTHORIZED";
    case 403: return "FORBIDDEN";
    case 404: return "NOT_FOUND";
    case 409: return "CONFLICT";
    case 422: return "VALIDATION_ERROR";
    case 429: return "RATE_LIMITED";
    default: return "ERROR";
  }
}
function errorMiddleware(err, req, res, next) {
  const appErr = normalizeError(err);

  // Avoid leaking internals in production
  const response = {
    code: appErr.code,
    message: appErr.message,
  };

  if (appErr.details) response.details = appErr.details;
  res.status(appErr.statusCode).json(response);
}

module.exports = {
  AppError,
  normalizeError,
  errorMiddleware,
};
