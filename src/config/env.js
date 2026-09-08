require("dotenv").config();

const env = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.PORT || 3000),
  mongodbUri:
    process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/plantation_tracker",
  countNextUploadSeconds: Number(process.env.COUNT_NEXT_UPLOAD_SECONDS || 3600),
  adminApiToken: process.env.ADMIN_API_TOKEN || "",
};

module.exports = { env };
