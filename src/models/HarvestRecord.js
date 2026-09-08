const mongoose = require("mongoose");

const harvestRecordSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, index: true },
    assignmentId: { type: Number, required: true, index: true },
    pointId: { type: Number, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    ts: { type: Number, required: true },
    receivedAt: { type: Number, required: true },
  },
  { collection: "harvest_records", versionKey: false }
);

harvestRecordSchema.index(
  { deviceId: 1, assignmentId: 1, pointId: 1 },
  { unique: true }
);

module.exports = mongoose.model("HarvestRecord", harvestRecordSchema);
