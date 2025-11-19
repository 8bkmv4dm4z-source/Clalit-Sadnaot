export const ENTITY_TYPE_USER = "user";
export const ENTITY_TYPE_FAMILY_MEMBER = "familyMember";

export const isFamilyEntity = (entity) => {
  if (!entity) return false;
  if (entity.entityType === ENTITY_TYPE_FAMILY_MEMBER) return true;
  if (entity.isFamily === true) return true;
  if (entity.parentId || entity.parentUserId || entity.parentUser || entity.parent) return true;
  return false;
};

export const getEntityIdentifiers = (entity = {}) => {
  const isFamily = isFamilyEntity(entity);
  const userId = isFamily
    ? String(
        entity.parentId ||
          entity.parentUserId ||
          entity.parentUser?._id ||
          entity.parentUser ||
          entity.userId ||
          entity.user?._id ||
          entity.user ||
          ""
      )
    : String(entity._id || entity.id || entity.userId || entity.user?._id || entity.user || "");

  const familyId = isFamily
    ? String(
        entity.familyId ||
          entity.familyMemberId?._id ||
          entity.familyMemberId ||
          entity.familyMember?._id ||
          entity.familyMember ||
          entity._id ||
          ""
      )
    : null;

  const key = [userId, familyId].filter(Boolean).join(":");

  return { isFamily, userId, familyId, key };
};

export const withEntityFlags = (entity = {}) => {
  const { isFamily, userId, familyId, key } = getEntityIdentifiers(entity);
  return {
    ...entity,
    entityType: isFamily ? ENTITY_TYPE_FAMILY_MEMBER : ENTITY_TYPE_USER,
    isFamily,
    parentId: entity.parentId || (isFamily ? userId : undefined),
    parentUserId: entity.parentUserId || (isFamily ? userId : undefined),
    _id: isFamily ? familyId || entity._id : userId || entity._id,
    __entityKey: key,
  };
};
