const test = require("node:test");
const assert = require("node:assert/strict");
const { csrfProtection, issueCsrfToken } = require("../../middleware/csrf");

process.env.NODE_ENV = "test";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

test("admin workshop mutation routes include csrfProtection middleware", () => {
  delete require.cache[require.resolve("../../routes/workshops")];
  const router = require("../../routes/workshops");

  const mutationRoutes = [
    { path: "/", method: "post" },
    { path: "/:id", method: "put" },
    { path: "/:id", method: "delete" },
    { path: "/:id/export", method: "post" },
  ];

  for (const { path, method } of mutationRoutes) {
    const layer = router.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods[method]
    );
    assert.ok(layer, `Route ${method.toUpperCase()} ${path} should exist`);

    const names = layer.route.stack.map((s) => s.name);
    const hasCsrf = names.includes("csrfProtection");
    assert.ok(hasCsrf, `Route ${method.toUpperCase()} ${path} should have csrfProtection middleware`);
  }
});

test("POST /workshops without CSRF token returns 403 EBADCSRFTOKEN", async () => {
  const req = { method: "POST", headers: {}, cookies: {}, body: {}, query: {} };
  const cookieWrites = {};
  const res = {
    cookie(name, value) {
      cookieWrites[name] = value;
    },
  };
  let forwardedError = null;

  await new Promise((resolve) => {
    csrfProtection(req, res, (err) => {
      forwardedError = err || null;
      resolve();
    });
  });

  assert.ok(forwardedError);
  assert.equal(forwardedError.code, "EBADCSRFTOKEN");
  assert.ok(cookieWrites["csrf-secret"]);
});

test("double-submit CSRF token allows workshop mutation", async () => {
  const cookieWrites = {};
  const bootstrapReq = { method: "GET", headers: {}, cookies: {}, body: {}, query: {} };
  const bootstrapRes = {
    locals: {},
    cookie(name, value) {
      cookieWrites[name] = value;
      bootstrapReq.cookies[name] = value;
    },
  };

  await new Promise((resolve, reject) => {
    csrfProtection(bootstrapReq, bootstrapRes, (err) => {
      if (err) return reject(err);
      issueCsrfToken(bootstrapReq, bootstrapRes, (issueErr) => {
        if (issueErr) return reject(issueErr);
        resolve();
      });
    });
  });

  assert.ok(cookieWrites["csrf-secret"]);
  assert.ok(cookieWrites["XSRF-TOKEN"]);
  assert.ok(bootstrapRes.locals.csrfToken);

  const postReq = {
    method: "POST",
    headers: { "x-csrf-token": bootstrapRes.locals.csrfToken },
    cookies: {
      "csrf-secret": cookieWrites["csrf-secret"],
      "XSRF-TOKEN": cookieWrites["XSRF-TOKEN"],
    },
    body: {},
    query: {},
  };
  const postRes = {
    cookie() {},
  };

  let forwardedError = null;
  await new Promise((resolve) => {
    csrfProtection(postReq, postRes, (err) => {
      forwardedError = err || null;
      resolve();
    });
  });

  assert.equal(forwardedError, null);
});
