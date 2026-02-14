const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const cookieParser = require("cookie-parser");

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
  const { csrfProtection } = require("../../middleware/csrf");
  const { errors: celebrateErrors } = require("celebrate");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.post(
    "/api/workshops",
    csrfProtection,
    (_req, res) => res.json({ ok: true })
  );

  // Handle CSRF error
  app.use((err, _req, res, _next) => {
    if (err.code === "EBADCSRFTOKEN") {
      return res.status(403).json({ message: "Invalid or missing CSRF token" });
    }
    return res.status(500).json({ message: "Server error" });
  });

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    const res = await fetch(`${baseUrl}/api/workshops`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "Test Workshop" }),
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.message, /csrf/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test("user-facing mutation routes do NOT have csrfProtection", () => {
  delete require.cache[require.resolve("../../routes/workshops")];
  const router = require("../../routes/workshops");

  const userRoutes = [
    { path: "/:id/register-entity", method: "post" },
    { path: "/:id/unregister-entity", method: "delete" },
    { path: "/:id/waitlist-entity", method: "post" },
  ];

  for (const { path, method } of userRoutes) {
    const layer = router.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods[method]
    );
    assert.ok(layer, `Route ${method.toUpperCase()} ${path} should exist`);

    const names = layer.route.stack.map((s) => s.name);
    const hasCsrf = names.includes("csrfProtection");
    assert.equal(hasCsrf, false, `Route ${method.toUpperCase()} ${path} should NOT have csrfProtection`);
  }
});
