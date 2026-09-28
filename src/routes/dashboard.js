const express = require("express");
const crypto = require("crypto");
const Device = require("../models/Device");
const DeviceLink = require("../models/DeviceLink");
const CountRecord = require("../models/CountRecord");
const Assignment = require("../models/Assignment");
const HarvestRecord = require("../models/HarvestRecord");
const { requireAdminToken } = require("../middleware/adminAuth");
const { nextSequence } = require("../services/counters");
const { env } = require("../config/env");
const { success, failure } = require("../utils/responses");
const { unixNow } = require("../utils/time");

const router = express.Router();

const DAY_SECONDS = 24 * 60 * 60;
const HOUR_SECONDS = 60 * 60;
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

function requireDashboardMutationAccess(req, res, next) {
  if (hasAdminToken(req)) return next();

  const origin = req.header("origin");
  try {
    if (!origin || new URL(origin).host !== req.header("host")) {
      return failure(res, 403, "INVALID_ORIGIN", "Request must come from this dashboard.");
    }
  } catch (err) {
    return failure(res, 403, "INVALID_ORIGIN", "Request must come from this dashboard.");
  }

  return requireDashboardAccess(req, res, next);
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

function parseMonthWindow(monthValue) {
  if (!monthValue) {
    return null;
  }

  if (!/^\d{4}-\d{2}$/.test(monthValue)) {
    return false;
  }

  const [year, month] = monthValue.split("-").map(Number);
  if (month < 1 || month > 12) {
    return false;
  }

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const startMs = Date.parse(`${monthValue}-01T00:00:00${MALAYSIA_OFFSET}`);
  const endMs = Date.parse(
    `${String(nextYear).padStart(4, "0")}-${String(nextMonth).padStart(2, "0")}-01T00:00:00${MALAYSIA_OFFSET}`
  );

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return false;
  }

  return { start: Math.floor(startMs / 1000), end: Math.floor(endMs / 1000) };
}

function epochToMalaysiaDate(epoch) {
  if (!epoch) return "";
  return new Date((epoch + 8 * HOUR_SECONDS) * 1000).toISOString().slice(0, 10);
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

async function buildDateCounts(dateWindow, deviceFilter) {
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

  const [countRecords, harvestRecords, assignments] = await Promise.all([
    CountRecord.find(countQuery).select("-_id receivedAt").lean().exec(),
    HarvestRecord.find(harvestQuery).select("-_id receivedAt").lean().exec(),
    Assignment.find(assignmentQuery).select("-_id generatedAt points.pointId").lean().exec(),
  ]);

  const countsByDate = {};
  const ensureDate = (date) => {
    countsByDate[date] = countsByDate[date] || {
      date,
      uploads: 0,
      downloads: 0,
      harvestUploads: 0,
      total: 0,
    };
    return countsByDate[date];
  };

  for (const record of countRecords) {
    const count = ensureDate(epochToMalaysiaDate(record.receivedAt));
    count.uploads += 1;
    count.total += 1;
  }

  for (const record of harvestRecords) {
    const count = ensureDate(epochToMalaysiaDate(record.receivedAt));
    count.harvestUploads += 1;
    count.total += 1;
  }

  for (const assignment of assignments) {
    const count = ensureDate(epochToMalaysiaDate(assignment.generatedAt));
    const pointCount = Array.isArray(assignment.points) ? assignment.points.length : 0;
    count.downloads += pointCount;
    count.total += pointCount;
  }

  return Object.values(countsByDate).sort((a, b) => a.date.localeCompare(b.date));
}

router.get("/data", requireDashboardAccess, async (req, res, next) => {
  try {
    const dateWindow = parseDateWindow(req.query.date);
    if (dateWindow === false) {
      return failure(res, 400, "INVALID_QUERY", "date must use YYYY-MM-DD format.");
    }

    const monthWindow = parseMonthWindow(req.query.month);
    if (monthWindow === false) {
      return failure(res, 400, "INVALID_QUERY", "month must use YYYY-MM format.");
    }

    const device = String(req.query.device || "all").trim();
    const deviceFilter = device && device.toLowerCase() !== "all" ? device : null;
    const limit = Math.min(Number(req.query.limit || 1000), 5000);
    const selectedWindow = dateWindow || monthWindow;

    const countQuery = {
      ...buildTimeRangeQuery("receivedAt", selectedWindow),
      ...(deviceFilter ? { deviceId: deviceFilter } : {}),
    };
    const harvestQuery = {
      ...buildTimeRangeQuery("receivedAt", selectedWindow),
      ...(deviceFilter ? { deviceId: deviceFilter } : {}),
    };
    const assignmentQuery = {
      ...buildTimeRangeQuery("generatedAt", selectedWindow),
      ...(deviceFilter ? { harvesterDeviceId: deviceFilter } : {}),
    };

    const [devices, countRecords, harvestRecords, assignments, dateCounts] = await Promise.all([
      Device.find({})
        .sort({ deviceId: 1 })
        .select("-_id deviceId role lastSeen battery firmware seq")
        .lean()
        .exec(),
      CountRecord.find(countQuery).sort({ receivedAt: -1 }).limit(limit).lean().exec(),
      HarvestRecord.find(harvestQuery).sort({ receivedAt: -1 }).limit(limit).lean().exec(),
      Assignment.find(assignmentQuery).sort({ generatedAt: -1 }).limit(limit).lean().exec(),
      buildDateCounts(monthWindow || dateWindow, deviceFilter),
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
        month: req.query.month || null,
        device: deviceFilter || "all",
      },
      devices,
      dateCounts,
      summary: summarize(rows),
      rows,
    });
  } catch (err) {
    return next(err);
  }
});

