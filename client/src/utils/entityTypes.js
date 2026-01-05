export const ENTITY_TYPE_USER = "user";
export const ENTITY_TYPE_FAMILY_MEMBER = "familyMember";

export const isFamilyEntity = (entity) => {
  if (!entity) return false;
  if (entity.entityType === ENTITY_TYPE_FAMILY_MEMBER) return true;
  if (entity.isFamily === true) return true;
  if (entity.parentKey || entity.parentEntityKey) return true;
  return false;
};

export const getEntityIdentifiers = (entity = {}) => {
  const isFamily = isFamilyEntity(entity);
  const entityKey = String(
    entity.entityKey || entity.entity_key || entity.id || entity._id || ""
  );
  const parentKey = isFamily
    ? String(
        entity.parentKey ||
          entity.parentEntityKey ||
          entity.parent?.entityKey ||
          entity.parentUser?.entityKey ||
          entity.parent?.entity_key ||
          entity.parentUser?.entity_key ||
          ""
      )
    : "";

  const key = [parentKey, entityKey].filter(Boolean).join(":");

  return { isFamily, parentKey, entityKey, key };
};

export const withEntityFlags = (entity = {}) => {
  const { isFamily, entityKey, parentKey, key } = getEntityIdentifiers(entity);
  return {
    ...entity,
    entityType: isFamily ? ENTITY_TYPE_FAMILY_MEMBER : ENTITY_TYPE_USER,
    isFamily,
    parentKey: entity.parentKey || parentKey || undefined,
    _id: entityKey || entity._id,
    __entityKey: key,
  };
};
export const normalizeMePayload = (payload = {}) => {
  if (!payload || !payload.data) return null;

  return payload.data; // already server-normalized
};

export const flattenUserEntities = (user = {}) => {
  const baseUser = withEntityFlags({ ...user, entityType: ENTITY_TYPE_USER, isFamily: false });

  // Prefer pre-flattened payloads from the server
  if (Array.isArray(user.entities) && user.entities.length > 0) {
    const normalized = user.entities.map((e) => withEntityFlags(e));
    const userEntity = normalized.find((e) => !e.isFamily) || baseUser;
    const familyMembers = normalized.filter((e) => e.isFamily);
    return { userEntity, familyMembers, allEntities: normalized };
  }

  const familyMembers = Array.isArray(user.familyMembers)
    ? user.familyMembers.map((member) =>
        withEntityFlags({
          ...member,
          parentKey: member.parentKey || baseUser.entityKey,
          parentName: member.parentName || baseUser.name,
          parentEmail: member.parentEmail || baseUser.email,
          parentPhone: member.parentPhone || baseUser.phone,
        })
      )
    : [];

  const allEntities = [baseUser, ...familyMembers];
  return { userEntity: baseUser, familyMembers, allEntities };
};
