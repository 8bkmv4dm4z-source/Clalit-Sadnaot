const test = require("node:test");
const assert = require("node:assert/strict");
const { AuditCategories, AuditEventTypes, allowedEventTypes } = require("../../services/AuditEventRegistry");

const reloadAuditLogService = () => {
  delete require.cache[require.resolve("../../services/AuditLogService")];
  return require("../../services/AuditLogService");
};

const mongoose = require("mongoose");

const reloadAuditLogEntryModel = () => {
  delete require.cache[require.resolve("../../models/AdminAuditLog")];
  delete mongoose.models.AdminAuditLog;
  return require("../../models/AdminAuditLog");
};

test("recordEvent hashes subjectKey and strips sensitive metadata", async () => {
  process.env.AUDIT_HMAC_SECRET = "unit-hmac-secret";
  const { recordEvent, useAuditLogModel } = reloadAuditLogService();
  const { hmacEntityKey } = require("../../utils/hmacUtil");

  const created = [];
  const fakeModel = {
    async create(payload) {
      created.push(payload);
      return payload;
    },
  };

  useAuditLogModel(fakeModel);

  const result = await recordEvent({
    eventType: AuditEventTypes.SECURITY,
    subjectType: "user",
    subjectKey: "entity-123",
    actorKey: "actor-999",
    metadata: {
      email: "sensitive@example.com",
      note: "kept",
      nested: { _id: "mongo-id", token: "secret", detail: "safe" },
    },
  });

  assert.equal(created[0].subjectKeyHash, hmacEntityKey("entity-123"));
  assert.deepEqual(created[0].metadata, { note: "kept", nested: { detail: "safe" } });
  assert.equal(result.subjectKey, "entity-123");
  assert.equal(result.subjectKeyHash, undefined);
  assert.equal(result.metadata.email, undefined);
  assert.equal(created[0].category, AuditCategories.SECURITY);
  assert.equal(result.category, AuditCategories.SECURITY);
});

test("queryLogs omits _id and re-sanitizes metadata on read", async () => {
  process.env.AUDIT_HMAC_SECRET = "unit-hmac-secret";
  const { queryLogs, useAuditLogModel } = reloadAuditLogService();
  const { hmacEntityKey } = require("../../utils/hmacUtil");

  const rows = [
    {
      _id: "mongo-id",
      eventType: AuditEventTypes.SECURITY,
      subjectType: "user",
      subjectKey: "entity-abc",
      subjectKeyHash: "should-not-leak",
      metadata: { phone: "555-1234", message: "ok" },
      category: AuditCategories.SECURITY,
      createdAt: new Date(),
    },
  ];

  const queryCapture = [];
  const fakeCursor = {
    sort() {
      return this;
    },
    skip() {
      return this;
    },
    limit() {
      return this;
    },
    select(selection) {
      this.selection = selection;
      return this;
    },
    lean: async () => rows,
  };

  const fakeModel = {
    find(query) {
      queryCapture.push(query);
      return { ...fakeCursor };
    },
  };

  useAuditLogModel(fakeModel);

  const docs = await queryLogs({ eventType: AuditEventTypes.SECURITY, subjectKey: "entity-abc" });
  const [doc] = docs;

  assert.deepEqual(queryCapture[0], {
    eventType: "security",
    subjectKeyHash: hmacEntityKey("entity-abc"),
  });
  assert.equal(doc._id, undefined);
  assert.equal(doc.subjectKeyHash, undefined);
  assert.deepEqual(doc.metadata, { message: "ok" });
  assert.equal(doc.category, AuditCategories.SECURITY);
});

test("AuditLogEntry schema applies TTL from AUDIT_RETENTION_DAYS", () => {
  const priorRetention = process.env.AUDIT_RETENTION_DAYS;
  process.env.AUDIT_RETENTION_DAYS = "2";
  const AuditLogEntry = reloadAuditLogEntryModel();

  const ttlIndex = AuditLogEntry.schema
    .indexes()
    .find(([keys]) => keys.createdAt === 1);

  assert(ttlIndex, "TTL index should be defined on createdAt");
  assert.equal(ttlIndex[1].expireAfterSeconds, 2 * 24 * 60 * 60);

  process.env.AUDIT_RETENTION_DAYS = priorRetention;
});

test("isSensitiveKey uses exact-match and does not strip workshopId or sessionId", async () => {
  process.env.AUDIT_HMAC_SECRET = "unit-hmac-secret";
  const { recordEvent, useAuditLogModel } = reloadAuditLogService();

  const created = [];
  const fakeModel = {
    async create(payload) {
      created.push(payload);
      return payload;
    },
  };

  useAuditLogModel(fakeModel);

  await recordEvent({
    eventType: AuditEventTypes.SECURITY,
    subjectType: "user",
    subjectKey: "entity-456",
    actorKey: "actor-789",
    metadata: {
      workshopId: "ws-123",
      sessionId: "sess-abc",
      emailVerified: true,
      email: "sensitive@example.com",
      phone: "0541234567",
      _id: "mongo-id",
      password: "secret",
      token: "jwt-token",
      detail: "safe-value",
    },
  });

  const meta = created[0].metadata;
  // Exact-match keys should NOT be stripped
  assert.equal(meta.workshopId, "ws-123");
  assert.equal(meta.sessionId, "sess-abc");
  assert.equal(meta.emailVerified, true);
  assert.equal(meta.detail, "safe-value");

  // Sensitive keys should still be stripped
  assert.equal(meta.email, undefined);
  assert.equal(meta.phone, undefined);
  assert.equal(meta._id, undefined);
  assert.equal(meta.password, undefined);
  assert.equal(meta.token, undefined);
});

test("recordEvent rejects unknown audit event types", async () => {
  const { recordEvent } = reloadAuditLogService();
  await assert.rejects(
    () =>
      recordEvent({
        eventType: "unknown.event",
        subjectType: "user",
        subjectKey: "entity-1",
      }),
    /required/i
  );
});

test("registry exposes categories for every event type", () => {
  const registryCategories = allowedEventTypes.map((type) => {
    const { category } = require("../../services/AuditEventRegistry").getAuditEventDefinition(type);
    return category;
  });

  registryCategories.forEach((category) => {
    assert.ok(Object.values(AuditCategories).includes(category));
  });
});
