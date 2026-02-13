const test = require("node:test");
const assert = require("node:assert/strict");

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const controllerPath = require.resolve("../../controllers/userController");
const userModelPath = require.resolve("../../models/User");
const resolveEntityPath = require.resolve("../../services/entities/resolveEntity");
const workshopModelPath = require.resolve("../../models/Workshop");
const authMiddlewarePath = require.resolve("../../middleware/authMiddleware");
const safeAuditLogPath = require.resolve("../../services/SafeAuditLog");

const resetModules = () => {
  [
    controllerPath,
    userModelPath,
    workshopModelPath,
    resolveEntityPath,
    authMiddlewarePath,
    safeAuditLogPath,
  ].forEach((p) => {
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

const installResolveEntityStub = (resolved) => {
  require.cache[resolveEntityPath] = {
    id: resolveEntityPath,
    filename: resolveEntityPath,
    loaded: true,
    exports: {
      resolveEntityByKey: async () => resolved,
      resolveEntity: async () => resolved,
    },
  };
};

const installModelStubs = () => {
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {},
  };
  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {},
  };
  require.cache[authMiddlewarePath] = {
    id: authMiddlewarePath,
    filename: authMiddlewarePath,
    loaded: true,
    exports: {
      hasAuthority: (user, key) => !!user?.authorities?.[key],
    },
  };
  require.cache[safeAuditLogPath] = {
    id: safeAuditLogPath,
    filename: safeAuditLogPath,
    loaded: true,
    exports: {
      safeAuditLog: async () => {},
    },
  };
};

test("user cannot fetch another user's entity payload", async () => {
  resetModules();
  installModelStubs();
  installResolveEntityStub({
    type: "user",
    userDoc: { entityKey: "user-b", name: "Target" },
  });

  const controller = require(controllerPath);
  const res = createRes();
  await controller.getEntityById(
    { params: { id: "user-b" }, user: { entityKey: "user-a", authorities: {} } },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Forbidden" });
});

test("user cannot mutate another user's entity payload", async () => {
  resetModules();
  installModelStubs();
  installResolveEntityStub({
    type: "user",
    userDoc: {
      entityKey: "user-b",
      save: async () => {},
    },
  });

  const controller = require(controllerPath);
  const res = createRes();
  await controller.updateEntity(
    {
      user: { entityKey: "user-a", authorities: {} },
      body: { entityKey: "user-b", updates: { name: "Hack" } },
    },
    res
  );

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Forbidden" });
});

test("admin-only list rejects non-admin callers", async () => {
  resetModules();
  installModelStubs();
  installResolveEntityStub(null);
  let called = false;
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      find: () => {
        called = true;
        throw new Error("Should not be called");
      },
    },
  };
  require.cache[workshopModelPath] = {
    id: workshopModelPath,
    filename: workshopModelPath,
    loaded: true,
    exports: {},
  };

  const controller = require(controllerPath);
  const res = createRes();
  await controller.getAllUsers({ user: { authorities: {} } }, res);

  assert.equal(res.statusCode, 403);
  assert.deepEqual(res.body, { message: "Unauthorized" });
  assert.equal(called, false);
});
