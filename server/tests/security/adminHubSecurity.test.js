const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.ADMIN_HUB_PASSWORD = "strong-secret";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const userModelPath = require.resolve("../../models/User");
const authMiddlewarePath = require.resolve("../../middleware/authMiddleware");
const auditServicePath = require.resolve("../../services/AuditLogService");
const { sanitizeMetadata: realSanitizeMetadata } = require(auditServicePath);
const adminHubServicePath = require.resolve("../../services/AdminHubService");
const adminHubRouterPath = require.resolve("../../routes/adminHub");
const adminHubControllerPath = require.resolve("../../controllers/adminHubController");

const createToken = (id = "user-id") => jwt.sign({ id }, process.env.JWT_SECRET);

const installUserStub = (role = "admin") => {
  delete require.cache[userModelPath];
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findById: () => ({
        select: async () => ({
          _id: "user-id",
          entityKey: "entity-user-id",
          role,
          isRoleIntegrityValid: () => true,
          refreshIntegrityHashes: () => {},
          save: async () => {},
        }),
      }),
    },
  };
};

const installAuditServiceStub = (impl) => {
  delete require.cache[auditServicePath];
  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      queryLogs: impl || (async () => []),
      sanitizeMetadata: realSanitizeMetadata,
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
  new Promise((resolve) => server.close(() => resolve()));

const fetchJson = async (server, path, { headers } = {}) => {
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  return { status: res.status, body: await res.json() };
};

test("PII guard: logs response strips _id and PII-like metadata", async () => {
  installUserStub("admin");
  installAdminHubServiceStub();
  installAuditServiceStub(async () => [
    {
      _id: "mongo-id",
      eventType: "security",
      subjectType: "user",
      subjectKey: "entity-123",
      metadata: { email: "secret@example.com", phone: "555-1212", token: "abc" },
    },
  ]);

  const app = buildApp();
  const server = await startServer(app);
  const token = createToken();

  const res = await fetchJson(server, "/api/admin/hub/logs", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.equal(res.status, 200);
  const [row] = res.body.logs;
  assert.equal(row._id, undefined);
  assert.equal(row.metadata.email, undefined);
  assert.equal(row.metadata.phone, undefined);
  assert.equal(row.metadata.token, undefined);
  assert.equal(row.category, "SECURITY");

  await stopServer(server);
});

test("access control fails for unauthenticated, non-admin, and missing password", async () => {
  const fetchWithRole = async (role, headers) => {
    installAuditServiceStub(async () => []);
    installAdminHubServiceStub();
    installUserStub(role);
    const app = buildApp();
    const server = await startServer(app);
    try {
      return await fetchJson(server, "/api/admin/hub/logs", { headers });
    } finally {
      await stopServer(server);
    }
  };

  const res1 = await fetchWithRole("admin");
  assert.equal(res1.status, 401);

  const tokenUser = createToken("user-x");
  const res2 = await fetchWithRole("user", {
    Authorization: `Bearer ${tokenUser}`,
    "x-admin-password": "strong-secret",
  });
  assert.equal(res2.status, 403);

  const token = createToken("admin-x");
  const res3 = await fetchWithRole("admin", {
    Authorization: `Bearer ${token}`,
  });
  assert.equal(res3.status, 401);

  const res4 = await fetchWithRole("admin", {
    Authorization: `Bearer ${token}`,
    "x-admin-password": "wrong",
  });
  assert.equal(res4.status, 401);
});

test("read-only: alerts and stale endpoints do not mutate source arrays", async () => {
  const alerts = [{ workshopId: "wk-1", title: "w1", participantsCount: 1, maxParticipants: 1 }];
  const staleUsers = [{ entityKey: "user-1", name: "One" }];
  installUserStub("admin");
  installAuditServiceStub(async () => []);
  installAdminHubServiceStub({
    getMaxedWorkshops: async () => alerts,
    getStaleUsers: async () => staleUsers,
  });
  const app = buildApp();
  const server = await startServer(app);
  const token = createToken();

  await fetchJson(server, "/api/admin/hub/alerts/maxed-workshops", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });
  await fetchJson(server, "/api/admin/hub/stale-users", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });

  assert.deepEqual(alerts, [{ workshopId: "wk-1", title: "w1", participantsCount: 1, maxParticipants: 1 }]);
  assert.deepEqual(staleUsers, [{ entityKey: "user-1", name: "One" }]);

  await stopServer(server);
});

test("pagination caps limit to 100 and rejects invalid eventType/subjectType", async () => {
  let captured = null;
  installUserStub("admin");
  installAdminHubServiceStub();
  installAuditServiceStub(async (filters) => {
    captured = filters;
    return [];
  });
  const app = buildApp();
  const server = await startServer(app);
  try {
    const token = createToken();

    const bad = await fetchJson(server, "/api/admin/hub/logs?eventType=invalid", {
      headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
    });
    assert.equal(bad.status, 400);

    const ok = await fetchJson(server, "/api/admin/hub/logs?limit=999&page=5", {
      headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
    });
    assert.equal(ok.status, 200);
    assert.ok(captured, "filters should be captured");
    assert.equal(captured.limit, 100);
    assert.equal(captured.page, 5);
  } finally {
    await stopServer(server);
  }
});

test("client filters cannot bypass authorization or designation", async () => {
  installUserStub("admin");
  installAdminHubServiceStub();
  installAuditServiceStub(async (filters) => {
    return [
      {
        eventType: filters.eventType || "security",
        subjectType: "user",
        subjectKey: "entity-1",
        metadata: {},
      },
    ];
  });
  const app = buildApp();
  const server = await startServer(app);
  const token = createToken();

  const res = await fetchJson(server, "/api/admin/hub/logs?eventType=security&subjectType=user", {
    headers: { Authorization: `Bearer ${token}`, "x-admin-password": "strong-secret" },
  });
  assert.equal(res.status, 200);
  const [row] = res.body.logs;
  assert.equal(row.eventType, "security");
  assert.equal(row.subjectType, "user");
  assert.equal(row.category, "SECURITY");

  await stopServer(server);
});
