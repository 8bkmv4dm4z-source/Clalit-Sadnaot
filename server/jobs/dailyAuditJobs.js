const { detectMaxedWorkshops, detectStaleUsers } = require("../services/AuditDetectionService");
const { queryLogs, recordEvent } = require("../services/AuditLogService");
const { AuditEventTypes, getAuditEventDefinition } = require("../services/AuditEventRegistry");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const withDependencies = (overrides = {}) => ({
  detectMaxedWorkshops,
  detectStaleUsers,
  queryLogs,
  recordEvent,
  now: () => Date.now(),
  ...overrides,
});

const hasRecentEvent = async ({ eventType, subjectType, subjectKey, windowMs, deps }) => {
  const from = new Date(deps.now() - windowMs);
  const existing = await deps.queryLogs({ eventType, subjectType, subjectKey, from });
  return Array.isArray(existing) && existing.length > 0;
};

const auditMaxedWorkshops = async (overrides = {}) => {
  const deps = withDependencies(overrides);
  const candidates = await deps.detectMaxedWorkshops({});
  const results = [];

  for (const candidate of candidates) {
    const def = getAuditEventDefinition(AuditEventTypes.WORKSHOP_MAXED);
    const shouldSkip = await hasRecentEvent({
      eventType: AuditEventTypes.WORKSHOP_MAXED,
      subjectType: "workshop",
      subjectKey: candidate.subjectKey,
      windowMs: ONE_DAY_MS,
      deps,
    });
    if (shouldSkip) {
      results.push({ subjectKey: candidate.subjectKey, recorded: false });
      continue;
    }

    await deps.recordEvent({
      eventType: AuditEventTypes.WORKSHOP_MAXED,
      category: def.category,
      subjectType: "workshop",
      subjectKey: candidate.subjectKey,
      actorKey: null,
      metadata: {
        participantsCount: candidate.participantsCount,
        maxParticipants: candidate.maxParticipants,
        waitlistCount: candidate.waitlistCount,
      },
    });
    results.push({ subjectKey: candidate.subjectKey, recorded: true });
  }

  return results;
};

const auditStaleUsers = async (overrides = {}) => {
  const deps = withDependencies(overrides);
  const candidates = await deps.detectStaleUsers({});
  const windowMs = Number(process.env.AUDIT_RETENTION_DAYS || 3) * ONE_DAY_MS;
  const results = [];

  for (const candidate of candidates) {
    const def = getAuditEventDefinition(AuditEventTypes.USER_STALE_DETECTED);
    const shouldSkip = await hasRecentEvent({
      eventType: AuditEventTypes.USER_STALE_DETECTED,
      subjectType: "user",
      subjectKey: candidate.subjectKey,
      windowMs,
      deps,
    });
    if (shouldSkip) {
      results.push({ subjectKey: candidate.subjectKey, recorded: false });
      continue;
    }

    await deps.recordEvent({
      eventType: AuditEventTypes.USER_STALE_DETECTED,
      category: def.category,
      subjectType: "user",
      subjectKey: candidate.subjectKey,
      actorKey: null,
      metadata: {
        lastUpdatedAt: candidate.lastUpdatedAt,
        staleDays: candidate.staleDays,
      },
    });
    results.push({ subjectKey: candidate.subjectKey, recorded: true });
  }

  return results;
};

const runDailyAuditJobs = async (overrides = {}) => {
  const workshops = await auditMaxedWorkshops(overrides);
  const staleUsers = await auditStaleUsers(overrides);
  return { workshops, staleUsers };
};

module.exports = {
  runDailyAuditJobs,
  auditMaxedWorkshops,
  auditStaleUsers,
};
