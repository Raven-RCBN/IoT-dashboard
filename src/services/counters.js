const Counter = require("../models/Counter");

async function nextSequence(name) {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { value: 1 } },
    { new: true, upsert: true }
  ).exec();
  return counter.value;
}

module.exports = { nextSequence };
