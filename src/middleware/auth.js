const crypto = require("crypto");
const Device = require("../models/Device");
const { unixNow } = require("../utils/time");
const { failure } = require("../utils/responses");

function tokenMatches(storedToken, presentedToken) {
  const stored = Buffer.from(storedToken);
  const presented = Buffer.from(presentedToken);
  return (
    stored.length === presented.length &&
    crypto.timingSafeEqual(stored, presented)
  );
}

function requireDeviceRole(expectedRole) {
  return async function authenticateDevice(req, res, next) {
    try {
      const deviceId = req.header("X-Device-ID");
      const apiToken = req.header("X-API-Token");

      if (!deviceId || !apiToken) {
        return failure(res, 401, "INVALID_TOKEN", "X-Device-ID and X-API-Token are required.");
      }

      const device = await Device.findOne({ deviceId }).exec();
      if (!device) {
        return failure(res, 401, "INVALID_DEVICE", "Device is not registered.");
      }

      if (!tokenMatches(device.token, apiToken)) {
        return failure(res, 401, "INVALID_TOKEN", "API token is invalid.");
      }

      if (expectedRole && device.role !== expectedRole) {
        return failure(res, 403, "INVALID_DEVICE", "Device role is not allowed for this endpoint.");
      }

      const firmware = typeof req.body.fw === "string" ? req.body.fw : undefined;
      const battery = Number.isInteger(req.body.battery) ? req.body.battery : undefined;
      const seq = Number.isInteger(req.body.seq) ? req.body.seq : undefined;

      await Device.updateOne(
        { _id: device._id },
        {
          $set: {
            lastSeen: unixNow(),
            ...(firmware ? { firmware } : {}),
            ...(battery !== undefined ? { battery } : {}),
            ...(seq !== undefined ? { seq } : {}),
          },
        }
      ).exec();

      req.device = device;
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = { requireDeviceRole };
