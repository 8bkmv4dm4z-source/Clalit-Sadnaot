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
    "_id",
    "passwordHash",
    "otpCode",
    "otpAttempts",
    "passwordResetTokenHash",
    "passwordResetTokenExpires",
    "passwordResetTokenIssuedAt",
    "refreshTokens",
    "roleIntegrityHash",
    "idNumberHash",
    "userWorkshopMap",
    "familyWorkshopMap",
    "otpExpires",
  ];

  for (const key of redactions) delete clean[key];
  return clean;
}

const ALLOWED_USER_FIELDS = ["entityKey", "name", "email", "phone", "city"];
const ALLOWED_FAMILY_FIELDS = [
  "entityKey",
  "name",
  "relation",
  "email",
  "phone",
  "city",
  "parentKey",
  "parentName",
  "parentEmail",
  "parentPhone",
];

const pickAllowed = (source = {}, allowed = []) => {
  const out = {};
  for (const key of allowed) {
    if (source[key] !== undefined) out[key] = source[key];
  }
  return out;
};

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

  const safeUser = pickAllowed(clean, ALLOWED_USER_FIELDS);
  const safeFamilyMembers = Array.isArray(clean.familyMembers)
    ? clean.familyMembers.map((member) =>
        pickAllowed(
          {
            parentKey: safeUser.entityKey,
            parentName: safeUser.name,
            parentEmail: safeUser.email,
            parentPhone: safeUser.phone,
            ...member,
          },
          ALLOWED_FAMILY_FIELDS
        )
      )
    : [];

  const roleFingerprint = User.computeRoleHash(safeUser.entityKey, clean.role);
  const isAdminRole = clean.role === "admin";
  const requesterIsAdmin = requester?.role === "admin";

  safeUser.isAdmin = isAdminRole;
  safeUser.roleFingerprint = roleFingerprint;
  safeUser.familyMembers = safeFamilyMembers;

  // Hide the literal role string for non-admin consumers to avoid leaking
  // role semantics through developer tools/sniffers.
  if (!requesterIsAdmin) {
    delete safeUser.role;
  }

  return safeUser;
}

module.exports = { sanitizeUserForResponse };
