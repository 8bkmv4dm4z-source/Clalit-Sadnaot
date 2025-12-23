const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";
process.env.AUDIT_HMAC_SECRET = process.env.AUDIT_HMAC_SECRET || "audit-secret";

const controllerPath = require.resolve("../../controllers/workshopController");
const workshopModelPath = require.resolve("../../models/Workshop");
const userModelPath = require.resolve("../../models/User");
const resolveEntityPath = require.resolve("../../services/entities/resolveEntity");
const auditServicePath = require.resolve("../../services/AuditLogService");
const authControllerPath = require.resolve("../../controllers/authController");
const bcryptPath = require.resolve("bcryptjs");
const safeAuditPath = require.resolve("../../services/SafeAuditLog");

const resetModules = () => {
  [
    controllerPath,
    workshopModelPath,
    userModelPath,
    resolveEntityPath,
    auditServicePath,
    authControllerPath,
    bcryptPath,
    safeAuditPath,
  ].forEach(
    (p) => delete require.cache[p]
  );
};

const createRes = () => {
  const res = {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
  return res;
};

test("registerEntityToWorkshop emits audit event on success", async () => {
  resetModules();
  const recorded = [];

  const workshopDoc = {
    _id: "workshop-1",
    workshopKey: "11111111-1111-4111-8111-111111111111",
    hashedId: "hashed-1",
    maxParticipants: 10,
    participantsCount: 0,
    participants: [],
    familyRegistrations: [],
    waitingList: [],
    save: async () => {},
  };

  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {
      findOne: async () => workshopDoc,
      findOneAndUpdate: async () => {
        workshopDoc.participants.push("user-1");
        workshopDoc.participantsCount = workshopDoc.participants.length;
        return workshopDoc;
      },
      findById: () => ({
        populate() {
          return this;
        },
        toObject: () => ({
          ...workshopDoc,
          participants: [],
          familyRegistrations: [],
          waitingList: [],
        }),
      }),
      updateOne: async () => {},
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      updateOne: async () => {},
    },
  };

  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => ({
        type: "user",
        userDoc: {
          _id: "user-1",
          entityKey: "entity-123",
          userWorkshopMap: [],
          familyWorkshopMap: [],
          save: async () => {},
        },
        memberDoc: null,
      }),
    },
  };

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
      hmacEntityKey: () => "hash",
    },
  };

  const controller = require(controllerPath);

  const req = {
    params: { id: "11111111-1111-4111-8111-111111111111" },
    body: {},
    user: { _id: "user-1", role: "user", entityKey: "actor-1" },
  };
  const res = createRes();

  await controller.registerEntityToWorkshop(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "workshop.registration");
  assert.equal(recorded[0].subjectType, "workshop");
  assert.equal(recorded[0].subjectKey, "11111111-1111-4111-8111-111111111111");
  assert.equal(recorded[0].actorKey, "actor-1");
  assert.deepEqual(recorded[0].metadata, {
    participantType: "user",
    participantKey: "entity-123",
    action: "join",
  });
  assert.equal(recorded[0]._id, undefined);
});

test("addEntityToWaitlist emits audit event on success", async () => {
  resetModules();
  const recorded = [];

  const workshopDoc = {
    _id: "workshop-2",
    workshopKey: "22222222-2222-4222-8222-222222222222",
    hashedId: "hashed-2",
    waitingList: [],
    waitingListMax: 0,
    save: async () => {},
  };

  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {
      findOne: async () => workshopDoc,
      findOneAndUpdate: async () => {
        workshopDoc.waitingList.push({ parentUser: "user-2" });
        return { ...workshopDoc, waitingList: workshopDoc.waitingList.slice() };
      },
      findById: () => ({
        populate() {
          return this;
        },
        toObject: () => ({
          ...workshopDoc,
          participants: [],
          familyRegistrations: [],
          waitingList: [],
        }),
      }),
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {},
  };

  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => ({
        type: "user",
        userDoc: {
          _id: "user-2",
          entityKey: "entity-222",
          userWorkshopMap: [],
          familyWorkshopMap: [],
          save: async () => {},
        },
        memberDoc: null,
      }),
    },
  };

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
      hmacEntityKey: () => "hash",
    },
  };

  const controller = require(controllerPath);

  const req = {
    params: { id: "22222222-2222-4222-8222-222222222222" },
    body: {},
    user: { _id: "user-2", role: "user", entityKey: "actor-2" },
  };
  const res = createRes();

  await controller.addEntityToWaitlist(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "workshop.waitlist.add");
  assert.equal(recorded[0].subjectType, "workshop");
  assert.equal(recorded[0].subjectKey, "22222222-2222-4222-8222-222222222222");
  assert.equal(recorded[0].actorKey, "actor-2");
  assert.deepEqual(recorded[0].metadata, {
    participantType: "user",
    participantKey: "entity-222",
    action: "waitlist_add",
  });
  assert.equal(recorded[0]._id, undefined);
});

