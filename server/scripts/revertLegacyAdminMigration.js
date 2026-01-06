#!/usr/bin/env node

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function run() {
  const dryRun = process.argv.includes("--dry-run");

  console.log(
    `\n[P7 ROLLBACK] Reverting legacy admin migration (${dryRun ? "DRY RUN" : "LIVE"})`
  );

  if (!process.env.MONGO_URI) {
    console.error("[P7 ROLLBACK] ❌ MONGO_URI is not set");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("[P7 ROLLBACK] Connected to MongoDB");

  const filter = {
    role: "admin",
    "authorities.admin": true,
  };

  const candidates = await User.find(filter)
    .select("_id email entityKey authorities")
    .lean();

  if (!candidates.length) {
    console.log("[P7 ROLLBACK] No users to revert.");
    await mongoose.disconnect();
    process.exit(0);
  }

  console.log(
    `[P7 ROLLBACK] Found ${candidates.length} admin(s) with authorities.admin=true`
  );

  candidates.forEach((u) =>
    console.log(
      `[P7 ROLLBACK] ${dryRun ? "Would revert" : "Reverting"} ${u._id} (${u.email})`
    )
  );

  if (!dryRun) {
    const result = await User.updateMany(filter, {
      $unset: { "authorities.admin": "" },
    });

    console.log(
      `[P7 ROLLBACK] Reverted ${result.modifiedCount || 0} user(s)`
    );
  } else {
    console.log("[P7 ROLLBACK] Dry run — no changes applied");
  }

  await mongoose.disconnect();
  console.log("[P7 ROLLBACK] Done\n");
  process.exit(0);
}

run().catch((err) => {
  console.error("[P7 ROLLBACK] ❌ Failed:", err);
  process.exit(1);
});
