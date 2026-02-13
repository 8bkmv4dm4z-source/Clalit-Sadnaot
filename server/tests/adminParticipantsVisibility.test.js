const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const controllerPath = require.resolve("../controllers/workshopController");
const workshopModelPath = require.resolve("../models/Workshop");
const auditPath = require.resolve("../services/SafeAuditLog");

const workshopKey = "11111111-1111-4111-8111-111111111111";

const resetModules = () => {
  [controllerPath, workshopModelPath, auditPath].forEach((p) => {
    delete require.cache[p];
  });
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

const installAuditStub = (sink = []) => {
  require.cache[auditPath] = {
    id: auditPath,
    filename: auditPath,
    loaded: true,
    exports: {
      safeAuditLog: async (payload) => {
        sink.push(payload);
      },
    },
  };
};

const installWorkshopStub = (impls = {}) => {
  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {
      findOne: async () => impls.findOneResult || { _id: "workshop-1", workshopKey },
      findById: () => ({
        populate() {
          return this;
        },
        select() {
          return this;
        },
        lean: async () => impls.findByIdResult,
      }),
      findByIdAndDelete: async () => null,
    },
  };
};

test("non-admins cannot access admin participant endpoints", async () => {
  resetModules();
  installWorkshopStub();
  installAuditStub();
  const controller = require(controllerPath);

  const res = createRes();
  await controller.getWorkshopParticipants(
    { user: { role: "user" }, params: { id: workshopKey }, query: {} },
    res
  );
  assert.equal(res.statusCode, 403);

  const waitlistRes = createRes();
  await controller.getWaitlist(
    { user: { role: "user" }, params: { id: workshopKey }, query: {} },
    waitlistRes
  );
  assert.equal(waitlistRes.statusCode, 403);
});

test("admin participant view uses allowlist DTO and logs access", async () => {
  resetModules();
  const auditCalls = [];
  installAuditStub(auditCalls);
  installWorkshopStub({
    findByIdResult: {
      _id: "workshop-1",
      workshopKey,
      participants: [
        { _id: "user-1", name: "User", email: "user@example.com", phone: "123", city: "City", canCharge: true },
      ],
      familyRegistrations: [
        {
          parentUser: { _id: "user-2", entityKey: "parent-key", email: "parent@example.com", phone: "555", city: "Town", canCharge: false },
          familyMemberId: { _id: "family-1", entityKey: "family-key", name: "Child", relation: "child", email: "child@example.com", phone: "999", city: "Town" },
          relation: "child",
        },
      ],
    },
  });

  const controller = require(controllerPath);
  const res = createRes();
  await controller.getWorkshopParticipants(
    { user: { role: "admin", entityKey: "admin-actor" }, params: { id: workshopKey }, query: { limit: "5" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.participants));
  assert.equal(res.body.participants.length, 2);

  const allowed = new Set([
    "entityKey",
    "name",
    "isFamily",
    "parentKey",
    "relation",
    "status",
    "city",
    "email",
    "phone",
  ]);
  res.body.participants.forEach((p) => {
    Object.keys(p).forEach((key) => assert.ok(allowed.has(key), `${key} should be allowlisted`));
    ["_id", "idNumber", "birthDate", "familyMemberId", "parentUser", "canCharge"].forEach((forbidden) =>
      assert.equal(p[forbidden], undefined)
    );
    assert.equal(p.status, "registered");
  });

  assert.deepEqual(res.body.meta, {
    limit: 5,
    skip: 0,
    nextSkip: res.body.participants.length,
    hasMore: false,
    total: 2,
  });

  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].metadata.action, "workshop_participants_view");
  assert.equal(auditCalls[0].subjectKey, workshopKey);
});

test("admin waitlist view redacts Mongo IDs and logs access", async () => {
  resetModules();
  const auditCalls = [];
  installAuditStub(auditCalls);
  installWorkshopStub({
    findByIdResult: {
      _id: "workshop-2",
      workshopKey,
      waitingList: [
        {
          parentUser: { _id: "user-3", entityKey: "parent-wl", phone: "888", email: "wl@example.com", canCharge: true },
          name: "Wait User",
          relation: "self",
          phone: "123123",
        },
        {
          parentUser: { _id: "user-4", entityKey: "parent-wl-2", phone: "111", email: "p2@example.com", city: "City" },
          familyMemberId: { _id: "fam-2", entityKey: "fam-wl", name: "Child WL", relation: "child", phone: "222" },
          relation: "child",
        },
      ],
    },
  });

  const controller = require(controllerPath);
  const res = createRes();
  await controller.getWaitlist(
    { user: { role: "admin", entityKey: "admin-actor" }, params: { id: workshopKey }, query: { skip: "0", limit: "10" } },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.ok(Array.isArray(res.body.waitingList));
  assert.equal(res.body.waitingList.length, 2);

  res.body.waitingList.forEach((entry) => {
    ["_id", "idNumber", "birthDate", "familyMemberId", "parentUser"].forEach((forbidden) =>
      assert.equal(entry[forbidden], undefined)
    );
    assert.equal(entry.status, "waitlist");
    assert.ok(entry.entityKey);
    assert.ok(entry.phone !== undefined);
  });

  assert.equal(auditCalls.length, 1);
  assert.equal(auditCalls[0].metadata.action, "workshop_waitlist_view");
  assert.equal(auditCalls[0].subjectKey, workshopKey);
});

test("public workshop responses never include participant arrays", async () => {
  resetModules();
  installAuditStub();
  installWorkshopStub({
    findByIdResult: {
      _id: "workshop-3",
      workshopKey,
      title: "Public Workshop",
      participants: [{ _id: "user-1" }],
      familyRegistrations: [{ _id: "family-1" }],
      waitingList: [{ _id: "wl-1" }],
      participantsCount: 2,
    },
  });

  const controller = require(controllerPath);
  const res = createRes();
  await controller.getWorkshopById(
    { params: { id: workshopKey }, user: null },
    res
  );

  assert.equal(res.statusCode, 200);
  const payload = res.body.data;
  ["participants", "waitingList", "familyRegistrations"].forEach((key) =>
    assert.equal(payload[key], undefined)
  );
  assert.equal(payload.participantsCount, 2);
});
