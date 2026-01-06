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
const ALLOWED_ME_FIELDS = [
  "entityKey",
  "name",
  "email",
  "phone",
  "city",
  "birthDate",
  "relation",
  "idNumber",
  "parentKey",
  "parentName",
  "parentEmail",
  "parentPhone",
];

const pickAllowedMeFields = (src = {}) => {
  const safe = {};
  for (const key of ALLOWED_ME_FIELDS) {
    if (src[key] !== undefined) safe[key] = src[key];
  }
  return safe;
};

export const normalizeMePayload = (payload = {}) => {
  const raw = payload?.data ?? payload ?? {};
  if (!raw.entityKey) return null;

  // Strip privileged/sensitive fields (role, authorities) and flatten entities
  const baseUser = withEntityFlags(pickAllowedMeFields(raw));

  const normalizeEntity = (entity, { isFamily = false } = {}) =>
    withEntityFlags({
      ...pickAllowedMeFields(entity),
      isFamily,
    });

  const normalizedEntities = Array.isArray(raw.entities)
    ? raw.entities
        .map((entity) => normalizeEntity(entity, { isFamily: isFamilyEntity(entity) }))
        .filter((e) => e.entityKey)
    : [];

  const normalizedFamily = Array.isArray(raw.familyMembers)
    ? raw.familyMembers
        .map((member) =>
          normalizeEntity(
            {
              ...member,
              parentKey: member.parentKey || raw.entityKey,
            },
            { isFamily: true }
          )
        )
        .filter((e) => e.entityKey)
    : [];

  const deduped = new Map();
  [baseUser, ...normalizedEntities, ...normalizedFamily].forEach((entity) => {
    if (!entity?.entityKey) return;
    const existing = deduped.get(entity.entityKey) || {};
    const merged = {
      ...existing,
      ...entity,
    };
    if (merged.isFamily && !merged.parentKey) {
      merged.parentKey = raw.entityKey;
    }
    deduped.set(entity.entityKey, merged);
  });

  const primaryKey = baseUser.entityKey;
  const entities = Array.from(deduped.values()).map((entity) =>
    entity.entityKey === primaryKey
      ? { ...entity, isFamily: false }
      : { ...entity, isFamily: true, parentKey: entity.parentKey || primaryKey }
  );

  const userEntity = entities.find((e) => !e.isFamily) || baseUser;
  const familyMembers = entities.filter((e) => e.isFamily);

  return {
    ...userEntity,
    entities,
    familyMembers,
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
