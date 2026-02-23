import { apiFetch } from "./apiFetch.ts";

export const buildAdminHeaders = (adminPassword) => {
  if (!adminPassword) throw new Error("Admin password is required");
  return {
    "Content-Type": "application/json",
    "x-admin-password": adminPassword,
  };
};

export const buildLogsQuery = (filters = {}) => {
  const params = new URLSearchParams();
  const entries = {
    eventType: filters.eventType,
    subjectType: filters.subjectType,
    subjectKey: filters.subjectKey,
    from: filters.from,
    to: filters.to,
    page: filters.page || 1,
    limit: filters.limit || 20,
  };
  Object.entries(entries).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  return params.toString();
};

export const fetchAdminHubLogs = async ({ adminPassword, filters }) => {
  const headers = buildAdminHeaders(adminPassword);
  const query = buildLogsQuery(filters);
  const res = await apiFetch(`/api/admin/hub/logs?${query}`, { headers });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
};

export const fetchAdminHubAlerts = async ({ adminPassword }) => {
  const headers = buildAdminHeaders(adminPassword);
  const [alertsRes, staleRes] = await Promise.all([
    apiFetch("/api/admin/hub/alerts/maxed-workshops", { headers }),
    apiFetch("/api/admin/hub/stale-users", { headers }),
  ]);
  const alerts = await alertsRes.json();
  const stale = await staleRes.json();
  return { alerts, stale, status: { alerts: alertsRes.status, stale: staleRes.status } };
};

export const fetchAdminHubStats = async ({ adminPassword }) => {
  const headers = buildAdminHeaders(adminPassword);
  const res = await apiFetch("/api/admin/hub/stats", { headers });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
};

export const fetchRiskAssessments = async ({ adminPassword, filters = {} }) => {
  const headers = buildAdminHeaders(adminPassword);
  const params = new URLSearchParams();
  const entries = {
    status: filters.status,
    eventType: filters.eventType,
    category: filters.category,
    includeFailures: filters.includeFailures ? "true" : "",
    page: filters.page || 1,
    limit: filters.limit || 20,
  };
  Object.entries(entries).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await apiFetch(`/api/admin/hub/risk-assessments?${params.toString()}`, { headers });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
};

export const submitRiskFeedback = async ({ adminPassword, assessmentId, payload }) => {
  const headers = buildAdminHeaders(adminPassword);
  const res = await apiFetch(`/api/admin/hub/risk-assessments/${assessmentId}/feedback`, {
    method: "POST",
    headers,
    body: JSON.stringify(payload || {}),
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
};

export const fetchRiskFailures = async ({ adminPassword, filters = {} }) => {
  const headers = buildAdminHeaders(adminPassword);
  const params = new URLSearchParams();
  const entries = {
    eventType: filters.eventType,
    category: filters.category,
    page: filters.page || 1,
    limit: filters.limit || 20,
  };
  Object.entries(entries).forEach(([key, value]) => {
    if (value) params.append(key, value);
  });
  const res = await apiFetch(`/api/admin/hub/risk-assessments/failures?${params.toString()}`, { headers });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
};

export const retryRiskAssessment = async ({ adminPassword, assessmentId }) => {
  const headers = buildAdminHeaders(adminPassword);
  const res = await apiFetch(`/api/admin/hub/risk-assessments/${assessmentId}/retry`, {
    method: "POST",
    headers,
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
};

export const normalizeLogEntry = (entry) => {
  if (!entry) return entry;
  return { ...entry };
};

export const groupLogsByCategory = (logs = []) =>
  (logs || []).reduce((acc, log) => {
    const key = log?.category || "SECURITY";
    if (!acc[key]) acc[key] = [];
    acc[key].push(log);
    return acc;
  }, {});
