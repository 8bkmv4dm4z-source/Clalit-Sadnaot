import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminHeaders,
  buildLogsQuery,
  normalizeLogEntry,
  groupLogsByCategory,
} from "../../src/utils/adminHubClient.js";

test("buildAdminHeaders includes x-admin-password", () => {
  const headers = buildAdminHeaders("secret");
  assert.equal(headers["x-admin-password"], "secret");
  assert.equal(headers["Content-Type"], "application/json");
});

test("buildLogsQuery encodes filters and pagination", () => {
  const query = buildLogsQuery({
    eventType: "security",
    subjectType: "user",
    subjectKey: "entity-123",
    page: 2,
    limit: 10,
  });
  assert(query.includes("eventType=security"));
  assert(query.includes("subjectType=user"));
  assert(query.includes("subjectKey=entity-123"));
  assert(query.includes("page=2"));
  assert(query.includes("limit=10"));
});

test("normalizeLogEntry keeps server-provided audit payload", () => {
  const entry = {
    _id: "mongo",
    __v: 0,
    subjectKeyHash: "hash",
    eventType: "workshop.registration",
    subjectType: "workshop",
    subjectKey: "wk-1",
    metadata: { note: "ok", _id: "hidden" },
    category: "WORKSHOP",
  };
  const normalized = normalizeLogEntry(entry);
  assert.equal(normalized._id, "mongo");
  assert.equal(normalized.subjectKeyHash, "hash");
  assert.equal(normalized.metadata._id, "hidden");
  assert.equal(normalized.category, "WORKSHOP");
});

test("groupLogsByCategory groups by server-provided categories only", () => {
  const grouped = groupLogsByCategory([
    { category: "SECURITY", eventType: "workshop.registration" },
    { category: "WORKSHOP", eventType: "security" },
  ]);
  assert.deepEqual(Object.keys(grouped).sort(), ["SECURITY", "WORKSHOP"]);
  assert.equal(grouped.SECURITY[0].eventType, "workshop.registration");
});

test("helpers do not persist admin password in storage", () => {
  globalThis.localStorage = {
    data: {},
    getItem(key) {
      return this.data[key] || null;
    },
    setItem(key, value) {
      this.data[key] = value;
    },
    removeItem(key) {
      delete this.data[key];
    },
  };
  buildAdminHeaders("temp-secret");
  assert.equal(globalThis.localStorage.getItem("adminPassword"), null);
});
