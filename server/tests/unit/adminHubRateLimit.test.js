const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { perUserRateLimit } = require("../../middleware/perUserRateLimit");

process.env.NODE_ENV = "test";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";
process.env.ADMIN_HUB_PASSWORD = "test-hub-password";

test("admin hub routes have 5 middleware layers (auth, admin, limiter, password, handler)", () => {
  delete require.cache[require.resolve("../../routes/adminHub")];
  const router = require("../../routes/adminHub");

  const hubPaths = ["/logs", "/alerts/maxed-workshops", "/stale-users", "/stats"];
  for (const path of hubPaths) {
    const layer = router.stack.find(
      (l) => l.route && l.route.path === path && l.route.methods.get
    );
    assert.ok(layer, `Route ${path} should exist`);
    // Before the fix there were 4 layers (auth, admin, password, handler).
    // After adding the rate limiter there should be 5.
    assert.equal(
      layer.route.stack.length,
      5,
      `Route ${path} should have 5 middleware layers (including rate limiter)`
    );

    const names = layer.route.stack.map((s) => s.name);
    // Rate limiter is the 3rd middleware (index 2), before requireAdminHubPassword
    const passwordIndex = names.indexOf("requireAdminHubPassword");
    assert.ok(passwordIndex > 2, `Rate limiter should be inserted before requireAdminHubPassword on ${path}`);
  }
});

test("admin hub rate limiter returns 429 after exceeding limit", async () => {
  // Build a standalone app with the rate limiter and a mock handler
  const app = express();
  app.use(express.json());

  const limiter = perUserRateLimit({ windowMs: 15 * 60 * 1000, limit: 5 });

  app.get(
    "/api/admin/hub/logs",
    (req, _res, next) => {
      req.user = { entityKey: "admin-key" };
      next();
    },
    limiter,
    (_req, res) => res.json({ ok: true })
  );

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  try {
    for (let i = 0; i < 5; i++) {
      const res = await fetch(`${baseUrl}/api/admin/hub/logs`);
      assert.equal(res.status, 200);
    }

    const res = await fetch(`${baseUrl}/api/admin/hub/logs`);
    assert.equal(res.status, 429);
    const data = await res.json();
    assert.match(data.message, /too many/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
