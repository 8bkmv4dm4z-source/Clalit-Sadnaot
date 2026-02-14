# Security Improvement Plan

Prioritized findings from a comprehensive security audit of the MERN Workshop App. Each finding includes the file path, severity, description, and a concrete fix recommendation.

---

## Summary

| Severity | Count |
|----------|-------|
| High | 3 |
| Medium | 6 |
| Low | 3 |

> **Note:** The `.env` file is listed in `.gitignore` and is not tracked in version control. Findings from automated scanners that flag "secrets in git" are a **false positive** for this repository.

---

## High Severity

### H1. Admin Hub Password — No Rate Limiting (Brute-Force Risk)

**File:** `server/routes/adminHub.js:19-53`
**Severity:** High

**Description:** All admin hub endpoints (`/logs`, `/alerts/maxed-workshops`, `/stale-users`, `/stats`) require `requireAdminHubPassword` but have no rate limiting applied. An attacker with valid admin credentials could brute-force the hub password with unlimited attempts.

**Current code:**
```javascript
router.get(
  "/logs",
  authenticate,
  authorizeAdmin,
  requireAdminHubPassword,  // No rate limiter before this
  adminHubController.getLogs
);
```

**Fix recommendation:**

Add a per-user rate limiter to all hub password-protected routes:

```javascript
const { perUserRateLimit } = require("../middleware/perUserRateLimit");

const adminHubPasswordLimiter = perUserRateLimit({
  windowMs: 15 * 60 * 1000,  // 15 minutes
  limit: 5,                   // 5 password attempts per window
});

router.get(
  "/logs",
  authenticate,
  authorizeAdmin,
  adminHubPasswordLimiter,     // Add before password check
  requireAdminHubPassword,
  adminHubController.getLogs
);
// Apply to all other hub routes similarly
```

---

### H2. CSRF Protection Not Applied to Workshop Mutation Endpoints

**File:** `server/routes/workshops.js:77-171`
**Severity:** High

**Description:** Workshop state-changing endpoints (register, unregister, waitlist, create, update, delete) do not use `csrfProtection` middleware. CSRF is currently only applied to auth cookie-reliant endpoints (`/refresh`, `/logout`, `/reset`).

**Affected endpoints:**
- `POST /:id/register-entity` (line 77)
- `DELETE /:id/unregister-entity` (line 85)
- `POST /:id/waitlist-entity` (line 94)
- `DELETE /:id/waitlist-entity` (line 102)
- `POST /:id/export` (line 111)
- `POST /` (line 150)
- `PUT /:id` (line 158)
- `DELETE /:id` (line 166)

**Mitigating factors:** These endpoints use Bearer token authentication (not cookies), so traditional CSRF attacks are less effective. However, if the app ever switches to cookie-based auth or if Bearer tokens are stored in cookies, this becomes exploitable.

**Fix recommendation:**

For endpoints that rely solely on Bearer tokens, CSRF is not strictly required. However, for defense-in-depth:

```javascript
const { csrfProtection } = require("../middleware/csrf");

// Apply to admin mutation endpoints that may also use cookies:
router.post("/", protect, authorizeAdmin, csrfProtection, validateWorkshopCreate, ...);
router.put("/:id", protect, authorizeAdmin, csrfProtection, validateWorkshopEdit, ...);
router.delete("/:id", protect, authorizeAdmin, csrfProtection, ...);
```

---

### H3. Validation Schemas Allow Unknown Fields (`.unknown(true)`)

**File:** `server/middleware/validation.js`
**Severity:** High

**Description:** 12 Joi validation schemas use `.unknown(true)`, allowing unvalidated fields to pass through to controllers. While the response guards and manual field filtering prevent most exploits, this weakens the input validation layer.

**Affected schemas and lines:**

| Schema | Line | Risk Level |
|--------|------|-----------|
| `familyMemberSchema` | 30 | Low (intentional for UI flags) |
| `validateLogin` | 107 | Medium |
| `validateSendOtp` | 113 | Low |
| `validateOTP` | 136 | Low |
| `validateUserRegistration` | 186 | Medium |
| `validateUserEdit` | 197 | Medium |
| `validateFamilyMember` | 212 | Low |
| `validateWorkshopCreate` | 393 | High (admin mutation) |
| `validateWorkshopEdit` | 436 | High (admin mutation) |
| `validateWorkshopRegistration` | 452 | Medium |
| `validateWorkshopUnregister` | 462 | Low |
| `validateProfile` | 490 | Low |

**Fix recommendation:**

Change to `.unknown(false)` where safe, and use `.strip()` for known extra fields:

```javascript
// Workshop create/edit — change to unknown(false), add known extra fields:
const validateWorkshopCreate = celebrate({
  [Segments.BODY]: Joi.object({
    // ... existing fields ...
  }).unknown(false),  // Reject unknown fields
});

// Login — change to unknown(false):
const validateLogin = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().min(4).max(64).required(),
    captchaToken: Joi.string().trim().optional(),  // Explicitly allow if needed
  }).unknown(false),
});

// For familyMemberSchema, keep unknown(true) but document:
// INTENTIONAL: Allows UI state flags like 'isOpen' from frontend
```

