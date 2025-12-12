// utils/app_error.js
class AppError extends Error {
  constructor(message, statusCode = 400, code = "BAD_REQUEST", details = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

module.exports = AppError;
