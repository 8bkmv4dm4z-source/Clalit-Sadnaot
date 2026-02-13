/**
 * Backfill waitingListCount based on waitingList array length.
 *
 * Usage:
 *   node server/scripts/backfillWaitingListCount.js --dry
 *   node server/scripts/backfillWaitingListCount.js --write
 */

const path = require("path");

require("dotenv").config({ path: path.join(__dirname, "../../.env") });
const mongoose = require("mongoose");

let Workshop;
try {
  Workshop = require("../models/Workshop");
} catch (err) {
  console.error("❌ Error: Could not load Workshop model.", err);
  process.exit(1);
}

async function run() {
  const args = process.argv.slice(2);
  const isWriteMode = args.includes("--write");
  const isDryRun = args.includes("--dry") || !isWriteMode;

  console.log("\n==================================================");
  console.log("🧮 Backfill waitingListCount");
  console.log(`MODE: ${isWriteMode ? "⚠️  WRITE" : "🛡️  DRY RUN"}`);
  console.log("==================================================\n");

  try {
    await mongoose.connect(process.env.MONGO_URI || process.env.DATABASE_URL);
    console.log("✅ DB Connected");
  } catch (err) {
    console.error("❌ DB Error:", err.message);
    process.exit(1);
  }

  try {
    const total = await Workshop.countDocuments();
    console.log(`📦 Workshops total: ${total}`);

    if (isDryRun) {
      const sample = await Workshop.find({})
        .select("waitingList waitingListCount")
        .limit(5);
      const preview = sample.map((doc) => ({
        id: doc._id,
        waitingListCount: doc.waitingListCount,
        computed: doc.waitingList?.length || 0,
      }));
      console.log("🔎 Sample preview:", preview);
      console.log("ℹ️ Dry run complete. Re-run with --write to update.");
      return;
    }

    const result = await Workshop.updateMany(
      {},
      [
        {
          $set: {
            waitingListCount: {
              $size: { $ifNull: ["$waitingList", []] },
            },
          },
        },
      ],
      { strict: false }
    );

    console.log(
      `✅ Updated ${result.modifiedCount ?? result.nModified ?? 0} workshop documents.`
    );
  } catch (err) {
    console.error("❌ Backfill failed:", err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

run();
