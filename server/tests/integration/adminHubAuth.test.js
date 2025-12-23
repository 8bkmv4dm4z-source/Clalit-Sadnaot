const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.ADMIN_HUB_PASSWORD = "strong-secret";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const userModulePath = require.resolve("../../models/User");
const userModelPath = require.resolve("../../models/User");
const authMiddlewarePath = require.resolve("../../middleware/authMiddleware");
const auditServicePath = require.resolve("../../services/AuditLogService");
const { sanitizeMetadata: realSanitizeMetadata } = require(auditServicePath);
const adminHubServicePath = require.resolve("../../services/AdminHubService");
const adminHubRouterPath = require.resolve("../../routes/adminHub");
const adminHubControllerPath = require.resolve("../../controllers/adminHubController");

const createUserStub = (role = "admin") => ({
  _id: "user-id",
  role,
  isRoleIntegrityValid: () => true,
  refreshIntegrityHashes: () => {},
  save: async () => {},
});

const installUserStub = (role = "admin") => {
  delete require.cache[userModulePath];
  require.cache[userModulePath] = {
    id: userModulePath,
    filename: userModulePath,
    loaded: true,
    exports: {
      findById: () => ({
        select: async () => createUserStub(role),
      }),
    },
  };
};

const installUserModelStub = (options = {}) => {
  delete require.cache[userModelPath];
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findById: () => ({
        select: async () => createUserStub(options.role || "admin"),
      }),
      find: () => ({
        select() {
          return this;
        },
        lean: async () => options.findResult || [],
      }),
    },
  };
};

const installAdminHubServiceStub = (impls = {}) => {
  delete require.cache[adminHubServicePath];
  require.cache[adminHubServicePath] = {
    id: adminHubServicePath,
    filename: adminHubServicePath,
    loaded: true,
    exports: {
      getMaxedWorkshops: impls.getMaxedWorkshops || (async () => []),
      getStaleUsers: impls.getStaleUsers || (async () => []),
    },
  };
};

const installAuditServiceStub = (options = {}) => {
  const { queryLogsImpl } =
    typeof options === "function"
      ? { queryLogsImpl: options }
      : {
          queryLogsImpl: options.queryLogsImpl || options.queryLogs,
        };

  delete require.cache[auditServicePath];
  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      queryLogs: queryLogsImpl || (async () => []),
      sanitizeMetadata: realSanitizeMetadata,
    },
  };
};

const buildApp = () => {
  delete require.cache[authMiddlewarePath];
  delete require.cache[adminHubControllerPath];
  delete require.cache[adminHubRouterPath];
  const router = require("../../routes/adminHub");
  const app = express();
  app.use(express.json());
  app.use("/api/admin/hub", router);
  return app;
};

const startServer = (app) =>
  new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });

const stopServer = (server) =>
  new Promise((resolve) => {
    server.close(() => resolve());
  });

const createToken = (id = "user-id") => jwt.sign({ id }, process.env.JWT_SECRET);

const fetchJson = async (server, path, { headers } = {}) => {
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: res.status, body: await res.json() };
};

test("rejects unauthenticated requests", async () => {
  installUserStub("admin");
  installAuditServiceStub(async () => []);
  installAdminHubServiceStub();
  const app = buildApp();
  const server = await startServer(app);

  const response = await fetchJson(server, "/api/admin/hub/logs");

  assert.equal(response.status, 401);
  await stopServer(server);
});

test("rejects non-admin users", async () => {
  installUserStub("user");
  installAuditServiceStub(async () => []);
  installAdminHubServiceStub();
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/logs", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 403);
  await stopServer(server);
});

test("rejects when admin password is missing", async () => {
  installUserStub("admin");
  installAuditServiceStub(async () => []);
  installAdminHubServiceStub();
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/logs", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 401);
  await stopServer(server);
});

test("allows admin with password and forwards filters without exposing _id", async () => {
  let capturedFilters = null;
  installUserStub("admin");
  installAuditServiceStub(async (filters) => {
    capturedFilters = filters;
    return [
      {
        eventType: "security",
        subjectType: "user",
        subjectKey: "entity-abc",
        metadata: { note: "ok" },
      },
    ];
  });
  installAdminHubServiceStub();

  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/logs?eventType=security&subjectKey=abc", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(capturedFilters.eventType, "security");
  assert.deepEqual(capturedFilters.subjectKey, "abc");
  assert.ok(Array.isArray(response.body.logs));
  assert.equal(response.body.logs[0]._id, undefined);
  assert.equal(response.body.logs[0].category, "SECURITY");

  await stopServer(server);
});

