/**
 * Diagnostic script: inspect failed RiskAssessment records.
 *
 * Usage:  cd server && node scripts/diagnose-risk-failures.js
 *
 * Connects to MongoDB using the app's existing dotenv config, queries
 * RiskAssessments with processing.status in ["failed", "dead_letter"],
 * and prints:
 *   - Total failed + dead-lettered count
 *   - Distinct processing.lastError values with frequency
 *   - A sample of 5 failed docs (auditLogId, status, lastError, attempts)
 *
 * This file is temporary and not intended to be committed.
 */

require("dotenv").config();
const mongoose = require("mongoose");
const RiskAssessment = require("../models/RiskAssessment");

const FAILURE_STATUSES = ["failed", "dead_letter"];

const run = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("MONGODB_URI is not set — check your .env file");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.info("Connected to MongoDB\n");

  const totalCount = await RiskAssessment.countDocuments({
    "processing.status": { $in: FAILURE_STATUSES },
  });
  console.info(`Total failed / dead-lettered assessments: ${totalCount}\n`);

  if (totalCount === 0) {
    console.info("No failures found — nothing to diagnose.");
    await mongoose.disconnect();
    return;
  }

  const errorDistribution = await RiskAssessment.aggregate([
    { $match: { "processing.status": { $in: FAILURE_STATUSES } } },
    {
      $group: {
        _id: "$processing.lastError",
        count: { $sum: 1 },
        statuses: { $addToSet: "$processing.status" },
      },
    },
    { $sort: { count: -1 } },
    { $limit: 20 },
  ]);

  console.info("Distinct lastError values (top 20):");
  for (const entry of errorDistribution) {
    console.info(
      `  [${entry.count}x] (${entry.statuses.join(",")}) ${String(entry._id || "(empty)").slice(0, 200)}`
    );
  }
  console.info();

  const samples = await RiskAssessment.find({
    "processing.status": { $in: FAILURE_STATUSES },
  })
    .sort({ updatedAt: -1 })
    .limit(5)
    .lean();

  console.info("Sample failed docs (up to 5):");
  for (const doc of samples) {
    console.info(
      JSON.stringify(
        {
          auditLogId: doc.auditLogId,
          status: doc.processing?.status,
          lastError: doc.processing?.lastError,
          attempts: doc.processing?.attempts,
          deadLetterReason: doc.processing?.deadLetterReason || undefined,
        },
        null,
        2
      )
    );
  }

  await mongoose.disconnect();
};

run().catch((err) => {
  console.error("Diagnostic script failed:", err);
  process.exit(1);
});
