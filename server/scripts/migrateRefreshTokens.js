require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../models/User");
const {
  hashRefreshToken,
} = require("../services/refreshTokenService");

const parseDurationToMs = (value) => {
  const m = String(value || "").match(/^(\d+)([smhd])$/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2].toLowerCase();
  const map = { s: 1000, m: 60000, h: 3600000, d: 86400000 };
  return n * (map[unit] || 0);
};

const REFRESH_TOKEN_CAP = Number(process.env.REFRESH_TOKEN_CAP || 5);
const REFRESH_TOKEN_TTL_MS =
  parseDurationToMs(process.env.JWT_REFRESH_EXPIRY || "7d") || 7 * 24 * 3600 * 1000;

async function run() {
  const dryRun = process.argv.includes("--dry-run");
  const uri = process.env.MONGO_URI || process.env.DATABASE_URL || process.env.DB_URI;
  if (!uri) {
    console.error("❌ Missing MONGO_URI / DATABASE_URL / DB_URI");
    process.exit(1);
  }

  await mongoose.connect(uri);
  console.log(`📡 Connected. Dry run: ${dryRun ? "yes" : "no"}`);

  const cursor = User.find({}).cursor();
  let processed = 0;
  let updated = 0;
  for await (const user of cursor) {
    processed += 1;
    const beforeCount = (user.refreshTokens || []).length;
    const normalized = {
  sessions: (user.refreshTokens || []).map((s) => ({
    tokenHash: s.tokenHash || s.token,
    issuedAt: s.issuedAt || s.createdAt || new Date(),
    expiresAt: null,
    lastUsedAt: s.createdAt || new Date(),
    userAgent: s.userAgent || "",
    revokedAt: null,
    replacedByJti: null,
  })),
  prunedExpired: 0,
  prunedCap: 0,
};


    // Ensure hashes live under tokenHash for any legacy 'token' properties
    const withHashes = normalized.sessions.map((session) => ({
      ...session,
      tokenHash: session.tokenHash || session.token || hashRefreshToken(session.token || ""),
    }));

    user.refreshTokens = withHashes;
    const afterCount = user.refreshTokens.length;

    if (!dryRun && (beforeCount !== afterCount || normalized.prunedCap || normalized.prunedExpired)) {
      await user.save();
      updated += 1;
    }

    if (processed % 100 === 0) {
      console.log(
        `Processed ${processed} users | updated=${updated} (last delta: ${beforeCount}→${afterCount})`
      );
    }
  }

  console.log(`✅ Done. Users processed=${processed}, updated=${updated}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
