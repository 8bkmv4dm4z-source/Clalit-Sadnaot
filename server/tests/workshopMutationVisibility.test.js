const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const controllerPath = require.resolve("../controllers/workshopController");
const workshopModelPath = require.resolve("../models/Workshop");
const userModelPath = require.resolve("../models/User");
const resolveEntityPath = require.resolve("../services/entities/resolveEntity");
const safeAuditPath = require.resolve("../services/SafeAuditLog");

const resetModules = () => {
  [
    controllerPath,
    workshopModelPath,
    userModelPath,
    resolveEntityPath,
    safeAuditPath,
  ].forEach((p) => delete require.cache[p]);
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

const workshopKey = "11111111-1111-4111-8111-111111111111";

const buildPopulatedWorkshop = (base) => ({
  ...base,
  participants: [
    { _id: "user-1", entityKey: "entity-user-1", name: "User One", email: "user1@example.com", phone: "123" },
    { _id: "user-2", entityKey: "entity-user-2", name: "User Two", email: "user2@example.com", phone: "456" },
  ],
  familyRegistrations: [
    {
      parentUser: { _id: "user-1", entityKey: "entity-user-1", email: "parent@example.com", phone: "321" },
      familyMemberId: { _id: "fam-1", entityKey: "family-1", relation: "child", email: "child@example.com" },
      parentKey: "entity-user-1",
      familyMemberKey: "family-1",
    },
  ],
  waitingList: [
    {
      parentUser: { _id: "user-3", entityKey: "entity-user-3", email: "wait@example.com", phone: "987" },
      parentKey: "entity-user-3",
    },
  ],
});

const installWorkshopMocks = (workshopDoc) => {
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
        toObject: () => buildPopulatedWorkshop(workshopDoc),
      }),
      updateOne: async () => {},
    },
  };
};

const installEntityMocks = () => {
  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => ({
        type: "user",
        userDoc: {
          _id: "user-1",
          entityKey: "entity-user-1",
          userWorkshopMap: [],
          familyWorkshopMap: [],
          save: async () => {},
        },
        memberDoc: null,
      }),
    },
  };
};

const installUserMocks = () => {
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      updateOne: async () => {},
      findById: async () => ({
        save: async () => {},
      }),
    },
  };
};

const installAuditMock = () => {
  require.cache[safeAuditPath] = {
    id: safeAuditPath,
    filename: safeAuditPath,
    loaded: true,
    exports: {
      safeAuditLog: async () => {},
    },
  };
};

test("registerEntityToWorkshop returns scope-safe payload for users", async () => {
  resetModules();
  const workshopDoc = {
    _id: "workshop-1",
    workshopKey,
    participants: [],
    familyRegistrations: [],
    waitingList: [],
    participantsCount: 0,
    save: async () => {},
  };

  installWorkshopMocks(workshopDoc);
  installEntityMocks();
  installUserMocks();
  installAuditMock();

  const controller = require(controllerPath);
  const req = {
    params: { id: workshopKey },
    body: {},
    query: {},
    user: { _id: "user-1", role: "user", entityKey: "actor-user" },
  };
  const res = createRes();

  await controller.registerEntityToWorkshop(req, res);

  const workshop = res.body.workshop;
  assert.equal(res.statusCode, 200);
  assert.ok(workshop);
  ["participants", "waitingList", "familyRegistrations"].forEach((key) => {
    assert.equal(workshop[key], undefined);
  });
  const json = JSON.stringify(workshop);
  ["entityKey", "parentKey", "phone", "email"].forEach((key) => {
    assert.equal(json.includes(key), false, `${key} should not be exposed`);
  });
});

test("unregisterEntityFromWorkshop keeps mutation responses scope-safe", async () => {
  resetModules();
  const workshopDoc = {
    _id: "workshop-2",
    workshopKey,
    participants: ["user-1"],
    familyRegistrations: [],
    waitingList: [],
    participantsCount: 1,
    save: async () => {},
  };

  installWorkshopMocks(workshopDoc);
  installEntityMocks();
  installUserMocks();
  installAuditMock();

  const controller = require(controllerPath);
  const req = {
    params: { id: workshopKey },
    body: { entityKey: "entity-user-1" },
    query: {},
    user: { _id: "user-1", role: "user", entityKey: "actor-user" },
  };
  const res = createRes();

  await controller.unregisterEntityFromWorkshop(req, res);

  const workshop = res.body.workshop;
  assert.equal(res.statusCode, 200);
  assert.ok(workshop);
  ["participants", "waitingList", "familyRegistrations"].forEach((key) => {
    assert.equal(workshop[key], undefined);
  });
  const json = JSON.stringify(workshop);
  ["entityKey", "parentKey", "phone", "email"].forEach((key) => {
    assert.equal(json.includes(key), false, `${key} should not be exposed`);
  });
});

test("admin can explicitly request participant details after mutation", async () => {
  resetModules();
  const workshopDoc = {
    _id: "workshop-3",
    workshopKey,
    participants: [],
    familyRegistrations: [],
    waitingList: [],
    participantsCount: 0,
    save: async () => {},
  };

  installWorkshopMocks(workshopDoc);
  installEntityMocks();
  installUserMocks();
  installAuditMock();

  const controller = require(controllerPath);
  const req = {
    params: { id: workshopKey },
    body: {},
    query: { includeParticipants: "true" },
    user: { _id: "admin-1", role: "admin", entityKey: "actor-admin" },
  };
  const res = createRes();

  await controller.registerEntityToWorkshop(req, res);

  const workshop = res.body.workshop;
  assert.equal(res.statusCode, 200);
  ["participants", "waitingList", "familyRegistrations"].forEach((key) => {
    assert.equal(workshop[key], undefined);
  });
  assert.ok(typeof workshop.participantsCount === "number");
});
