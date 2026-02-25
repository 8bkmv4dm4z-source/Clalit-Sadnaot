# BLUEPRINT.md — Clalit Workshops Platform

> **Date:** 2026-02-25
> **Branch:** `feat/ai-integration-and-realtime-escalation`
> **Stack:** React 18 · Express 4 · Mongoose 8 · MongoDB Atlas · Render.com

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Layout](#2-repository-layout)
3. [System Data Flow](#3-system-data-flow)
4. [Database Schemas](#4-database-schemas)
5. [API Reference](#5-api-reference)
6. [Server Architecture](#6-server-architecture)
7. [Client Architecture](#7-client-architecture)
8. [Risk & AI Pipeline](#8-risk--ai-pipeline)
9. [Audit & Security Layer](#9-audit--security-layer)
10. [Middleware Stack](#10-middleware-stack)
11. [Service Catalogue](#11-service-catalogue)
12. [Key Utilities](#12-key-utilities)
13. [Deployment](#13-deployment)
14. [Environment Variables](#14-environment-variables)

---

## 1. Project Overview

A full-stack MERN workshop-registration platform (codename **Sandaot**). Users browse, enrol in, and manage workshop registrations for themselves and family members. Admins manage workshops, view participant lists, export data, and monitor a security-aware **Admin Hub** featuring a deterministic risk engine with an optional AI overlay.

| Concern | Technology |
|---|---|
| Frontend | React 18.2 + Vite 5 + Tailwind CSS v3 + React Router v6 |
| Backend | Express 4 (CommonJS) on Node ≥ 18.18.0 |
| Database | MongoDB Atlas via Mongoose 8 |
| Auth | JWT access tokens (15 min) + HTTP-only refresh cookies (7 d) |
| Validation | Celebrate + Joi on every mutating endpoint |
| Testing | Node.js built-in `node:test` (no Jest / Mocha) |
| Deployment | Render.com — static site (client) + web service (server) |
| AI provider | Groq (`llama-3.3-70b-versatile`) or Ollama (local), auto-detected |

---

## 2. Repository Layout

```
my-react-app-public/
│
├── client/                                # React SPA — independent npm package
│   ├── src/
│   │   ├── main.jsx                       # Entry point — mounts provider tree + <App>
│   │   ├── App.jsx                        # Route definitions
│   │   │
│   │   ├── layouts/
│   │   │   ├── AuthLayout/                # AuthProvider (tokens · login · logout · refresh)
│   │   │   │   ├── index.jsx
│   │   │   │   └── AuthLayout.jsx
│   │   │   ├── ProfileContext/            # ProfileProvider (user + family member state)
│   │   │   │   ├── index.jsx
│   │   │   │   └── ProfileContext.jsx
│   │   │   ├── WorkshopContext/           # WorkshopProvider (list · filters · mutations)
│   │   │   │   ├── index.jsx
│   │   │   │   └── WorkshopContext.jsx
│   │   │   ├── EventContext/              # EventProvider (calendar events)
│   │   │   │   └── EventContext.jsx
│   │   │   ├── AppShell.jsx               # Persistent chrome (nav · toasts)
│   │   │   └── PublicLayout.jsx           # Unauthenticated wrapper
│   │   │
│   │   ├── context/
│   │   │   ├── AdminCapabilityContext.jsx  # Probes /api/admin/hub/access; exposes canAccessAdmin
│   │   │   └── AdminHubContext.jsx         # Admin Hub data + actions (logs · risk · stats)
│   │   │
│   │   ├── contexts/
│   │   │   └── WorkshopContext.jsx         # Legacy alias (re-exports WorkshopProvider)
│   │   │
│   │   ├── pages/
│   │   │   ├── Home/                       # Landing page
│   │   │   ├── Login/                      # Login form
│   │   │   ├── Register/                   # Two-step: request → OTP verify
│   │   │   ├── Verify/                     # OTP entry screen
│   │   │   ├── ForgotPassword/             # Password recovery entry
│   │   │   ├── ResetPassword/              # Token-based password reset
│   │   │   ├── Profile/                    # View own profile
│   │   │   ├── EditProfile/                # Edit own profile
│   │   │   ├── Workshops/                  # Workshop browser (filterable grid)
│   │   │   ├── MyWorkshops/                # Registered workshops (cards + calendar)
│   │   │   │   ├── MyWorkshopsCards.jsx
│   │   │   │   └── MyWorkshopsSimpleGcal.jsx
│   │   │   ├── EditWorkshop/               # Admin: create / edit workshop
│   │   │   ├── AllProfiles/                # Admin: user directory
│   │   │   └── AdminHub/                   # Admin: security dashboard
│   │   │       ├── AdminHub.jsx
│   │   │       └── SecurityInsightsPanel.jsx
│   │   │
│   │   ├── components/                     # 14+ reusable UI component subdirs
│   │   │   ├── WorkshopCard/
│   │   │   ├── WorkshopParticipantsModal/
│   │   │   └── …
│   │   │
│   │   ├── hooks/                          # Custom React hooks
│   │   │
│   │   ├── utils/
│   │   │   ├── apiFetch.js                 # Fetch wrapper (auth · CSRF · silent 401 refresh)
│   │   │   ├── adminHubClient.js           # Typed Admin Hub API calls
│   │   │   ├── workshopDerivation.js       # Pure derivation helpers (capacity · status)
│   │   │   ├── participantDisplay.js       # Participant name / relation formatting
│   │   │   ├── errorTranslator.js          # API error → RTL-safe UI message
│   │   │   └── captcha.js                  # CAPTCHA token acquisition
│   │   │
│   │   ├── constants/
│   │   ├── lib/
│   │   ├── styles/                         # index.css · SimpleGCal.css
│   │   └── types/
│   │
│   ├── tests/                              # node:test unit tests
│   ├── vite.config.js                      # /api → :5000 proxy in dev
│   └── package.json
│
├── server/                                 # Express API — independent npm package
│   ├── server.js                           # App bootstrap & middleware composition
│   │
│   ├── models/
│   │   ├── User.js                         # Users + family members + refresh tokens
│   │   ├── Workshop.js                     # Workshops + participants + waitlist
│   │   ├── RegistrationRequest.js          # Pending email-verified registration
│   │   ├── RiskAssessment.js               # Per-event risk assessment (deterministic + AI)
│   │   ├── RiskCalibrationProfile.js       # Per-org calibration weights + history
│   │   ├── RiskFeedback.js                 # Admin feedback on risk assessments
│   │   ├── AdminAuditLog.js                # Security/operational audit log (TTL)
│   │   ├── AuditLog.js                     # Legacy system migration log
│   │   ├── SecurityInsight.js              # Hourly/daily aggregated security metrics (TTL)
│   │   └── IdempotencyKey.js               # Request deduplication keys (TTL)
│   │
│   ├── routes/
│   │   ├── auth.js                         # /api/auth
│   │   ├── workshops.js                    # /api/workshops
│   │   ├── users.js                        # /api/users
│   │   ├── profile.js                      # /api/profile
│   │   ├── adminHub.js                     # /api/admin/hub
│   │   ├── adminWorkshops.js               # /api/admin/workshops
│   │   └── dev.js                          # /api/dev (disabled in production)
│   │
│   ├── controllers/
│   │   ├── authController.js               # Registration · login · OTP · password reset
│   │   ├── workshopController.js           # CRUD · search · enrol · waitlist · export
│   │   ├── workshop.participants.js        # Participant-specific sub-controller
│   │   ├── userController.js               # User / family member CRUD + search
│   │   └── adminHubController.js           # Hub: logs · risk · stats · metrics · feedback
│   │
│   ├── middleware/
│   │   ├── authMiddleware.js               # JWT verify + admin scope guard
│   │   ├── validation.js                   # Celebrate + Joi schemas (all endpoints)
│   │   ├── sanitizeBody.js                 # XSS input sanitization
│   │   ├── csrf.js                         # Double-submit CSRF protection
│   │   ├── captchaValidator.js             # reCAPTCHA / hCaptcha token validation
│   │   ├── adminPasswordMiddleware.js      # Timing-safe x-admin-password gate
│   │   ├── perUserRateLimit.js             # Per-entityKey sliding-window rate limiter
│   │   └── observabilityMetrics.js         # Per-route latency counters
│   │
│   ├── services/
│   │   ├── AuditEventRegistry.js           # Frozen event type · category · severity registry
│   │   ├── AuditLogService.js              # Write audit events (HMAC keys · dedup · async risk)
│   │   ├── SafeAuditLog.js                 # Fire-and-forget audit wrapper
│   │   ├── auditService.js                 # SecurityInsight aggregation scheduler
│   │   ├── SecurityEventLogger.js          # Helpers: logCsrfFailure · logRateLimit · etc.
│   │   ├── SecurityInsightService.js       # SecurityInsight read/write helpers
│   │   ├── AuditDetectionService.js        # Pattern detection on audit windows
│   │   ├── AdminHubService.js              # Hub queries: logs · stale users · stats
│   │   ├── ObservabilityMetricsService.js  # Request latency tracking store
│   │   ├── emailService.js                 # Transactional email (OTP · reset · verify)
│   │   ├── refreshTokenService.js          # Refresh token issuance · rotation · revocation
│   │   ├── workshopRegistration.js         # Atomic enrol / unenrol / waitlist with capacity
│   │   ├── workshopAuditService.js         # Workshop integrity audit (orphans · count drift)
│   │   ├── idempotency.js                  # Idempotency-Key SHA-256 deduplication (24 h)
│   │   ├── SubjectProfileResolver.js       # Load 72-h audit history per subjectKeyHash
│   │   ├── StaleUserDetector.js            # Detect users with no workshop activity
│   │   ├── userDeletionService.js          # Cascade-delete user + remove from workshops
│   │   ├── legacyAdminMigration.js         # One-time role→authorities migration
│   │   ├── entities/
│   │   │   ├── buildEntity.js              # Unified user / family entity builder
│   │   │   ├── hydration.js                # Family member field hydration
│   │   │   ├── normalize.js                # Entity normalization for API responses
│   │   │   └── resolveEntity.js            # entityKey → Mongoose document resolver
│   │   └── risk/
│   │       ├── DeterministicRiskEngine.js   # Rule-based scoring engine (v1.0.0)
│   │       ├── AIReasoningOverlay.js        # Subject profile + pattern + AI integration
│   │       ├── OpenAIRiskAnalysisService.js # Groq / Ollama LLM client (cache · rate-limit)
│   │       ├── RiskReviewerService.js       # Async lease-based processing queue + backfill
│   │       ├── RiskCalibrationService.js    # Feedback-driven rule weight updates (2% decay)
│   │       ├── RealTimeEscalationService.js # In-memory 5-min window escalation detection
│   │       └── RiskActionRegistry.js        # Allowlisted AI action IDs
│   │
│   ├── contracts/
│   │   ├── responseGuards.js               # Strip forbidden fields from all responses
│   │   └── workshopContracts.js            # Workshop response shaping (card · detail · admin)
│   │
│   ├── utils/
│   │   ├── hashId.js                       # SHA-256(namespace:mongoId) → entityKey
│   │   ├── hmacUtil.js                     # HMAC-SHA256(entityKey, secret) → audit key
│   │   ├── passwordHasher.js               # Argon2/bcrypt abstraction
│   │   ├── logScrub.js                     # PII / token redaction from console
│   │   ├── accessScope.js                  # Access-Scope header name constants
│   │   └── …
│   │
│   ├── audit/
│   │   └── hashAudit.js                    # Startup entity-key integrity check
│   │
│   ├── tests/
│   │   ├── unit/
│   │   └── integration/ (postman/)
│   │
│   └── package.json
│
├── render.yaml                             # Render.com service definitions
├── CLAUDE.md                               # Agent instructions
└── BLUEPRINT.md                            # ← this file
```

---

## 3. System Data Flow

### Request lifecycle

```
Browser
  │  HTTPS
  ▼
Render CDN / Static Site  (client/)
  │  fetch /api/**
  │  Headers: Authorization: Bearer <token>
  │           X-CSRF-Token: <token>
  ▼
Express  (server/server.js)
  │
  ├─ [CORS]                ← origin allowlist from env
  ├─ [Helmet]              ← CSP · HSTS · X-Frame-Deny
  ├─ [Body parse]          ← JSON 1 MB limit
  ├─ [Cookie parse]        ← HTTP-only refresh cookie
  ├─ [Response contract]   ← wraps res.json; strips _id · passwordHash · authorities
  │
  └─ /api sub-router
       ├─ [HPP]            ← HTTP Parameter Pollution guard
       ├─ [sanitizeBody]   ← XSS sanitization
       ├─ [mongoSanitize]  ← NoSQL operator injection prevention
       ├─ [compression]    ← gzip
       ├─ [CSRF]           ← double-submit cookie check
       ├─ [apiMetrics]     ← per-route latency counters
       ├─ [globalLimiter]  ← 300 req/min per IP
       │
       ├─ /auth         → authController
       ├─ /workshops    → workshopController
       ├─ /users        → userController
       ├─ /profile      → authController + userController
       └─ /admin/hub    → adminHubController
              │
              ▼
         Service Layer → Mongoose → MongoDB Atlas
              │
              ▼
         AuditLogService.recordEvent()
              ├─ RealTimeEscalationService.trackEvent()   [immediate · in-memory]
              └─ scheduleAuditLogRiskProcessing()          [async · non-blocking]
                    │
                    ▼
               RiskReviewerService  (lease-based queue)
                    ├─ DeterministicRiskEngine
                    ├─ RiskCalibrationService
                    ├─ AIReasoningOverlay
                    │     └─ OpenAIRiskAnalysisService (Groq / Ollama)
                    └─ RiskAssessment.save()
```

### Client context provider stack

```
BrowserRouter
  └─ EventProvider              ← calendar / workshop events
      └─ AuthProvider           ← JWT tokens · login · logout · register
          └─ AdminCapabilityProvider   ← /api/admin/hub/access probe → canAccessAdmin
              └─ ProfileProvider       ← user profile data + update handlers
                  └─ WorkshopProvider  ← workshop list + filters + registration mutations
                      └─ App (routes)
```

---

## 4. Database Schemas

### 4.1 User  *(collection: users)*

```
User {
  ── Identity ────────────────────────────────────────────────────────────────
  entityKey          String   unique   ← hashId("user", _id)
  hashedId           String   unique   ← same value; legacy alias
  name               String
  email              String   unique   required
  passwordHash       String            select: false
  idNumber           String
  birthDate          String
  phone              String
  city               String
  canCharge          Boolean  = false

  ── Family Members (embedded) ───────────────────────────────────────────────
  familyMembers []  {
    _id              ObjectId
    entityKey        String   ← hashId("family", _id)
    name             String   required
    relation         String
    idNumber, phone, email, city, birthDate
  }

  ── Role & Access ───────────────────────────────────────────────────────────
  role               "user" | "admin"           = "user"
  authorities        { admin: Boolean }          select: false
  roleIntegrityHash  String                      select: false
  idNumberHash       String                      select: false

  ── OTP ─────────────────────────────────────────────────────────────────────
  otpCode            String   select: false
  otpExpires         Number
  otpAttempts        Number   select: false
  otpLastSent        Number   select: false
  otpLockUntil       Number   select: false

  ── Password Reset ──────────────────────────────────────────────────────────
  passwordResetTokenHash     String   select: false
  passwordResetTokenExpires  Number
  hasPassword                Boolean = false
  temporaryPassword          Boolean = false
  passwordChangedAt          Date

  ── Refresh Tokens ──────────────────────────────────────────────────────────
  refreshTokens []  {
    tokenHash        String   required
    jti              String
    issuedAt, expiresAt, lastUsedAt, revokedAt, replacedByJti
    userAgent        String
  }

  ── Workshop Maps (O(1) membership) ─────────────────────────────────────────
  userWorkshopMap    [ObjectId → Workshop]
  familyWorkshopMap  [{ familyMemberId: ObjectId, workshops: [ObjectId] }]

  timestamps: createdAt · updatedAt
}

Indexes:
  email (unique), entityKey (unique), hashedId (unique)
  phone, idNumber, city, role
  familyMembers.name · phone · email · city
  text (weighted): name(5), email(3), idNumber(2), phone(2), city(1) + family fields
```

### 4.2 Workshop  *(collection: workshops)*

```
Workshop {
  ── Identity ────────────────────────────────────────────────────────────────
  workshopKey        String   unique   ← UUID (random)
  hashedId           String   unique   ← hashId("workshop", _id)

  ── Details ─────────────────────────────────────────────────────────────────
  title              String   required
  type, ageGroup, city (required), address, studio, coach
  days               [String]   ≥1 required
  hour               String
  sessionsCount      Number = 4
  startDate          Date
  endDate            Date   ← auto-calculated (startDate + days + sessionsCount − inactiveDates)
  inactiveDates      [Date]
  image              String = "functional_training"
  description        String
  price              Number = 0

  ── Visibility ──────────────────────────────────────────────────────────────
  available          Boolean = true
  adminHidden        Boolean = false

  ── Participants ─────────────────────────────────────────────────────────────
  participants       [ObjectId → User]

  familyRegistrations [] {
    parentUser       ObjectId → User
    familyMemberId   ObjectId
    parentKey, familyMemberKey, name, relation, idNumber, phone, birthDate
  }

  ── Waiting List ─────────────────────────────────────────────────────────────
  waitingList [] {
    parentUser, familyMemberId, parentKey, familyMemberKey,
    name, relation, idNumber, phone, birthDate
  }
  waitingListMax         Number = 10
  autoEnrollOnVacancy    Boolean = false

  ── Counters ─────────────────────────────────────────────────────────────────
  participantsCount  Number = 0
  waitingListCount   Number = 0
  maxParticipants    Number = 20

  timestamps: createdAt · updatedAt
}

Indexes:
  city, coach, type, available, adminHidden, startDate
  compound: (city, coach, type, available)
  familyRegistrations.familyMemberId · idNumber
  text (weighted): title(5), coach(4), type(3), city(2), description(1)
```

### 4.3 RegistrationRequest  *(collection: registrationrequests)*

```
RegistrationRequest {
  name, email (required), phone, passwordHash, idNumber, birthDate, city, canCharge

  familyMembers []  { name, relation, idNumber, phone, email, city, birthDate }

  status    "pending" | "verified" | "expired" | "cancelled" | "consumed"
  otpCode   String   select: false
  otpExpires, otpAttempts
  expiresAt, completedAt
  userId    ObjectId → User

  meta: { ip, userAgent, otpLastSent }

  timestamps: createdAt · updatedAt
}

Indexes:
  email, status
  partial compound: (email, status) WHERE status = "pending"
```

### 4.4 AdminAuditLog  *(collection: adminHubAuditLogs)*

```
AdminAuditLog {
  eventType     String   enum: 45+ AuditEventTypes
  category      "SECURITY" | "REGISTRATION" | "WORKSHOP" | "CAPACITY" | "HYGIENE"
  severity      "info" | "warn" | "critical"
  subjectType   "user" | "familyMember" | "workshop" | "system"
  subjectKey    String   ← HMAC-hashed entity key (never raw)
  subjectKeyHash String
  actorKey      String
  metadata      Object   ← sanitized; no PII, no tokens
  createdAt     Date

  TTL: AUDIT_RETENTION_DAYS env (default 3 days)
}

Indexes:
  TTL on createdAt, subjectKeyHash+createdAt, eventType+createdAt,
  severity+createdAt, category+severity+createdAt
```

### 4.5 RiskAssessment  *(collection: riskAssessments)*

```
RiskAssessment {
  auditLogId      ObjectId   unique   ← 1:1 with AdminAuditLog
  organizationId  String = "global"
  eventType, category, severity, subjectType, subjectKey, subjectKeyHash
  sourceMetadata  Object

  deterministic {
    score         Number [0–100]
    riskLevel     "low" | "warn" | "medium" | "high" | "immediate"
    version       String
    contributions [] {
      ruleId, label, category, baseScore, calibrationOffset, score, reason
    }
    summary       String
  }

  aiOverlay {
    enabled            Boolean
    summary            String
    confidence         Number [0–1]
    advisoryScore      Number [0–100]
    divergenceScore    Number [0–100]
    openAIAnalysis {
      available, summary
      anomalyFlags []  { flag, confidence, reasoning }
      patternAnalysis, suggestedUrgency, confidenceNote, model, cached
    }
    suggestedActions [] { actionId, reason, implication, fix, confidence, blocked }
    blockedActions  []
    guardrails {
      confidenceGateBlocked   ← confidence < 0.6
      divergenceExceeded      ← AI vs deterministic gap > 35
      shadowMode              ← RISK_AI_SHADOW env
    }
  }

  final {
    score                Number
    riskLevel            String
    requiresManualReview Boolean
    sourceOfTruth        "deterministic" | "ai_advisory"
  }

  calibration { profileVersion, appliedRuleWeights }

  review {
    status    "none" | "pending_review" | "in_review" | "approved" | "dismissed" | "escalated"
    priority  "critical" | "high" | "medium" | "low"
    slaDeadline, assignedTo, reviewedBy, reviewedAt, decision, rationale, escalationReason
  }

  processing {
    status    "pending" | "processing" | "completed" | "failed" | "dead_letter"
    attempts, maxAttempts, lastError, lastAttemptAt, processedAt
    leaseOwner, leaseAcquiredAt, leaseExpiresAt
    nextRetryAt, deadLetteredAt, deadLetterReason
    logs []   { at, stage, level, message }
  }

  timestamps: createdAt · updatedAt
}

Indexes:
  createdAt, eventType+createdAt, category+riskLevel+createdAt
  processing.status+createdAt, review.status+priority+slaDeadline
  organizationId+createdAt
```

### 4.6 RiskCalibrationProfile  *(collection: riskCalibrationProfiles)*

```
RiskCalibrationProfile {
  organizationId   String   unique
  active           Boolean = true
  version          Number = 1
  ruleWeights      Object   ← { ruleId: offset ∈ [-20, +20] }
  driftScore       Number = 0
  history []  {
    at, actorKeyHash, feedbackId
    changes []  { ruleId, from, to, reason, feedbackType }
  }
  timestamps: createdAt · updatedAt
}
```

### 4.7 RiskFeedback  *(collection: riskFeedback)*

```
RiskFeedback {
  assessmentId  ObjectId → RiskAssessment
  organizationId String = "global"
  feedbackType  "false_positive" | "true_positive" | "escalate" |
                "downgrade" | "accepted_action" | "rejected_action"
  actionId      String
  actorKeyHash  String
  notes         String
  createdAt     Date
}

Indexes: feedbackType+createdAt, organizationId+createdAt
```

### 4.8 SecurityInsight  *(collection: securityInsights)*

```
SecurityInsight {
  periodType   "hourly" | "daily"
  periodStart, periodEnd  Date
  metrics {
    totalEvents, bySeverity {}, byEventType {}, topSubjectHashes []
  }
  warnings []  { code, message, severity, value, threshold }
  createdAt    Date

  TTL: SECURITY_INSIGHT_RETENTION_DAYS env (default 14 days)
}

Indexes: TTL on createdAt, periodType+periodStart
```

### 4.9 IdempotencyKey  *(collection: idempotencykeys)*

```
IdempotencyKey {
  keyHash        String   ← SHA-256 of Idempotency-Key header
  actorKey       String
  scope          String   ← route path
  method         String
  status         "in_progress" | "completed"
  responseStatus Number
  responseBody   Mixed
  completedAt    Date
  expiresAt      Date     ← TTL index
  timestamps: createdAt · updatedAt
}

Unique compound index: (keyHash, actorKey, scope, method)
TTL index on expiresAt (default 24 h)
```

### 4.10 AuditLog  *(legacy — collection: auditlogs)*

```
AuditLog {
  type         String   ← e.g. "ENTITY_KEY_MIGRATION"
  initiatedBy  String = "system"
  summary      Object   ← counts / stats
  details      Object
  timestamps: createdAt · updatedAt
}
```

---

## 5. API Reference

> All routes are under `/api`. Auth tokens are sent as `Authorization: Bearer <token>`.
> Mutating routes require the `X-CSRF-Token` header (issued by `GET /api/auth/csrf`).

### 5.1 Auth  `/api/auth`

| Method | Path | Auth | Guard | Description |
|---|---|---|---|---|
| GET | `/csrf` | — | — | Issue CSRF token |
| POST | `/register/request` | — | rate-limit · velocity | Stage 1: pending registration + send OTP |
| POST | `/register/verify` | — | OTP rate-limit | Stage 2: verify OTP → create User |
| POST | `/register` | — | rate-limit | Legacy single-step registration |
| POST | `/login` | — | rate-limit · CAPTCHA | Credentials → access token + refresh cookie |
| POST | `/refresh` | cookie | CSRF | Rotate refresh token → new access token |
| POST | `/logout` | cookie | CSRF | Revoke refresh token |
| POST | `/send-otp` | — | OTP rate-limit · CAPTCHA | Send OTP to email |
| POST | `/verify` | — | OTP rate-limit · CAPTCHA | Verify OTP → access token |
| POST | `/recover` | — | OTP + email rate-limit · CAPTCHA | Initiate password recovery |
| POST | `/password/request` | — | OTP + email rate-limit · CAPTCHA | Request password-reset link |
| POST | `/reset` | — | OTP rate-limit · CAPTCHA · CSRF | Reset password with token |
| GET | `/me` | JWT | — | Logged-in user profile |
| PUT | `/password` | JWT | — | Change own password |

Rate windows: 5 auth attempts / 15 min (general), 3 OTPs / 1 min (OTP), 3 registrations / hour, 5 resets / hour per email.

---

### 5.2 Workshops  `/api/workshops`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | — | List all workshops (public) |
| GET | `/search` | — | Full-text + filter search |
| GET | `/registered` | JWT | Workshops the user is enrolled in |
| GET | `/meta/cities` | — | Available city list |
| GET | `/meta/validate-address` | JWT + Admin | Geocode / validate address |
| GET | `/audit/run` | JWT + Admin | Workshop data-integrity audit |
| GET | `/:id` | — | Single workshop by hashedId |
| GET | `/:id/participants` | JWT + Admin | Participant list (contact stripped for non-admin) |
| GET | `/:id/waitlist` | JWT + Admin | Waiting list |
| POST | `/` | JWT + Admin + CSRF | Create workshop |
| POST | `/:id/register-entity` | JWT | Enrol self or family member |
| POST | `/:id/waitlist-entity` | JWT | Join waiting list |
| POST | `/:id/export` | JWT + Admin + CSRF | Export participant Excel |
| PUT | `/:id` | JWT + Admin + CSRF | Update workshop |
| DELETE | `/:id` | JWT + Admin + CSRF | Delete workshop |
| DELETE | `/:id/unregister-entity` | JWT | Unenrol self or family member |
| DELETE | `/:id/waitlist-entity` | JWT | Leave waiting list |

Rate: 15 participant actions / 15 min (per-user). Workshop write limiter: 30 req/min (admin-whitelist exempt).

---

### 5.3 Users  `/api/users`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/getMe` | JWT | Minimal identity (entityKey, name) |
| GET | `/search` | JWT | Full-text search (admin: global; user: own family) |
| GET | `/` | JWT + Admin | All users |
| GET | `/audit/report` | JWT + Admin | Data integrity audit report |
| GET | `/entity/:id` | JWT | Fetch user or family entity |
| GET | `/:id` | JWT | Get user by entityKey |
| GET | `/:id/workshops` | JWT + Admin | Workshop list for a user |
| POST | `/` | JWT + Admin | Create user |
| PUT | `/update-entity` | JWT | Update self or family member |
| DELETE | `/by-entity/:entityKey` | JWT + Admin | Delete user by entityKey |
| DELETE | `/:id` | JWT + Admin | Delete user (legacy route) |

---

### 5.4 Profile  `/api/profile`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/` | JWT | Own profile |
| PUT | `/edit` | JWT | Edit own profile (name, phone, city, email, birthDate, idNumber) |
| GET | `/all` | JWT + Admin | All users |
| DELETE | `/by-entity/:entityKey` | JWT + Admin | Delete by entityKey |
| DELETE | `/:id` | JWT + Admin | Delete (legacy) |

---

### 5.5 Admin Hub  `/api/admin/hub`

> **Triple-gated:** JWT + `authorities.admin` + timing-safe `x-admin-password` header.

| Method | Path | Description |
|---|---|---|
| GET | `/access` | Opaque readiness probe (204 OK / 404 for non-admins) |
| GET | `/logs` | Paginated audit log feed |
| GET | `/alerts/maxed-workshops` | Workshops at capacity |
| GET | `/stale-users` | Users with no workshop activity |
| GET | `/stats` | Aggregate counts (users · workshops · registrations) |
| GET | `/metrics` | API observability metrics (per-route latency) |
| GET | `/risk-assessments` | Paginated risk assessment list |
| GET | `/risk-assessments/review-queue` | Assessments pending manual review |
| GET | `/risk-assessments/failures` | Dead-lettered assessments |
| POST | `/risk-assessments/:id/feedback` | Submit reviewer feedback → triggers calibration |
| POST | `/risk-assessments/:id/review` | Approve / dismiss / escalate decision |
| POST | `/risk-assessments/:id/retry` | Re-queue a failed assessment |
| POST | `/risk-assessments/reset-failed` | Bulk reset dead-lettered assessments |

Rate: 120 req / 15 min per-user (accommodates multi-panel concurrent loads).

---

### 5.6 Admin Workshops  `/api/admin/workshops`

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/invariants` | JWT + Admin | Workshop integrity invariants report |

---

## 6. Server Architecture

### Startup sequence (`server.js`)

```
1.  dotenv.config()
2.  Trust proxy (TRUST_PROXY_HOPS hops)
3.  CORS   (origin allowlist from ALLOWED_ORIGINS + dev defaults)
4.  Helmet (CSP · HSTS in prod · X-Frame-Deny · no X-Powered-By)
5.  Permissions-Policy header (disable geo · mic · camera · payment · USB)
6.  express.json (1 MB) + express.urlencoded + cookieParser
7.  Response contract wrapper  (wraps res.json; strips forbidden fields globally)

8.  /api sub-router:
     HPP → sanitizeBody → mongoSanitize → compression
     → CSRF → apiMetrics → globalLimiter (300 req/min)
     → route handlers

9.  mongoose.connect() with autoIndex + 10 s timeout
10. migrateLegacyAdmins()          (if MIGRATE_LEGACY_ADMINS=true)
11. startAuditScheduler()           SecurityInsight hourly/daily aggregation
12. startRiskReviewerScheduler()    process pending RiskAssessments on cron
13. startEscalationCleanup()        prune expired in-memory escalation windows
14. scheduleRiskBackfillFromAuditLogs("startup")
15. runAllHashAudits()              (if HASH_AUDIT=true)
16. app.listen(PORT, HOST)
17. SIGTERM / SIGINT graceful shutdown (10 s hard timeout)
```

### Auth guard chain

```
authenticate(req)
  ├─ Extract Bearer token from Authorization header
  ├─ jwt.verify(token, JWT_SECRET)  → decoded { sub, entityKey, authorities, … }
  └─ req.user = decoded

authorizeAdmin(req)
  └─ requires req.user.authorities.admin === true

requireAdminHubPassword(req)
  └─ timingSafeEqual(req.headers["x-admin-password"], ADMIN_HUB_PASSWORD)
```

### Response contract (`contracts/responseGuards.js`)

Every `res.json()` call is intercepted. Payloads containing any of the following fields are rejected (dev) or logged (prod) before transmission:

```
_id · passwordHash · authorities · adminHidden · otpCode · otpExpires
otpAttempts · roleIntegrityHash · idNumberHash · refreshTokens
passwordResetTokenHash
```

Contact fields (`email · phone · idNumber · birthDate`) are stripped from participant lists for non-admin callers.

---

## 7. Client Architecture

### Provider responsibilities

| Provider | Manages |
|---|---|
| `EventProvider` | Calendar event data |
| `AuthProvider` | JWT tokens · `isLoggedIn` · login / logout / register |
| `AdminCapabilityProvider` | Probes `/api/admin/hub/access`; exposes `canAccessAdmin` |
| `ProfileProvider` | Own user profile + family members + update handlers |
| `WorkshopProvider` | Workshop list · filters · enrolment / waitlist mutations |
| `AdminHubContext` | Hub data: logs · risk assessments · metrics · stats · feedback |

### Route map (React Router v6)

| Path | Component | Guard |
|---|---|---|
| `/` | Home | — |
| `/login` | Login | — |
| `/register` | Register | — |
| `/verify` | Verify | — |
| `/forgot-password` | ForgotPassword | — |
| `/resetpassword` | ResetPassword | — |
| `/workshops` | Workshops | `isLoggedIn` |
| `/my-workshops` | MyWorkshops | `isLoggedIn` |
| `/profile` | Profile | `isLoggedIn` |
| `/profile/edit` | EditProfile | `isLoggedIn` |
| `/admin/profiles` | AllProfiles | `canAccessAdmin` |
| `/admin/workshop/edit/:id` | EditWorkshop | `canAccessAdmin` |
| `/admin/hub` | AdminHub | `canAccessAdmin` |

### `apiFetch.js`

- Injects `Authorization: Bearer <token>` on every request
- Attaches `X-CSRF-Token` from cookie for state-mutating methods (POST · PUT · PATCH · DELETE)
- On 401: silently calls `/api/auth/refresh`, retries original request once
- Normalises error shapes using `errorTranslator.js`

---

## 8. Risk & AI Pipeline

### Flow

```
AuditLogService.recordEvent(event)
    │
    ├─ [Synchronous] RealTimeEscalationService.trackEvent()
    │     ↳ In-memory sliding window (5 min) per subjectKeyHash
    │     ↳ Escalation rules:
    │         brute_force_suspected      auth.failure ≥ 3
    │         admin_probe_detected       admin.unauthorized ≥ 2
    │         data_exfiltration_suspected response.guard ≥ 2
    │         severity_escalation        ≥1 critical + ≥2 warn in window
    │     ↳ On trigger → emits security.realtime.escalation audit event
    │
    └─ [Async · setImmediate] scheduleAuditLogRiskProcessing(auditLogId)
          │
          ▼
     RiskReviewerService.processOne(auditLogId)
          ├─ Acquire lease (leaseOwner · leaseAcquiredAt · leaseExpiresAt)
          │    Retry: exponential backoff with jitter; max 3 attempts → dead_letter
          │
          ├─ DeterministicRiskEngine.scoreAuditEvent(auditEvent, { calibrationProfile })
          │    Scoring components:
          │      severity_base   info=15  warn=45  critical=80
          │      category_base   SECURITY=12  CAPACITY=18  REGISTRATION=8  …
          │      event_rule      per-type bonus (e.g. csrf.failure=25, response.guard=30)
          │      metadata signals (failedAttempts · rateLimitReason · …)
          │    Score = weighted sum, clamped [0–100]
          │    riskLevel: ≥90 immediate · ≥75 high · ≥50 medium · ≥25 warn · else low
          │
          ├─ RiskCalibrationService.getOrCreateCalibrationProfile(organizationId)
          │    Applies per-rule offsets from RiskCalibrationProfile.ruleWeights [-20..+20]
          │
          ├─ AIReasoningOverlay.buildAIReasoningOverlay(auditEvent, deterministicResult)
          │    ├─ SubjectProfileResolver: load 72-h audit history for subject
          │    ├─ Pattern detection against thresholds:
          │    │     repeatedAuthFailures, rateLimitAbuse, highSeveritySpike, rapidRegistrations
          │    ├─ OpenAIRiskAnalysisService (if enabled and not shadow-mode)
          │    │     Provider auto-detect: Ollama (local, free) → Groq (API key required)
          │    │     LRU cache: TTL 1 h · max 500 entries
          │    │     Groq sliding-window rate limit: 28 RPM
          │    │     Timeout: RISK_AI_TIMEOUT_MS (default 8 s)
          │    ├─ Guardrails:
          │    │     confidence < 0.6          → confidenceGateBlocked; AI ignored
          │    │     |aiScore - detScore| > 35 → divergenceExceeded; AI ignored
          │    │     RISK_AI_SHADOW=true        → shadowMode; AI runs but not surfaced
          │    └─ suggestedActions validated against RiskActionRegistry allowlist
          │
          └─ RiskAssessment.save()
                final.sourceOfTruth = deterministic (AI is always advisory)
                review.status = pending_review  (if score ≥ threshold or requiresManualReview)
```

### Calibration feedback loop

```
Admin submits POST /risk-assessments/:id/feedback  { feedbackType, actionId }
  │
  └─ RiskCalibrationService.applyFeedback()
        feedbackType → weight delta:
          false_positive  → -3
          downgrade       → -2
          rejected_action → -1
          accepted_action → +1
          true_positive   → +3
          escalate        → +4

        Algorithm:
          currentValue  = ruleWeights[targetRuleId] || 0
          decayed       = clamp(currentValue × 0.98, -20, +20)   ← 2% decay
          nextValue     = clamp(decayed + delta,      -20, +20)

        Saves to RiskCalibrationProfile.ruleWeights + appends to history
        Next assessment for same org picks up updated weights automatically
```

---

## 9. Audit & Security Layer

### Audit event taxonomy

| Category | Event types |
|---|---|
| `SECURITY` | `security.auth.failure` · `security.csrf.failure` · `security.admin.password.failure` · `security.role.integrity` · `security.response.guard` · `security.rate.limit` · `security.otp.lockout` · `security.admin.unauthorized` · `security.realtime.escalation` · `security.token.expired` · `security.token.malformed` · `security.input.sanitized` · `security.mongo.sanitized` · `security.integrity.mismatch` |
| `REGISTRATION` | `user.registered` |
| `WORKSHOP` | `workshop.registration` · `workshop.unregister` · `workshop.waitlist.add` · `workshop.visibility.toggle` · `admin.workshop.create` · `admin.workshop.update` · `admin.workshop.delete` |
| `CAPACITY` | `workshop.maxed` · `workshop.waitlist.promoted` |
| `HYGIENE` | `user.stale.detected` · `admin.user.create` · `admin.user.delete` |

### Subject key privacy

All audit `subjectKey` values are stored as `HMAC-SHA256(entityKey, HMAC_SECRET)`. Raw entity keys are never persisted to the audit log. A 12-hour deduplication window prevents log flooding for repeated events on the same subject.

### SecurityInsight aggregation

`auditService.startAuditScheduler()` runs on a cron schedule:
- **Hourly:** count events by severity, eventType, top subject hashes; detect spikes
- **Daily:** same metrics over a longer window; threshold-based warnings
- Stored in `SecurityInsight` with a configurable TTL (default 14 days)

---

## 10. Middleware Stack

| Middleware | Scope | Purpose |
|---|---|---|
| `cors` | global | Origin allowlist; `credentials: true` for cookies |
| `helmet` | global | CSP · HSTS (prod) · X-Frame-Deny · referrer-policy · no X-Powered-By |
| `Permissions-Policy` | global | Disable geolocation · mic · camera · payment · USB |
| `express.json` | global | 1 MB body limit |
| `cookieParser` | global | Parse HTTP-only refresh cookie |
| Response contract wrapper | global | Intercepts `res.json()`; strips forbidden fields |
| `hpp` | /api | HTTP Parameter Pollution prevention |
| `sanitizeBody` | /api | XSS input sanitization |
| `mongoSanitize` | /api | NoSQL `$`-operator injection prevention |
| `compression` | /api | gzip response bodies |
| `csrfProtection` | /api | Double-submit CSRF (state-mutating routes) |
| `apiMetricsMiddleware` | /api | Per-route latency counters |
| `globalLimiter` | /api | 300 req / 60 s per IP |
| `workshopWriteLimiter` | /api/workshops | 30 req / 60 s; admin whitelist exempt |
| `authenticate` | protected routes | JWT verify; attach `req.user` |
| `authorizeAdmin` | admin routes | Require `authorities.admin` |
| `requireAdminHubPassword` | /api/admin/hub | Timing-safe `x-admin-password` check |
| `perUserRateLimit` | various | Per-entityKey sliding-window limits |
| `requireCaptcha` | login · OTP · reset | reCAPTCHA / hCaptcha token validation |
| `validateXxx` (Celebrate) | mutating routes | Joi schema enforcement → 400 on violation |
| `celebrateErrors()` | /api error handler | Format Celebrate errors as 400 |
| CSRF error handler | /api error handler | 403 on `EBADCSRFTOKEN` |
| Global error handler | /api error handler | 500 in prod (message hidden); full in dev |

---

## 11. Service Catalogue

| Service | Purpose |
|---|---|
| `AuditEventRegistry` | Frozen registry: all event types, categories, default severities |
| `AuditLogService` | Write audit events (HMAC key, metadata sanitize, 12-h dedup, async risk queue) |
| `SafeAuditLog` | Fire-and-forget wrapper; swallows errors silently |
| `SecurityEventLogger` | Structured helpers: logCsrfFailure · logRateLimit · logResponseGuardViolation · logMongoSanitized |
| `AuditDetectionService` | Pattern detection across audit windows |
| `auditService` | Hourly/daily SecurityInsight aggregation scheduler |
| `SecurityInsightService` | SecurityInsight CRUD helpers |
| `AdminHubService` | Hub queries: logs · stale users · aggregate stats |
| `ObservabilityMetricsService` | Per-route latency tracking store |
| `emailService` | Transactional email via Nodemailer (OTP · password reset · verification) |
| `refreshTokenService` | Refresh token issuance, rotation, revocation |
| `workshopRegistration` | Atomic enrol / unenrol / waitlist with capacity checks + audit |
| `workshopAuditService` | Workshop integrity audit (orphaned refs, counter drift) |
| `idempotency` | SHA-256 Idempotency-Key deduplication with 24-h TTL |
| `SubjectProfileResolver` | Load 72-h audit history per HMAC subject key |
| `StaleUserDetector` | Detect users with no workshop activity |
| `userDeletionService` | Cascade-delete: user + all workshop references |
| `legacyAdminMigration` | One-time migration of `role: admin` → `authorities.admin: true` |
| `entities/buildEntity` | Unified user / family entity builder for API responses |
| `entities/hydration` | Family member field population from parent document |
| `entities/normalize` | Entity normalization (strip internal fields, compute derived values) |
| `entities/resolveEntity` | entityKey → Mongoose document with lean / projection options |
| `DeterministicRiskEngine` | Rule-based event scoring; calibration offsets; version `1.0.0` |
| `AIReasoningOverlay` | Subject profile assembly + pattern flags + AI overlay integration |
| `OpenAIRiskAnalysisService` | Groq / Ollama LLM client with LRU cache and sliding-window rate limit |
| `RiskReviewerService` | Async lease-based processing queue; exponential retry; startup backfill |
| `RiskCalibrationService` | Feedback-driven rule weight updates with 2% decay per adjustment |
| `RealTimeEscalationService` | In-memory 5-min window escalation detection; periodic cleanup |
| `RiskActionRegistry` | Allowlisted AI action IDs; validates suggested actions before persistence |

---

## 12. Key Utilities

### Server

| Utility | Purpose |
|---|---|
| `utils/hashId.js` | `SHA-256(namespace + ":" + mongoId)` → deterministic, stable `entityKey` |
| `utils/hmacUtil.js` | `HMAC-SHA256(entityKey, HMAC_SECRET)` → opaque audit subject key |
| `utils/passwordHasher.js` | Argon2/bcrypt abstraction for password storage and verification |
| `utils/logScrub.js` | Redacts PII / token values from all console output |
| `utils/accessScope.js` | `Access-Scope` and `Access-Proof` HTTP header name constants |
| `contracts/responseGuards.js` | Deep-scan + strip forbidden fields on every `res.json()` call |
| `contracts/workshopContracts.js` | Workshop response shaping (card view · detail view · admin view) |

### Client

| Utility | Purpose |
|---|---|
| `utils/apiFetch.js` | Authenticated fetch: token injection · CSRF · silent 401 refresh |
| `utils/adminHubClient.js` | Typed Admin Hub API call wrappers |
| `utils/workshopDerivation.js` | Pure helpers: capacity status · registration state · display values |
| `utils/participantDisplay.js` | Participant name / relation / status formatting |
| `utils/errorTranslator.js` | API error code → RTL-safe Hebrew/English UI message |
| `utils/captcha.js` | CAPTCHA token acquisition (supports reCAPTCHA + hCaptcha) |

---

## 13. Deployment

### Render.com configuration (`render.yaml`)

```yaml
services:
  - type: static_site
    name: sandaot-client
    env: static
    rootDir: client
    buildCommand: npm run build
    publishPath: client/dist
    routes:
      - type: rewrite          # SPA client-side routing fallback
        source: /*
        destination: /index.html
```

The Express server runs as a separate Render **web service**. Set `SERVE_CLIENT=false` when the SPA is served from Render's CDN.

### Local development

```bash
# Terminal 1 — API server
cd server && npm run dev          # Nodemon on :5000

# Terminal 2 — React dev server
cd client && npm run dev          # Vite on :5173; proxies /api → :5000
```

### Production build

```bash
cd client && npm run build        # → client/dist/
cd server && npm start            # NODE_ENV=production on :5000
```

### Node requirement

```
node >= 18.18.0   (required for native fetch · node:crypto · node:test)
```

---

## 14. Configuration

All runtime configuration is supplied via environment variables. Values are never committed to source control — see `.env.example` (not tracked) for the full variable list.

| Group | Variables |
|---|---|
| Server / network | `PORT` · `HOST` · `TRUST_PROXY_HOPS` · `SERVE_CLIENT` · `CLIENT_DIST_PATH` |
| Database | `MONGODB_URI` |
| Auth & secrets | `JWT_SECRET` · `JWT_REFRESH_SECRET` · `ROLE_HASH_SECRET` · `HMAC_SECRET` |
| CORS | `ALLOWED_ORIGINS` · `DEV_ALLOWED_ORIGINS` · `PUBLIC_URL` |
| Admin | `ADMIN_HUB_PASSWORD` · `ADMIN_WHITELIST_IDS` · `ADMIN_WHITELIST_EMAILS` |
| Feature flags | `ENABLE_DEV_ROUTES` · `MIGRATE_LEGACY_ADMINS` · `HASH_AUDIT` |
| Retention / TTL | `AUDIT_RETENTION_DAYS` · `SECURITY_INSIGHT_RETENTION_DAYS` · `IDEMPOTENCY_TTL_HOURS` |
| CAPTCHA | `RECAPTCHA_SITE_KEY` · `HCAPTCHA_SITE_KEY` |
| AI provider | `RISK_AI_PROVIDER` · `GROQ_API_KEY` · `GROQ_RISK_MODEL` · `GROQ_RPM_LIMIT` · `OLLAMA_BASE_URL` · `OLLAMA_RISK_MODEL` |
| AI tuning | `RISK_AI_TIMEOUT_MS` · `RISK_AI_CACHE_TTL_MS` · `RISK_AI_CACHE_MAX` · `RISK_AI_SHADOW` |
| Risk reviewer | `RISK_REVIEWER_LEASE_MS` · `RISK_REVIEWER_MAX_ATTEMPTS` · `RISK_REVIEWER_RETRY_BASE_MS` · `RISK_REVIEWER_RETRY_MAX_MS` · `RISK_REVIEWER_RETRY_JITTER_RATIO` · `RISK_REVIEWER_TRACE` |
| Client (`VITE_`) | `VITE_API_URL` · `VITE_RECAPTCHA_SITE_KEY` · `VITE_HCAPTCHA_SITE_KEY` |