test("addEntityToWaitlist does not emit audit event when unchanged", async () => {
  resetModules();
  const recorded = [];

  const workshopDoc = {
    _id: "workshop-4",
    workshopKey: "44444444-4444-4444-8444-444444444444",
    hashedId: "hashed-4",
    waitingList: [{ parentUser: "user-4" }],
    waitingListMax: 1,
    save: async () => {},
  };

  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {
      findOne: async () => workshopDoc,
      findOneAndUpdate: async () => null,
      findById: () => ({
        select: () => ({
          waitingList: workshopDoc.waitingList,
          waitingListMax: workshopDoc.waitingListMax,
        }),
      }),
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {},
  };

  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => ({
        type: "user",
        userDoc: {
          _id: "user-4",
          entityKey: "entity-444",
          userWorkshopMap: [],
          familyWorkshopMap: [],
          save: async () => {},
        },
        memberDoc: null,
      }),
    },
  };

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
      hmacEntityKey: () => "hash",
    },
  };

  const controller = require(controllerPath);

  const req = {
    params: { id: "44444444-4444-4444-8444-444444444444" },
    body: {},
    user: { _id: "user-4", role: "user", entityKey: "actor-4" },
  };
  const res = createRes();

  await controller.addEntityToWaitlist(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(recorded.length, 0);
});

test("registerUser emits user.registered audit event on success", async () => {
  resetModules();
  const recorded = [];

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findOne: async () => null,
      create: async (doc) => ({ ...doc, _id: "user-1", entityKey: "entity-111" }),
    },
  };

  require.cache[bcryptPath] = {
    id: bcryptPath,
    filename: bcryptPath,
    loaded: true,
    exports: {
      hash: async () => "hashed",
    },
  };

  const authController = require(authControllerPath);
  const req = {
    body: { email: "user@example.com", password: "Secret123!", name: "User" },
  };
  const res = createRes();

  await authController.registerUser(req, res);

  assert.equal(res.statusCode, 202);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "user.registered");
  assert.equal(recorded[0].subjectType, "user");
  assert.equal(recorded[0].subjectKey, "entity-111");
  assert.equal(recorded[0].actorKey, "entity-111");
  assert.deepEqual(recorded[0].metadata, { source: "self_signup" });
});

test("unregisterEntityFromWorkshop emits audit event when state changes", async () => {
  resetModules();
  const recorded = [];

  const workshopDoc = {
    _id: "workshop-3",
    workshopKey: "33333333-3333-4333-8333-333333333333",
    hashedId: "hashed-3",
    participants: ["user-3"],
    familyRegistrations: [],
    waitingList: [],
    participantsCount: 1,
    save: async () => {},
  };

  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {
      findOne: async () => workshopDoc,
      findById: () => ({
        populate() {
          return this;
        },
        toObject: () => ({ ...workshopDoc }),
      }),
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findById: async () => ({}),
    },
  };

  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => ({
        type: "user",
        userDoc: {
          _id: "user-3",
          entityKey: "entity-333",
          userWorkshopMap: ["workshop-3"],
          save: async () => {},
        },
        memberDoc: null,
      }),
    },
  };

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
    },
  };

  const controller = require(controllerPath);
  const req = {
    params: { id: "33333333-3333-4333-8333-333333333333" },
    body: { entityKey: "entity-333" },
    user: { _id: "user-3", role: "user", entityKey: "actor-3" },
  };
  const res = createRes();

  await controller.unregisterEntityFromWorkshop(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "workshop.unregister");
  assert.equal(recorded[0].subjectType, "workshop");
  assert.equal(recorded[0].subjectKey, "33333333-3333-4333-8333-333333333333");
  assert.equal(recorded[0].actorKey, "actor-3");
  assert.deepEqual(recorded[0].metadata, {
    participantType: "user",
    participantKey: "entity-333",
    action: "unregister",
  });
});

