const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");

const authControllerPath = require.resolve("../../controllers/authController");
const authMiddleware = require("../../middleware/authMiddleware");
const sanitizeUser = require("../../utils/sanitizeUser");

const resetAuthController = () => {
  delete require.cache[authControllerPath];
  return require(authControllerPath);
};

test.beforeEach(() => {
  process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
  process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";
  process.env.JWT_EXPIRY = "15m";
  process.env.JWT_REFRESH_EXPIRY = "7d";
  process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";
});

test("hasAuthority ignores legacy role strings", () => {
  const { hasAuthority } = authMiddleware;
  assert.equal(hasAuthority({ role: "admin", authorities: {} }, "admin"), false);
  assert.equal(hasAuthority({ role: "admin", authorities: { admin: true } }, "admin"), true);
});

test("authorizeAdmin fails closed when authorities.admin is missing", () => {
  const { authorizeAdmin } = authMiddleware;
  let status = null;
  let body = null;
  const req = { user: { role: "admin", authorities: {} } };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
  };
  let nextCalled = false;
  authorizeAdmin(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(status, 403);
  assert.deepEqual(body, { message: "Admin access only" });
});

test("access tokens include exp/iat/jti and omit authority fields", () => {
  const authController = resetAuthController();
  const token = authController.generateAccessToken({ entityKey: "user-123" });
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  assert.ok(decoded.exp);
  assert.ok(decoded.iat);
  assert.ok(decoded.jti);
  assert.equal(decoded.role, undefined);
  assert.equal(decoded.authorities, undefined);
  assert.deepEqual(Object.keys(decoded).sort(), ["exp", "iat", "jti", "sub"]);
});

test("fails token issuance when JWT_EXPIRY is missing", () => {
  process.env.JWT_EXPIRY = "";
  const authController = resetAuthController();
  assert.throws(
    () => authController.generateAccessToken({ entityKey: "user-123" }),
    /JWT_EXPIRY missing/
  );
});

test("authenticate rejects tokens without exp", async () => {
  const token = jwt.sign({ sub: "user-123", jti: "no-exp" }, process.env.JWT_SECRET, {
    noTimestamp: true,
  });
  const { authenticate } = authMiddleware;
  let status = null;
  let body = null;
  const req = { headers: { authorization: `Bearer ${token}` } };
  const res = {
    status(code) {
      status = code;
      return this;
    },
    json(payload) {
      body = payload;
      return this;
    },
    setHeader() {},
  };
  let nextCalled = false;
  await authenticate(req, res, () => {
    nextCalled = true;
  });
  assert.equal(nextCalled, false);
  assert.equal(status, 401);
  assert.deepEqual(body, { message: "Invalid or expired token" });
});

test("sanitized user responses exclude role and authorities", () => {
  const { sanitizeUserForResponse } = sanitizeUser;
  const user = { role: "admin", authorities: { admin: true }, entityKey: "abc123", name: "A" };
  const sanitized = sanitizeUserForResponse(user, { authorities: {} }, { includeFull: true });
  assert.equal(sanitized.role, undefined);
  assert.equal(sanitized.authorities, undefined);
  assert.equal(sanitized.isAdmin, undefined);
  assert.equal(sanitized.permissions, undefined);
});
