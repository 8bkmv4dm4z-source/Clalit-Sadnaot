const User = require("../models/User");

const ACCESS_SCOPE_HEADER = "X-Access-Scope";
const ACCESS_PROOF_HEADER = "X-Access-Proof";
const ENTITY_SCOPE_HEADER = "X-Entity-Scope";

/**
 * Builds a transport-safe descriptor for the caller's access scope.
 * - Scope is derived exclusively from server-side authorities (never from payloads).
 * - Proof is a role hash keyed off the caller's entityKey/hashedId so the client
 *   can cache a tamper-evident hint without receiving a raw role string.
 */
const deriveAccessScope = (requester = null) => {
  const hasAdmin = !!requester?.authorities?.admin;
  const scope = requester ? (hasAdmin ? "admin" : "user") : "public";
  const entityKey = requester?.entityKey || requester?.hashedId || null;
  const proof = entityKey ? User.computeRoleHash(entityKey, scope) : null;

  return { scope, proof, entityKey };
};

/**
 * Derives access scope for a specific entity. Scopes are derived exclusively
 * from authenticated identity + entityKey relationships (never payloads).
 */
const deriveEntityScope = ({ requester, entityKey, parentKey } = {}) => {
  const requesterKey = requester?.entityKey ? String(requester.entityKey) : null;
  const targetKey = entityKey ? String(entityKey) : null;
  const targetParentKey = parentKey ? String(parentKey) : null;
  const isAdmin = !!requester?.authorities?.admin;

  if (!requesterKey || !targetKey) {
    return { scope: "none", requesterKey, entityKey: targetKey, parentKey: targetParentKey };
  }

  if (isAdmin) {
    return { scope: "admin", requesterKey, entityKey: targetKey, parentKey: targetParentKey };
  }

  if (requesterKey === targetKey) {
    return { scope: "self", requesterKey, entityKey: targetKey, parentKey: targetParentKey };
  }

  if (targetParentKey && requesterKey === targetParentKey) {
    return { scope: "parent", requesterKey, entityKey: targetKey, parentKey: targetParentKey };
  }

  return { scope: "none", requesterKey, entityKey: targetKey, parentKey: targetParentKey };
};

/**
 * Applies CORS-exposed headers so clients can read access scope without relying
 * on JSON payload fields.
 */
const applyAccessHeaders = (res, access = {}) => {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader(ACCESS_SCOPE_HEADER, access.scope || "public");
  if (access.proof) res.setHeader(ACCESS_PROOF_HEADER, access.proof);
};

const applyEntityScopeHeader = (res, scope = "none") => {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader(ENTITY_SCOPE_HEADER, scope || "none");
};

module.exports = {
  ACCESS_SCOPE_HEADER,
  ACCESS_PROOF_HEADER,
  ENTITY_SCOPE_HEADER,
  deriveAccessScope,
  deriveEntityScope,
  applyAccessHeaders,
  applyEntityScopeHeader,
};
