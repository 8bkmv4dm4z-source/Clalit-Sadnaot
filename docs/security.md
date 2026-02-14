# Security Architecture Reference

Comprehensive documentation of all implemented security mechanisms in the MERN Workshop App.

---

## Table of Contents

1. [Authentication (JWT)](#1-authentication-jwt)
2. [Password Hashing](#2-password-hashing)
3. [Entity Key System](#3-entity-key-system)
4. [Response Guards & Contracts](#4-response-guards--contracts)
5. [Input Sanitization](#5-input-sanitization)
6. [Rate Limiting](#6-rate-limiting)
7. [CSRF Protection](#7-csrf-protection)
8. [CORS Configuration](#8-cors-configuration)
9. [Helmet & Security Headers](#9-helmet--security-headers)
10. [Audit System](#10-audit-system)
11. [OTP & Password Reset Flows](#11-otp--password-reset-flows)
12. [Integrity Hashing](#12-integrity-hashing)
13. [CAPTCHA Validation](#13-captcha-validation)
14. [Admin Access Model](#14-admin-access-model)
15. [Log Sanitization](#15-log-sanitization)
16. [Refresh Token Rotation & Reuse Detection](#16-refresh-token-rotation--reuse-detection)

---

## 1. Authentication (JWT)

**Files:** `server/controllers/authController.js`, `server/middleware/authMiddleware.js`

### Access Tokens

| Property | Value |
|----------|-------|
| Algorithm | HS256 (jsonwebtoken ^9.0.2) |
| Payload | `{ sub: entityKey, jti: uuid }` |
| Expiry | `JWT_EXPIRY` env var (default: `15m`) |
| Secret | `JWT_SECRET` env var |
| Transport | `Authorization: Bearer <token>` header |

- Tokens **must** include an `exp` claim; tokens without it are rejected (`authMiddleware.js:25-29`).
- On login, `passwordChangedAt` is checked to invalidate tokens issued before a password change (`authMiddleware.js:60-66`).
- The JWT `sub` claim contains the user's opaque `entityKey`, not the MongoDB `_id`.

### Refresh Tokens

| Property | Value |
|----------|-------|
| Expiry | `JWT_REFRESH_EXPIRY` env var (default: `7d`) |
| Secret | `JWT_REFRESH_SECRET` env var |
| Storage | HTTP-only cookie (`refreshToken`) |
| Max Sessions | `REFRESH_TOKEN_CAP` env var (default: `5`) |

- Refresh tokens are hashed with SHA-256 before storage; raw tokens are never persisted.
- Each refresh rotates the token (old one is revoked, new one issued).
- Reuse of a revoked token triggers **all sessions to be cleared** (reuse detection).
- Sessions are pruned on each refresh: expired tokens removed, oldest beyond cap discarded.

### Cookie Configuration

```
httpOnly: true
sameSite: process.env.COOKIE_SAMESITE || "Strict"
secure:   process.env.COOKIE_SECURE === "true" (or NODE_ENV === "production")
path:     "/api/auth"
```

### Token Verification Flow (`authMiddleware.js`)

1. Extract Bearer token from `Authorization` header.
2. Verify with `JWT_SECRET` (rejects expired/malformed).
3. Require both `sub` (or legacy `id`) and `exp` claims.
4. Resolve user via `User.findByEntityKey(decoded.sub)` (never by raw `_id` for new tokens).
5. Legacy fallback: `User.findById(decoded.id)` for older tokens.
6. Reject if `passwordChangedAt > token.iat`.
7. Validate role integrity hash (`user.isRoleIntegrityValid()`).
8. Require valid `entityKey` string.
9. Auto-refresh integrity hashes if missing.
10. Set `req.user` and `req.access` (derived scope).

---

## 2. Password Hashing

**File:** `server/utils/passwordHasher.js`

### Primary: Argon2id

| Parameter | Value |
|-----------|-------|
| Variant | `argon2id` |
| Memory Cost | 2^16 = 64 MB |
| Time Cost | 3 iterations |
| Parallelism | 1 |
| Package | `argon2` ^0.41.1 |

### Fallback: bcrypt

| Parameter | Value |
|-----------|-------|
| Salt Rounds | 12 |
| Package | `bcryptjs` ^2.4.3 |

### Auto-Upgrade

When a user logs in with a bcrypt-hashed password and Argon2 is available, the hash is transparently upgraded:

```
Login → verifyPassword(plain, storedHash)
      → if bcrypt hash detected (starts with "$2") and argon2 available
      → upgradeHashIfNeeded(userDoc, plain, currentHash)
      → re-hash with Argon2id → save
```

Detection: `isBcryptHash(hash)` checks for `$2` prefix. Argon2 hashes start with `$argon2`.

---

## 3. Entity Key System

**File:** `server/utils/hashId.js`

All MongoDB `_id` values are replaced with opaque, deterministic `entityKey` identifiers before any API response.

### Algorithm

```javascript
HMAC-SHA256(PUBLIC_ID_SECRET, "{type}:{_id}")
  → base64url encode
  → truncate to 22 characters
```

| Parameter | Value |
|-----------|-------|
| Algorithm | HMAC-SHA256 |
| Secret | `PUBLIC_ID_SECRET` env var (required) |
| Input | `"{type}:{mongoObjectId}"` |
| Output | 22-character base64url string |

### Entity Types

| Type Prefix | Used For |
|-------------|----------|
| `"user"` | User documents |
| `"family"` | Family member sub-documents |
| `"workshop"` | Workshop documents |

### Lifecycle

- **User pre-validate hook:** Ensures `entityKey` exists for user and all family members (`User.js:208-211`).
- **User pre-save hook:** Generates `hashedId` and family member entity keys (`User.js:213-227`).
- **Workshop pre-save hook:** Generates workshop `hashedId` (`Workshop.js:115`).
- `entityKey` and `hashedId` are indexed and unique.

---

## 4. Response Guards & Contracts

**File:** `server/contracts/responseGuards.js`, `server/utils/sanitizeUser.js`

### Forbidden Response Fields

Every API response is scrubbed of these fields before reaching the client:

**Base Forbidden Fields:**
`_id`, `__v`, `role`, `roles`, `permissions`, `authorities`, `isAdmin`, `passwordHash`, `otpCode`, `otpAttempts`, `otpExpires`, `otpLastSent`, `otpLockUntil`, `refreshTokens`, `internalIds`, `canCharge`, `adminHidden`, `auditFlags`, `roleIntegrityHash`, `idNumberHash`, `passwordResetTokenHash`, `passwordResetTokenExpires`, `passwordResetTokenIssuedAt`

**Contact Forbidden Fields** (applied when `forbidContactFields: true`):
`email`, `phone`, `idNumber`, `birthDate`

### Context-Aware Allowlists

The `deriveContextAllowlist(context)` function permits certain fields based on HTTP method + route:

| Context | Allowed Fields |
|---------|---------------|
| `GET /api/workshops?scope=admin` | `adminHidden` |
| `POST/PUT/PATCH/DELETE /api/workshops/*` | `adminHidden` |
| All other contexts | (none) |

### Enforcement

In `server.js`, every `res.json()` call is wrapped to run `enforceResponseContract()`:
- **Development:** Throws a 500 error if forbidden fields are detected (fail-fast).
- **Production:** Silently strips forbidden fields (fail-safe).

### User Sanitization Scopes

`sanitizeUser.js` provides scoped payloads:

| Scope | Use Case | Fields Included |
|-------|----------|----------------|
| `profile` | `/profile`, `/users/me` | entityKey, name, email, phone, city, birthDate, idNumber, canCharge + family |
| `identity` | `/getMe` | entityKey, name, email, phone, city, birthDate + minimal family |
| `full` | `/me`, admin views | All non-sensitive fields + complete family |
| `default` | Legacy clients | entityKey, name, email, phone, city + family |

---

## 5. Input Sanitization

### Global Body Sanitizer

**File:** `server/middleware/sanitizeBody.js`

Applied to `req.body`, `req.query`, and `req.params` before validation:

| Rule | Pattern | Effect |
|------|---------|--------|
| HTML removal | `/[<>]/g` | Strips `<` and `>` |
| Template injection | `/[{}\`$]/g` | Strips `{`, `}`, `` ` ``, `$` |
| Whitespace normalization | `/\s{3,}/g` | Collapses 3+ spaces to 1 |
| Trim | `.trim()` | Leading/trailing whitespace |

Processes recursively through objects and arrays.

### MongoDB Injection Prevention

**Package:** `express-mongo-sanitize` ^2.2.0

Applied as `mongoSanitize()` in the API middleware stack. Strips `$` and `.` operators from keys in request bodies/queries.

### Celebrate/Joi Validation

**File:** `server/middleware/validation.js`

- Text fields validated against `/^[^<>${}]{1,}$/` (blocks `<`, `>`, `$`, `{`, `}`).
- Emails normalized: `.email().lowercase().trim()`.
- Phones: `/^[0-9+\-\s]{6,20}$/`.
- ID numbers: `/^[0-9]{5,10}$/`.
- Entity keys: `/^[A-Za-z0-9_\-=]{10,200}$/`.
- Passwords: min 8, max 64, requires uppercase + lowercase + digit + special char.
- `confirmPassword` validated against `password` reference then `.strip()` (removed before DB).

### HTTP Parameter Pollution

**Package:** `hpp` ^0.2.x

Applied as first middleware in the API router to prevent parameter pollution attacks.

---

## 6. Rate Limiting

**Package:** `express-rate-limit` ^7.4.0

### Global Limiter

| Property | Value |
|----------|-------|
| Window | 60 seconds |
| Max Requests | 300 |
| Scope | All `/api/**` routes |
| Headers | `draft-7` standard |

### Auth Endpoint Limiters

| Limiter | Window | Max | Key | Applied To |
|---------|--------|-----|-----|-----------|
| `generalAuthLimiter` | 15 min | 5 | IP | `/login`, `/register`, `/register/request` |
| `perUserAuthLimiter` | 10 min | 10 | entityKey/email/IP | Auth endpoints |
| `otpLimiter` | 1 min | 3 | IP | `/send-otp`, `/verify`, `/recover`, `/reset` |
| `perUserOtpLimiter` | 10 min | 5 | entityKey/email/IP | OTP endpoints |
| `otpEmailLimiter` | 5 min | 3 | email | `/send-otp`, `/recover` |
| `registrationLimiter` | 1 hour | 3 | IP | `/register`, `/register/request` |
| `registrationVelocity` | 30 min | 5 | IP+email | `/register`, `/register/request` |
| `passwordResetEmailLimiter` | 1 hour | 5 | email | `/recover`, `/password/request` |

### Workshop Limiters

| Limiter | Window | Max | Key | Applied To |
|---------|--------|-----|-----|-----------|
| `workshopWriteLimiter` | 60 sec | 30 | IP | All `/api/workshops/**` routes |
| `participantActionLimiter` | 15 min | 15 | entityKey | Register/unregister/waitlist |
| `adminParticipantViewLimiter` | 10 min | 30 | entityKey | Participants/waitlist view |

### Admin Whitelist

Workshop write limiter can be bypassed by admins in `ADMIN_WHITELIST_IDS` or `ADMIN_WHITELIST_EMAILS` (comma-separated env vars). The skip function decodes the JWT to check identity.

### Per-User Key Generation (`perUserRateLimit.js`)

Key priority: `req.user.entityKey` > `req.body.entityKey` > `req.body.email` > `req.ip`

All limiters skip when `NODE_ENV === "loadtest"`. Localhost IPs (`127.0.0.1`, `::1`) skip `generalAuthLimiter`.

---

## 7. CSRF Protection

**File:** `server/middleware/csrf.js`

### Design

CSRF protection is scoped to cookie-reliant state-changing endpoints (refresh, logout, reset) to avoid breaking Bearer-token-only APIs.

### Token Generation

1. A 32-byte random secret is generated and stored in an `httpOnly` cookie (`csrf-secret`).
2. The CSRF token is derived: `HMAC-SHA256(secret, "csrf-token")` → hex digest.
3. The derived token is set in a readable cookie (`XSRF-TOKEN`, `httpOnly: false`).

### Token Validation

For `POST`, `PUT`, `PATCH`, `DELETE` requests:

1. Read the secret from `csrf-secret` cookie.
2. Derive the expected token.
3. Compare with candidate from (in order): `x-csrf-token` header, `x-xsrf-token` header, `_csrf` body, `_csrf` query.
4. **Timing-safe comparison** via `crypto.timingSafeEqual()`.

### Cookie Settings

| Cookie | httpOnly | sameSite | secure | path |
|--------|----------|----------|--------|------|
| `csrf-secret` | true | strict | prod only | `/` |
| `XSRF-TOKEN` | false | strict | prod only | `/` |

### Applied Endpoints

`/api/auth/csrf` (GET, bootstrap), `/api/auth/refresh` (POST), `/api/auth/logout` (POST), `/api/auth/reset` (POST).

---

## 8. CORS Configuration

**File:** `server/server.js:83-149`

### Origin Strategy

| Environment | Behavior |
|-------------|----------|
| Development | Allow all origins |
| Production | Strict whitelist from `ALLOWED_ORIGINS` env var + `PUBLIC_URL` |

Non-browser requests (no `Origin` header) are always permitted.

### Options

```
credentials:         true
methods:             GET, POST, PUT, PATCH, DELETE, OPTIONS
allowedHeaders:      Content-Type, Authorization, X-Requested-With, Accept, x-admin-password, X-CSRF-Token
exposedHeaders:      Content-Disposition, X-Entity-Scope
preflightContinue:   false
optionsSuccessStatus: 204
```

---

## 9. Helmet & Security Headers

**File:** `server/server.js:151-195`
**Package:** `helmet` ^7.1.0

### Helmet Configuration

| Header | Value |
|--------|-------|
| X-Frame-Options | `DENY` (frameguard) |
| X-Powered-By | Removed (hidePoweredBy) |
| Referrer-Policy | `no-referrer` |
| Cross-Origin-Resource-Policy | `cross-origin` |
| Cross-Origin-Opener-Policy | Disabled |

### HSTS (Production Only)

```
max-age: 31536000 (1 year)
includeSubDomains: true
preload: true
```

### Content Security Policy (Production Only)

```
default-src:     'self'
script-src:      'self' + CAPTCHA script sources
style-src:       'self'
img-src:         'self'
connect-src:     'self' + allowed origins + CAPTCHA connect sources
frame-src:       'self' + CAPTCHA frame sources
frame-ancestors: 'none'
base-uri:        'self'
object-src:      'none'
```

CAPTCHA sources are dynamically added based on `RECAPTCHA_SITE_KEY` / `HCAPTCHA_SITE_KEY` env vars.

### Permissions-Policy

```
geolocation=(), microphone=(), camera=(), payment=(), usb=()
```

### Password Reset Referrer Protection

`/resetpassword` routes have an explicit `Referrer-Policy: no-referrer` header to prevent token leakage via referrer (`server.js:362-365`).

---

## 10. Audit System

**Files:** `server/services/AuditLogService.js`, `server/models/AdminAuditLog.js`, `server/utils/hmacUtil.js`

### Subject Key Hashing

Audit logs store entity keys as HMAC-SHA256 hashes for privacy:

```javascript
hmacEntityKey(entityKey) → HMAC-SHA256(AUDIT_HMAC_SECRET, entityKey) → hex
```

Secret: `AUDIT_HMAC_SECRET` env var (falls back to `PUBLIC_ID_SECRET`).

### Retention

| Setting | Env Var | Default |
|---------|---------|---------|
| Retention days | `AUDIT_RETENTION_DAYS` | 3 days |
| Dedup window | `AUDIT_DEDUP_WINDOW_HOURS` | 12 hours |

MongoDB TTL index on `createdAt` automatically deletes expired logs.

### Metadata Sanitization

Before storing, metadata is recursively cleaned:
- Keys containing `password`, `token`, `otp`, `email`, `phone`, `idnumber`, `id_number`, `_id`, `id` are **removed**.
- String values truncated to 500 characters.

### Log Schema

```
eventType:      String (from AuditEventRegistry enum)
category:       String (from AuditCategories enum)
subjectType:    "user" | "familyMember" | "workshop"
subjectKey:     String (original entityKey)
subjectKeyHash: String (HMAC of entityKey)
actorKey:       String (entityKey of actor, or undefined for system)
metadata:       Object (sanitized)
createdAt:      Date (auto, TTL-indexed)
```

### Query API

`queryLogs()` supports filtering by `eventType`, `subjectType`, `subjectKey` (matched via HMAC), date range, pagination (max 200/page), and sort direction. Responses strip `_id`, `__v`, and `subjectKeyHash`.

---

## 11. OTP & Password Reset Flows

**File:** `server/controllers/authController.js`

### OTP Configuration

| Parameter | Value |
|-----------|-------|
| OTP length | 6 digits |
| OTP expiry | 5 minutes (login), 10 minutes (registration) |
| Cooldown between sends | 60 seconds |
| Max failed attempts | 5 |
| Lockout duration | 10 minutes |

### Enumeration Safety

All OTP-related endpoints return **identical generic responses** regardless of whether the user exists:

```json
{ "success": true, "message": "If the account is eligible, a verification code has been sent." }
```

A random delay of **150-350ms** is added before responding to prevent timing-based user enumeration.

### Login OTP Flow

1. `POST /api/auth/send-otp` → validate email → check lockout → check cooldown → generate OTP → send email → generic response.
2. `POST /api/auth/verify` → validate OTP → check lockout → check expiry → compare code → increment attempts on failure → lockout on 5th failure → issue tokens on success.

### Registration OTP Flow

1. `POST /api/auth/register/request` → validate payload → create/update `RegistrationRequest` document → generate OTP → send email.
2. `POST /api/auth/register/verify` → find pending request → verify OTP → create `User` → mark request as consumed.

Registration requests have a 30-minute TTL (`REGISTRATION_REQUEST_TTL_MS`).

### Password Reset Flow

1. `POST /api/auth/recover` → generate UUID reset token → SHA-256 hash → store `passwordResetTokenHash` + 30-minute expiry → send email with link.
2. `POST /api/auth/reset` → find user by hashed token → verify expiry → verify phone answer (last 4 digits) → hash new password → clear all refresh tokens → clear reset token.

---

## 12. Integrity Hashing

**File:** `server/models/User.js:154-242`

### Role Integrity Hash

Detects unauthorized role changes in the database.

```
SHA-256(ROLE_HASH_SECRET + ":" + userId + ":" + role) → hex
```

Secret: `ROLE_HASH_SECRET` env var (falls back to `JWT_SECRET`, then `"role-hash-fallback"`).

Stored in `user.roleIntegrityHash` (select: false). Verified on every authentication via `user.isRoleIntegrityValid()`. Mismatch returns `403 Role integrity check failed`.

### ID Number Integrity Hash

Detects unauthorized ID number changes.

```
SHA-256(ROLE_HASH_SECRET + ":" + idNumber) → hex
```

Stored in `user.idNumberHash` (select: false). Verified via `user.hasIdNumberIntegrity()`.

### Auto-Refresh

Both hashes are automatically recomputed on every `User.save()` via a pre-save hook (`User.js:239-242`). If missing during authentication, they are lazily regenerated (`authMiddleware.js:81-88`).

---

## 13. CAPTCHA Validation

**File:** `server/middleware/captchaValidator.js`

### Dual Provider Support

| Provider | Env Var | Verify URL |
|----------|---------|-----------|
| reCAPTCHA | `RECAPTCHA_SECRET` | `https://www.google.com/recaptcha/api/siteverify` |
| hCaptcha | `HCAPTCHA_SECRET` | `https://hcaptcha.com/siteverify` |

Active provider selected by `CAPTCHA_PROVIDER` env var (`"recaptcha"` or `"hcaptcha"`).

### Token Sources

Accepted from (in order): `req.body.captchaToken`, `x-captcha-token` header, provider-specific body field (`g-recaptcha-response` or `h-recaptcha-response`).

### Behavior

| Environment | No Provider Configured | Missing Token | Failed Verification |
|-------------|----------------------|---------------|-------------------|
| Production | 503 Service Unavailable | 400 Required | 403 Failed |
| Development | Skip (pass through) | 400 Required | 403 Failed |

### Applied Endpoints

`/login`, `/send-otp`, `/verify` (OTP), `/recover`, `/password/request`, `/reset`.

---

## 14. Admin Access Model

**File:** `server/ADMIN_ACCESS.md`, `server/middleware/authMiddleware.js`

### Core Principle

**No admin hints are ever exposed in API payloads.** There is no `isAdmin` boolean, no `role` string, and no admin metadata in any response. Admin UI infers access by attempting privileged endpoints and reacting to success/failure.

### Authorization Derivation

```javascript
hasAuthority(user, "admin") → user.authorities.admin === true
```

- `authorities` is stored in MongoDB with `select: false` (never loaded by default).
- `authMiddleware.js` explicitly selects `+authorities` for authentication.
- `authorizeAdmin` middleware returns `403 Admin access only` for non-admins.

### Admin Hub Secondary Password

Some admin hub endpoints (`/logs`, `/alerts`, `/stale-users`, `/stats`) require an additional password via the `x-admin-password` header. This is compared using `crypto.timingSafeEqual()` against `ADMIN_HUB_PASSWORD` env var. If the env var is not configured, the endpoint returns `500` (fail-closed).

### Opaque Admin Probe

`GET /api/admin/hub/access` returns `204 No Content` for admins and `404` for non-admins, providing no information about admin existence.

---

## 15. Log Sanitization

**File:** `server/server.js:55-81`

### Console Interception

All four console methods (`log`, `info`, `warn`, `error`) are wrapped to scrub sensitive data before output.

### Scrub Patterns

| Pattern | Replacement |
|---------|-------------|
| `Bearer <token>` | `Bearer ***` |
| `"password": "<value>"` | `"password": "***"` |
| `"pass": "<value>"` | `"pass": "***"` |
| `"token": "<value>"` | `"token": "***"` |
| `"secret": "<value>"` | `"secret": "***"` |
| `"authorization": "<value>"` | `"authorization": "***"` |
| `"otp": "<value>"` | `"otp": "***"` |
| `"code": "<value>"` | `"code": "***"` |

Objects are `JSON.stringify()`-ed before scrubbing.

### File Logging

Scrubbed log output is also persisted to `logs/server.log` with ISO timestamp and level prefix. Log persistence errors are silently ignored.

---

## 16. Refresh Token Rotation & Reuse Detection

**File:** `server/services/refreshTokenService.js`

### Token Storage

Refresh tokens are stored as an array of session objects on the User document:

```
tokenHash:     SHA-256(rawToken)
jti:           JWT ID
issuedAt:      Date
expiresAt:     Date
lastUsedAt:    Date
revokedAt:     Date (null until rotated)
replacedByJti: String (JTI of replacement token)
userAgent:     String
```

### Rotation Process

1. Find session matching the presented token (timing-safe comparison).
2. If not found → **reuse detected** → clear ALL sessions.
3. If already revoked (`revokedAt !== null`) → **reuse detected** → clear ALL sessions.
4. Mark old session as revoked (`revokedAt = now`).
5. Record replacement chain (`replacedByJti = newToken.jti`).
6. Create new session from the new token.
7. Normalize: prune expired sessions, enforce cap.

### Session Management

- **Max concurrent sessions:** 5 (configurable via `REFRESH_TOKEN_CAP`).
- **Pruning:** Expired sessions removed on every rotation.
- **Cap enforcement:** Oldest sessions (by `lastUsedAt`) discarded when over cap.
- **Sorting:** Most recently used sessions kept first.

---

## Middleware Stack Order

The full middleware stack in `server.js`, applied in order:

```
1. Trust Proxy (TRUST_PROXY_HOPS, default 1)
2. CORS (global, before Helmet)
3. Helmet (security headers, CSP, HSTS)
4. Permissions-Policy header
5. Body parsing (JSON 1MB limit, URL-encoded 1MB limit)
6. Cookie parser
7. Response contract enforcement (wraps res.json)
─── API Router (/api) ───
8. HPP (HTTP Parameter Pollution)
9. sanitizeBody (XSS/template injection)
10. mongoSanitize (NoSQL injection)
11. compression (gzip)
12. Global rate limiter (300/min)
13. Route-specific middleware (auth, validation, per-endpoint rate limits)
─── Error Handlers ───
14. Celebrate validation errors
15. CSRF token errors (EBADCSRFTOKEN → 403)
16. Generic error handler (hides details in production)
```

---

## Security-Critical Environment Variables

| Variable | Purpose |
|----------|---------|
| `JWT_SECRET` | Access token signing |
| `JWT_REFRESH_SECRET` | Refresh token signing |
| `JWT_EXPIRY` | Access token lifetime |
| `JWT_REFRESH_EXPIRY` | Refresh token lifetime |
| `PUBLIC_ID_SECRET` | Entity key HMAC derivation |
| `ROLE_HASH_SECRET` | Role/ID integrity hashing |
| `AUDIT_HMAC_SECRET` | Audit log subject key hashing |
| `ADMIN_HUB_PASSWORD` | Secondary admin authentication |
| `CAPTCHA_PROVIDER` | CAPTCHA service selection |
| `RECAPTCHA_SECRET` / `HCAPTCHA_SECRET` | CAPTCHA verification |
| `COOKIE_SAMESITE` | Cookie SameSite policy |
| `COOKIE_SECURE` | Cookie Secure flag |
| `ALLOWED_ORIGINS` | CORS whitelist |
| `REFRESH_TOKEN_CAP` | Max concurrent sessions |
| `AUDIT_RETENTION_DAYS` | Audit log TTL |
| `AUDIT_DEDUP_WINDOW_HOURS` | Audit dedup window |

---

## Security Packages

| Package | Version | Purpose |
|---------|---------|---------|
| `argon2` | ^0.41.1 | Primary password hashing |
| `bcryptjs` | ^2.4.3 | Fallback password hashing |
| `jsonwebtoken` | ^9.0.2 | JWT sign/verify |
| `helmet` | ^7.1.0 | Security headers |
| `cors` | ^2.8.5 | Cross-origin policy |
| `express-rate-limit` | ^7.4.0 | Rate limiting |
| `express-mongo-sanitize` | ^2.2.0 | NoSQL injection prevention |
| `hpp` | ^0.2.x | HTTP parameter pollution |
| `celebrate` / `joi` | Latest | Request validation |
