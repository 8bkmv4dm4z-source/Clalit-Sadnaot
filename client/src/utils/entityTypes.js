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
