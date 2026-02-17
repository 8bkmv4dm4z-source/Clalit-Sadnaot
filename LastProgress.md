# Last Progress — Security Logger & Derived Insights

**Branch:** `feat/security-logger-insights` (merged to `main`)
**Commit:** `f55a868`
**Date:** 2026-02-16

---

## What Was Built

### Security Event Logger (server)
- **12 new security event types** added to `AuditEventRegistry`: auth failure, token expired/malformed, role integrity, rate limit, CSRF failure, admin password failure, input/mongo sanitized, integrity mismatch, response guard violation, OTP lockout.
- **Severity levels** (`info`, `warn`, `critical`) with per-event defaults added to `AdminAuditLog` schema and `AuditLogService`.
- **`SecurityEventLogger` service** — convenience methods (`logAuthFailure`, `logRateLimit`, etc.) that wrap `safeAuditLog` with auto-severity, IP hashing via HMAC, and request context (route, method, user-agent).

### Middleware Instrumentation (server)
All security-relevant middleware now persists events to the audit log instead of only `console.warn`:
- `authMiddleware` — no token, user not found, token expired/malformed, role integrity mismatch
- `adminPasswordMiddleware` — password mismatch
- `perUserRateLimit` — 429 handler
- `sanitizeBody` — body changed after sanitization
- `server.js` — CSRF failures, response guard violations, mongo sanitize callbacks
- `auditService` — integrity hash mismatches
- `authController` — OTP lockout (migrated from generic `safeAuditLog` to `logOtpLockout`)

### Derived Data Aggregation (server)
- **`SecurityInsight` model** — hourly/daily period snapshots with metrics (totals, by severity, by event type, top subject hashes) and threshold warnings. 14-day TTL via `SECURITY_INSIGHT_RETENTION_DAYS` env var.
- **`SecurityInsightService`** — MongoDB aggregation pipeline computing hourly + daily insights. Configurable thresholds (env vars with defaults: auth failures 20/hr, rate limits 50/day, CSRF 5/hr, admin pwd 3/day, critical 1/day).
- Wired into `auditService.runAuditSuite` so insights regenerate on every scheduled audit cycle.

### Stats API (server)
- **`GET /api/admin/hub/stats`** — replaced 501 stub with live endpoint returning latest hourly/daily insights and active warnings.
- **Severity filter** added to `GET /api/admin/hub/logs` (`?severity=info|warn|critical`).
- `"system"` added as valid `subjectType` in schema and controller.

### Client UI
- **`fetchAdminHubStats`** added to `adminHubClient.js`.
- **`AdminHubContext`** — `stats`, `statsLoading`, `statsError`, `refreshStats` state and auto-fetch on unlock.
- **`SecurityInsightsPanel`** — stat cards (events/hour, events/day, critical count, warning count), event breakdown table sorted by count, active warnings list with severity badges, green "all clear" when no warnings.
- **`AdminHub`** — new "Insights" tab routing to the panel, severity badges on all log entries in `LogsTable`.

---

## Bugs Fixed

### `normalizeResponseError` hook ordering (AuthLayout)
`refreshAccessToken` referenced `normalizeResponseError` in its body and dependency array, but the `useCallback` for `normalizeResponseError` was declared ~100 lines later. React captured `undefined`. Moved the declaration above `refreshAccessToken`.

### AdminHubContext fetch cascade
`refreshLogs` had `filters` (object) in its `useCallback` dep array. Every filter change recreated the callback, which triggered both the context effect and the `AdminHubContent` effect — double-fetching on every interaction. Fixed by reading filters via a ref, removing `refreshLogs` from effect deps, and removing the duplicate effect in `AdminHubContent`.

### Admin hub rate limiting
`adminHubPasswordLimiter` was set to 5 req/15min. The initial unlock fires 4 parallel requests (logs + alerts + stale-users + stats), so one tab switch or refresh immediately triggered 429. Raised to 40 req/15min — the route is already triple-gated (JWT + admin authority + timing-safe password).

---

## Files Changed (21)

| File | Change |
|---|---|
| `server/services/AuditEventRegistry.js` | +severity levels, +12 event types, +severity defaults map |
| `server/models/AdminAuditLog.js` | +severity field, +system subjectType, +2 indexes |
| `server/models/SecurityInsight.js` | **NEW** — aggregated insight model |
| `server/services/SecurityEventLogger.js` | **NEW** — 12 convenience logging methods |
| `server/services/SecurityInsightService.js` | **NEW** — aggregation pipeline + thresholds |
| `server/services/AuditLogService.js` | +severity in recordEvent/queryLogs |
| `server/services/SafeAuditLog.js` | +severity extraction and passthrough |
| `server/services/auditService.js` | +insight aggregation in audit suite |
| `server/middleware/authMiddleware.js` | +4 security event log calls |
| `server/middleware/adminPasswordMiddleware.js` | +logAdminPasswordFailure |
| `server/middleware/perUserRateLimit.js` | +logRateLimit |
| `server/middleware/sanitizeBody.js` | +before/after comparison, +logInputSanitized |
| `server/server.js` | +logCsrfFailure, +logResponseGuardViolation, +mongoSanitize onSanitize |
| `server/controllers/authController.js` | migrated OTP lockout to logOtpLockout |
| `server/controllers/adminHubController.js` | implemented getStats, +severity filter on getLogs |
| `server/routes/adminHub.js` | rate limit 5 -> 40 |
| `client/src/utils/adminHubClient.js` | +fetchAdminHubStats |
| `client/src/context/AdminHubContext.jsx` | +stats state, +filtersRef fix, stabilized effects |
| `client/src/pages/AdminHub/SecurityInsightsPanel.jsx` | **NEW** — insights UI panel |
| `client/src/pages/AdminHub/AdminHub.jsx` | +Insights tab, +severity badges, removed duplicate fetch |
| `client/src/layouts/AuthLayout/AuthLayout.jsx` | fixed normalizeResponseError hook ordering |

---

## Env Vars (all optional, have defaults)

| Variable | Default | Purpose |
|---|---|---|
| `SECURITY_INSIGHT_RETENTION_DAYS` | 14 | TTL for SecurityInsight documents |
| `SECURITY_THRESHOLD_AUTH_FAILURES_HOUR` | 20 | Hourly auth failure warning threshold |
| `SECURITY_THRESHOLD_RATE_LIMITS_DAY` | 50 | Daily rate limit warning threshold |
| `SECURITY_THRESHOLD_CSRF_HOUR` | 5 | Hourly CSRF failure warning threshold |
| `SECURITY_THRESHOLD_ADMIN_PWD_DAY` | 3 | Daily admin password failure warning threshold |
| `SECURITY_THRESHOLD_CRITICAL_DAY` | 1 | Daily critical event warning threshold |
