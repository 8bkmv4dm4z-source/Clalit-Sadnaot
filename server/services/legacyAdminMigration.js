const User = require("../models/User");

/**
 * P7 migration:
 * - Roles are inert; authorities.admin is the only source of admin power.
 * - Promote any legacy role-based admins by setting authorities.admin=true.
 * - Idempotent and safe to re-run.
 */
async function migrateLegacyAdmins(logger = console) {
  const filter = {
    role: "admin",
    $or: [
      { "authorities.admin": { $ne: true } },
      { authorities: { $exists: false } },
      { authorities: null },
    ],
  };

  const update = {
    $set: {
      "authorities.admin": true,
    },
  };

  const result = await User.updateMany(filter, update, { strict: false });
  const touched = result.modifiedCount || 0;
  const matched = result.matchedCount || 0;

  if (matched === 0) {
    logger.info("[P7 MIGRATION] No legacy admins needed migration.");
  } else if (touched > 0) {
    logger.info(`[P7 MIGRATION] Promoted ${touched} legacy admin(s) to authorities.admin=true.`);
  } else {
    logger.info("[P7 MIGRATION] Legacy admins already migrated; no changes applied.");
  }

  return { matched, modified: touched };
}

module.exports = { migrateLegacyAdmins };
