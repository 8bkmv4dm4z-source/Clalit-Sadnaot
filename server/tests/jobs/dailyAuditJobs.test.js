const test = require("node:test");
const { after } = require("node:test");
const assert = require("node:assert/strict");
const { AuditCategories } = require("../../services/AuditEventRegistry");

const fixedNow = new Date("2024-01-08T12:00:00Z").getTime();
const originalPublicIdSecret = process.env.PUBLIC_ID_SECRET;
process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

after(() => {
  if (originalPublicIdSecret === undefined) {
    delete process.env.PUBLIC_ID_SECRET;
  } else {
    process.env.PUBLIC_ID_SECRET = originalPublicIdSecret;
  }
});

const { recordWorkshopMaxedAlerts, recordStaleUserAlerts, runDailyAuditJobs } = require("../../scripts/dailyAuditJobs");

test("records workshop.maxed once per workshop within 24h dedup window", async () => {
  const created = [];
  const services = {
    adminHubService: {
      async getMaxedWorkshops() {
        return [
          { workshopId: "wk-1", participantsCount: 30, maxParticipants: 30 },
          { workshopId: "wk-2", participantsCount: 40, maxParticipants: 40 },
        ];
      },
    },
    auditLogService: {
      queries: [],
      async queryLogs(query) {
        this.queries.push(query);
        if (query.subjectKey === "wk-2") return [{}];
        return [];
      },
      async recordEvent(payload) {
        created.push(payload);
        return payload;
      },
    },
    now: () => fixedNow,
  };

  const results = await recordWorkshopMaxedAlerts(services);

  assert.deepEqual(results, [
    { workshopId: "wk-1", recorded: true },
    { workshopId: "wk-2", recorded: false },
  ]);
  assert.equal(created.length, 1);
  assert.equal(created[0].eventType, "workshop.maxed");
  assert.equal(created[0].subjectType, "workshop");
  assert.equal(created[0].subjectKey, "wk-1");
  assert.equal(created[0].actorKey, null);
  assert.equal(created[0].category, AuditCategories.CAPACITY);
  assert.deepEqual(created[0].metadata, { participantsCount: 30, maxParticipants: 30 });
  const [firstQuery] = services.auditLogService.queries;
  assert.equal(firstQuery.from instanceof Date, true);
  assert.equal(fixedNow - firstQuery.from.getTime(), 24 * 60 * 60 * 1000);
});

test("records user.stale.detected once per entityKey within 7d dedup window", async () => {
  const priorStale = process.env.STALE_USER_DAYS;
  process.env.STALE_USER_DAYS = "45";
  const created = [];
  const services = {
    staleUserDetector: {
      async findStaleUsers() {
        return [
          { entityKey: "user-1", updatedAt: new Date("2023-10-01T00:00:00Z") },
          { entityKey: "user-2", updatedAt: new Date("2023-11-01T00:00:00Z") },
        ];
      },
      resolveStaleDays: () => 45,
    },
    auditLogService: {
      queries: [],
      async queryLogs(query) {
        this.queries.push(query);
        if (query.subjectKey === "user-2") return [{}];
        return [];
      },
      async recordEvent(payload) {
        created.push(payload);
        return payload;
      },
    },
    now: () => fixedNow,
  };

  const results = await recordStaleUserAlerts(services);

  assert.deepEqual(results, [
    { entityKey: "user-1", recorded: true },
    { entityKey: "user-2", recorded: false },
  ]);

  assert.equal(created.length, 1);
  const [payload] = created;
  assert.equal(payload.eventType, "user.stale.detected");
  assert.equal(payload.subjectType, "user");
  assert.equal(payload.subjectKey, "user-1");
  assert.equal(payload.actorKey, null);
  assert.equal(payload.category, AuditCategories.HYGIENE);
  assert.deepEqual(payload.metadata, { staleDays: 45 });
  const [firstQuery] = services.auditLogService.queries;
  assert.equal(firstQuery.from instanceof Date, true);
  assert.equal(fixedNow - firstQuery.from.getTime(), 7 * 24 * 60 * 60 * 1000);

  process.env.STALE_USER_DAYS = priorStale;
});

test("runDailyAuditJobs combines workshop and stale user results", async () => {
  const services = {
    adminHubService: { async getMaxedWorkshops() { return [{ workshopId: "wk-1", participantsCount: 10, maxParticipants: 10 }]; } },
    staleUserDetector: { async findStaleUsers() { return [{ entityKey: "user-1" }]; }, resolveStaleDays: () => 30 },
    auditLogService: {
      async queryLogs() { return []; },
      async recordEvent() { return {}; },
    },
    now: () => fixedNow,
  };

  const results = await runDailyAuditJobs(services);

  assert.deepEqual(results, {
    workshops: [{ workshopId: "wk-1", recorded: true }],
    staleUsers: [{ entityKey: "user-1", recorded: true }],
  });
});
