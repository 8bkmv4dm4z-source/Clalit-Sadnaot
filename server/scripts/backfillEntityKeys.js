/*
 * Backfill entityKey/workshopKey for existing documents.
 * Usage: MONGO_URI=mongodb://... node server/scripts/backfillEntityKeys.js
 */
const mongoose = require("mongoose");
const crypto = require("node:crypto");
const User = require("../models/User");
const Workshop = require("../models/Workshop");
require("dotenv").config();

async function backfillUsers() {
  const users = await User.find({});
  let updated = 0;
  for (const user of users) {
    let changed = false;
    if (!user.entityKey) {
      user.entityKey = crypto.randomUUID();
      changed = true;
    }
    if (Array.isArray(user.familyMembers)) {
      user.familyMembers.forEach((member) => {
        if (!member.entityKey) {
          member.entityKey = crypto.randomUUID();
          changed = true;
        }
      });
    }
    if (changed) {
      updated += 1;
      await user.save();
    }
  }
  console.log(`✅ Users processed: ${users.length}, updated: ${updated}`);
}

async function backfillWorkshops() {
  const workshops = await Workshop.find({});
  let updated = 0;
  for (const ws of workshops) {
    if (!ws.workshopKey) {
      ws.workshopKey = crypto.randomUUID();
      await ws.save();
      updated += 1;
    }
  }
  console.log(`✅ Workshops processed: ${workshops.length}, updated: ${updated}`);
}

async function run() {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI is required");
  await mongoose.connect(uri);
  console.log("📡 Connected");
  await backfillUsers();
  await backfillWorkshops();
  await mongoose.disconnect();
  console.log("🎉 Done");
}

run().catch((err) => {
  console.error("❌ Backfill failed:", err);
  process.exit(1);
});
