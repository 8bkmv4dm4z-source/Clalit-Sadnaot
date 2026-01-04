/**
 * pruneUnregisteredAccounts.js
 * -----------------------------------------------------------------------------
 * Deletes users that are not registered to any workshop (participants, family
 * registrations, or waiting list) and have no workshop mappings.
 *
 * Behavior:
 * - Scans workshop participants, familyRegistrations, waitingList for user ids
 *   and hashed entity keys.
 * - Preserves admin accounts automatically.
 * - Dry-run mode will only log the accounts that would be deleted.
 *
 * Usage:
 *   MONGO_URI=mongodb://... node server/scripts/pruneUnregisteredAccounts.js [--dry-run]
 */

const mongoose = require("mongoose");
const User = require("../models/User");
const Workshop = require("../models/Workshop");
require("dotenv").config();

function parseArgs(argv = process.argv.slice(2)) {
  return argv.reduce((acc, arg) => {
    const [key, value] = arg.replace(/^--/, "").split("=");
    acc[key] = value === undefined ? true : value;
    return acc;
  }, {});
}

function stringId(value) {
  return value ? String(value) : null;
}

async function collectActiveRefs() {
  const workshops = await Workshop.find({}, "participants familyRegistrations waitingList");
  const userIds = new Set();
  const entityKeys = new Set();

  workshops.forEach((ws) => {
    (ws.participants || []).forEach((id) => userIds.add(stringId(id)));

    (ws.familyRegistrations || []).forEach((fr) => {
      if (fr.parentUser) userIds.add(stringId(fr.parentUser));
      if (fr.parentKey) entityKeys.add(fr.parentKey);
      if (fr.familyMemberKey) entityKeys.add(fr.familyMemberKey);
    });

    (ws.waitingList || []).forEach((entry) => {
      if (entry.parentUser) userIds.add(stringId(entry.parentUser));
      if (entry.parentKey) entityKeys.add(entry.parentKey);
      if (entry.familyMemberKey) entityKeys.add(entry.familyMemberKey);
    });
  });

  return { userIds, entityKeys };
}

async function pruneUsers({ dryRun }) {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGO_URI or MONGODB_URI is required");

  await mongoose.connect(uri);
  console.log("📡 Connected to MongoDB");

  const { userIds, entityKeys } = await collectActiveRefs();
  const users = await User.find(
    {},
    "_id role email entityKey userWorkshopMap familyWorkshopMap familyMembers"
  );

  let removed = 0;
  const pruned = [];

  for (const user of users) {
    if (user.authorities?.admin) continue;

    const idStr = stringId(user._id);
    const hasDirectRegistration = userIds.has(idStr);
    const hasMapWorkshops =
      (user.userWorkshopMap || []).length > 0 ||
      (user.familyWorkshopMap || []).some((entry) => (entry.workshops || []).length > 0);

    const familyMemberKeys = (user.familyMembers || [])
      .map((m) => m.entityKey)
      .filter(Boolean);
    const hasEntityKeyRegistration =
      entityKeys.has(user.entityKey) || familyMemberKeys.some((k) => entityKeys.has(k));

    if (hasDirectRegistration || hasMapWorkshops || hasEntityKeyRegistration) {
      continue;
    }

    pruned.push({ email: user.email, id: idStr, entityKey: user.entityKey });
    if (!dryRun) {
      await User.deleteOne({ _id: user._id });
    }
    removed += 1;
  }

  await mongoose.disconnect();

  if (pruned.length) {
    console.log("🧹 Accounts pruned:");
    pruned.forEach((u) => console.log(` - ${u.email} (${u.id})`));
  }

  console.log(
    `${dryRun ? "[dry-run]" : ""} scanned ${users.length} users; marked ${removed} for removal.`
  );
}

const args = parseArgs();

pruneUsers({ dryRun: Boolean(args["dry-run"] || args.dryRun) }).catch((err) => {
  console.error("❌ Prune script failed:", err.message);
  process.exit(1);
});
