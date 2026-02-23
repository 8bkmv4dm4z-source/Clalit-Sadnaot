# Operations Runbook

This runbook is the minimum operator playbook for this repository.

## 1. Pre-Deploy Checks

Run these before cutting a deploy candidate.

```bash
# root
npm run lint

# client
cd client && npm test

# server
cd server && npm test
```

If backend performance/security validation is in scope for the release:

```bash
cd server && npm run k6
cd server && npm run artillery
```

## 2. Deploy Readiness Checklist

- `NODE_ENV=production` is set in runtime.
- Required auth env vars are present: `JWT_SECRET`, `JWT_EXPIRY`, `JWT_REFRESH_SECRET`, `JWT_REFRESH_EXPIRY`, `PUBLIC_ID_SECRET`.
- Database connection var is set (`MONGODB_URI` or `MONGO_URI`) and reachable.
- CORS allowlist is explicit (`ALLOWED_ORIGINS`) for deployed origins.
- If CAPTCHA is enabled, provider and keys match (`CAPTCHA_PROVIDER`, matching secret).
- If password reset emails are expected, mail provider env is configured (`RESEND_API_KEY` or SMTP path).

## 3. Post-Deploy Smoke Checks

Run or verify immediately after deploy:

1. `GET /api/auth/csrf` returns token payload and CSRF cookie.
2. Login and token refresh succeed (`POST /api/auth/login`, `POST /api/auth/refresh`).
3. Public workshop endpoints respond (`GET /api/workshops/meta/cities`, `GET /api/workshops`).
4. Admin access probe behavior is correct (`GET /api/admin/hub/access`: non-admin `404`, admin `204`).
5. Metrics export responds for admin context (`GET /api/admin/hub/metrics`) with `200` and `text/plain` plus `ws3_` metric lines (send valid admin auth + `x-admin-password` header).

## 4. Rollback Basics

Use this sequence when a deploy introduces regression:

1. Identify last known good commit SHA.
2. Redeploy that commit in the hosting platform.
3. Confirm smoke checks against the rolled-back version.
4. Keep failing commit for investigation; do not force-push rewrite shared history.

Platform notes for this repository:

- Client: `render.yaml` defines a Render static site build from `client/`.
- Server: documented as a separate Render web service configured outside `render.yaml`.
- Rollback should therefore be performed per service (client and/or server), based on blast radius.

## 5. Incident Triage Skeleton

Use this template during incidents.

### Trigger

- What alerted us (test failure, monitoring, user report, rate-limit spike, auth failures).

### Scope

- Impacted surface: `auth`, `workshops`, `admin`, `profile`, `infra`.
- User impact: % requests failing, endpoint list, affected roles.

### First Containment

- Stop/limit blast radius (disable risky route flags, reduce traffic, rollback candidate).
- Preserve evidence (logs, failing request IDs, timestamps, deploy SHA).

### Working Hypothesis

- Suspected component/file(s).
- Why this is plausible.

### Validation Steps

- Reproduce with exact endpoint + payload.
- Compare behavior on last known good release.
- Confirm env/config drift.

### Resolution

- Fix or rollback action taken.
- Verification performed (smoke checks + targeted tests).

### Follow-ups

- Add regression test.
- Update docs/ADR if architecture/security behavior changed.
- Record timeline, owner, and prevention action.
