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
    "userWorkshopMap",
    "familyWorkshopMap",
    "otpExpires",
  ];

  for (const key of redactions) delete clean[key];
  return clean;
}

const toStringOrNull = (value) => {
  if (value === undefined || value === null) return null;
  return String(value);
};

const normalizeEntityShape = (entity = {}) => {
  const normalized = { ...entity };
  if (normalized._id !== undefined) normalized._id = toStringOrNull(normalized._id);
  if (normalized.entityKey !== undefined)
    normalized.entityKey = toStringOrNull(normalized.entityKey);
  if (normalized.parentKey !== undefined)
    normalized.parentKey = toStringOrNull(normalized.parentKey);
  return normalized;
};

const withEntityFlags = (entity = {}, { isFamily = false, parent = null } = {}) => {
  const flagged = normalizeEntityShape(entity);

  // Explicit entity flags for client-side renderers
  flagged.entityType = isFamily ? "familyMember" : "user";
  flagged.isFamily = isFamily;

  if (isFamily && parent) {
    flagged.parentKey = flagged.parentKey || parent.entityKey || null;
    flagged.parentName = flagged.parentName || parent.name || null;
    flagged.parentEmail = flagged.parentEmail || parent.email || null;
    flagged.parentPhone = flagged.parentPhone || parent.phone || null;
    flagged.parentCity = flagged.parentCity || parent.city || null;
  }

  return flagged;
};

const ALLOWED_USER_FIELDS = ["_id", "entityKey", "name", "email", "phone", "city"];
const ALLOWED_FAMILY_FIELDS = [
  "_id",
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
  "birthDate",
  "idNumber",
  "canCharge",
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
function sanitizeUserForResponse(user, requester, { includeFull = false } = {}) {
  if (!user) return null;
  const clean = stripSensitiveFields(user);

  const requesterIsAdmin = requester?.role === "admin";
  const isAdminRole = clean.role === "admin";

  // 📦 Full profile payload (for /me and admin views)
  if (includeFull) {
    const normalizedUser = normalizeEntityShape(clean);
    const base = {
      ...withEntityFlags(normalizedUser, { isFamily: false }),
      isAdmin: isAdminRole,
      roleFingerprint: User.computeRoleHash(clean.entityKey, clean.role),
    };

    base.familyMembers = Array.isArray(clean.familyMembers)
      ? clean.familyMembers.map((member) => {
          const merged = normalizeEntityShape({
            parentKey: normalizedUser.entityKey,
            parentName: normalizedUser.name,
            parentEmail: normalizedUser.email,
            parentPhone: normalizedUser.phone,
            parentCity: normalizedUser.city,
            ...member,
          });

          // Ensure inherited contact fields are present even if missing in member doc
          merged.email = merged.email ?? normalizedUser.email ?? "";
          merged.phone = merged.phone ?? normalizedUser.phone ?? "";
          merged.city = merged.city ?? normalizedUser.city ?? "";

          return withEntityFlags(merged, { isFamily: true, parent: normalizedUser });
        })
      : [];

    const selfEntity = { ...base };
    delete selfEntity.entities;
    const entities = [selfEntity, ...base.familyMembers];

    base.entities = entities;

    return base;
  }

  // 🔒 Minimal payload (legacy clients)
  const safeUser = withEntityFlags(
    pickAllowed(clean, ALLOWED_USER_FIELDS),
    { isFamily: false }
  );
  const safeFamilyMembers = Array.isArray(clean.familyMembers)
    ? clean.familyMembers.map((member) =>
        withEntityFlags(
          pickAllowed(
            {
              parentKey: safeUser.entityKey,
              parentName: safeUser.name,
              parentEmail: safeUser.email,
              parentPhone: safeUser.phone,
              ...member,
            },
            ALLOWED_FAMILY_FIELDS
          ),
          { isFamily: true, parent: safeUser }
        )
      )
    : [];

  const roleFingerprint = User.computeRoleHash(safeUser.entityKey, clean.role);

  safeUser.isAdmin = isAdminRole;
  safeUser.roleFingerprint = roleFingerprint;
  safeUser.familyMembers = safeFamilyMembers;

  const safeSelf = { ...safeUser };
  delete safeSelf.entities;
  const safeEntities = [safeSelf, ...safeFamilyMembers];

  safeUser.entities = safeEntities;

  // Hide the literal role string for non-admin consumers to avoid leaking
  // role semantics through developer tools/sniffers.
  if (!requesterIsAdmin) {
    delete safeUser.role;
  }

  return safeUser;
}

module.exports = { sanitizeUserForResponse };
