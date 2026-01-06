const User = require("../models/User");

/**
 * P7 migration:
 * - Roles are inert; authorities.admin is the only source of admin power.
 * - Promote any legacy role-based admins by setting authorities.admin=true.
 * - Idempotent and safe to re-run.
 */
async function migrateLegacyAdmins(logger = console) {
  const log = typeof logger?.info === "function"
    ? logger.info.bind(logger)
    : typeof logger === "function"
    ? logger
    : console.log;

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

  const candidates = await User.find(filter)
    .select("_id email entityKey role authorities")
    .lean();

  if (!candidates.length) {
    log("[P7 MIGRATION] No legacy admins needed migration.");
    return { matched: 0, modified: 0 };
  }

  candidates.forEach((u) =>
    log(
      `[P7 MIGRATION] Promoting legacy admin ${u._id} (${u.email || "unknown"}) to authorities.admin=true`
    )
  );

  const result = await User.updateMany(filter, update, { strict: true });
  const touched = result.modifiedCount || 0;

  log(`[P7 MIGRATION] Promoted ${touched} legacy admin(s) to authorities.admin=true.`);

  return { matched: candidates.length, modified: touched };
}

module.exports = { migrateLegacyAdmins };
