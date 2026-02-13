/**
 * EMERGENCY ONLY: Sync participantsCount and waitingListCount based on current array sizes.
 *
 * Usage:
 *   REALLY_SYNC_COUNTS=YES node server/scripts/syncWorkshopCounts.js --dry
 *   REALLY_SYNC_COUNTS=YES node server/scripts/syncWorkshopCounts.js --write
 */

const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "../../.env") });

const mongoose = require("mongoose");
const Workshop = require("../models/Workshop");

const syncCounts = async () => {
  if (process.env.REALLY_SYNC_COUNTS !== "YES") {
    console.error("❌ REALLY_SYNC_COUNTS=YES is required to run this script.");
    process.exit(1);
  }
  const args = process.argv.slice(2);
  const isWriteMode = args.includes("--write");
  const isDryRun = args.includes("--dry") || !isWriteMode;

  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
    console.log("🔌 Connected to DB");

    const cursor = Workshop.find({}).cursor();
    let scanned = 0;
    const bulkOps = [];

    for (let doc = await cursor.next(); doc != null; doc = await cursor.next()) {
      const participantsCount =
        (doc.participants?.length || 0) + (doc.familyRegistrations?.length || 0);
      const waitingListCount = doc.waitingList?.length || 0;

      if (
        doc.participantsCount !== participantsCount ||
        doc.waitingListCount !== waitingListCount
      ) {
        bulkOps.push({
          updateOne: {
            filter: { _id: doc._id },
            update: {
              $set: {
                participantsCount,
                waitingListCount,
              },
            },
          },
        });
      }
      scanned += 1;
    }

    if (bulkOps.length > 0) {
      console.log(`📝 Syncing counts for ${bulkOps.length} workshops...`);
      if (!isDryRun) {
        await Workshop.bulkWrite(bulkOps);
        console.log("✅ Sync complete.");
      } else {
        console.log("🛡️ Dry run mode: no changes applied.");
      }
    } else {
      console.log("✨ All workshop counts are already in sync.");
    }

    console.log(`📦 Workshops scanned: ${scanned}`);
    process.exit(0);
  } catch (err) {
    console.error("❌ Error:", err);
    process.exit(1);
  }
};

syncCounts();
