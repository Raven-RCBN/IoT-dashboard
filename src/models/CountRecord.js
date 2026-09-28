const mongoose = require("mongoose");

const countRecordSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    localId: { type: Number, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    ts: { type: Number, required: true },
    battery: { type: Number, min: 0, max: 100 },
    receivedAt: { type: Number, required: true },
    zoneId: { type: Number, index: true },
    assignedAssignmentId: { type: Number },
  },
  { collection: "count_records", versionKey: false }
);

countRecordSchema.index({ deviceId: 1, localId: 1 }, { unique: true });

module.exports = mongoose.model("CountRecord", countRecordSchema);
