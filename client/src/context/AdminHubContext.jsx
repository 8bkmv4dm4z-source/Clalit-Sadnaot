import React, { createContext, useContext, useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  buildAdminHeaders,
  buildLogsQuery,
  fetchAdminHubAlerts,
  fetchAdminHubLogs,
  fetchAdminHubStats,
  normalizeLogEntry,
} from "../utils/adminHubClient";
import { normalizeError } from "../utils/normalizeError";

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
    buildAdminHeaders,
    buildLogsQuery,
  };

  return <AdminHubContext.Provider value={value}>{children}</AdminHubContext.Provider>;
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAdminHub = () => useContext(AdminHubContext);
