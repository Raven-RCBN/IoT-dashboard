const express = require("express");
const helmet = require("helmet");
const morgan = require("morgan");
const path = require("path");
const countRoutes = require("./routes/count");
const harvestRoutes = require("./routes/harvest");
const adminRoutes = require("./routes/admin");
const dashboardRoutes = require("./routes/dashboard");
const healthRoutes = require("./routes/health");
const { errorHandler, notFound } = require("./middleware/errorHandler");

function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "https://unpkg.com"],
          styleSrc: ["'self'", "https://unpkg.com", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https://*.tile.openstreetmap.org"],
          connectSrc: ["'self'"],
        },
      },
    })
  );
  app.use(morgan("combined"));
  app.use(express.json({ limit: "16kb", type: "application/json" }));
  app.use((req, res, next) => {
    req.body = req.body || {};
    next();
  });

  app.use(express.static(path.join(__dirname, "..", "public")));
  app.use("/", healthRoutes);
  app.use("/api/v1/count", countRoutes);
  app.use("/api/v1/harvest", harvestRoutes);
  app.use("/api/v1/admin", adminRoutes);
  app.use("/api/v1/dashboard", dashboardRoutes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