For schemas where the frontend sends known extra fields (like `captchaToken`), add them explicitly rather than using `.unknown(true)`.

---

## Medium Severity

### M1. Search Endpoints Missing Input Validation

**File:** `server/routes/workshops.js:69`, `server/routes/users.js`
**Severity:** Medium

**Description:** The `/api/workshops/search` and `/api/users/search` endpoints accept query parameters without Celebrate/Joi validation. While `sanitizeBody` middleware strips dangerous characters from `req.query`, there is no validation on field lengths, types, or allowed values.

**Current code:**
```javascript
// No validation middleware applied
router.get("/search", workshopController.searchWorkshops);
```

The controller does normalize the query internally (trim, lowercase, strip special chars, `escapeRegex`), but there is no limit validation on `page` or `limit` query parameters at the middleware level.

**Fix recommendation:**

Add a validation middleware:

```javascript
const validateWorkshopSearch = celebrate({
  [Segments.QUERY]: Joi.object({
    q: Joi.string().max(100).trim().optional(),
    city: Joi.string().max(50).trim().optional(),
    coach: Joi.string().max(50).trim().optional(),
    type: Joi.string().max(50).trim().optional(),
    day: Joi.string().max(20).trim().optional(),
    hour: Joi.string().max(20).trim().optional(),
    ageGroup: Joi.string().max(50).trim().optional(),
    available: Joi.boolean().optional(),
    page: Joi.number().integer().min(1).max(1000).optional(),
    limit: Joi.number().integer().min(1).max(200).optional(),
  }).unknown(false),
});

router.get("/search", validateWorkshopSearch, workshopController.searchWorkshops);
```

---

### M2. Rate Limiting Gaps — User Search and Admin Hub

**File:** `server/routes/users.js`, `server/routes/adminHub.js`
**Severity:** Medium

**Description:** Several endpoints rely only on the global rate limiter (300/min) without per-endpoint or per-user limits:

| Endpoint | Current Rate Limit |
|----------|-------------------|
| `GET /api/users/search` | Global only (300/min) |
| `GET /api/users` (list all) | Global only |
| `GET /api/admin/hub/logs` | Global only |
| `GET /api/admin/hub/alerts/*` | Global only |
| `GET /api/admin/hub/stale-users` | Global only |

**Fix recommendation:**

```javascript
// User search — add per-user limit
const searchLimiter = perUserRateLimit({ windowMs: 10 * 60 * 1000, limit: 30 });
router.get("/search", protect, searchLimiter, usersController.searchUsers);

// Admin hub — see H1 for hub password rate limiter
```

---

### M3. Response Guard Edge Case — `adminHidden` in Non-Admin Context

**File:** `server/contracts/responseGuards.js:38-62`
**Severity:** Medium

**Description:** The `deriveContextAllowlist()` function allows `adminHidden` in workshop mutation responses based solely on HTTP method and route path, without checking whether the requester is actually an admin. If a non-admin somehow reaches a workshop mutation endpoint (e.g., through a middleware bypass), the response would leak `adminHidden` status.

**Current code:**
```javascript
if (isWorkshopMutation) {
  return ["adminHidden"];  // Allows regardless of caller's scope
}
```

**Mitigating factors:** The `authorizeAdmin` middleware prevents non-admins from reaching these endpoints. This is a defense-in-depth concern.

**Fix recommendation:**

Pass the admin scope into the context check:

```javascript
// In server.js response contract wrapper:
enforceResponseContract(payload, {
  context: `${req.method} ${req.originalUrl}`,
  isAdminScope: !!req.user?.authorities?.admin,
});

// In responseGuards.js:
const deriveContextAllowlist = (context = "", isAdminScope = false) => {
  // ...
  if (isWorkshopMutation && isAdminScope) {
    return ["adminHidden"];
  }
  return [];
};
```

---

### M4. Log Scrubbing — PII Fields Not Covered

**File:** `server/server.js:55-61`
**Severity:** Medium

**Description:** The log scrubbing function redacts `password`, `token`, `secret`, `authorization`, `otp`, and `code` from JSON-formatted log output. However, PII fields are not scrubbed:

**Not scrubbed:**
- `email` — User email addresses appear in logs
- `phone` — Phone numbers appear in logs
- `idNumber` — National ID numbers appear in logs
- `birthDate` — Birth dates appear in logs
- Raw email addresses in non-JSON format (e.g., controller log messages)

**Fix recommendation:**

Extend the scrub patterns:

```javascript
const scrub = (s = "") =>
  String(s)
    .replace(/Bearer\s+[A-Za-z0-9.\-_]+/g, "Bearer ***")
    .replace(
      /("(password|pass|token|secret|authorization|otp|code|email|phone|idNumber|birthDate)"\s*:\s*")([^"]+)/gi,
      '$1***'
    )
    // Scrub raw email patterns
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]");
```

---

### M5. Dev Route Secret — Non-Timing-Safe Comparison

