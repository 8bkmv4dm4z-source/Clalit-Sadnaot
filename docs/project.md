# Project Overview

Full-stack MERN application for managing workshop registrations. Users can browse, register for, and manage workshops. Admins can create/edit workshops, view participants, and access audit/monitoring tools.

---

## Table of Contents

1. [Architecture](#1-architecture)
2. [Tech Stack](#2-tech-stack)
3. [Directory Structure](#3-directory-structure)
4. [Data Models](#4-data-models)
5. [API Surface](#5-api-surface)
6. [Client Application](#6-client-application)
7. [Authentication & Authorization](#7-authentication--authorization)
8. [Entity Key System](#8-entity-key-system)
9. [Deployment](#9-deployment)
10. [Development Setup](#10-development-setup)
11. [Testing](#11-testing)
12. [Documentation Index](#12-documentation-index)

---

## 1. Architecture

Two independent packages — `client/` (React SPA) and `server/` (Express API) — with no shared workspace tooling.

```
Browser
  |
  v
React SPA (Vite, port 5173)
  |  Bearer token + CSRF header
  v
Express API (port 5000)
  |
  v
MongoDB Atlas (Mongoose 8)
```

In development, Vite proxies `/api` requests to `http://localhost:5000`. In production, the client is deployed as a static site and the server runs independently on Render.com.

---

## 2. Tech Stack

### Client

| Layer | Technology |
|-------|-----------|
| Framework | React 18 with React Compiler (Babel plugin) |
| Routing | React Router v6 |
| Styling | Tailwind CSS v3 |
| Build | Vite 7 |
| Module System | ESM (`"type": "module"`) |
| Calendar | FullCalendar 6 |
| Animation | Framer Motion, React Spring |
| Virtualization | @tanstack/react-virtual |
| HTTP | Axios (legacy), `apiFetch.js` (primary) |

### Server

| Layer | Technology |
|-------|-----------|
| Framework | Express 4 |
| Database | MongoDB via Mongoose 8 (Atlas in production) |
| Module System | CommonJS (`require()`) |
| Auth | JWT (jsonwebtoken 9) + HTTP-only refresh cookies |
| Password Hashing | Argon2id (primary), bcryptjs (fallback with auto-upgrade) |
| Validation | Celebrate + Joi |
| Email | Nodemailer, Resend |
| Security Headers | Helmet 7 |
| Rate Limiting | express-rate-limit 7 |
| Export | ExcelJS (participant spreadsheets) |
| Node | >=18.18.0 |

---

## 3. Directory Structure

### Client (`client/`)

```
client/
├── src/
│   ├── main.jsx                    # Entry point, context provider stack
│   ├── App.jsx                     # App shell
│   ├── routes/
│   │   └── AppRoutes/
│   │       └── AppRoutes.jsx       # Route definitions with auth guards
│   ├── layouts/                    # Context providers & layout wrappers
│   │   ├── AppShell.jsx            # Authenticated layout
│   │   ├── PublicLayout.jsx        # Public layout
│   │   ├── AuthLayout/             # AuthContext provider
│   │   ├── EventContext/           # Calendar events provider
│   │   ├── ProfileContext/         # User profile provider
│   │   └── WorkshopContext/        # Workshop data provider
│   ├── context/
│   │   ├── AdminCapabilityContext.jsx
│   │   └── AdminHubContext.jsx
│   ├── pages/                      # Route-level components
│   │   ├── Home/
│   │   ├── Login/
│   │   ├── Register/
│   │   ├── Verify/
│   │   ├── Profile/
│   │   ├── EditProfile/
│   │   ├── Workshops/
│   │   ├── MyWorkshops/
│   │   ├── EditWorkshop/
│   │   ├── AllProfiles/
│   │   ├── AdminHub/
│   │   ├── ForgotPassword/
│   │   └── ResetPassword/
│   ├── components/                 # Reusable UI
│   │   ├── Header/
│   │   ├── WorkshopCard/
│   │   ├── WorkshopParticipantsModal/
│   │   ├── FilterPanel/
│   │   ├── SearchBar/
│   │   ├── calendar/
│   │   ├── common/
│   │   ├── people/
│   │   └── Icons/
│   ├── utils/                      # Helpers
│   │   ├── apiFetch.js             # API wrapper (token injection, 401 refresh, CSRF)
│   │   ├── normalizeError.js
│   │   ├── errorTranslator.js
│   │   ├── validation.js
│   │   ├── normalizeEntity.js
│   │   ├── workshopDerivation.js
│   │   ├── adminHubClient.js
│   │   ├── captcha.js
│   │   └── formatters.js
│   ├── hooks/                      # Custom hooks
│   ├── constants/
│   └── styles/
├── tests/                          # Unit tests (node --test)
├── vite.config.js
└── package.json
```

### Server (`server/`)

```
server/
├── server.js                       # Express app, middleware stack, route mounting
├── models/
│   ├── User.js                     # User + FamilyMember subdocuments
│   ├── Workshop.js                 # Workshop + participants/waitlist
│   ├── AdminAuditLog.js
│   ├── RegistrationRequest.js
│   └── IdempotencyKey.js
├── controllers/
│   ├── authController.js           # Register, login, OTP, password reset
│   ├── userController.js           # User CRUD, entity updates
│   ├── workshopController.js       # Workshop CRUD, registration/unregistration
│   ├── adminHubController.js       # Admin dashboard endpoints
│   └── workshop.participants.js    # Participant list helpers
├── routes/
│   ├── auth.js                     # /api/auth/*
│   ├── users.js                    # /api/users/*
│   ├── workshops.js                # /api/workshops/*
│   ├── profile.js                  # /api/profile/*
│   ├── adminHub.js                 # /api/admin/hub/*
│   ├── adminWorkshops.js           # /api/admin/workshops/*
│   └── dev.js                      # Development-only routes
├── middleware/
│   ├── authMiddleware.js           # JWT verification, admin authorization
│   ├── validation.js               # Celebrate + Joi schemas
│   ├── captchaValidator.js         # reCAPTCHA / hCaptcha
│   ├── csrf.js                     # CSRF token issue & validation
│   ├── sanitizeBody.js             # XSS/template injection stripping
│   ├── adminPasswordMiddleware.js  # Admin hub secondary password
│   └── perUserRateLimit.js         # Per-user rate limit key derivation
├── services/
│   ├── AuditLogService.js          # Audit log CRUD
│   ├── AuditEventRegistry.js       # Event type enum
│   ├── AuditDetectionService.js    # Anomaly detection
│   ├── refreshTokenService.js      # Token rotation & reuse detection
│   ├── workshopRegistration.js     # Registration business logic
│   ├── workshopAuditService.js     # Data consistency audits
│   ├── emailService.js             # Email sending (Nodemailer/Resend)
│   ├── idempotency.js              # Idempotent request handling
│   ├── StaleUserDetector.js
│   ├── AdminHubService.js
│   └── entities/                   # Entity transformation pipeline
│       ├── buildEntity.js
│       ├── hydration.js
│       ├── normalize.js
│       └── resolveEntity.js
├── contracts/
│   ├── responseGuards.js           # Forbidden field stripping
│   ├── userContracts.js            # User response shapes
│   └── workshopContracts.js        # Workshop response shapes
├── utils/
│   ├── hashId.js                   # HMAC-SHA256 entity key generation
│   ├── accessScope.js              # Scope derivation (admin/self/parent/user/public)
│   ├── passwordHasher.js           # Argon2id + bcrypt with auto-upgrade
│   ├── sanitizeUser.js             # User field scoping
│   └── hmacUtil.js                 # HMAC helpers for audit
├── config/
│   ├── db.js                       # MongoDB connection
│   └── fallbackCities.json
├── tests/
│   ├── unit/
│   └── integration/
├── migrations/
├── jobs/
├── scripts/
└── package.json
```

---

## 4. Data Models

### User

Core user document with embedded family members, workshop maps, and auth state.

| Field Group | Fields |
|-------------|--------|
| Identity | `entityKey`, `hashedId`, `name`, `email`, `phone`, `city`, `idNumber`, `birthDate` |
| Auth | `passwordHash`, `hasPassword`, `passwordChangedAt`, `temporaryPassword` |
| OTP | `otpCode`, `otpExpires`, `otpAttempts`, `otpLastSent`, `otpLockUntil` |
| Password Reset | `passwordResetTokenHash`, `passwordResetTokenExpires`, `passwordResetTokenIssuedAt` |
| Authorization | `role`, `authorities` (select: false), `roleIntegrityHash`, `idNumberHash` |
| Sessions | `refreshTokens[]` (tokenHash, jti, issuedAt, expiresAt, revokedAt, replacedByJti) |
| Family | `familyMembers[]` (entityKey, name, relation, idNumber, phone, email, city, birthDate) |
| Workshop Maps | `userWorkshopMap[]`, `familyWorkshopMap[]` (familyMemberId + workshops) |
| Meta | `canCharge`, `createdAt`, `updatedAt` |

### Workshop

Workshop document with participant and waitlist subdocuments.

| Field Group | Fields |
|-------------|--------|
| Identity | `workshopKey` (UUID), `hashedId` |
| Details | `title`, `type`, `ageGroup`, `description`, `image`, `coach` |
| Location | `city`, `address`, `studio` |
| Schedule | `days[]`, `hour`, `sessionsCount`, `startDate`, `endDate`, `inactiveDates[]` |
| Capacity | `maxParticipants`, `participantsCount`, `waitingListMax`, `waitingListCount`, `autoEnrollOnVacancy` |
| Visibility | `available`, `adminHidden` |
| Pricing | `price` |
| Registrations | `participants[]`, `familyRegistrations[]`, `waitingList[]` |

### Supporting Models

| Model | Purpose |
|-------|---------|
| `RegistrationRequest` | Two-step OTP registration (pending → verified → consumed), 30-min TTL |
| `AdminAuditLog` | Mutation audit trail with HMAC-hashed subject keys, TTL-indexed |
| `IdempotencyKey` | Prevents duplicate workshop registrations, 1-hour TTL |

---

## 5. API Surface

### Route Mounting

```
/api/auth            → Auth (register, login, OTP, refresh, logout, password reset)
/api/workshops       → Workshops (list, search, register, waitlist, CRUD)
/api/users           → Users (profile, search, admin management)
/api/profile         → Profile (view, edit own profile)
/api/admin/hub       → Admin Hub (audit logs, alerts, stale users)
/api/admin/workshops → Admin Workshops (invariants)
```

### Endpoint Count by Domain

| Domain | Endpoints | Auth Required |
|--------|-----------|---------------|
| Auth | 14 | Mixed (most public) |
| Workshops | 17 | Mixed |
| Users/Profile | 16 | Required |
| Admin Hub | 5 | Admin + hub password |
| Admin Workshops | 1 | Admin |
| **Total** | **53** | |

### Middleware Stack (request order)

```
1.  Trust Proxy
2.  CORS
3.  Helmet (security headers, CSP, HSTS)
4.  Permissions-Policy
5.  Body parsing (JSON + URL-encoded, 1 MB limit)
6.  Cookie parser
7.  Response contract enforcement (wraps res.json)
--- API Router (/api) ---
8.  HPP (HTTP Parameter Pollution)
9.  sanitizeBody (XSS/template injection)
10. mongoSanitize (NoSQL injection)
11. compression
12. Global rate limiter (300/min)
13. Route-specific middleware (auth, validation, per-endpoint rate limits)
--- Error Handlers ---
14. Celebrate validation errors
15. CSRF token errors
16. Generic error handler
```

Full endpoint documentation: [`docs/api-flow.md`](api-flow.md)

---

## 6. Client Application

### Context Provider Stack

Ordered in `main.jsx` from outermost to innermost:

```
BrowserRouter
  EventProvider        ← Calendar/workshop event data
    AuthProvider       ← Token management, login/logout/register
      AdminCapabilityProvider  ← Probes admin access silently
        ProfileProvider        ← Current user profile & update handlers
          WorkshopProvider     ← Workshop datasets, filters, mutations
            App
```

### Routing

**Public routes** (unauthenticated):
- `/` — Home
- `/login` — Login (email/password or OTP)
- `/register` — Registration (OTP-verified)
- `/verify` — OTP verification

**Protected routes** (`isLoggedIn`):
- `/workshops` — Workshop listing with filters
- `/myworkshops` — User's registered workshops (calendar view)
- `/profile` — User profile
- `/forgot-password`, `/resetpassword` — Password recovery

**Admin routes** (`canAccessAdmin`):
- `/profiles` — All users list
- `/editprofile/:id` — Edit user profile
- `/editworkshop/:id` — Edit workshop
- `/editworkshop/new` — Create workshop
- `/admin/hub` — Admin dashboard (logs, alerts, stats)

### API Layer (`apiFetch.js`)

All API calls go through a unified fetch wrapper that handles:

1. **Bearer token injection** — reads `accessToken` from localStorage
2. **Silent 401 refresh** — on 401, calls `POST /api/auth/refresh`, stores new token, retries
3. **CSRF management** — fetches and attaches `X-CSRF-Token` for state-changing requests
4. **Error normalization** — maps HTTP status to UI-safe error kinds (see [`docs/error-normalization.md`](error-normalization.md))

---

## 7. Authentication & Authorization

### Auth Flows

| Flow | Steps |
|------|-------|
| **Registration** | `POST /register/request` (send OTP) → `POST /register/verify` (verify OTP, create user) |
| **Login** | `POST /login` (email + password → access token + refresh cookie) |
| **OTP Login** | `POST /send-otp` → `POST /verify` (passwordless) |
| **Token Refresh** | `POST /refresh` (rotate refresh token, issue new access token) |
| **Password Reset** | `POST /recover` (email link) → `POST /reset` (token + phone answer + new password) |
| **Logout** | `POST /logout` (clear cookie, remove session) |

### Token Architecture

| Token | Lifetime | Storage | Secret |
|-------|----------|---------|--------|
| Access (JWT) | 15 min default | Client localStorage | `JWT_SECRET` |
| Refresh (JWT) | 7 days default | HTTP-only cookie | `JWT_REFRESH_SECRET` |

- Refresh tokens stored as SHA-256 hashes in the User document
- Rotation on every refresh; reuse of revoked token clears all sessions
- Max 5 concurrent sessions (`REFRESH_TOKEN_CAP`)

### Admin Authorization

- No `isAdmin` boolean or role hints in any API response
- Admin scope derived from `User.authorities.admin` (select: false, never loaded by default)
- `authorizeAdmin` middleware gates admin endpoints
- Admin hub endpoints require a secondary password (`x-admin-password` header)
- Admin UI probes access via `GET /api/admin/hub/access` (204 = admin, 404 = not)

---

## 8. Entity Key System

Raw MongoDB `_id` values are never exposed in API responses. Every entity receives an opaque, deterministic identifier:

```
HMAC-SHA256(PUBLIC_ID_SECRET, "{type}:{_id}") → base64url → 22 characters
```

| Entity Type | Prefix | Generated In |
|-------------|--------|-------------|
| User | `"user"` | User pre-save hook |
| Family Member | `"family"` | User pre-save hook |
| Workshop | `"workshop"` | Workshop pre-save hook |

Response guards (`contracts/responseGuards.js`) enforce that `_id` never appears in any `res.json()` output. In development mode, a forbidden field triggers a 500 error; in production, it is silently stripped.

---

## 9. Deployment

### Render.com (`render.yaml`)

**Client** — deployed as a static site:
- Build: `npm run build` from `client/`
- Publish: `client/dist/`
- SPA fallback: `/* → /index.html`

**Server** — deployed as a web service (configured separately on Render):
- Start: `npm start` (`NODE_ENV=production node server.js`)
- Environment variables managed via Render dashboard

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `MONGODB_URI` | MongoDB Atlas connection string |
| `JWT_SECRET` | Access token signing |
| `JWT_REFRESH_SECRET` | Refresh token signing |
| `PUBLIC_ID_SECRET` | Entity key HMAC derivation |
| `ROLE_HASH_SECRET` | Role/ID integrity hashing |
| `AUDIT_HMAC_SECRET` | Audit log subject key hashing |
| `ALLOWED_ORIGINS` | CORS whitelist (comma-separated) |
| `ADMIN_HUB_PASSWORD` | Admin hub secondary password |
| `CAPTCHA_PROVIDER` | `"recaptcha"` or `"hcaptcha"` |
| `RECAPTCHA_SECRET` / `HCAPTCHA_SECRET` | CAPTCHA verification |

---

## 10. Development Setup

### Prerequisites

- Node.js >= 18.18.0
- MongoDB (local or Atlas)

### Running Locally

```bash
# Terminal 1 — Server
cd server
cp .env.example .env   # Configure env vars
npm install
npm run dev             # Nodemon on :5000

# Terminal 2 — Client
cd client
npm install
npm run dev             # Vite on :5173, proxies /api → :5000
```

### Commands

| Command | Directory | Description |
|---------|-----------|-------------|
| `npm run dev` | `client/` | Vite dev server on :5173 |
| `npm run build` | `client/` | Production build to `client/dist/` |
| `npm run lint` | `client/` | ESLint (flat config, .js/.jsx) |
| `npm run dev` | `server/` | Nodemon + NODE_ENV=development on :5000 |
| `npm start` | `server/` | NODE_ENV=production |
| `npm test` | `client/` | `node --test tests/**/*.test.js` |
| `npm test` | `server/` | `NODE_ENV=test node --test` (all tests) |
| `npm run k6` | `server/` | k6 load tests |
| `npm run artillery` | `server/` | Artillery load tests |

---

## 11. Testing

Both client and server use **Node.js built-in `node:test`** exclusively. No Jest or Mocha.

```bash
# Client — all tests
cd client && npm test

# Server — all tests
cd server && npm test

# Server — single test file
cd server && cross-env NODE_ENV=test node --test tests/unit/someFile.test.js
```

Server tests are split into `tests/unit/` and `tests/integration/`. Load tests use k6 and Artillery (`tests/k6/`, `tests/artillery/`).

---

## 12. Documentation Index

| Document | Description |
|----------|-------------|
| [`CLAUDE.md`](../CLAUDE.md) | Agent instructions and codebase context |
| [`docs/project.md`](project.md) | This file — project overview |
| [`docs/onboarding.md`](onboarding.md) | Onboarding flow, environment matrix, and working conventions |
| [`docs/runbook.md`](runbook.md) | Operations runbook for deploy checks, rollback, and incident triage |
| [`docs/ADR-index.md`](ADR-index.md) | Architecture/security ADR index and decision changelog |
| [`docs/api-flow.md`](api-flow.md) | Complete API endpoint catalog with middleware chains and data flows |
| [`docs/security.md`](security.md) | Security architecture — JWT, hashing, CSRF, rate limiting, audit, etc. |
| [`docs/suggestions-to-fix.md`](suggestions-to-fix.md) | Security audit findings and fix recommendations |
| [`docs/error-normalization.md`](error-normalization.md) | Error status mapping and UI-safe message allowlist |
| [`server/ADMIN_ACCESS.md`](../server/ADMIN_ACCESS.md) | Admin access model — no admin hints policy |
