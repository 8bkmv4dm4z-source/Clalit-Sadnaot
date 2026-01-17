/**
 * clearLegacyRefreshTokens.js
 *
 * Purpose:
 *   - Invalidate ALL existing refresh tokens.
 *   - Required after migrating from hashed-only refresh tokens
 *     to JWT-based rotating refresh tokens.
 *
 * Usage:
 *   node scripts/clearLegacyRefreshTokens.js --dry-run
 *   node scripts/clearLegacyRefreshTokens.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

async function run() {
  const dryRun = process.argv.includes("--dry-run");

  const uri =
    process.env.MONGO_URI ||
    process.env.DATABASE_URL ||
    process.env.DB_URI;

  if (!uri) {
    console.error("❌ Missing MONGO_URI / DATABASE_URL / DB_URI");
    process.exit(1);
  }

  console.log(`[REFRESH RESET] Starting (${dryRun ? "DRY RUN" : "LIVE"})`);

  await mongoose.connect(uri);
  console.log("[REFRESH RESET] Connected to MongoDB");

  const users = await User.find(
    { refreshTokens: { $exists: true, $not: { $size: 0 } } },
    { _id: 1, email: 1, refreshTokens: 1 }
  ).lean();

  if (users.length === 0) {
    console.log("[REFRESH RESET] No users have refresh tokens. Nothing to do.");
    await mongoose.disconnect();
    return;
  }

  console.log(`[REFRESH RESET] Users affected: ${users.length}`);

  users.forEach((u) => {
    console.log(
      ` - ${u._id} ${u.email || "(no email)"} | tokens=${u.refreshTokens.length}`
    );
  });

  if (!dryRun) {
    const result = await User.updateMany(
      {},
      { $set: { refreshTokens: [] } }
    );

    console.log(
      `[REFRESH RESET] Cleared refreshTokens for ${result.modifiedCount} users`
    );
  } else {
    console.log("[REFRESH RESET] Dry run only — no changes written");
  }

  await mongoose.disconnect();
  console.log("[REFRESH RESET] Done");
}

run().catch((err) => {
  console.error("❌ Refresh token reset failed:", err);
  process.exit(1);
});
