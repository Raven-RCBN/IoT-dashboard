const express = require("express");
const crypto = require("crypto");
const Device = require("../models/Device");
const CountRecord = require("../models/CountRecord");
const Assignment = require("../models/Assignment");
const HarvestRecord = require("../models/HarvestRecord");
const { requireAdminToken } = require("../middleware/adminAuth");
const { env } = require("../config/env");
const { success, failure } = require("../utils/responses");

const router = express.Router();

const DAY_SECONDS = 24 * 60 * 60;
const MALAYSIA_OFFSET = "+08:00";
const DASHBOARD_COOKIE = "iot_dashboard_session";
const DASHBOARD_SESSION_SECONDS = 12 * 60 * 60;

function safeEquals(left, right) {
  const leftBuffer = Buffer.from(String(left || ""));
  const rightBuffer = Buffer.from(String(right || ""));
  return (
    leftBuffer.length === rightBuffer.length &&
    crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseCookies(req) {
  return String(req.header("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((cookies, part) => {
      const separator = part.indexOf("=");
      if (separator === -1) return cookies;
      const key = decodeURIComponent(part.slice(0, separator));
      const value = decodeURIComponent(part.slice(separator + 1));
      cookies[key] = value;
      return cookies;
    }, {});
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

function sign(value) {
  return crypto
    .createHmac("sha256", env.dashboardSessionSecret)
    .update(value)
    .digest("base64url");
}

function createSession(username) {
  const payload = base64Url(
    JSON.stringify({
      sub: username,
      exp: Math.floor(Date.now() / 1000) + DASHBOARD_SESSION_SECONDS,
    })
  );
  return `${payload}.${sign(payload)}`;
}

function readSession(req) {
  const token = parseCookies(req)[DASHBOARD_COOKIE];
  if (!token || !token.includes(".")) return null;

  const [payload, signature] = token.split(".");
  if (!safeEquals(sign(payload), signature)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data.sub || !data.exp || data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch (err) {
    return null;
  }
}

function cookieOptions(req, maxAge) {
  const secure =
    req.secure || String(req.header("x-forwarded-proto") || "").split(",")[0] === "https";
  return [
    `${DASHBOARD_COOKIE}=`,
    `Max-Age=${maxAge}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    secure ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function requestHost(req) {
  return String(req.hostname || req.header("host") || "")
    .split(":")[0]
    .toLowerCase();
}

function dashboardIsPublic(req) {
  if (!env.dashboardPublic) {
    return false;
  }

  if (env.dashboardPublicHosts.length === 0) {
    return true;
  }

  return env.dashboardPublicHosts.includes(requestHost(req));
}

function dashboardLoginEnabled(req) {
  return Boolean(env.dashboardUser && env.dashboardPassword && dashboardIsPublic(req));
}

function hasAdminToken(req) {
  const token = req.header("X-Admin-Token");
  return Boolean(env.adminApiToken && token && safeEquals(env.adminApiToken, token));
}

function requireDashboardAccess(req, res, next) {
  if (hasAdminToken(req)) {
    return next();
  }

  if (dashboardLoginEnabled(req) && readSession(req)) {
    return next();
  }

  return requireAdminToken(req, res, next);
}

router.get("/config", (req, res) => {
  const session = readSession(req);
  const loginEnabled = dashboardLoginEnabled(req);
  return success(res, {
    authRequired: loginEnabled ? !session : !hasAdminToken(req),
    loginEnabled,
    authenticated: Boolean(session),
    username: session ? session.sub : null,
  });
});

router.post("/login", (req, res) => {
  if (!dashboardLoginEnabled(req)) {
    return failure(res, 403, "LOGIN_DISABLED", "Dashboard login is not enabled for this host.");
  }

  const username = String(req.body.username || "");
  const password = String(req.body.password || "");
  if (!safeEquals(username, env.dashboardUser) || !safeEquals(password, env.dashboardPassword)) {
    return failure(res, 401, "INVALID_LOGIN", "Username or password is invalid.");
  }

  res.setHeader(
    "Set-Cookie",
    `${DASHBOARD_COOKIE}=${encodeURIComponent(createSession(username))}; ${cookieOptions(req, DASHBOARD_SESSION_SECONDS)
      .split("; ")
      .slice(1)
      .join("; ")}`
  );
  return success(res, { username });
});

router.post("/logout", (req, res) => {
  res.setHeader("Set-Cookie", cookieOptions(req, 0));
  return success(res);
});

function parseDateWindow(dateValue) {
  if (!dateValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
    return false;
  }

  const startMs = Date.parse(`${dateValue}T00:00:00${MALAYSIA_OFFSET}`);
  if (Number.isNaN(startMs)) {
    return false;
  }

  const start = Math.floor(startMs / 1000);
  return { start, end: start + DAY_SECONDS };
}

function gpsE7ToDecimal(value) {
  return Number((value / 10000000).toFixed(7));
}

function buildTimeRangeQuery(field, window) {
  if (!window) {
    return {};
  }
  return { [field]: { $gte: window.start, $lt: window.end } };
}

function serializeCountRecord(record) {
  const lat = gpsE7ToDecimal(record.lat);
  const lon = gpsE7ToDecimal(record.lon);

  return {
    type: "upload",
    deviceId: record.deviceId,
    role: "count",
    recordId: record.localId,
    assignmentId: null,
    pointId: record.localId,
    sectorName: record.zoneId ? `Zone ${record.zoneId}` : "",
    lat,
    lon,
    rawLat: record.lat,
    rawLon: record.lon,
    deviceTs: record.ts,
    serverTs: record.receivedAt,
    battery: record.battery ?? null,
    status: "Received",
  };
}

function serializeHarvestRecord(record) {
  const lat = gpsE7ToDecimal(record.lat);
  const lon = gpsE7ToDecimal(record.lon);

  return {
    type: "harvest_upload",
    deviceId: record.deviceId,
    role: "harvest",
    recordId: `${record.assignmentId}:${record.pointId}`,
    assignmentId: record.assignmentId,
    pointId: record.pointId,
    sectorName: "",
    lat,
    lon,
    rawLat: record.lat,
    rawLon: record.lon,
    deviceTs: record.ts,
    serverTs: record.receivedAt,
    battery: null,
    status: "Harvest result",
  };
}

function serializeAssignmentPoint(assignment, point) {
  const lat = gpsE7ToDecimal(point.lat);
  const lon = gpsE7ToDecimal(point.lon);

  return {
    type: "download",
    deviceId: assignment.harvesterDeviceId,
    role: "harvest",
    recordId: `${assignment.assignmentId}:${point.pointId}`,
    assignmentId: assignment.assignmentId,
    pointId: point.pointId,
    sectorName: assignment.sectorName,
    lat,
    lon,
    rawLat: point.lat,
    rawLon: point.lon,
    deviceTs: assignment.generatedAt,
    serverTs: assignment.ackedAt || assignment.generatedAt,
    battery: null,
    status: assignment.ackedAt ? "Downloaded and acked" : "Available to download",
  };
}

function summarize(rows) {
  return rows.reduce(
    (summary, row) => {
      summary.total += 1;
      if (row.type === "upload") summary.uploads += 1;
      if (row.type === "download") summary.downloads += 1;
      if (row.type === "harvest_upload") summary.harvestUploads += 1;
      return summary;
    },
    { total: 0, uploads: 0, downloads: 0, harvestUploads: 0 }
  );
}

router.get("/data", requireDashboardAccess, async (req, res, next) => {
  try {
    const dateWindow = parseDateWindow(req.query.date);
    if (dateWindow === false) {
      return failure(res, 400, "INVALID_QUERY", "date must use YYYY-MM-DD format.");
    }

    const device = String(req.query.device || "all").trim();
    const deviceFilter = device && device.toLowerCase() !== "all" ? device : null;
    const limit = Math.min(Number(req.query.limit || 1000), 5000);

    const countQuery = {
      ...buildTimeRangeQuery("receivedAt", dateWindow),
      ...(deviceFilter ? { deviceId: deviceFilter } : {}),
    };
    const harvestQuery = {
      ...buildTimeRangeQuery("receivedAt", dateWindow),
      ...(deviceFilter ? { deviceId: deviceFilter } : {}),
    };
    const assignmentQuery = {
      ...buildTimeRangeQuery("generatedAt", dateWindow),
      ...(deviceFilter ? { harvesterDeviceId: deviceFilter } : {}),
    };

    const [devices, countRecords, harvestRecords, assignments] = await Promise.all([
      Device.find({})
        .sort({ deviceId: 1 })
        .select("-_id deviceId role lastSeen battery firmware seq")
        .lean()
        .exec(),
      CountRecord.find(countQuery).sort({ receivedAt: -1 }).limit(limit).lean().exec(),
      HarvestRecord.find(harvestQuery).sort({ receivedAt: -1 }).limit(limit).lean().exec(),
      Assignment.find(assignmentQuery).sort({ generatedAt: -1 }).limit(limit).lean().exec(),
    ]);

    const rows = [
      ...countRecords.map(serializeCountRecord),
      ...harvestRecords.map(serializeHarvestRecord),
      ...assignments.flatMap((assignment) =>
        assignment.points.map((point) => serializeAssignmentPoint(assignment, point))
      ),
    ].sort((a, b) => b.serverTs - a.serverTs);

    return success(res, {
      filters: {
        date: req.query.date || null,
        device: deviceFilter || "all",
      },
      devices,
      summary: summarize(rows),
      rows,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
