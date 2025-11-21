/**
 * fixUserEntityKeys.js
 * ---------------------------------------------------------
 * Adds missing entityKey to users & family members.
 * Writes one structured entry to AuditLog.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const crypto = require("node:crypto");

const User = require("../models/User");
const AuditLog = require("../models/AuditLog");

const MONGODB_URI =
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  "mongodb://127.0.0.1:27017/ClalitData";

(async () => {
  console.log("🔌 Connecting to MongoDB...");

  try {
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
    });
    console.log("✅ Connected.");

    let usersFixed = 0;
    let familyFixed = 0;

    const users = await User.find({});
    console.log(`📦 Loaded ${users.length} users from DB`);

    for (const user of users) {
      let changed = false;

      // fix user entityKey
      if (!user.entityKey) {
        user.entityKey = crypto.randomUUID();
        usersFixed++;
        changed = true;
      }

      // fix family members
      if (Array.isArray(user.familyMembers)) {
        user.familyMembers.forEach((m) => {
          if (!m.entityKey) {
            m.entityKey = crypto.randomUUID();
            familyFixed++;
            changed = true;
          }
        });
      }

      if (changed) {
        await user.save({ validateBeforeSave: false });
      }
    }

    console.log("🟦 Summary:");
    console.log(`  ➤ Users fixed:           ${usersFixed}`);
    console.log(`  ➤ Family members fixed:  ${familyFixed}`);

    // 📝 Write audit entry
    await AuditLog.create({
      type: "ENTITY_KEY_MIGRATION",
      initiatedBy: "system",
      summary: {
        usersFixed,
        familyFixed,
        totalProcessed: users.length,
      },
    });

    console.log("📝 AuditLog entry written.");

    console.log("🎉 Migration complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration Error:", err);
    process.exit(1);
  }
})();
