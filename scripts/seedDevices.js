const Device = require("../src/models/Device");
const { connectDatabase, disconnectDatabase } = require("../src/db");

const requiredTokens = [
  "CNT00002_TOKEN",
  "CNT00003_TOKEN",
  "HRV00002_TOKEN",
  "HRV00003_TOKEN",
];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to seed device credentials.`);
  }
  return value;
}

const devices = [
  {
    deviceId: "CNT00002",
    role: "count",
    token: requireEnv("CNT00002_TOKEN"),
  },
  {
    deviceId: "CNT00003",
    role: "count",
    token: requireEnv("CNT00003_TOKEN"),
  },
  {
    deviceId: "HRV00002",
    role: "harvest",
    token: requireEnv("HRV00002_TOKEN"),
  },
  {
    deviceId: "HRV00003",
    role: "harvest",
    token: requireEnv("HRV00003_TOKEN"),
  },
];

async function seed() {
  requiredTokens.forEach(requireEnv);
  await connectDatabase();
  for (const device of devices) {
    await Device.updateOne(
      { deviceId: device.deviceId },
      { $set: device, $setOnInsert: { seq: 0 } },
      { upsert: true }
    ).exec();
  }
  await disconnectDatabase();
  console.log(`Seeded ${devices.length} devices.`);
}

seed().catch(async (err) => {
  console.error(err);
  await disconnectDatabase();
  process.exit(1);
});