test("clamps pagination and rejects invalid dates", async () => {
  installUserStub("admin");
  let capturedFilters = null;
  installAuditServiceStub(async (filters) => {
    capturedFilters = filters;
    return [];
  });
  installAdminHubServiceStub();

  const app = buildApp();
  const server = await startServer(app);
  const token = createToken();

  const invalid = await fetchJson(
    server,
    "/api/admin/hub/logs?from=not-a-date",
    { headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" } }
  );
  assert.equal(invalid.status, 400);

  const response = await fetchJson(
    server,
    "/api/admin/hub/logs?limit=999&page=5000&sort=unknown",
    { headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" } }
  );

  assert.equal(response.status, 200);
  assert.equal(capturedFilters.limit, 100);
  assert.equal(capturedFilters.page, 1000);
  assert.equal(capturedFilters.sort, -1);
  await stopServer(server);
});

test("logs endpoint strips _id from responses even if service returns it", async () => {
  installUserStub("admin");
  installAuditServiceStub(async () => [
    {
      _id: "mongo-id",
      eventType: "security",
      subjectType: "user",
      subjectKey: "entity-abc",
      metadata: {},
    },
  ]);
  installAdminHubServiceStub();

  const app = buildApp();
  const server = await startServer(app);
  const token = createToken();

  const response = await fetchJson(
    server,
    "/api/admin/hub/logs",
    { headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" } }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.logs[0]._id, undefined);

  await stopServer(server);
});

test("stale users endpoint requires admin password", async () => {
  installUserModelStub({ role: "admin", findResult: [] });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/stale-users", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 401);
  await stopServer(server);
});

test("stale users endpoint returns sanitized shape", async () => {
  const staleRow = {
    entityKey: "entity-123",
    name: "Stale User",
    updatedAt: new Date("2024-01-01T00:00:00Z"),
  };
  installUserModelStub({ role: "admin" });
  installAdminHubServiceStub({ getStaleUsers: async () => [staleRow] });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/stale-users", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.staleUsers));
  assert.deepEqual(response.body.staleUsers[0], {
    entityKey: "entity-123",
    name: "Stale User",
    updatedAt: staleRow.updatedAt.toISOString(),
  });
  await stopServer(server);
});

test("/stats returns 501", async () => {
  installUserModelStub({ role: "admin", findResult: [] });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/stats", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 501);
  assert.deepEqual(response.body, { message: "Not implemented" });
  await stopServer(server);
});

test("alerts endpoint uses service and keeps response sanitized", async () => {
  const recorded = [];
  installUserStub("admin");
  installAdminHubServiceStub({
    getMaxedWorkshops: async () => [
      {
        workshopId: "wk-321",
        title: "Maxed",
        participantsCount: 25,
        maxParticipants: 25,
      },
    ],
  });
  installAuditServiceStub({ queryLogsImpl: async () => recorded });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/alerts/maxed-workshops", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 200);
  assert.equal(recorded.length, 0);
  assert.deepEqual(response.body.alerts[0], {
    workshopId: "wk-321",
    title: "Maxed",
    participantsCount: 25,
    maxParticipants: 25,
  });
  await stopServer(server);
});

test("stale users endpoint uses service and returns sanitized shape", async () => {
  const recorded = [];
  installUserModelStub({ role: "admin" });
  installAdminHubServiceStub({
    getStaleUsers: async () => [
      {
        entityKey: "entity-999",
        name: "Dormant",
        updatedAt: new Date("2023-12-12T00:00:00Z"),
      },
    ],
  });
  installAuditServiceStub({ queryLogsImpl: async () => recorded });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/stale-users", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 200);
  assert.equal(recorded.length, 0);
  assert.deepEqual(response.body.staleUsers[0], {
    entityKey: "entity-999",
    name: "Dormant",
    updatedAt: "2023-12-12T00:00:00.000Z",
  });
  await stopServer(server);
});

test("maxed workshops endpoint requires admin password", async () => {
  installUserStub("admin");
  installAdminHubServiceStub({ getMaxedWorkshops: async () => [] });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/alerts/maxed-workshops", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 401);
  await stopServer(server);
});

test("returns maxed workshop alerts without exposing _id", async () => {
  installUserStub("admin");
  installAdminHubServiceStub({
    getMaxedWorkshops: async () => [
      {
        workshopId: "wk-123",
        title: "Capacity reached",
        participantsCount: 30,
        maxParticipants: 30,
      },
    ],
  });
  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/admin/hub/alerts/maxed-workshops", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(response.status, 200);
  assert.ok(Array.isArray(response.body.alerts));
  assert.deepEqual(response.body.alerts[0], {
    workshopId: "wk-123",
    title: "Capacity reached",
    participantsCount: 30,
    maxParticipants: 30,
  });
  await stopServer(server);
});
