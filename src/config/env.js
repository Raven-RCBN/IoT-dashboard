require("dotenv").config();

function readBoolean(value, fallback = false) {
  if (value === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(value).toLowerCase());
}

function readList(value) {
  if (!value) return [];
  return String(value)
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  mongodbUri:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/plantation_tracker",
  countNextUploadSeconds: Number(process.env.COUNT_NEXT_UPLOAD_SECONDS || 3600),
  adminApiToken: process.env.ADMIN_API_TOKEN || "",
  dashboardPublic: readBoolean(process.env.DASHBOARD_PUBLIC, false),
  dashboardPublicHosts: readList(process.env.DASHBOARD_PUBLIC_HOSTS),
  dashboardUser: process.env.DASHBOARD_USER || "",
  dashboardPassword: process.env.DASHBOARD_PASSWORD || "",
  dashboardSessionSecret:
    process.env.DASHBOARD_SESSION_SECRET || process.env.ADMIN_API_TOKEN || "local-dashboard-secret",
};

module.exports = { env };
