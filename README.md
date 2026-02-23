# MERN Workshop Registration Platform

This repository contains a production-oriented **full-stack MERN workshop app** with a React client and an Express/MongoDB server.

> **Note:** `LastProgress.md` was not found in this repository, so this README is updated from the current codebase and docs under `docs/`.

## Project Status (Current Snapshot)

- ✅ Client lint passes (`client/npm run lint`).
- ✅ Client unit tests pass (`client/npm test`, 17/17 passing).
- ⚠️ Server linter is currently a placeholder (`echo 'No linter configured'`).
- ⚠️ Server test suite runs but has multiple failing tests and env preconditions (e.g. missing `JWT_EXPIRY`, `JWT_REFRESH_EXPIRY` in test env).
- ⚠️ Root lint (`npm run lint`) fails due to a large existing lint backlog across `client/` + `server/` source.

## Architecture

```text
Browser (React SPA)
  -> /api via Vite proxy in development
Express API (security middleware + route guards)
  -> MongoDB via Mongoose
```

- Client dev server: `http://localhost:5173`
- Server dev API: `http://localhost:5000`
- Deployment target: Render (`render.yaml`)

---

## Project Tree

```text
my-react-app-public/
├── client/
│   ├── src/                    # React app (pages, components, contexts, utils)
│   ├── tests/                  # node:test frontend/unit tests
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── controllers/            # Route handlers
│   ├── routes/                 # API route modules
│   ├── middleware/             # Auth, CSRF, sanitize, rate limits
│   ├── models/                 # Mongoose models
│   ├── contracts/              # Response contract guards / DTO shaping
│   ├── services/               # Domain/security services
│   ├── utils/                  # Hashing, sanitization, security utilities
│   ├── tests/                  # node:test backend test suites
│   ├── server.js               # Express bootstrap + global middleware
│   └── package.json
├── docs/
│   ├── project.md
│   ├── onboarding.md
│   ├── runbook.md
│   ├── ADR-index.md
│   ├── api-flow.md
│   ├── security.md
│   ├── error-normalization.md
│   └── suggestions-to-fix.md
├── render.yaml
├── package.json
└── README.md
```

---

## API Surface

Base URL in production is your deployed server origin. In development, Vite proxies `/api` to the backend.

### Auth (`/api/auth`)

- `GET /csrf`
- `POST /register`
- `POST /register/request`
- `POST /register/verify-otp`
- `POST /login`
- `POST /refresh`
- `POST /logout`
- `POST /send-otp`
- `POST /verify-otp`
- `POST /request-password-reset`
- `POST /reset-password`
- `GET /me`
- `PUT /password`

### Workshops (`/api/workshops`)

- `GET /audit/run` (admin)
- `GET /meta/cities`
- `GET /mine`
- `GET /mine/all`
- `GET /search`
- `GET /registered` (auth)
- `GET /`
- `POST /:id/register-entity` (auth)
- `DELETE /:id/unregister-entity` (auth)
- `POST /:id/waitlist-entity` (auth)
- `DELETE /:id/waitlist-entity` (auth)
- `POST /:id/export` (admin)
- `GET /:id/participants` (admin)
- `GET /:id/waitlist` (admin)
- `GET /:id`
- `POST /` (admin)
- `PUT /:id` (admin)
- `DELETE /:id` (admin)

### Users (`/api/users`)

- `GET /getMe`
- `GET /search`
- `GET /` (admin)
- `GET /me` (admin)
- `POST /` (admin)
- `DELETE /by-entity/:entityKey` (admin)
- `DELETE /:id` (admin)
- `GET /:id/workshops` (admin)
- `GET /entity/:id`
- `GET /:id`
- `PUT /update-entity`

### Profile (`/api/profile`)

- `GET /`
- `PUT /edit`
- `GET /all` (admin)
- `DELETE /by-entity/:entityKey` (admin)
- `DELETE /:id` (admin)

### Admin Hub (`/api/admin/hub`)

- `GET /logs`
- `GET /alerts/maxed-workshops`
- `GET /alerts/failed-logins`
- `GET /alerts/error-rate`
- `GET /stale-users`

### Admin Workshops (`/api/admin/workshops`)

- `GET /participants/:id`

---

## Security Measures Implemented

### 1) Authentication & Session Security
- JWT access tokens + HTTP-only refresh cookie model.
- Refresh token rotation and capped active refresh sessions.
- Password change invalidates earlier access tokens.
- Admin access is validated server-side (database-backed authority checks), not trusted from client hints.

### 2) Response Contract & Data Minimization
- Response guard layer strips sensitive/forbidden fields before payloads are sent.
- Internal identifiers (`_id`) are hidden; opaque `entityKey` / hashed identifiers are used.
- Role/authority fields are not exposed in standard client payloads.
- Participant/contact data exposure is narrowed by endpoint scope.

### 3) Input Hardening & Injection Mitigation
- Global sanitize middleware on body/query/params.
- `express-mongo-sanitize` to block Mongo operator injection.
- Celebrate/Joi validation middleware for key request payloads.
- HPP middleware to reduce HTTP parameter pollution risks.

### 4) Transport & Browser Security
- CORS policy with environment-aware allowlisting.
- Helmet security headers (+ strict production CSP configuration).
- Permissions-Policy locked down for high-risk browser capabilities.
- Secure cookie options (HTTP-only, SameSite, secure in production).

### 5) Abuse & Attack Surface Reduction
- Global API and route-level rate limiting (`express-rate-limit` and per-user limiter).
- CAPTCHA gate available for abuse-prone auth flows.
- Dev route surface is environment-gated and can be hard-disabled.
- Audit/security logging around sensitive actions and admin views.

---

## Local Development

### Prerequisites
- Node.js `>=18.18.0`
- npm
- MongoDB instance (local or Atlas)

### Install

```bash
npm install
cd client && npm install
cd ../server && npm install
```

### Run

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

---

## Documentation

- [`docs/project.md`](docs/project.md) — overall architecture and module map.
- [`docs/onboarding.md`](docs/onboarding.md) — setup flow, env matrix, and team conventions.
- [`docs/runbook.md`](docs/runbook.md) — deploy checks, rollback basics, incident triage skeleton.
- [`docs/ADR-index.md`](docs/ADR-index.md) — architecture/security decision index and change log.
- [`docs/security.md`](docs/security.md) — security controls and implementation notes.
- [`docs/api-flow.md`](docs/api-flow.md) — endpoint catalog and request flow.

---

## Validation Commands Used for This README Update

```bash
npm run lint
cd client && npm run lint
cd client && npm test
cd server && npm run lint
cd server && npm test
```

If you want, I can follow this README update with a focused **“known issues + stabilization checklist”** based on the currently failing backend tests/lint findings.
