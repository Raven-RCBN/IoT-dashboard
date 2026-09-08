const mongoose = require("mongoose");

const zoneSchema = new mongoose.Schema(
  {
    zoneId: { type: Number, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true, default: "" },
    createdAt: { type: Number, required: true },
  },
  { collection: "zones", versionKey: false }
);

module.exports = mongoose.model("Zone", zoneSchema);
