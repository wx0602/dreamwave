class AppError extends Error {
  constructor(code, message, statusCode = 400, details = null) {
    super(message);
    this.name = "AppError";
    this.code = String(code || "APP_ERROR");
    this.statusCode = Number(statusCode) || 400;
    this.details = details;
  }
}

function isAppError(error) {
  return Boolean(error && error.name === "AppError" && error.code);
}

module.exports = {
  AppError,
  isAppError,
};