**File:** `server/routes/dev.js:30`
**Severity:** Medium

**Description:** The dev route admin secret is compared using simple string equality (`!==`) instead of `crypto.timingSafeEqual()`, making it vulnerable to timing attacks.

**Current code:**
```javascript
if (providedSecret !== configuredSecret) {
  return res.status(401).json({ message: "Invalid or missing admin secret" });
}
```

**Mitigating factors:** Dev routes are disabled in production (`requireDevSurface` checks `NODE_ENV !== "production"`), and a rate limiter (5/min) is applied. The risk is limited to development environments.

**Fix recommendation:**

```javascript
const crypto = require("crypto");

const safeEqual = (a, b) => {
  if (!a || !b) return false;
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
};

if (!safeEqual(providedSecret, configuredSecret)) {
  return res.status(401).json({ message: "Invalid or missing admin secret" });
}
```

---

### M6. Error Message Leakage in Controllers

**File:** Multiple controller files
**Severity:** Medium

**Description:** The main error handler in `server.js` hides error details in production, but several controllers directly return `err.message` in error responses, which could leak internal details:

**Examples:**
- Workshop audit route: `res.status(500).json({ success: false, message: e.message })` (`workshops.js:43`)
- Various catch blocks in controllers that return `error: err.message`

**Fix recommendation:**

Use a consistent error response pattern:

```javascript
// In catch blocks:
catch (err) {
  console.error("[CONTROLLER] Error:", err.message);
  const message = process.env.NODE_ENV === "production"
    ? "Server error"
    : err.message;
  res.status(500).json({ success: false, message });
}
```

Or better, let errors propagate to the centralized error handler via `next(err)`.

---

## Low Severity

### L1. CORS `x-admin-password` in Allowed Headers

**File:** `server/server.js:140`
**Severity:** Low

**Description:** The `x-admin-password` header is listed in CORS `allowedHeaders`, which means any allowed origin can send this header in cross-origin requests. While this is necessary for the admin hub to function, it increases the attack surface.

**Fix recommendation:**

Consider whether admin hub requests should be restricted to same-origin only, or add the header dynamically based on the route.

---

### L2. Hardcoded Dev Defaults for CORS Origins

**File:** `server/server.js:95-98`
**Severity:** Low

**Description:** Localhost dev ports (`5173`, `3000`) are hardcoded as CORS defaults. This is standard practice but could be made configurable.

**Current code:**
```javascript
const DEV_DEFAULTS = ["http://localhost:5173", "http://localhost:3000"];
```

**Fix recommendation:**

Make configurable via env var:
```javascript
const DEV_DEFAULTS = parseCSV(process.env.DEV_ALLOWED_ORIGINS || "http://localhost:5173,http://localhost:3000");
```

---

### L3. Audit Log `sanitizeMetadata` Key Matching — Broad Patterns

**File:** `server/services/AuditLogService.js:19-32`
**Severity:** Low

**Description:** The `isSensitiveKey` function uses `includes()` to match sensitive keys, which means any key containing substrings like `id`, `token`, or `email` will be stripped from metadata. This could unintentionally remove legitimate metadata fields like `workshopId`, `sessionId`, `emailVerified`, etc.

**Current code:**
```javascript
const SENSITIVE_KEYS = ["password", "token", "otp", "email", "phone", "idnumber", "id_number", "_id", "id"];

const isSensitiveKey = (key = "") =>
  SENSITIVE_KEYS.some((needle) => key.toLowerCase().includes(needle));
```

**Fix recommendation:**

Use exact match or word-boundary matching:
```javascript
const SENSITIVE_EXACT_KEYS = new Set([
  "password", "token", "otp", "email", "phone",
  "idnumber", "id_number", "_id", "id",
  "passwordHash", "otpCode", "refreshToken",
]);

const isSensitiveKey = (key = "") => SENSITIVE_EXACT_KEYS.has(key.toLowerCase());
```

---

## Implementation Priority

| Priority | Finding | Effort |
|----------|---------|--------|
| 1 | H1 — Admin hub rate limiting | Low (add middleware) |
| 2 | H3 — Tighten `.unknown(true)` schemas | Medium (test each schema) |
| 3 | M1 — Search validation | Low (add Celebrate schema) |
| 4 | M4 — Log scrubbing PII | Low (extend regex) |
| 5 | M6 — Error message leakage | Low (standardize catch blocks) |
| 6 | H2 — CSRF on workshop mutations | Medium (assess Bearer-only risk) |
| 7 | M2 — Rate limiting gaps | Low (add middleware) |
| 8 | M3 — Response guard scope check | Low (pass admin flag) |
| 9 | M5 — Dev route timing-safe compare | Low (change comparison) |
| 10 | L1-L3 — Low severity items | Low |

---

## False Positives

### `.env` Secrets in Git History

Some automated scanners may flag `.env` as containing secrets committed to version control. **This is a false positive** — the `.env` file is listed in `.gitignore` and is not tracked by git. Secrets are managed through environment variable injection at the deployment level (Render.com).
