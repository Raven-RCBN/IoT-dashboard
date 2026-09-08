const express = require("express");
const Device = require("../models/Device");
const Zone = require("../models/Zone");
const CountRecord = require("../models/CountRecord");
const Assignment = require("../models/Assignment");
const HarvestRecord = require("../models/HarvestRecord");
const { requireAdminToken } = require("../middleware/adminAuth");
const { nextSequence } = require("../services/counters");
const { success, failure } = require("../utils/responses");
const { unixNow } = require("../utils/time");
const { isInteger, validGpsE7 } = require("../utils/validation");

const router = express.Router();

router.use(requireAdminToken);

router.post("/devices", async (req, res, next) => {
  try {
    const { device_id: deviceId, token, role } = req.body;
    if (!deviceId || !token || !["count", "harvest"].includes(role)) {
      return failure(res, 400, "INVALID_JSON", "device_id, token, and role are required.");
    }

    const device = await Device.findOneAndUpdate(
      { deviceId },
      { $set: { deviceId, token, role } },
      { new: true, upsert: true }
    )
      .lean()
      .exec();

    return success(res, {
      device_id: device.deviceId,
      role: device.role,
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/devices", async (req, res, next) => {
  try {
    const devices = await Device.find({})
      .sort({ deviceId: 1 })
      .select("-_id deviceId role lastSeen battery firmware seq")
      .lean()
      .exec();
    return success(res, { devices });
  } catch (err) {
    return next(err);
  }
});

router.post("/zones", async (req, res, next) => {
  try {
    const zoneId = isInteger(req.body.zone_id)
      ? req.body.zone_id
      : await nextSequence("zone_id");
    const name = req.body.name;
    const description = req.body.description || "";

    if (!name) {
      return failure(res, 400, "INVALID_JSON", "name is required.");
    }

    const zone = await Zone.findOneAndUpdate(
      { zoneId },
      {
        $set: { name, description },
        $setOnInsert: { zoneId, createdAt: unixNow() },
      },
      { new: true, upsert: true }
    )
      .lean()
      .exec();

    return success(res, {
      zone_id: zone.zoneId,
      name: zone.name,
      description: zone.description,
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/assignments", async (req, res, next) => {
  try {
    const assignmentId = isInteger(req.body.assignment_id)
      ? req.body.assignment_id
      : await nextSequence("assignment_id");
    const harvesterDeviceId = req.body.harvester_device_id;
    const sectorName = req.body.sector_name;
    const zoneId = isInteger(req.body.sector_id)
      ? req.body.sector_id
      : isInteger(req.body.zone_id)
        ? req.body.zone_id
        : undefined;
    const points = Array.isArray(req.body.points) ? req.body.points : [];
    const now = unixNow();

    if (!harvesterDeviceId || !sectorName || points.length === 0 || points.length > 200) {
      return failure(
        res,
        400,
        "INVALID_JSON",
        "harvester_device_id, sector_name, and 1-200 points are required."
      );
    }

    const harvester = await Device.findOne({
      deviceId: harvesterDeviceId,
      role: "harvest",
    })
      .lean()
      .exec();
    if (!harvester) {
      return failure(res, 400, "INVALID_DEVICE", "harvester_device_id must be a harvest device.");
    }

    const normalizedPoints = [];
    for (const point of points) {
      const pointId = point.id ?? point.point_id;
      if (!isInteger(pointId) || !validGpsE7(point.lat, point.lon)) {
        return failure(res, 400, "INVALID_JSON", "Each point needs integer id, lat, and lon.");
      }
      normalizedPoints.push({ pointId, lat: point.lat, lon: point.lon });
    }

    await Assignment.updateMany(
      { harvesterDeviceId, active: true },
      { $set: { active: false } }
    ).exec();

    const assignment = await Assignment.findOneAndUpdate(
      { assignmentId },
      {
        $set: {
          assignmentId,
          zoneId,
          harvesterDeviceId,
          sectorName,
          generatedAt: isInteger(req.body.generated_at) ? req.body.generated_at : now,
          active: true,
          points: normalizedPoints,
        },
        $setOnInsert: { createdAt: now },
      },
      { new: true, upsert: true }
    )
      .lean()
      .exec();

    return success(res, {
      assignment_id: assignment.assignmentId,
      harvester_device_id: assignment.harvesterDeviceId,
      points: assignment.points.length,
    });
  } catch (err) {
    return next(err);
  }
});

router.get("/assignments", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 1000);
    const assignments = await Assignment.find({})
      .sort({ generatedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return success(res, { assignments });
  } catch (err) {
    return next(err);
  }
});

router.get("/count-records", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 1000);
    const records = await CountRecord.find({})
      .sort({ receivedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return success(res, { records });
  } catch (err) {
    return next(err);
  }
});

router.get("/harvest-records", async (req, res, next) => {
  try {
    const limit = Math.min(Number(req.query.limit || 100), 1000);
    const records = await HarvestRecord.find({})
      .sort({ receivedAt: -1 })
      .limit(limit)
      .lean()
      .exec();
    return success(res, { records });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
