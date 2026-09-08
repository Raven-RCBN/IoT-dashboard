const express = require("express");
const Assignment = require("../models/Assignment");
const HarvestRecord = require("../models/HarvestRecord");
const { requireDeviceRole } = require("../middleware/auth");
const { success, failure } = require("../utils/responses");
const { unixNow } = require("../utils/time");
const {
  isInteger,
  validGpsE7,
  validRecordsArray,
  validTimestamp,
} = require("../utils/validation");

const router = express.Router();

router.post("/download", requireDeviceRole("harvest"), async (req, res, next) => {
  try {
    const assignment = await Assignment.findOne({
      harvesterDeviceId: req.device.deviceId,
      active: true,
    })
      .sort({ generatedAt: -1, createdAt: -1 })
      .lean()
      .exec();

    if (!assignment) {
      return success(res, {
        assignment_id: null,
        sector_id: null,
        sector_name: null,
        generated_at: null,
        points: [],
      });
    }

    return success(res, {
      assignment_id: assignment.assignmentId,
      sector_id: assignment.zoneId ?? null,
      sector_name: assignment.sectorName,
      generated_at: assignment.generatedAt,
      points: assignment.points.map((point) => ({
        id: point.pointId,
        lat: point.lat,
        lon: point.lon,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

router.post("/download/ack", requireDeviceRole("harvest"), async (req, res, next) => {
  try {
    const assignmentId = req.body.assignment_id;
    if (!isInteger(assignmentId)) {
      return failure(res, 400, "INVALID_ASSIGNMENT", "assignment_id must be an integer.");
    }

    const assignment = await Assignment.findOneAndUpdate(
      {
        assignmentId,
        harvesterDeviceId: req.device.deviceId,
        active: true,
      },
      { $set: { ackedAt: unixNow() } },
      { new: true }
    ).exec();

    if (!assignment) {
      return failure(res, 404, "INVALID_ASSIGNMENT", "Assignment was not found for this device.");
    }

    return success(res);
  } catch (err) {
    return next(err);
  }
});

router.post("/upload", requireDeviceRole("harvest"), async (req, res, next) => {
  try {
    const { assignment_id: assignmentId, records } = req.body;

    if (!isInteger(assignmentId)) {
      return failure(res, 400, "INVALID_ASSIGNMENT", "assignment_id must be an integer.");
    }

    if (!validRecordsArray(records)) {
      return failure(res, 400, "INVALID_JSON", "records must be an array with 200 or fewer items.");
    }

    const assignment = await Assignment.findOne({
      assignmentId,
      harvesterDeviceId: req.device.deviceId,
      active: true,
    })
      .lean()
      .exec();

    if (!assignment) {
      return failure(res, 404, "INVALID_ASSIGNMENT", "Assignment was not found for this device.");
    }

    const receivedAt = unixNow();
    let received = 0;
    let duplicates = 0;

    for (const record of records) {
      if (!isInteger(record.point_id)) {
        return failure(res, 400, "INVALID_JSON", "record.point_id must be an integer.");
      }

      if (!validGpsE7(record.lat, record.lon)) {
        return failure(res, 400, "INVALID_GPS", "lat and lon must be valid E7 integers.");
      }

      if (!validTimestamp(record.ts)) {
        return failure(res, 400, "INVALID_TIMESTAMP", "ts must be a positive UTC unix timestamp.");
      }

      const pointIsAssigned = assignment.points.some(
        (point) => point.pointId === record.point_id
      );
      if (!pointIsAssigned) {
        return failure(res, 400, "INVALID_ASSIGNMENT", "record.point_id is not in this assignment.");
      }

      try {
        await HarvestRecord.create({
          deviceId: req.device.deviceId,
          assignmentId,
          pointId: record.point_id,
          lat: record.lat,
          lon: record.lon,
          ts: record.ts,
          receivedAt,
        });
        received += 1;
      } catch (err) {
        if (err && err.code === 11000) {
          duplicates += 1;
        } else {
          throw err;
        }
      }
    }

    return success(res, {
      received,
      duplicates,
      server_time: unixNow(),
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
