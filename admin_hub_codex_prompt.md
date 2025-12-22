
ROLE: Structural designer and executor of a MERN project (Admin Hub)

TASK:
Design and implement a secure Admin Hub for the existing MERN application.

CRITICAL CONSTRAINTS:
- You may ONLY ADD to the current system. Do NOT change existing API behavior.
- Base all work on existing APIs and security mechanisms already implemented.
- Treat authenticated users as potentially malicious.
- The current priority is the NOTICE / AUDIT HUB. Statistics are future-facing only.

SOURCE OF TRUTH:
- Existing backend APIs
- Existing entityKey (public UUID) system
- /mnt/data/security_diagnostic_report.md

-------------------------
CORE OBJECTIVES
-------------------------

1) ADMIN HUB PURPOSE
The Admin Hub must translate raw logs/events into actionable, human-readable admin data.
It must automatically clean old data to prevent storage bloat.

2) DATA TYPES TO SUPPORT (PHASE 1 – REQUIRED)
- App registrations (users / family members)
- Workshop registrations & capacity alerts
- Security hazards (OTP abuse, refresh token reuse, suspicious activity)
- Stale users / stale entities

3) DATA TYPES (PHASE 2 – FUTURE, NOT REQUIRED NOW)
- Aggregated statistics (most searched topics, popular requests)
NOTE: Design must allow future extension without refactor.

-------------------------
IDENTITY & SECURITY MODEL (VERY IMPORTANT)
-------------------------

- entityKey (public UUID) is the CANONICAL identifier for admins.
- entityKey is shown in Admin Hub alongside display name.
- Mongo _id must NEVER be exposed or logged.

Hashing rules:
- Hashing is for STORAGE and CORRELATION only.
- Logs may store:
  - subjectKey = entityKey (public UUID)
  - subjectKeyHash = HMAC(entityKey, AUDIT_HMAC_SECRET)
- UI filtering uses entityKey, not hashes.

Use HMAC (not plain hash) for protection against rainbow tables.

-------------------------
ADMIN HUB ACCESS SECURITY
-------------------------

Admin Hub access requires:
1) Valid authenticated admin JWT
2) Secondary admin password stored in .env:
   ADMIN_HUB_PASSWORD

The password:
- Is never returned
- Is checked via header (x-admin-password)
- Is required for ALL admin hub endpoints

-------------------------
BACKEND ARCHITECTURE
-------------------------

You MUST create a new backend subsystem dedicated to audit & analysis.

1) New Mongo Collection: AuditLog
Fields:
- eventType (registration | workshop_maxed | security | stale_user)
- subjectType (user | familyMember | workshop)
- subjectKey (entityKey / public UUID)
- subjectKeyHash (HMAC)
- actorKey (entityKey of actor, if applicable)
- metadata (sanitized, no PII)
- createdAt (TTL indexed)

2) Retention
- Logs auto-expire via TTL index
- Default: 3 days
- Configurable via AUDIT_RETENTION_DAYS env

3) AuditLogService
Responsibilities:
- recordEvent(type, subject, actor, metadata)
- queryLogs(filters, pagination)
- enforce sanitization & hashing
- NO PII storage

4) Scheduled Jobs
- Daily job:
  - Detect workshops that reached max capacity
  - Detect stale users (no activity > STALE_USER_DAYS)
  - Record audit events
- Cleanup handled automatically by TTL

-------------------------
ADMIN HUB API (NEW ROUTES ONLY)
-------------------------

Base path: /api/admin/hub

Endpoints:
- GET /logs
  - Filters: eventType, date range, subjectKey, subjectType
  - Pagination & sorting
- GET /alerts/maxed-workshops
  - Uses existing workshop data
  - Provides action to trigger EXISTING Excel export API
- GET /stale-users
- DELETE /logs (optional manual cleanup)
- GET /stats (placeholder, return 501)

Security:
- authorizeAdmin middleware
- admin password middleware
- per-user rate limiting

-------------------------
FRONTEND REQUIREMENTS
-------------------------

- New Admin Hub page
- Context-based data fetching (AdminHubContext)
- Filters by:
  - event type
  - entityKey
  - date
- Clear notices for:
  - workshop full
  - suspicious activity
  - stale users
- Excel resend uses EXISTING workshop export endpoint
- Statistics tab hidden or disabled (future)

-------------------------
DATA & SPACE EFFICIENCY
-------------------------

- No raw logs stored
- Only meaningful audit events
- No duplication of large payloads
- TTL ensures bounded storage
- Index subjectKeyHash + createdAt

-------------------------
TESTING & VERIFICATION
-------------------------

You must document each step and provide:
- Unit tests for AuditLogService
- Integration tests for admin hub endpoints
- Security tests:
  - no PII leakage
  - no Mongo _id exposure
  - admin password enforced
  - retention works

-------------------------
DELIVERABLE
-------------------------

1) Step-by-step implementation plan (PLAN MODE FIRST)
2) Then wait for approval
3) Execute ONE STEP AT A TIME when instructed
4) Document each step
5) Do NOT proceed automatically

End PLAN with:
"PLAN COMPLETE — WAITING FOR APPROVAL"
