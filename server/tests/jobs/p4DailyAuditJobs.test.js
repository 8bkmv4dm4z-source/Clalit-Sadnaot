const test = require("node:test");
const assert = require("node:assert/strict");
const { AuditCategories } = require("../../services/AuditEventRegistry");

process.env.PUBLIC_ID_SECRET = process.env.PUBLIC_ID_SECRET || "test-public-id-secret";

const { auditMaxedWorkshops, auditStaleUsers, runDailyAuditJobs } = require("../../jobs/dailyAuditJobs");

const fixedNow = new Date("2024-02-01T12:00:00Z").getTime();

test("auditMaxedWorkshops deduplicates within 24h and does not modify data", async () => {
  const recorded = [];
  const deps = {
    detectMaxedWorkshops: async () => [
      { subjectKey: "wk-1", participantsCount: 30, maxParticipants: 30, waitlistCount: 5 },
      { subjectKey: "wk-2", participantsCount: 40, maxParticipants: 40, waitlistCount: 0 },
    ],
    queryLogs: async (query) => {
      if (query.subjectKey === "wk-2") return [{}];
      return [];
    },
    recordEvent: async (payload) => recorded.push(payload),
    now: () => fixedNow,
  };

  const results = await auditMaxedWorkshops(deps);

  assert.deepEqual(results, [
    { subjectKey: "wk-1", recorded: true },
    { subjectKey: "wk-2", recorded: false },
  ]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "workshop.maxed");
  assert.equal(recorded[0].subjectType, "workshop");
  assert.equal(recorded[0].actorKey, null);
  assert.equal(recorded[0].category, AuditCategories.CAPACITY);
  assert.deepEqual(recorded[0].metadata, {
    participantsCount: 30,
    maxParticipants: 30,
    waitlistCount: 5,
  });
});

test("auditStaleUsers deduplicates across retention window and does not alter users", async () => {
  const recorded = [];
  const deps = {
    detectStaleUsers: async () => [
      { subjectKey: "user-1", lastUpdatedAt: new Date("2023-01-01T00:00:00Z"), staleDays: 45 },
      { subjectKey: "user-2", lastUpdatedAt: new Date("2023-02-01T00:00:00Z"), staleDays: 45 },
    ],
    queryLogs: async (query) => {
      if (query.subjectKey === "user-2") return [{}];
      return [];
    },
    recordEvent: async (payload) => recorded.push(payload),
    now: () => fixedNow,
  };

  const results = await auditStaleUsers(deps);

  assert.deepEqual(results, [
    { subjectKey: "user-1", recorded: true },
    { subjectKey: "user-2", recorded: false },
  ]);
  assert.equal(recorded.length, 1);
  assert.equal(recorded[0].eventType, "user.stale.detected");
  assert.equal(recorded[0].subjectType, "user");
  assert.equal(recorded[0].actorKey, null);
  assert.equal(recorded[0].category, AuditCategories.HYGIENE);
  assert.deepEqual(recorded[0].metadata, {
    lastUpdatedAt: new Date("2023-01-01T00:00:00Z"),
    staleDays: 45,
  });
});

test("runDailyAuditJobs combines both job outputs", async () => {
  const results = await runDailyAuditJobs({
    detectMaxedWorkshops: async () => [{ subjectKey: "wk-1", participantsCount: 10, maxParticipants: 10, waitlistCount: 1 }],
    detectStaleUsers: async () => [{ subjectKey: "user-1", lastUpdatedAt: new Date("2023-01-01T00:00:00Z"), staleDays: 30 }],
    queryLogs: async () => [],
    recordEvent: async () => {},
    now: () => fixedNow,
  });

  assert.deepEqual(results, {
    workshops: [{ subjectKey: "wk-1", recorded: true }],
    staleUsers: [{ subjectKey: "user-1", recorded: true }],
  });
});
