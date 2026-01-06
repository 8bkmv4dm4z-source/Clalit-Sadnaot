const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const jwt = require("jsonwebtoken");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const userModelPath = require.resolve("../../models/User");
const auditServicePath = require.resolve("../../services/workshopAuditService");
const workshopsRouterPath = require.resolve("../../routes/workshops");

const createUserStub = (authorities = {}) => ({
  _id: "user-id",
  entityKey: "entity-user-id",
  role: "admin",
  authorities,
  isRoleIntegrityValid: () => true,
  refreshIntegrityHashes: () => {},
  save: async () => {},
});

const installUserStub = (authorities = {}) => {
  delete require.cache[userModelPath];
  require.cache[userModelPath] = {
    id: userModelPath,
    filename: userModelPath,
    loaded: true,
    exports: {
      findByEntityKey: async () => createUserStub(authorities),
      findById: () => ({
        select: async () => createUserStub(authorities),
      }),
    },
  };
};

const installAuditStub = (impl = async () => ({})) => {
  delete require.cache[auditServicePath];
  require.cache[auditServicePath] = {
    id: auditServicePath,
    filename: auditServicePath,
    loaded: true,
    exports: {
      runWorkshopAudit: impl,
    },
  };
};

const buildApp = () => {
  delete require.cache[workshopsRouterPath];
  const router = require(workshopsRouterPath);
  const app = express();
  app.use(express.json());
  app.use("/api/workshops", router);
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

const createToken = () =>
  jwt.sign({ sub: "entity-user-id", jti: "test-jti" }, process.env.JWT_SECRET, {
    expiresIn: "15m",
  });

const fetchJson = async (server, path, { headers } = {}) => {
  const port = server.address().port;
  const res = await fetch(`http://127.0.0.1:${port}${path}`, { headers });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

test("denies audit run without admin authority even when admin key is provided", async () => {
  process.env.ADMIN_KEY = "server-key";
  installUserStub({});
  let called = 0;
  installAuditStub(async () => {
    called += 1;
    return { ok: true };
  });

  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/workshops/audit/run?key=server-key", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 403);
  assert.deepEqual(response.body, { message: "Admin access only" });
  assert.equal(called, 0);

  await stopServer(server);
});

test("allows audit run for callers with admin authority", async () => {
  process.env.ADMIN_KEY = "server-key";
  let called = 0;
  installUserStub({ admin: true });
  installAuditStub(async () => {
    called += 1;
    return { ok: true };
  });

  const app = buildApp();
  const server = await startServer(app);

  const token = createToken();
  const response = await fetchJson(server, "/api/workshops/audit/run", {
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, { success: true, result: { ok: true } });
  assert.equal(called, 1);

  await stopServer(server);
});
