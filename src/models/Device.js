const mongoose = require("mongoose");

const deviceSchema = new mongoose.Schema(
  {
    deviceId: { type: String, required: true, unique: true, index: true },
    token: { type: String, required: true },
    role: { type: String, enum: ["count", "harvest"], required: true },
    lastSeen: { type: Number },
    battery: { type: Number, min: 0, max: 100 },
    firmware: { type: String },
    seq: { type: Number, required: true, default: 0 },
  },
  { collection: "devices", versionKey: false }
);

module.exports = mongoose.model("Device", deviceSchema);
