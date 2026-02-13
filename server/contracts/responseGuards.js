const BASE_FORBIDDEN_RESPONSE_FIELDS = new Set([
  "_id",
  "__v",
  "role",
  "roles",
  "permissions",
  "authorities",
  "isAdmin",
  "passwordHash",
  "otpCode",
  "otpAttempts",
  "otpExpires",
  "otpLastSent",
  "otpLockUntil",
  "refreshTokens",
  "internalIds",
  "canCharge",
  "adminHidden",
  "auditFlags",
  "roleIntegrityHash",
  "idNumberHash",
  "passwordResetTokenHash",
  "passwordResetTokenExpires",
  "passwordResetTokenIssuedAt",
]);

const CONTACT_FORBIDDEN_FIELDS = new Set([
  "email",
  "phone",
  "idNumber",
  "birthDate",
]);

const FORBIDDEN_RESPONSE_FIELDS = BASE_FORBIDDEN_RESPONSE_FIELDS;

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

const deriveContextAllowlist = (context = "") => {
  const raw = String(context || "").trim();
  const match = raw.match(/^[A-Z]+\s+([^\s]+)/);
  const target = match?.[1];
  if (!target) return [];

  try {
    const parsed = new URL(target, "http://localhost");
    if (parsed.pathname === "/api/workshops" && parsed.searchParams.get("scope") === "admin") {
      return ["adminHidden"];
    }
  } catch {
    return [];
  }

  return [];
};

/**
 * Development guard to prevent accidental leakage of privileged fields.
 * - Always strips forbidden keys from the payload.
 * - Throws in non-production environments to surface the mistake early (unless suppressThrow is set).
 */
function enforceResponseContract(
  payload,
  { allowlist = [], context = "response", suppressThrow = false, forbidContactFields = false } = {}
) {
  const allow = new Set([...allowlist, ...deriveContextAllowlist(context)]);
  const stripped = [];
  const forbidden = new Set(BASE_FORBIDDEN_RESPONSE_FIELDS);
  if (forbidContactFields) {
    CONTACT_FORBIDDEN_FIELDS.forEach((f) => forbidden.add(f));
  }

  const scrub = (value, path = []) => {
    if (Array.isArray(value)) {
      value.forEach((entry, idx) => scrub(entry, [...path, idx]));
      return;
    }
    if (!isObject(value)) return;

    for (const key of Object.keys(value)) {
      const currentPath = [...path, key].join(".");

      if (allow.has(key)) {
        scrub(value[key], [...path, key]);
        continue;
      }

      if (forbidden.has(key)) {
        stripped.push(currentPath);
        delete value[key];
        continue;
      }

      scrub(value[key], [...path, key]);
    }
  };

  scrub(payload);

  if (stripped.length && process.env.NODE_ENV !== "production" && !suppressThrow) {
    const error = new Error(
      `Forbidden fields stripped from ${context}: ${stripped.join(", ")}`
    );
    error.statusCode = 500;
    throw error;
  }

  return payload;
}

module.exports = {
  FORBIDDEN_RESPONSE_FIELDS,
  enforceResponseContract,
};