async function activeAssignmentProgress(harvesterDeviceId) {
  const assignment = await Assignment.findOne({ harvesterDeviceId, active: true })
    .sort({ generatedAt: -1, createdAt: -1 })
    .lean()
    .exec();
  if (!assignment) return null;

  const harvestedPointIds = await HarvestRecord.distinct("pointId", {
    deviceId: harvesterDeviceId,
    assignmentId: assignment.assignmentId,
  }).exec();
  const harvested = new Set(harvestedPointIds);
  return {
    assignmentId: assignment.assignmentId,
    points: assignment.points.length,
    harvested: assignment.points.filter((point) => harvested.has(point.pointId)).length,
    acked: Boolean(assignment.ackedAt),
  };
}

router.get("/links", requireDashboardAccess, async (req, res, next) => {
  try {
    const links = await DeviceLink.find({}).sort({ countDeviceId: 1 }).lean().exec();
    const rows = await Promise.all(links.map(async (link) => {
      const [uploads, unassigned, activeAssignment] = await Promise.all([
        CountRecord.countDocuments({ deviceId: link.countDeviceId }),
        CountRecord.countDocuments({
          deviceId: link.countDeviceId,
          assignedAssignmentId: { $exists: false },
        }),
        activeAssignmentProgress(link.harvesterDeviceId),
      ]);
      return {
        countDeviceId: link.countDeviceId,
        harvesterDeviceId: link.harvesterDeviceId,
        sectorName: link.sectorName,
        uploads,
        unassigned,
        activeAssignment,
      };
    }));
    return success(res, { links: rows });
  } catch (err) {
    return next(err);
  }
});

router.post("/links", requireDashboardMutationAccess, async (req, res, next) => {
  try {
    const countDeviceId = String(req.body.countDeviceId || "").trim();
    const harvesterDeviceId = String(req.body.harvesterDeviceId || "").trim();
    const sectorName = String(req.body.sectorName || "").trim();
    if (!countDeviceId || !harvesterDeviceId || !sectorName || sectorName.length > 100) {
      return failure(res, 400, "INVALID_LINK", "Choose both devices and enter a sector name (up to 100 characters).");
    }

    const [countDevice, harvesterDevice, targetLink, currentLink] = await Promise.all([
      Device.findOne({ deviceId: countDeviceId, role: "count" }).lean().exec(),
      Device.findOne({ deviceId: harvesterDeviceId, role: "harvest" }).lean().exec(),
      DeviceLink.findOne({ harvesterDeviceId }).lean().exec(),
      DeviceLink.findOne({ countDeviceId }).lean().exec(),
    ]);
    if (!countDevice || !harvesterDevice) {
      return failure(res, 400, "INVALID_DEVICE", "Select a registered count device and harvest device.");
    }
    if (targetLink && targetLink.countDeviceId !== countDeviceId) {
      return failure(res, 409, "DEVICE_ALREADY_LINKED", "This harvest device is already linked to another count device.");
    }
    if (currentLink && currentLink.harvesterDeviceId !== harvesterDeviceId) {
      const progress = await activeAssignmentProgress(currentLink.harvesterDeviceId);
      if (progress && progress.harvested < progress.points) {
        return failure(res, 409, "ACTIVE_ASSIGNMENT", "Finish the current harvest assignment before changing this link.");
      }
    }

    const now = unixNow();
    await DeviceLink.findOneAndUpdate(
      { countDeviceId },
      {
        $set: { harvesterDeviceId, sectorName, updatedAt: now },
        $setOnInsert: { countDeviceId, createdAt: now },
      },
      { upsert: true, new: true, runValidators: true }
    ).exec();
    return success(res, { countDeviceId, harvesterDeviceId, sectorName });
  } catch (err) {
    if (err && err.code === 11000) {
      return failure(res, 409, "DEVICE_ALREADY_LINKED", "One of these devices is already linked.");
    }
    return next(err);
  }
});

