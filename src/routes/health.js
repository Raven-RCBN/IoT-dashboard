const express = require("express");
const mongoose = require("mongoose");
const { success } = require("../utils/responses");

const router = express.Router();

router.get("/health", (req, res) => {
  return success(res, {
    status: "ok",
    mongodb: mongoose.connection.readyState === 1 ? "connected" : "disconnected",
  });
});

module.exports = router;
