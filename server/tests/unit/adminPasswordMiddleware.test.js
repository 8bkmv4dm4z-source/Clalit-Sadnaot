const test = require("node:test");
const assert = require("node:assert/strict");

const { requireAdminHubPassword } = require("../../middleware/adminPasswordMiddleware");

const createMockRes = () => {
  const res = {
    statusCode: null,
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

test("allows request when admin password matches", () => {
  const prior = process.env.ADMIN_HUB_PASSWORD;
  process.env.ADMIN_HUB_PASSWORD = "strong-secret";

  const req = { headers: { "x-admin-password": "strong-secret" } };
  const res = createMockRes();
  let nextCalled = false;

  requireAdminHubPassword(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, null);

  process.env.ADMIN_HUB_PASSWORD = prior;
});

test("rejects when admin password is missing", () => {
  const prior = process.env.ADMIN_HUB_PASSWORD;
  process.env.ADMIN_HUB_PASSWORD = "strong-secret";

  const req = { headers: {} };
  const res = createMockRes();
  let nextCalled = false;

  requireAdminHubPassword(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Admin password required" });

  process.env.ADMIN_HUB_PASSWORD = prior;
});

test("rejects when admin password is incorrect", () => {
  const prior = process.env.ADMIN_HUB_PASSWORD;
  process.env.ADMIN_HUB_PASSWORD = "strong-secret";

  const req = { headers: { "x-admin-password": "wrong-secret" } };
  const res = createMockRes();
  let nextCalled = false;

  requireAdminHubPassword(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.deepEqual(res.body, { message: "Invalid admin password" });

  process.env.ADMIN_HUB_PASSWORD = prior;
});

test("fails closed when admin password is not configured", () => {
  const prior = process.env.ADMIN_HUB_PASSWORD;
  delete process.env.ADMIN_HUB_PASSWORD;

  const req = { headers: { "x-admin-password": "anything" } };
  const res = createMockRes();
  let nextCalled = false;

  requireAdminHubPassword(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 500);
  assert.deepEqual(res.body, { message: "Admin hub password not configured" });

  process.env.ADMIN_HUB_PASSWORD = prior;
});
