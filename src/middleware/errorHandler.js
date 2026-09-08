const { failure } = require("../utils/responses");

function notFound(req, res) {
  return failure(res, 404, "NOT_FOUND", "Route not found.");
}

function errorHandler(err, req, res, next) {
  if (err && err.type === "entity.parse.failed") {
    return failure(res, 400, "INVALID_JSON", "Request body must be valid JSON.");
  }

  if (err && err.type === "entity.too.large") {
    return failure(res, 413, "PAYLOAD_TOO_LARGE", "Payload must be 16 KB or smaller.");
  }

  console.error(err);
  return failure(res, 500, "SERVER_ERROR", "Unexpected server error.");
}

module.exports = { errorHandler, notFound };
