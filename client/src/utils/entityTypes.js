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
const ALLOWED_ME_FIELDS = ["entityKey", "name", "email", "phone", "city", "birthDate"];

const pickAllowedMeFields = (src = {}) => {
  const safe = {};
  for (const key of ALLOWED_ME_FIELDS) {
    if (src[key] !== undefined) safe[key] = src[key];
  }
  return safe;
};

const normalizeAccessScope = (rawScope) => {
  if (!rawScope) return null;
  const scope = String(rawScope).toLowerCase();
  return ["admin", "user", "public"].includes(scope) ? scope : null;
};

export const normalizeMePayload = (payload = {}, meta = {}) => {
  const raw = payload?.data ?? payload ?? {};
  if (!raw.entityKey) return null;

  const accessScope =
    normalizeAccessScope(raw.access?.scope) ||
    normalizeAccessScope(meta.accessScope);

  const access = {
    scope: accessScope || "user",
    proof: raw.access?.proof || meta.accessProof || null,
  };

  // Strip privileged/sensitive fields (role, authorities) and flatten entities
  const baseUser = withEntityFlags({
    ...pickAllowedMeFields(raw),
    isFamily: false,
  });

  const normalizedEntities = Array.isArray(raw.entities)
    ? raw.entities
        .map((entity) => withEntityFlags(pickAllowedMeFields(entity)))
        .filter((e) => e.entityKey)
    : [];

  const deduped = new Map();
  [baseUser, ...normalizedEntities].forEach((entity) => {
    if (entity?.entityKey && !deduped.has(entity.entityKey)) {
      deduped.set(entity.entityKey, entity);
    }
  });

  const primaryKey = baseUser.entityKey;
  const entities = Array.from(deduped.values()).map((entity) => {
    if (entity.entityKey === primaryKey) return entity;

    const withParent = entity.parentKey
      ? entity
      : { ...entity, parentKey: primaryKey, isFamily: true };

    return withEntityFlags(withParent);
  });

  const userEntity = entities.find((e) => !e.isFamily) || baseUser;
  const familyMembers = entities.filter((e) => e.isFamily);

  return {
    ...userEntity,
    entities,
    familyMembers,
    access,
    isAdmin: access.scope === "admin",
  };
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
