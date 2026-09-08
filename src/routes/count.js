const express = require("express");
const CountRecord = require("../models/CountRecord");
const { requireDeviceRole } = require("../middleware/auth");
const { env } = require("../config/env");
const { success, failure } = require("../utils/responses");
const { unixNow } = require("../utils/time");
const {
  isInteger,
  validGpsE7,
  validRecordsArray,
  validTimestamp,
} = require("../utils/validation");

const router = express.Router();

router.post("/upload", requireDeviceRole("count"), async (req, res, next) => {
  try {
    const { records } = req.body;
    if (!validRecordsArray(records)) {
      return failure(res, 400, "INVALID_JSON", "records must be an array with 200 or fewer items.");
    }

    const receivedAt = unixNow();
    let received = 0;
    let duplicates = 0;

    for (const record of records) {
      if (!isInteger(record.id)) {
        return failure(res, 400, "INVALID_JSON", "record.id must be an integer.");
      }

      if (!validGpsE7(record.lat, record.lon)) {
        return failure(res, 400, "INVALID_GPS", "lat and lon must be valid E7 integers.");
      }

      if (!validTimestamp(record.ts)) {
        return failure(res, 400, "INVALID_TIMESTAMP", "ts must be a positive UTC unix timestamp.");
      }

      try {
        await CountRecord.create({
          deviceId: req.device.deviceId,
          localId: record.id,
          lat: record.lat,
          lon: record.lon,
          ts: record.ts,
          battery: Number.isInteger(req.body.battery) ? req.body.battery : undefined,
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
      next_upload: env.countNextUploadSeconds,
    });
  } catch (err) {
    return next(err);
  }
});

module.exports = router;
