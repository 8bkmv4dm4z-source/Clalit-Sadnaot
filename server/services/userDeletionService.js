const User = require("../models/User");
const { safeAuditLog } = require("./SafeAuditLog");
const { AuditEventTypes } = require("./AuditEventRegistry");
const {
  unregisterUserFromWorkshop,
  unregisterFamilyFromWorkshop,
} = require("./workshopRegistration");

const withDependencies = (overrides = {}) => ({
  userModel: User,
  unregisterUserFromWorkshop,
  unregisterFamilyFromWorkshop,
  safeAuditLog,
  ...overrides,
});

const deleteUserEntity = async ({
  userEntityKey,
  actorKey,
  ip,
  deps: overrides = {},
} = {}) => {
  const deps = withDependencies(overrides);
  const user = await deps.userModel
    .findOne({ entityKey: userEntityKey })
    .select("entityKey userWorkshopMap familyWorkshopMap");

  if (!user) {
    return { deleted: false, reason: "not_found" };
  }

  const unregisterOps = [];
  const userWorkshops = Array.from(new Set(user.userWorkshopMap || []));
  for (const workshopId of userWorkshops) {
    unregisterOps.push(deps.unregisterUserFromWorkshop({ workshopId, userId: user._id }));
  }

  const familyEntries = Array.isArray(user.familyWorkshopMap) ? user.familyWorkshopMap : [];
  for (const familyEntry of familyEntries) {
    const familyWorkshops = Array.from(new Set(familyEntry.workshops || []));
    for (const workshopId of familyWorkshops) {
      unregisterOps.push(
        deps.unregisterFamilyFromWorkshop({
          workshopId,
          parentUserId: user._id,
          familyId: familyEntry.familyMemberId,
        })
      );
    }
  }

  await Promise.all(unregisterOps);
  await deps.userModel.deleteOne({ _id: user._id });

  await deps.safeAuditLog({
    eventType: AuditEventTypes.ADMIN_USER_DELETE,
    subjectType: "user",
    subjectKey: user.entityKey || userEntityKey || null,
    actorKey: actorKey || null,
    metadata: {
      action: "user_delete",
      adminId: actorKey || null,
      entityId: user.entityKey || userEntityKey || null,
      ip: ip || null,
    },
  });

  return { deleted: true, user };
};

module.exports = {
  deleteUserEntity,
};
