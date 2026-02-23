const test = require("node:test");
const assert = require("node:assert/strict");

const { deleteUserEntity } = require("../../services/userDeletionService");

test("deleteUserEntity unregisters workshop links, deletes user, and writes audit event", async () => {
  const unregisterUserCalls = [];
  const unregisterFamilyCalls = [];
  const deleteCalls = [];
  const auditCalls = [];

  const userDoc = {
    _id: "mongo-user-1",
    entityKey: "user_1",
    userWorkshopMap: ["wk-1", "wk-2", "wk-2"],
    familyWorkshopMap: [
      { familyMemberId: "fam-1", workshops: ["wk-3", "wk-3"] },
      { familyMemberId: "fam-2", workshops: ["wk-4"] },
    ],
  };

  const deps = {
    userModel: {
      findOne() {
        return {
          select: async () => userDoc,
        };
      },
      async deleteOne(query) {
        deleteCalls.push(query);
      },
    },
    async unregisterUserFromWorkshop(payload) {
      unregisterUserCalls.push(payload);
    },
    async unregisterFamilyFromWorkshop(payload) {
      unregisterFamilyCalls.push(payload);
    },
    async safeAuditLog(payload) {
      auditCalls.push(payload);
    },
  };

  const result = await deleteUserEntity({
    userEntityKey: "user_1",
    actorKey: "admin_1",
    ip: "127.0.0.1",
    deps,
  });

  assert.equal(result.deleted, true);
  assert.equal(unregisterUserCalls.length, 2);
  assert.equal(unregisterFamilyCalls.length, 2);
  assert.deepEqual(deleteCalls, [{ _id: "mongo-user-1" }]);
  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].eventType, "admin.user.delete");
  assert.equal(auditCalls[0].subjectKey, "user_1");
  assert.equal(auditCalls[0].actorKey, "admin_1");
});

test("deleteUserEntity returns not_found when user is missing", async () => {
  const deps = {
    userModel: {
      findOne() {
        return {
          select: async () => null,
        };
      },
    },
  };

  const result = await deleteUserEntity({
    userEntityKey: "missing_user",
    deps,
  });

  assert.deepEqual(result, { deleted: false, reason: "not_found" });
});
