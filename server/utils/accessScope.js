const ENTITY_SCOPE_HEADER = "X-Entity-Scope";

/**
 * Builds a transport-safe descriptor for the caller's access scope.
 * - Scope is derived exclusively from server-side authorities (never from payloads).
 * - Scope is used for server-side branching only and is never emitted to clients.
 */
const deriveAccessScope = (requester = null) => {
  const hasAdmin = !!requester?.authorities?.admin;
  const scope = requester ? (hasAdmin ? "admin" : "user") : "public";
  const entityKey = requester?.entityKey || requester?.hashedId || null;
  return { scope, entityKey };
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

const applyEntityScopeHeader = (res, scope = "none") => {
  if (!res || typeof res.setHeader !== "function") return;
  res.setHeader(ENTITY_SCOPE_HEADER, scope || "none");
};

module.exports = {
  ENTITY_SCOPE_HEADER,
  deriveAccessScope,
  deriveEntityScope,
  applyEntityScopeHeader,
};
