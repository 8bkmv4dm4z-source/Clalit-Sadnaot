/**
 * setAdminAuthoritiesAndInvalidateTokens.js
 * -----------------------------------------
 * One-time migration to:
 * 1) Grant explicit admin authority to existing admin-role users
 * 2) Invalidate all refresh tokens (global logout)
 *
 * Usage:
 *   NODE_ENV=production node scripts/setAdminAuthoritiesAndInvalidateTokens.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/ClalitData";

(async () => {
  console.log("🔌 Connecting to MongoDB…");
  try {
    await mongoose.connect(MONGODB_URI, { serverSelectionTimeoutMS: 10000 });
    console.log("✅ Connected.");

    console.log("🛠 Setting authorities for legacy admin roles…");
    const adminResult = await User.updateMany(
      { role: "admin" },
      { $set: { authorities: { admin: true } } }
    );

    console.log("🧹 Clearing all refresh tokens (global logout) …");
    const invalidateResult = await User.updateMany({}, { $set: { refreshTokens: [] } });

    console.log("🎯 Migration summary:");
    console.log(`  ➤ Admin authority updates: ${adminResult.modifiedCount}`);
    console.log(`  ➤ Refresh tokens cleared: ${invalidateResult.modifiedCount}`);

    await mongoose.disconnect();
    console.log("✅ Done.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
})();