router.delete("/links/:countDeviceId", requireDashboardMutationAccess, async (req, res, next) => {
  try {
    const link = await DeviceLink.findOne({ countDeviceId: req.params.countDeviceId }).lean().exec();
    if (!link) return failure(res, 404, "LINK_NOT_FOUND", "Device link was not found.");

    const progress = await activeAssignmentProgress(link.harvesterDeviceId);
    if (progress && progress.harvested < progress.points) {
      return failure(res, 409, "ACTIVE_ASSIGNMENT", "Finish the current harvest assignment before removing this link.");
    }

    await DeviceLink.deleteOne({ _id: link._id }).exec();
    return success(res);
  } catch (err) {
    return next(err);
  }
});

router.post("/links/:countDeviceId/assignments", requireDashboardMutationAccess, async (req, res, next) => {
  const countDeviceId = req.params.countDeviceId;
  const now = unixNow();
  let lockedLink;
  try {
    lockedLink = await DeviceLink.findOneAndUpdate(
      {
        countDeviceId,
        $or: [
          { assignmentLockUntil: { $exists: false } },
          { assignmentLockUntil: { $lt: now } },
        ],
      },
      { $set: { assignmentLockUntil: now + 120 } },
      { new: true }
    ).lean().exec();
    if (!lockedLink) {
      return failure(res, 409, "LINK_BUSY", "Device link is missing or an assignment is already being created.");
    }

    const progress = await activeAssignmentProgress(lockedLink.harvesterDeviceId);
    if (progress && progress.harvested < progress.points) {
      return failure(res, 409, "ACTIVE_ASSIGNMENT", "Finish the current harvest assignment before creating another.");
    }

    const records = await CountRecord.find({
      deviceId: countDeviceId,
      assignedAssignmentId: { $exists: false },
    }).sort({ receivedAt: 1, localId: 1 }).limit(200).lean().exec();
    if (!records.length) {
      return failure(res, 409, "NO_NEW_RECORDS", "This count device has no unassigned uploads.");
    }

    const assignmentId = await nextSequence("assignment_id");
    await Assignment.create({
      assignmentId,
      sourceDeviceId: countDeviceId,
      harvesterDeviceId: lockedLink.harvesterDeviceId,
      sectorName: lockedLink.sectorName,
      generatedAt: now,
      createdAt: now,
      active: true,
      points: records.map((record) => ({
        pointId: record.localId,
        lat: record.lat,
        lon: record.lon,
        countRecordId: record._id,
      })),
    });

    await CountRecord.updateMany(
      { _id: { $in: records.map((record) => record._id) } },
      { $set: { assignedAssignmentId: assignmentId } }
    ).exec();
    await Assignment.updateMany(
      { harvesterDeviceId: lockedLink.harvesterDeviceId, active: true, assignmentId: { $ne: assignmentId } },
      { $set: { active: false } }
    ).exec();
    return success(res, {
      assignmentId,
      countDeviceId,
      harvesterDeviceId: lockedLink.harvesterDeviceId,
      points: records.length,
    }, 201);
  } catch (err) {
    return next(err);
  } finally {
    if (lockedLink) {
      await DeviceLink.updateOne(
        { _id: lockedLink._id, assignmentLockUntil: now + 120 },
        { $unset: { assignmentLockUntil: "" } }
      ).exec().catch((err) => console.error("Failed to release assignment lock", err));
    }
  }
});

module.exports = router;
