const { auditMaxedWorkshops, auditStaleUsers, runDailyAuditJobs: runCanonicalDailyAuditJobs } = require("../jobs/dailyAuditJobs");

const mapWorkshopInput = (candidate = {}) => ({
  subjectKey: candidate.workshopId || candidate.subjectKey || null,
  participantsCount: candidate.participantsCount,
  maxParticipants: candidate.maxParticipants,
  waitlistCount: candidate.waitlistCount || 0,
});

const mapStaleInput = (candidate = {}, staleDays) => ({
  subjectKey: candidate.entityKey || candidate.subjectKey || null,
  lastUpdatedAt: candidate.lastUpdatedAt || candidate.updatedAt || null,
  staleDays: candidate.staleDays || staleDays,
});

const buildAdapterDeps = (overrides = {}) => {
  const deps = { ...overrides };

  if (deps.adminHubService?.getMaxedWorkshops && !deps.detectMaxedWorkshops) {
    deps.detectMaxedWorkshops = async () => {
      const workshops = (await deps.adminHubService.getMaxedWorkshops()) || [];
      return workshops.map(mapWorkshopInput).filter((w) => w.subjectKey);
    };
  }

  if (deps.staleUserDetector?.findStaleUsers && !deps.detectStaleUsers) {
    deps.detectStaleUsers = async () => {
      const staleDays = deps.staleUserDetector.resolveStaleDays?.();
      const staleUsers = (await deps.staleUserDetector.findStaleUsers({})) || [];
      return staleUsers.map((u) => mapStaleInput(u, staleDays)).filter((u) => u.subjectKey);
    };
  }

  if (deps.auditLogService?.queryLogs && !deps.queryLogs) {
    deps.queryLogs = (query) => deps.auditLogService.queryLogs(query);
  }

  if (deps.auditLogService?.recordEvent && !deps.recordEvent) {
    deps.recordEvent = (payload) => deps.auditLogService.recordEvent(payload);
  }

  return deps;
};

const mapWorkshopOutput = (results = []) =>
  (results || []).map((row) => ({
    workshopId: row.subjectKey || null,
    recorded: !!row.recorded,
  }));

const mapStaleOutput = (results = []) =>
  (results || []).map((row) => ({
    entityKey: row.subjectKey || null,
    recorded: !!row.recorded,
  }));

const recordWorkshopMaxedAlerts = async (overrides = {}) => {
  const results = await auditMaxedWorkshops(buildAdapterDeps(overrides));
  return mapWorkshopOutput(results);
};

const recordStaleUserAlerts = async (overrides = {}) => {
  const results = await auditStaleUsers(buildAdapterDeps(overrides));
  return mapStaleOutput(results);
};

const runDailyAuditJobs = async (overrides = {}) => {
  const canonical = await runCanonicalDailyAuditJobs(buildAdapterDeps(overrides));
  return {
    workshops: mapWorkshopOutput(canonical.workshops),
    staleUsers: mapStaleOutput(canonical.staleUsers),
  };
};

module.exports = {
  runDailyAuditJobs,
  recordWorkshopMaxedAlerts,
  recordStaleUserAlerts,
};
