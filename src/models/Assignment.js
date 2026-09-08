const mongoose = require("mongoose");

const assignmentPointSchema = new mongoose.Schema(
  {
    pointId: { type: Number, required: true },
    lat: { type: Number, required: true },
    lon: { type: Number, required: true },
    countRecordId: { type: mongoose.Schema.Types.ObjectId, ref: "CountRecord" },
  },
  { _id: false }
);

const assignmentSchema = new mongoose.Schema(
  {
    assignmentId: { type: Number, required: true, unique: true, index: true },
    zoneId: { type: Number },
    harvesterDeviceId: { type: String, required: true, index: true },
    sectorName: { type: String, required: true },
    generatedAt: { type: Number, required: true },
    ackedAt: { type: Number },
    active: { type: Boolean, required: true, default: true, index: true },
    createdAt: { type: Number, required: true },
    points: { type: [assignmentPointSchema], required: true, default: [] },
  },
  { collection: "assignments", versionKey: false }
);

assignmentSchema.index({ harvesterDeviceId: 1, active: 1, generatedAt: -1 });

module.exports = mongoose.model("Assignment", assignmentSchema);
