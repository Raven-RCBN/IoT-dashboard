const mongoose = require("mongoose");

const deviceLinkSchema = new mongoose.Schema(
  {
    countDeviceId: { type: String, required: true, unique: true },
    harvesterDeviceId: { type: String, required: true, unique: true },
    sectorName: { type: String, required: true },
    createdAt: { type: Number, required: true },
    updatedAt: { type: Number, required: true },
    assignmentLockUntil: { type: Number },
  },
  { collection: "device_links", versionKey: false }
);

module.exports = mongoose.model("DeviceLink", deviceLinkSchema);
