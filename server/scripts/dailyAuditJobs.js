const AdminHubService = require("../services/AdminHubService");
const { findStaleUsers, resolveStaleDays } = require("../services/StaleUserDetector");
const AuditLogService = require("../services/AuditLogService");
const { AuditEventTypes, getAuditEventDefinition } = require("../services/AuditEventRegistry");

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const WORKSHOP_MAXED_DEDUP_MS = ONE_DAY_MS;
const STALE_USER_DEDUP_MS = 7 * ONE_DAY_MS;

const resolveDeps = (overrides = {}) => ({
  adminHubService: AdminHubService,
  staleUserDetector: { findStaleUsers, resolveStaleDays },
  auditLogService: AuditLogService,
  now: () => Date.now(),
  ...overrides,
});

const shouldLogEvent = async ({ eventType, subjectType, subjectKey, windowMs, services }) => {
  const from = new Date(services.now() - windowMs);
  const existing = await services.auditLogService.queryLogs({ eventType, subjectType, subjectKey, from });
  return !existing || existing.length === 0;
};

const recordWorkshopMaxedAlerts = async (overrides = {}) => {
  const services = resolveDeps(overrides);
  const workshops = (await services.adminHubService.getMaxedWorkshops()) || [];
  const results = [];

  for (const workshop of workshops) {
    if (!workshop?.workshopId) continue;
    const def = getAuditEventDefinition(AuditEventTypes.WORKSHOP_MAXED);
    const allowLog = await shouldLogEvent({
      eventType: AuditEventTypes.WORKSHOP_MAXED,
      subjectType: "workshop",
      subjectKey: workshop.workshopId,
      windowMs: WORKSHOP_MAXED_DEDUP_MS,
      services,
    });

    if (!allowLog) {
      results.push({ workshopId: workshop.workshopId, recorded: false });
      continue;
    }

    await services.auditLogService.recordEvent({
      eventType: AuditEventTypes.WORKSHOP_MAXED,
      category: def.category,
      subjectType: "workshop",
      subjectKey: workshop.workshopId,
      actorKey: null,
      metadata: {
        participantsCount: workshop.participantsCount,
        maxParticipants: workshop.maxParticipants,
      },
    });
    results.push({ workshopId: workshop.workshopId, recorded: true });
  }

  return results;
};

const recordStaleUserAlerts = async (overrides = {}) => {
  const services = resolveDeps(overrides);
  const staleUsers = (await services.staleUserDetector.findStaleUsers({})) || [];
  const staleDays = services.staleUserDetector.resolveStaleDays();
  const results = [];

  for (const user of staleUsers) {
    if (!user?.entityKey) continue;
    const def = getAuditEventDefinition(AuditEventTypes.USER_STALE_DETECTED);
    const allowLog = await shouldLogEvent({
      eventType: AuditEventTypes.USER_STALE_DETECTED,
      subjectType: "user",
      subjectKey: user.entityKey,
      windowMs: STALE_USER_DEDUP_MS,
      services,
    });

    if (!allowLog) {
      results.push({ entityKey: user.entityKey, recorded: false });
      continue;
    }

    await services.auditLogService.recordEvent({
      eventType: AuditEventTypes.USER_STALE_DETECTED,
      category: def.category,
      subjectType: "user",
      subjectKey: user.entityKey,
      actorKey: null,
      metadata: { staleDays },
    });
    results.push({ entityKey: user.entityKey, recorded: true });
  }

  return results;
};

const runDailyAuditJobs = async (overrides = {}) => {
  const workshops = await recordWorkshopMaxedAlerts(overrides);
  const staleUsers = await recordStaleUserAlerts(overrides);
  return { workshops, staleUsers };
};

module.exports = {
  runDailyAuditJobs,
  recordWorkshopMaxedAlerts,
  recordStaleUserAlerts,
};
