import assert from "node:assert/strict";
import test from "node:test";

import {
  buildAdminHeaders,
  buildLogsQuery,
  normalizeLogEntry,
  groupLogsByCategory,
  fetchRiskAssessments,
  submitRiskFeedback,
  fetchRiskFailures,
  retryRiskAssessment,
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

test("fetchRiskAssessments sends request to risk endpoint", async () => {
  let capturedUrl = "";
  let capturedHeaders = null;
  globalThis.fetch = async (url, init = {}) => {
    capturedUrl = String(url);
    capturedHeaders = init.headers;
    return {
      ok: true,
      status: 200,
      json: async () => ({ assessments: [], page: 1, limit: 20 }),
      url,
    };
  };
  const result = await fetchRiskAssessments({
    adminPassword: "secret",
    filters: { status: "failed", category: "SECURITY", page: 2, limit: 10 },
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { assessments: [], page: 1, limit: 20 });
  assert.match(capturedUrl, /\/api\/admin\/hub\/risk-assessments\?/);
  assert.match(capturedUrl, /status=failed/);
  assert.match(capturedUrl, /category=SECURITY/);
  assert.match(capturedUrl, /page=2/);
  assert.match(capturedUrl, /limit=10/);
  assert.equal(capturedHeaders["x-admin-password"], "secret");
});

test("submitRiskFeedback posts feedback payload", async () => {
  let captured = null;
  globalThis.fetch = async (_url, init = {}) => {
    captured = init;
    return {
      ok: true,
      status: 201,
      json: async () => ({ feedbackId: "f1", profileVersion: 2, organizationId: "global" }),
    };
  };

  const result = await submitRiskFeedback({
    adminPassword: "secret",
    assessmentId: "ra-1",
    payload: { feedbackType: "false_positive", notes: "ok" },
  });

  assert.equal(result.status, 201);
  assert.equal(captured.method, "POST");
  assert.match(String(captured.body), /false_positive/);
});

test("fetchRiskFailures requests failures endpoint", async () => {
  let capturedUrl = "";
  globalThis.fetch = async (url) => {
    capturedUrl = String(url);
    return {
      ok: true,
      status: 200,
      json: async () => ({ failures: [], page: 1, limit: 20 }),
    };
  };

  const result = await fetchRiskFailures({
    adminPassword: "secret",
    filters: { eventType: "security.auth.failure", category: "SECURITY", page: 3, limit: 5 },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.body, { failures: [], page: 1, limit: 20 });
  assert.match(capturedUrl, /\/api\/admin\/hub\/risk-assessments\/failures\?/);
  assert.match(capturedUrl, /eventType=security.auth.failure/);
  assert.match(capturedUrl, /category=SECURITY/);
  assert.match(capturedUrl, /page=3/);
  assert.match(capturedUrl, /limit=5/);
});

test("retryRiskAssessment sends POST with no body", async () => {
  let captured = null;
  let capturedUrl = "";
  globalThis.fetch = async (url, init = {}) => {
    capturedUrl = String(url);
    captured = init;
    return {
      ok: true,
      status: 200,
      json: async () => ({ assessment: { processing: { status: "pending" } } }),
    };
  };
  const result = await retryRiskAssessment({ adminPassword: "secret", assessmentId: "ra-1" });
  assert.equal(result.status, 200);
  assert.equal(captured.method, "POST");
  assert.equal(captured.body, undefined);
  assert.match(capturedUrl, /\/api\/admin\/hub\/risk-assessments\/ra-1\/retry/);
});
