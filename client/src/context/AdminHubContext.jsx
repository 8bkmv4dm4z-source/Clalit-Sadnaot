import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from "react";
import {
  buildAdminHeaders,
  buildLogsQuery,
  fetchAdminHubAlerts,
  fetchAdminHubLogs,
  normalizeLogEntry,
} from "../utils/adminHubClient";

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

  const canFetch = useMemo(() => !!adminPassword, [adminPassword]);

  const refreshLogs = useCallback(
    async (override = {}) => {
      if (!canFetch) return;
      setLoading(true);
      setError("");
      const mergedFilters = { ...filters, ...override };
      try {
        const { ok, status, body } = await fetchAdminHubLogs({
          adminPassword,
          filters: mergedFilters,
        });
        if (!ok) {
          setError(body?.message || `Request failed (${status})`);
          setLogs([]);
          return;
        }
        const normalized = (body.logs || []).map(normalizeLogEntry);
        setLogs(normalized);
      } catch (err) {
        setError(err?.message || "Failed to load logs");
      } finally {
        setLoading(false);
      }
    },
    [adminPassword, canFetch, filters]
  );

  const refreshAlerts = useCallback(async () => {
    if (!canFetch) return;
    try {
      const { alerts: alertsPayload, stale } = await fetchAdminHubAlerts({ adminPassword });
      setAlerts(alertsPayload?.alerts || []);
      setStaleUsers(stale?.staleUsers || []);
    } catch (err) {
      // Non-fatal; keep UI functional
    }
  }, [adminPassword, canFetch]);

  useEffect(() => {
    refreshLogs({ page: filters.page, limit: filters.limit });
  }, [canFetch, filters.page, filters.limit, refreshLogs]);

  useEffect(() => {
    refreshAlerts();
  }, [canFetch, refreshAlerts]);

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
    buildAdminHeaders,
    buildLogsQuery,
  };

  return <AdminHubContext.Provider value={value}>{children}</AdminHubContext.Provider>;
};

export const useAdminHub = () => useContext(AdminHubContext);
