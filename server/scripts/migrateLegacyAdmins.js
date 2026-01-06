#!/usr/bin/env node

require("dotenv").config(); // if you use .env locally
const mongoose = require("mongoose");
const { migrateLegacyAdmins } = require("../services/legacyAdminMigration");

async function run() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `\n[P7 MIGRATION] Starting legacy admin migration (${dryRun ? "DRY RUN" : "LIVE"})`
  );

  if (!process.env.MONGO_URI) {
    console.error("[P7 MIGRATION] ❌ MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("[P7 MIGRATION] Connected to MongoDB");

  const result = await migrateLegacyAdmins({
    dryRun,
    logger: console,
  });

  console.log("[P7 MIGRATION] Result:", result);

  await mongoose.disconnect();
  console.log("[P7 MIGRATION] Done\n");
  process.exit(0);
}

run().catch((err) => {
  console.error("[P7 MIGRATION] ❌ Failed:", err);
  process.exit(1);
});