test("autoPromoteFromWaitlist emits waitlist.promoted audit event", async () => {
  resetModules();
  const recorded = [];

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
    },
  };

  const controller = require(controllerPath);
  const autoPromote = controller.autoPromoteFromWaitlist || controller.__test?.autoPromoteFromWaitlist;

  const workshopDoc = {
    workshopKey: "44444444-4444-4444-8444-444444444444",
    hashedId: "hashed-4",
    participants: [],
    familyRegistrations: [],
    waitingList: [
      { parentUser: "user-4", parentKey: "entity-parent", familyMemberId: null },
      { parentUser: "user-5", parentKey: "entity-parent-2", familyMemberId: "fam-1", familyMemberKey: "family-1" },
    ],
    canAddParticipant: () => true,
    save: async () => {},
  };

  await autoPromote(workshopDoc);

  assert.equal(recorded.length, 2);
  assert.equal(recorded[0].eventType, "workshop.waitlist.promoted");
  assert.equal(recorded[0].actorKey, null);
  assert.equal(recorded[0].metadata.participantType, "user");
  assert.equal(recorded[1].metadata.participantType, "familyMember");
});

test("sendOtp logs security audit when user is already locked out", async () => {
  resetModules();
  const recorded = [];

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findOne: () => ({
        entityKey: "entity-locked",
        otpLockUntil: Date.now() + 60_000,
        otpAttempts: 5,
        select() {
          return this;
        },
      }),
    },
  };

  const authController = require(authControllerPath);
  const req = { body: { email: "locked@example.com" } };
  const res = createRes();

  await authController.sendOtp(req, res);

  assert.equal(res.statusCode, 429);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "security");
  assert.equal(recorded[0].subjectKey, "entity-locked");
  assert.equal(recorded[0].metadata.reason, "otp_lockout_active");
});

test("registerEntityToWorkshop does not emit audit event when no state change", async () => {
  resetModules();
  const recorded = [];

  const workshopDoc = {
    _id: "workshop-3",
    workshopKey: "33333333-3333-4333-8333-333333333333",
    hashedId: "hashed-3",
    participantsCount: 1,
    participants: ["user-3"],
    familyRegistrations: [],
    waitingList: [],
    save: async () => {},
  };

  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {
      findOne: async () => workshopDoc,
      findOneAndUpdate: async () => null,
      findById: () => ({
        select: () => ({
          familyRegistrations: workshopDoc.familyRegistrations,
          participants: workshopDoc.participants,
          waitingList: workshopDoc.waitingList,
          waitingListMax: 0,
          maxParticipants: 1,
          participantsCount: 1,
        }),
      }),
      updateOne: async () => {},
    },
  };

  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      updateOne: async () => {},
    },
  };

  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => ({
        type: "user",
        userDoc: {
          _id: "user-3",
          entityKey: "entity-333",
          userWorkshopMap: [],
          familyWorkshopMap: [],
          save: async () => {},
        },
        memberDoc: null,
      }),
    },
  };

  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      recordEvent: async (payload) => recorded.push(payload),
      hmacEntityKey: () => "hash",
    },
  };

  const controller = require(controllerPath);

  const req = {
    params: { id: "33333333-3333-4333-8333-333333333333" },
    body: {},
    user: { _id: "user-3", role: "user", entityKey: "actor-3" },
  };
  const res = createRes();

  await controller.registerEntityToWorkshop(req, res);

  assert.equal(res.statusCode, 400);
  assert.equal(recorded.length, 0);
});
