const express = require("express");
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

function requireDashboardAccess(req, res, next) {
  if (env.dashboardPublic) {
    return next();
  }
  return requireAdminToken(req, res, next);
}

router.get("/config", (req, res) => {
  return success(res, {
    authRequired: !env.dashboardPublic,
  });
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
