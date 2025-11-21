export const ENTITY_TYPE_USER = "user";
export const ENTITY_TYPE_FAMILY_MEMBER = "familyMember";

export const isFamilyEntity = (entity) => {
  if (!entity) return false;
  if (entity.entityType === ENTITY_TYPE_FAMILY_MEMBER) return true;
  if (entity.isFamily === true) return true;
  if (entity.parentKey || entity.parentEntityKey) return true;
  return false;
};

/**
 * getEntityIdentifiers
 *
 * Canonical rules:
 *  - entityKey is always the server-generated key
 *  - parentKey is the parent user entityKey for family members
 *  - key (identity) = entityKey (not parentKey:entityKey)
 */
export const getEntityIdentifiers = (entity = {}) => {
  const isFamily = isFamilyEntity(entity);

  // Canonical key: only trust entityKey coming from server / hydration
  const entityKey = entity.entityKey || entity.entity_key || "";

  // For family members we may still want to know the parent key
  const parentKey = isFamily
    ? entity.parentKey ||
      entity.parentEntityKey ||
      entity.parent?.entityKey ||
      entity.parentUser?.entityKey ||
      ""
    : "";

  // Identity key used by WorkshopCard, AllProfiles, waitlist, etc.
  const key = String(entityKey || "");

  return { isFamily, parentKey: parentKey ? String(parentKey) : "", entityKey: String(key), key };
};

/**
 * withEntityFlags
 *
 * - Standardizes flags on any backend row
 * - __entityKey is now always the canonical entityKey (for convenience)
 */
export const withEntityFlags = (entity = {}) => {
  const { isFamily, entityKey, parentKey, key } = getEntityIdentifiers(entity);
  return {
    ...entity,
    entityType: isFamily ? ENTITY_TYPE_FAMILY_MEMBER : ENTITY_TYPE_USER,
    isFamily,
    parentKey: parentKey || undefined,
    entityKey: entityKey || undefined,
    __entityKey: key || undefined,
  };
};
