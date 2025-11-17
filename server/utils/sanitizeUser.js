const User = require("../models/User");

/**
 * Normalize a Mongoose document or plain object into a plain object.
 */
function toPlain(doc) {
  if (!doc) return null;
  if (typeof doc.toObject === "function") {
    return doc.toObject({ depopulate: true });
  }
  return { ...doc };
}

/**
 * Remove sensitive fields that should never be returned to clients.
 */
function stripSensitiveFields(user) {
  const clean = toPlain(user) || {};
  const redactions = [
    "passwordHash",
    "otpCode",
    "otpAttempts",
    "passwordResetTokenHash",
    "passwordResetTokenExpires",
    "passwordResetTokenIssuedAt",
    "refreshTokens",
    "roleIntegrityHash",
    "idNumberHash",
  ];

  for (const key of redactions) delete clean[key];
  return clean;
}

/**
 * Returns a user object safe for network transport.
 * - Adds a salted fingerprint of the role so the raw role value is hidden
 *   from non-admin consumers while remaining verifiable internally.
 * - Exposes a boolean `isAdmin` flag for client feature toggles without
 *   leaking the underlying role string.
 * - Removes all sensitive fields (passwords, OTP, integrity hashes, tokens).
 */
function sanitizeUserForResponse(user, requester) {
  if (!user) return null;
  const clean = stripSensitiveFields(user);

  const roleFingerprint = User.computeRoleHash(clean._id, clean.role);
  const isAdminRole = clean.role === "admin";
  const requesterIsAdmin = requester?.role === "admin";

  clean.isAdmin = isAdminRole;
  clean.roleFingerprint = roleFingerprint;

  // Hide the literal role string for non-admin consumers to avoid leaking
  // role semantics through developer tools/sniffers.
  if (!requesterIsAdmin) {
    delete clean.role;
  }

  return clean;
}

module.exports = { sanitizeUserForResponse };
