const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const { errors: celebrateErrors } = require("celebrate");

process.env.NODE_ENV = "test";
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const {
  validateWorkshopSearch,
  validateUserSearch,
} = require("../../middleware/validation");

function buildApp(validator) {
  const app = express();
  app.use(express.json());
  app.get("/test", validator, (_req, res) => res.json({ ok: true }));
  app.use(celebrateErrors());
  return app;
}

async function withServer(app, handler) {
  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  try {
    await handler(baseUrl);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test("workshop search rejects unknown query params", async () => {
  const app = buildApp(validateWorkshopSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?unknownParam=evil`);
    assert.equal(res.status, 400);
  });
});

test("workshop search accepts valid query params", async () => {
  const app = buildApp(validateWorkshopSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?q=yoga&city=TelAviv&page=1&limit=20`);
    assert.equal(res.status, 200);
  });
});

test("workshop search rejects page > 1000", async () => {
  const app = buildApp(validateWorkshopSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?page=1001`);
    assert.equal(res.status, 400);
  });
});

test("workshop search rejects limit > 200", async () => {
  const app = buildApp(validateWorkshopSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?limit=201`);
    assert.equal(res.status, 400);
  });
});

test("user search rejects unknown query params", async () => {
  const app = buildApp(validateUserSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?evil=injection`);
    assert.equal(res.status, 400);
  });
});

test("user search accepts valid query params", async () => {
  const app = buildApp(validateUserSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?q=john&limit=50&page=1`);
    assert.equal(res.status, 200);
  });
});

test("user search rejects page > 1000", async () => {
  const app = buildApp(validateUserSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?page=1001`);
    assert.equal(res.status, 400);
  });
});

test("user search rejects limit > 200", async () => {
  const app = buildApp(validateUserSearch);
  await withServer(app, async (baseUrl) => {
    const res = await fetch(`${baseUrl}/test?limit=201`);
    assert.equal(res.status, 400);
  });
});
