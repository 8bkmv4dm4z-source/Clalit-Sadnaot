const nodeCrypto = require("crypto");

/**
 * Retrieve the audit HMAC secret or throw if missing.
 * This is intentionally lazy to avoid breaking environments
 * that do not exercise audit functionality.
 */
const getAuditHmacSecret = () => {
  const secret = process.env.AUDIT_HMAC_SECRET || process.env.PUBLIC_ID_SECRET;
  if (!secret) {
    throw new Error(
      "AUDIT_HMAC_SECRET (or PUBLIC_ID_SECRET) is required for audit HMAC operations"
    );
  }
  return secret;
};

/**
 * HMAC helper for entityKey correlation.
 * Uses SHA-256 to produce a hex digest.
 */
const hmacEntityKey = (entityKey) => {
  if (!entityKey || typeof entityKey !== "string") {
    throw new Error("entityKey must be a non-empty string");
  }
  const secret = getAuditHmacSecret();
  return nodeCrypto.createHmac("sha256", secret).update(entityKey).digest("hex");
};

module.exports = { getAuditHmacSecret, hmacEntityKey };
