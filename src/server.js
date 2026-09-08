const { env } = require("./config/env");
const { connectDatabase } = require("./db");
const { createApp } = require("./app");

async function main() {
  await connectDatabase();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Plantation tracker API listening on port ${env.port}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
