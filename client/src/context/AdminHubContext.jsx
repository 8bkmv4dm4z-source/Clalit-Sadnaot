import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  buildAdminHeaders,
  buildLogsQuery,
  fetchAdminHubAlerts,
  fetchAdminHubLogs,
  fetchAdminHubStats,
  fetchRiskAssessments,
  normalizeLogEntry,
} from "../utils/adminHubClient";
import { normalizeError } from "../utils/normalizeError";

const RISK_QUEUE_STATUSES = ["pending", "processing", "failed", "dead_letter", "completed"];

const buildEmptyQueueSummary = () =>
  RISK_QUEUE_STATUSES.reduce((acc, status) => {
    acc[status] = 0;
    return acc;
  }, {});

const AdminHubContext = createContext({
  adminPassword: "",
  setAdminPassword: () => {},
  filters: {},
  setFilters: () => {},
  logs: [],
  loading: false,
  error: "",
  refreshLogs: async () => {},
  alerts: [],
  staleUsers: [],
  stats: null,
  statsLoading: false,
  statsError: "",
  refreshStats: async () => {},
  riskAssessments: [],
  riskFailures: [],
  riskQueueSummary: buildEmptyQueueSummary(),
  riskQueueLoading: false,
  riskQueueError: "",
  riskQueueSyncing: false,
  riskQueueLastUpdatedAt: "",
  refreshRiskQueue: async () => {},
});

const DEFAULT_FILTERS = {
  eventType: "",
  subjectType: "",
  subjectKey: "",
  from: "",
  to: "",
  page: 1,
  limit: 20,
};

export const AdminHubProvider = ({ children }) => {
  const [adminPassword, setAdminPassword] = useState("");
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [logs, setLogs] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [staleUsers, setStaleUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [stats, setStats] = useState(null);
  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState("");
  const [riskAssessments, setRiskAssessments] = useState([]);
  const [riskFailures, setRiskFailures] = useState([]);
  const [riskQueueSummary, setRiskQueueSummary] = useState(buildEmptyQueueSummary());
  const [riskQueueLoading, setRiskQueueLoading] = useState(false);
  const [riskQueueError, setRiskQueueError] = useState("");
  const [riskQueueSyncing, setRiskQueueSyncing] = useState(false);
  const [riskQueueLastUpdatedAt, setRiskQueueLastUpdatedAt] = useState("");

  const canFetch = useMemo(() => !!adminPassword, [adminPassword]);
  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const refreshLogs = useCallback(
    async (override = {}) => {
      if (!canFetch) return;
      setLoading(true);
      setError("");
      const mergedFilters = { ...filtersRef.current, ...override };
      try {
        const { ok, status, body } = await fetchAdminHubLogs({
          adminPassword,
          filters: mergedFilters,
        });
        if (!ok) {
          const normalized = normalizeError(null, {
            status,
            payload: body,
            fallbackMessage: `Request failed (${status})`,
          });
          setError(normalized.message);
          setLogs([]);
          return;
        }
        const normalized = (body.logs || []).map(normalizeLogEntry);
        setLogs(normalized);
      } catch (err) {
        const normalized = normalizeError(err, { fallbackMessage: "Failed to load logs" });
        setError(normalized.message);
      } finally {
        setLoading(false);
      }
    },
    [adminPassword, canFetch]
  );

  const refreshStats = useCallback(async () => {
    if (!canFetch) return;
    setStatsLoading(true);
    setStatsError("");
    try {
      const { ok, status, body } = await fetchAdminHubStats({ adminPassword });
      if (!ok) {
        const normalized = normalizeError(null, {
          status,
          payload: body,
          fallbackMessage: `Stats request failed (${status})`,
        });
        setStatsError(normalized.message);
        return;
      }
      setStats(body);
    } catch (err) {
      const normalized = normalizeError(err, { fallbackMessage: "Failed to load stats" });
      setStatsError(normalized.message);
    } finally {
      setStatsLoading(false);
    }
  }, [adminPassword, canFetch]);

  const refreshAlerts = useCallback(async () => {
    if (!canFetch) return;
    try {
      const { alerts: alertsPayload, stale } = await fetchAdminHubAlerts({ adminPassword });
      setAlerts(alertsPayload?.alerts || []);
      setStaleUsers(stale?.staleUsers || []);
    } catch {
      // Non-fatal; keep UI functional
    }
  }, [adminPassword, canFetch]);

  const refreshRiskQueue = useCallback(
    async ({ page = 1, limit = 10 } = {}) => {
      if (!canFetch) return;
      setRiskQueueLoading(true);
      setRiskQueueError("");
      try {
        const assessmentResult = await fetchRiskAssessments({
          adminPassword,
          filters: { page, limit, includeFailures: true },
        });

        if (!assessmentResult.ok) {
          const normalized = normalizeError(null, {
            status: assessmentResult.status,
            payload: assessmentResult.body,
            fallbackMessage: `Risk queue request failed (${assessmentResult.status})`,
          });
          setRiskQueueError(normalized.message);
          setRiskAssessments([]);
          setRiskFailures([]);
          setRiskQueueSummary(buildEmptyQueueSummary());
          setRiskQueueSyncing(false);
          return;
        }

        const nextSummary = buildEmptyQueueSummary();
        RISK_QUEUE_STATUSES.forEach((status) => {
          nextSummary[status] = Number(assessmentResult.body?.queueSummary?.[status] || 0);
        });

        const nextAssessments = assessmentResult.body?.assessments || [];
        const hasQueueData =
          nextAssessments.length > 0 ||
          Object.values(nextSummary).some((count) => Number(count || 0) > 0);
        const backfillTriggered = Boolean(assessmentResult.body?.backfillTriggered);
        const backfillInFlight = Boolean(assessmentResult.body?.backfillInFlight);

        setRiskAssessments(nextAssessments);
        setRiskQueueSummary(nextSummary);
        setRiskQueueSyncing((prev) => {
          if (hasQueueData) return false;
          return backfillTriggered || backfillInFlight || prev;
        });
        setRiskQueueLastUpdatedAt(new Date().toISOString());

        setRiskFailures(assessmentResult.body?.failures || []);
      } catch (err) {
        const normalized = normalizeError(err, { fallbackMessage: "Failed to load risk queue" });
        setRiskQueueError(normalized.message);
      } finally {
        setRiskQueueLoading(false);
      }
    },
    [adminPassword, canFetch]
  );

  useEffect(() => {
    refreshLogs({ page: filters.page, limit: filters.limit });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch, filters.page, filters.limit]);

  useEffect(() => {
    refreshAlerts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch]);

  useEffect(() => {
    refreshStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canFetch]);

  const value = {
    adminPassword,
    setAdminPassword,
    filters,
    setFilters,
    logs,
    loading,
    error,
    refreshLogs,
    alerts,
    staleUsers,
    stats,
    statsLoading,
    statsError,
    refreshStats,
    riskAssessments,
    riskFailures,
      riskQueueSummary,
      riskQueueLoading,
      riskQueueError,
      riskQueueSyncing,
      riskQueueLastUpdatedAt,
      refreshRiskQueue,
    buildAdminHeaders,
    buildLogsQuery,
  };

  return <AdminHubContext.Provider value={value}>{children}</AdminHubContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdminHub = () => useContext(AdminHubContext);
