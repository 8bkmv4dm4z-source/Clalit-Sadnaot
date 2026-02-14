# API Endpoint & Data Flow Reference

Complete catalog of all API endpoints with middleware chains, request/response shapes, and data flow descriptions.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Authentication API](#authentication-api-apiauth)
3. [Workshops API](#workshops-api-apiworkshops)
4. [Users API](#users-api-apiusers)
5. [Profile API](#profile-api-apiprofile)
6. [Admin Hub API](#admin-hub-api-apiadminhub)
7. [Admin Workshops API](#admin-workshops-api-apiadminworkshops)
8. [Data Models](#data-models)
9. [Entity Transformation Pipeline](#entity-transformation-pipeline)
10. [Data Flow Diagrams](#data-flow-diagrams)

---

## Architecture Overview

### Request/Response Flow

```
Client (React + apiFetch)
    |
    v
/api/** routes
    |
    v
Global Middleware: CORS → Helmet → Body Parse → Cookie Parse → Response Contract
    |
    v
API Middleware: HPP → sanitizeBody → mongoSanitize → compression → Global Rate Limit
    |
    v
Route Middleware: Rate Limiters → Auth → CSRF → CAPTCHA → Validation (Celebrate/Joi)
    |
    v
Controller (business logic)
    |
    v
Service Layer → Models (MongoDB via Mongoose)
    |
    v
Entity Shaping (sanitizeUser, formatParticipant)
    |
    v
Response Contract Guard (strip forbidden fields)
    |
    v
Client receives sanitized JSON
```

### Identity Model

- **entityKey**: HMAC-SHA256 derived opaque identifier (22 chars, base64url). Replaces `_id` in all API responses.
- **hashedId**: Alias of entityKey for backward compatibility.
- **_id**: MongoDB ObjectId, internal only, never exposed to clients.

### Route Mounting (`server.js`)

```
/api/workshops       → workshopWriteLimiter → workshopsRouter
/api/auth            → authRouter
/api/users           → usersRouter
/api/profile         → profileRouter
/api/admin/hub       → adminHubRoutes
/api/admin/workshops → adminWorkshopsRoutes
```

---

## Authentication API (`/api/auth`)

**File:** `server/routes/auth.js`, `server/controllers/authController.js`

### GET /csrf

Issues a CSRF token for cookie-reliant endpoints.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | csrfProtection, issueCsrfToken |
| **Response** | `{ csrfToken: string }` |

---

### POST /register/request

Initiates two-step registration by sending an OTP email.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | generalAuthLimiter → perUserAuthLimiter → registrationLimiter → enforceRegistrationVelocity → validateRegistrationRequest |
| **Request** | `{ name, email, password, phone?, idNumber?, birthDate?, city?, canCharge?, familyMembers?: [{ name, relation, idNumber?, phone?, email?, city?, birthDate? }] }` |
| **Response** | `{ success: true, message: "If eligible, OTP sent" }` (enumeration-safe) |
| **Models** | RegistrationRequest (create/update) |
| **Side Effects** | Sends OTP email, creates RegistrationRequest document |

---

### POST /register/verify

Verifies OTP and completes registration.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | otpLimiter → perUserOtpLimiter → otpEmailLimiter → validateRegistrationOtp |
| **Request** | `{ email, otp }` |
| **Response** | `{ success: true, user: toOwnerUser(user) }` |
| **Models** | RegistrationRequest (lookup), User (create) |
| **Side Effects** | Creates User, marks RegistrationRequest as verified |

---

### POST /register

Direct registration (legacy, without OTP step).

| | |
|-|-|
| **Auth** | None |
| **Middleware** | generalAuthLimiter → perUserAuthLimiter → registrationLimiter → enforceRegistrationVelocity → validateRegister |
| **Request** | `{ name, email, password, phone?, idNumber?, birthDate?, city?, canCharge?, familyMembers? }` |
| **Response** | `{ success: true, message: "Registration accepted" }` (enumeration-safe) |
| **Models** | User (create) |

---

### POST /login

Authenticates user and issues JWT + refresh token.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | generalAuthLimiter → perUserAuthLimiter → requireCaptcha → validateLogin |
| **Request** | `{ email, password }` |
| **Response** | `{ accessToken: jwt, user: toOwnerUser(user) }` |
| **Models** | User (lookup by email, select +passwordHash +authorities) |
| **Side Effects** | Creates refresh token session, sets httpOnly cookie, auto-upgrades bcrypt → Argon2id |

---

### POST /send-otp

Sends OTP for passwordless login.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | otpLimiter → otpEmailLimiter → perUserOtpLimiter → requireCaptcha → validateSendOtp |
| **Request** | `{ email }` |
| **Response** | `{ success: true, message: "If eligible, OTP sent" }` (enumeration-safe) |
| **Models** | User (update otpCode, otpExpires) |
| **Side Effects** | Generates 6-digit OTP, sends email |

---

### POST /verify

Verifies OTP and issues login tokens.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | otpLimiter → perUserOtpLimiter → requireCaptcha → validateOTP |
| **Request** | `{ email, otp }` |
| **Response** | `{ accessToken: jwt, user: toOwnerUser(user) }` |
| **Models** | User (verify OTP, update refreshTokens) |
| **Side Effects** | Clears OTP fields, creates refresh session, sets cookie |

---

### POST /recover

Initiates password reset (sends reset link).

| | |
|-|-|
| **Auth** | None |
| **Middleware** | otpLimiter → otpEmailLimiter → passwordResetEmailLimiter → requireCaptcha → validatePasswordResetRequest |
| **Request** | `{ email }` |
| **Response** | `{ success: true, message: "If eligible, reset link sent" }` (enumeration-safe) |
| **Models** | User (store passwordResetTokenHash) |
| **Side Effects** | Generates UUID reset token, SHA-256 hashes it, sends email |

---

### POST /password/request

Alias for `/recover`.

---

### POST /reset

Validates reset token and updates password.

| | |
|-|-|
| **Auth** | None |
| **Middleware** | otpLimiter → requireCaptcha → csrfProtection → issueCsrfToken → validatePasswordReset |
| **Request** | `{ token, newPassword, phoneAnswer }` |
| **Response** | `{ success: true, message: "Password reset successfully" }` |
| **Models** | User (lookup by hashed token, update passwordHash) |
| **Side Effects** | Updates password, clears all refresh tokens (forces re-login), clears reset token |

---

### POST /refresh

Refreshes access token via httpOnly cookie.

| | |
|-|-|
| **Auth** | None (uses refresh token cookie) |
| **Middleware** | perUserAuthLimiter → csrfProtection → issueCsrfToken |
| **Response** | `{ accessToken: jwt }` + new refresh cookie |
| **Models** | User (rotate refreshTokens) |
| **Side Effects** | Rotates refresh token, prunes expired sessions, reuse detection |

---

### POST /logout

Clears refresh token and logs out.

| | |
|-|-|
| **Auth** | None (uses refresh token cookie) |
| **Middleware** | csrfProtection → issueCsrfToken |
| **Response** | `{ success: true }` |
| **Models** | User (remove refresh token session) |
| **Side Effects** | Clears cookie, removes session from array |

---

### GET /me

Retrieves authenticated user profile.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate |
| **Response** | `toOwnerUser(user)` with entities array |
| **Models** | User |

---

### PUT /password

Updates authenticated user's password.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → validatePasswordChange |
| **Request** | `{ currentPassword, newPassword }` |
| **Response** | `{ success: true, message: "Password updated" }` |
| **Side Effects** | Updates password hash, clears all refresh tokens |

---

## Workshops API (`/api/workshops`)

**Files:** `server/routes/workshops.js`, `server/controllers/workshopController.js`

All workshop routes go through `workshopWriteLimiter` (30/min) at the router level.

### GET /meta/cities

Returns available workshop cities for filter dropdowns.

| | |
|-|-|
| **Auth** | None |
| **Response** | `{ cities: string[] }` (or fallback from `config/fallbackCities.json`) |
| **Models** | Workshop (aggregate distinct cities) |

---

### GET /meta/validate-address, GET /validate-address

Validates a workshop address against OSM or southern city fallback.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin |
| **Query** | `{ city, address, studio? }` |
| **Response** | `{ valid: boolean, source: string, message: string }` |

---

### GET /

Lists all workshops (access-scoped visibility).

| | |
|-|-|
| **Auth** | None (scope varies by auth state) |
| **Query** | `{ page?, limit?, filter? }` |
| **Response** | `toPublicWorkshop[]` (public) / `toUserWorkshop[]` (user) / `toAdminWorkshop[]` (admin) |
| **Models** | Workshop (find `{ available: true, adminHidden: false }` for non-admin) |

---

### GET /search

Searches workshops by text query and filters.

| | |
|-|-|
| **Auth** | None |
| **Query** | `{ q, city?, coach?, type?, day?, hour?, ageGroup?, available?, page?, limit? }` |
| **Response** | Access-scoped workshop array |
| **Models** | Workshop ($text index on title, description, coach, type, city) |

---

### GET /registered

Lists workshops the authenticated user is registered in.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate |
| **Response** | Workshop array (user view) |
| **Models** | User (userWorkshopMap + familyWorkshopMap), Workshop |

---

### GET /:id

Retrieves a single workshop by workshopKey or hashedId.

| | |
|-|-|
| **Auth** | None (visibility checks applied) |
| **Response** | `toPublicWorkshop` / `toUserWorkshop` / `toAdminWorkshop` |
| **Models** | Workshop (rejects hidden workshops for non-admins) |

---

### GET /:id/participants (Admin)

Lists workshop participants.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin → adminParticipantViewLimiter (30/10min) |
| **Response** | `{ participants: [], familyRegistrations: [], counts: { participantsCount, familyRegistrationsCount } }` |
| **Models** | Workshop (populate participants) |

---

### GET /:id/waitlist (Admin)

Lists workshop waitlist.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin → adminParticipantViewLimiter |
| **Response** | `{ waitingList: [], count: number }` |

---

### POST /

Creates a new workshop (admin only).

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin → validateWorkshopCreate |
| **Request** | `{ title, type, ageGroup, city, address, studio, coach, days, hour, sessionsCount, startDate, endDate?, inactiveDates?, price, available, adminHidden?, description, image, maxParticipants, waitingListMax, autoEnrollOnVacancy? }` |
| **Response** | `toAdminWorkshop(workshop)` |
| **Side Effects** | Generates workshopKey (UUID), computes endDate, audit log |

---

### PUT /:id

Updates a workshop (admin only).

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin → validateWorkshopEdit |
| **Request** | Partial workshop fields |
| **Response** | `toAdminWorkshop(workshop)` |
| **Side Effects** | Recalculates endDate if schedule changed, audit log |

---

### DELETE /:id

Deletes a workshop (admin only).

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin |
| **Response** | `{ success: true, message: "Workshop deleted" }` |
| **Side Effects** | Removes all user registrations (userWorkshopMap/familyWorkshopMap), audit log |

---

### POST /:id/register-entity

Registers a user or family member to a workshop.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → participantActionLimiter (15/15min) → validateWorkshopRegistration |
| **Request** | `{ entityKey, parentKey?, familyMemberId? }` |
| **Response** | `{ success: true, workshop: toUserWorkshop(workshop) }` |
| **Models** | User, Workshop, IdempotencyKey |
| **Side Effects** | Adds to participants/familyRegistrations or waitlist, updates user maps, idempotency key, audit log |

---

### DELETE /:id/unregister-entity

Unregisters an entity from a workshop.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → participantActionLimiter → validateWorkshopUnregister |
| **Query** | `{ entityKey, parentKey? }` |
| **Response** | `{ success: true, workshop: toUserWorkshop(workshop) }` |
| **Side Effects** | Removes from participants, updates user maps, waitlist promotion, audit log |

---

### POST /:id/waitlist-entity

Adds an entity to the workshop waitlist.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → participantActionLimiter → validateWaitlistEntity |
| **Request** | `{ entityKey, parentKey?, familyMemberId? }` |
| **Response** | `{ success: true, workshop: toUserWorkshop(workshop) }` |

---

### DELETE /:id/waitlist-entity

Removes an entity from the workshop waitlist.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → participantActionLimiter → validateWaitlistEntity |
| **Query** | `{ entityKey, parentKey? }` |

---

### POST /:id/export (Admin)

Exports workshop participants to Excel file.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin |
| **Response** | Binary xlsx file with `Content-Disposition` header |

---

### GET /audit/run (Admin)

Runs workshop data consistency audit.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin |
| **Response** | `{ success: true, result: auditResult }` |
| **Services** | workshopAuditService |

---

## Users API (`/api/users`)

**Files:** `server/routes/users.js`, `server/controllers/userController.js`

### GET /getMe

Retrieves compact identity for authenticated user.

| | |
|-|-|
| **Auth** | Bearer token |
| **Response** | `{ entityKey, name, email, phone, city, birthDate, entities }` |

---

### GET /search

Searches users and family members.

| | |
|-|-|
| **Auth** | Bearer token |
| **Query** | `{ q, limit?, page? }` |
| **Response** | Admin: `toAdminListEntity[]` (global). User: `toListEntity[]` (family-scoped, no contact fields) |
| **Models** | User ($text index) |

---

### GET / (Admin)

Lists all users.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin |
| **Response** | `toAdminListEntity[]` (flattened: users + family members as individual rows) |

---

### GET /audit/report (Admin)

Data integrity audit report.

| | |
|-|-|
| **Auth** | Admin |
| **Response** | `{ issues: [], summary: { total, warning, error } }` |

---

### POST / (Admin)

Creates a new user.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin → validateUserRegistration |
| **Request** | `{ name, email, phone?, idNumber?, birthDate?, city?, canCharge?, familyMembers? }` |
| **Response** | `toAdminListEntity(user)` |

---

### DELETE /by-entity/:entityKey (Admin)

Deletes a user by entityKey.

| | |
|-|-|
| **Auth** | Admin |
| **Response** | `{ success: true }` |
| **Side Effects** | Removes from all workshops, audit log |

---

### DELETE /:id (Admin)

Legacy: deletes a user (treats `:id` as entityKey).

---

### GET /:id/workshops (Admin)

Lists workshops a user/family is registered in.

| | |
|-|-|
| **Auth** | Admin |
| **Response** | `{ userWorkshops: [], familyWorkshops: Map }` |

---

### GET /entity/:id

Fetches an entity (user or family member) by entityKey.

| | |
|-|-|
| **Auth** | Bearer token (self or family of self) |
| **Response** | `toSelfProfileEntity(entity)` |

---

### GET /:id

Fetches a user by entityKey.

| | |
|-|-|
| **Auth** | Bearer token (self or admin) |
| **Response** | `toOwnerUser(user)` |

---

### PUT /update-entity

Updates a user or family member.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → validateUserEdit |
| **Request** | `{ entityKey, updates: { name?, email?, phone?, city?, birthDate?, idNumber?, canCharge? } }` |
| **Response** | `toSelfProfileEntity(entity)` |

---

## Profile API (`/api/profile`)

**Files:** `server/routes/profile.js`

### GET /

Retrieves authenticated user profile.

| | |
|-|-|
| **Auth** | Bearer token |
| **Response** | `toOwnerUser(user)` (includes entities + family) |

---

### PUT /edit

Edits the authenticated user's own profile.

| | |
|-|-|
| **Auth** | Bearer token |
| **Middleware** | authenticate → validateProfile |
| **Request** | `{ name?, email?, phone?, city?, birthDate?, idNumber? }` |
| **Response** | Updated entity |

Internally injects `req.body.entityKey` from JWT before calling `userController.updateEntity`.

---

### GET /all (Admin)

Lists all users (alias for `/api/users`).

---

### DELETE /by-entity/:entityKey (Admin)

Deletes a user (alias for `/api/users/by-entity/:entityKey`).

---

### DELETE /:id (Admin)

Legacy delete (alias).

---

## Admin Hub API (`/api/admin/hub`)

**File:** `server/routes/adminHub.js`, `server/controllers/adminHubController.js`

All routes require: `authenticate` → `authorizeAdmin` (+ `requireAdminHubPassword` for most).

### GET /access

Opaque readiness probe for admin UI.

| | |
|-|-|
| **Auth** | Admin |
| **Response** | 204 No Content (admin), 404 (non-admin) |

---

### GET /logs

Retrieves audit logs.

| | |
|-|-|
| **Auth** | Admin + hub password |
| **Query** | `{ eventType?, subjectType?, subjectKey?, from?, to?, page?, limit?, sort? }` |
| **Response** | `{ logs: auditLog[] }` (sanitized, no _id, no __v) |
| **Services** | AuditLogService.queryLogs |

---

### GET /alerts/maxed-workshops

Lists workshops at or over capacity.

| | |
|-|-|
| **Auth** | Admin + hub password |
| **Response** | `{ alerts: [{ workshopKey, title, participantsCount, maxParticipants }] }` |

---

### GET /stale-users

Lists users inactive for a period.

| | |
|-|-|
| **Auth** | Admin + hub password |
| **Response** | `{ staleUsers: [{ name, email, lastActivity, registeredAt }] }` |

---

### GET /stats

Placeholder stats endpoint.

| | |
|-|-|
| **Auth** | Admin + hub password |
| **Response** | 501 Not Implemented |

---

## Admin Workshops API (`/api/admin/workshops`)

**File:** `server/routes/adminWorkshops.js`

### GET /invariants

Returns workshop data constraints and validation rules.

| | |
|-|-|
| **Auth** | Admin |
| **Middleware** | authenticate → authorizeAdmin |
| **Response** | `{ maxParticipants: { min, max }, maxSessions: { min, max }, allowedDays: [] }` |

---

## Data Models

### User

```
entityKey           String  (unique, indexed) - HMAC-SHA256 of _id
hashedId            String  (unique, indexed) - alias of entityKey
name                String
email               String  (required, unique, indexed)
phone               String
city                String
idNumber            String
birthDate           String  (YYYY-MM-DD)
canCharge           Boolean (default: false)

passwordHash        String  (select: false)
hasPassword         Boolean
temporaryPassword   Boolean
passwordChangedAt   Date

otpCode             String  (select: false)
otpExpires          Number
otpAttempts         Number  (select: false)
otpLastSent         Number  (select: false)
otpLockUntil        Number  (select: false)

passwordResetTokenHash     String  (select: false)
passwordResetTokenExpires  Number
passwordResetTokenIssuedAt Date

role                String  (enum: [user, admin], default: user)
authorities         Object  ({ admin: Boolean }, select: false)
roleIntegrityHash   String  (select: false)
idNumberHash        String  (select: false)

refreshTokens       [{ tokenHash, jti, issuedAt, expiresAt, lastUsedAt,
                       revokedAt, replacedByJti, userAgent }]

familyMembers       [{ entityKey, name, relation, idNumber, phone,
                       email, city, birthDate }]

userWorkshopMap     [ObjectId ref Workshop]
familyWorkshopMap   [{ familyMemberId: ObjectId, workshops: [ObjectId] }]

createdAt           Date (auto)
updatedAt           Date (auto)
```

### Workshop

```
workshopKey         String  (UUID, unique, indexed)
hashedId            String  (unique, indexed)

title               String  (required)
type                String
ageGroup            String
description         String
image               String  (default: "functional_training")

city                String  (required, indexed)
address             String
studio              String
coach               String

days                [String] (e.g., ["Monday", "Wednesday"])
hour                String
sessionsCount       Number  (default: 4, min: 1)
startDate           Date
endDate             Date    (auto-computed from startDate + days + sessionsCount)
inactiveDates       [Date]

price               Number  (default: 0)
available           Boolean (default: true)
adminHidden         Boolean (default: false, indexed)

maxParticipants     Number  (default: 20)
participantsCount   Number  (default: 0)
waitingListMax      Number  (default: 10)
waitingListCount    Number  (default: 0)
autoEnrollOnVacancy Boolean (default: false)

participants        [ObjectId ref User]
familyRegistrations [{ parentUser, familyMemberId, parentKey, familyMemberKey,
                       name, relation, idNumber, phone, birthDate }]
waitingList         [{ parentUser, familyMemberId, parentKey, familyMemberKey,
                       name, relation, idNumber, phone, birthDate }]

createdAt           Date (auto)
updatedAt           Date (auto)
```

### RegistrationRequest

```
name           String  (required)
email          String  (required, indexed)
phone          String
idNumber       String
birthDate      String
city           String
canCharge      Boolean (default: false)
passwordHash   String
otpCode        String  (select: false)
otpExpires     Number
otpAttempts    Number  (select: false)
familyMembers  [same schema as User]
status         String  (enum: [pending, verified, expired, cancelled, consumed])
expiresAt      Date    (30 minutes default)
completedAt    Date
userId         ObjectId ref User
meta           { ip, userAgent, otpLastSent }
```

### AuditLog (AdminAuditLog)

```
eventType      String  (from AuditEventRegistry enum)
category       String  (from AuditCategories enum)
subjectType    String  (enum: [user, familyMember, workshop])
subjectKey     String
subjectKeyHash String  (HMAC-SHA256)
actorKey       String
metadata       Object
createdAt      Date    (TTL-indexed for auto-deletion)
```

### IdempotencyKey

```
requestKey     String  (indexed, derived from method + path + body hash)
actorKey       String
responseStatus Number
responseBody   Object
expiresAt      Date    (TTL index, default 1 hour)
createdAt      Date
```

---

## Entity Transformation Pipeline

### Pipeline Steps

```
Raw MongoDB Document
    |
    v
1. Hydration: Extract fields, inherit from parent for family members
    |
    v
2. Normalization: Trim strings, lowercase email, sanitize phone
    |
    v
3. Shaping: Select allowed fields based on scope (profile/identity/full/admin)
    |
    v
4. Entity Flags: Add entityType, isFamily, parentKey, parentName, etc.
    |
    v
5. Response Contract: Strip all forbidden fields (enforceResponseContract)
    |
    v
Sanitized JSON to Client
```

### Entity Shaping Functions

| Function | Use Case | Key Fields |
|----------|----------|-----------|
| `toOwnerUser` | User's own profile | entityKey, name, email, phone, city, birthDate, idNumber, familyMembers, entities |
| `toAdminUser` | Admin view of user | entityKey, name, email, phone, city, familySummary |
| `toPublicUser` | Public view | entityKey, name, city |
| `toListEntity` | Non-admin list row | entityKey, name, city, relation |
| `toAdminListEntity` | Admin list row | entityKey, name, email, phone, city, birthDate, relation, parentKey, parentName, entityType, isFamily |
| `toSelfProfileEntity` | Profile edit form | entityKey, name, email, phone, city, birthDate, idNumber, relation, entityType |

### Access Scopes

Derived in `server/utils/accessScope.js`:

| Scope | Condition | Used For |
|-------|-----------|----------|
| `admin` | `authorities.admin === true` | Full data access |
| `self` | Requester entityKey matches target | Own profile |
| `parent` | Requester is target's parent user | Family member access |
| `user` | Authenticated, non-admin | Limited data |
| `public` | Not authenticated | Public data only |
| `none` | No access | Rejected |

---

## Data Flow Diagrams

### User Registration with OTP

```
Client                          Server
  |                               |
  |-- POST /register/request ---->|
  |   { email, password, name }   |
  |                               |-- Validate & rate-limit
  |                               |-- Normalize payload
  |                               |-- Create RegistrationRequest (OTP + 10min expiry)
  |                               |-- Send OTP email
  |<---- { success: true } -------|  (generic response)
  |                               |
  |-- POST /register/verify ----->|
  |   { email, otp }              |
  |                               |-- Find pending RegistrationRequest
  |                               |-- Verify OTP (not expired, correct code)
  |                               |-- Create User (hash password, generate entityKey)
  |                               |-- Mark request as consumed
  |<---- { user: toOwnerUser } ---|
```

### Workshop Registration (Idempotent)

```
Client                          Server
  |                               |
  |-- POST /:id/register-entity ->|
  |   { entityKey, parentKey? }   |
  |                               |-- Authenticate (JWT)
  |                               |-- Check IdempotencyKey
  |                               |   (if exists → return cached response)
  |                               |-- Resolve entity by entityKey
  |                               |-- Verify ownership (self/parent/admin)
  |                               |-- Find workshop by workshopKey
  |                               |-- Check capacity:
  |                               |   if space → add to participants/familyRegistrations
  |                               |   if full  → add to waitingList
  |                               |-- Update User.userWorkshopMap or familyWorkshopMap
  |                               |-- Cache IdempotencyKey (1hr TTL)
  |                               |-- Audit log
  |<-- { workshop: toUserView } --|
```

### Token Refresh with Rotation

```
Client                          Server
  |                               |
  |-- POST /refresh ------------->|
  |   Cookie: refreshToken        |
  |   Header: X-CSRF-Token        |
  |                               |-- Verify CSRF token
  |                               |-- Decode refresh token (JWT)
  |                               |-- Find user by entityKey
  |                               |-- rotateRefreshToken():
  |                               |   1. Find matching session by hash
  |                               |   2. If not found → REUSE DETECTED → clear all
  |                               |   3. If revoked → REUSE DETECTED → clear all
  |                               |   4. Revoke old session
  |                               |   5. Create new session
  |                               |   6. Prune expired, enforce cap (5)
  |                               |-- Sign new access token
  |                               |-- Sign new refresh token
  |                               |-- Set new httpOnly cookie
  |<-- { accessToken } -----------|
  |   Set-Cookie: refreshToken    |
```

### Admin Audit Log Query

```
Client                          Server
  |                               |
  |-- GET /admin/hub/logs ------->|
  |   Header: Authorization       |
  |   Header: x-admin-password    |
  |   Query: ?eventType=...       |
  |                               |-- Authenticate (JWT)
  |                               |-- Authorize admin (authorities.admin)
  |                               |-- Verify hub password (timing-safe)
  |                               |-- AuditLogService.queryLogs()
  |                               |   - HMAC(subjectKey) for lookup
  |                               |   - Date range filter
  |                               |   - Pagination (max 200/page)
  |                               |   - Strip _id, __v, subjectKeyHash
  |                               |   - Sanitize metadata (remove sensitive keys)
  |<-- { logs: [...] } -----------|
```

---

## Endpoint Summary

| Domain | Endpoints | Auth | Rate Limits | Key Models |
|--------|-----------|------|-------------|-----------|
| Auth | 14 | Mixed | 3-5 req/min per endpoint | User, RegistrationRequest |
| Workshops | 17 | Mixed | 15/15min (participants), 30/min (writes) | Workshop, User, IdempotencyKey |
| Users/Profile | 16 | Required | Global only | User |
| Admin Hub | 5 | Admin + hub password | Global only | AuditLog |
| Admin Workshops | 1 | Admin | Global only | - |
| **Total** | **53** | | | **6 models** |
