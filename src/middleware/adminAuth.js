const { env } = require("../config/env");
const { failure } = require("../utils/responses");

function requireAdminToken(req, res, next) {
  if (!env.adminApiToken) {
    return failure(res, 503, "SERVER_ERROR", "Admin routes are not configured.");
  }

  const token = req.header("X-Admin-Token");
  if (token !== env.adminApiToken) {
    return failure(res, 401, "INVALID_TOKEN", "Admin token is invalid.");
  }

  return next();
}

module.exports = { requireAdminToken };
