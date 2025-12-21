Full Security Diagnostic
Overview

The project is a production‑intended web application built with React (Vite) on the client and Node.js/Express on the backend. Users register through an OTP‑based flow and receive short‑lived JWT access tokens and longer‑lived refresh tokens. Workshops can be created, edited and deleted by admins, and authenticated users can register themselves or family members to workshops and manage waiting lists. MongoDB stores application data.

The audit focuses on abuses after registration, meaning attackers already possess valid credentials and tokens. All external requests must be treated as potentially malicious regardless of authentication status.

1. Authentication
1.1 Unlimited Refresh Tokens & No Rotation

Severity: 🔴 High

Vulnerable: Refresh token management (authController.refreshAccessToken)

Exploit: The backend stores every issued refresh token in User.refreshTokens without any limit and does not rotate or invalidate the old token on refresh. An authenticated attacker can accumulate unlimited refresh tokens by repeatedly logging in or verifying OTP and then resell or reuse those tokens. Since refreshAccessToken simply returns a new access token without removing or rotating the refresh token
github.com
, stolen tokens remain valid. There is no reuse detection, so a stolen refresh token can be used indefinitely until it expires.

Fix: Implement refresh token rotation and reuse detection. Store only the latest refresh token per user (or per device) and invalidate the entire family on reuse. During refresh, compare the presented token with the stored hash; if it matches, issue a new refresh token and replace the stored hash. If a different (old) token is seen, invalidate all tokens and require reauthentication.

Code Example (before → after):

Before (authController.refreshAccessToken):

// existing refresh logic
const session = user.refreshTokens.find((rt) => tokensMatch(rt.token, token));
if (!session) return res.status(403).json({ message: "Refresh not recognized" });
const newAccess = generateAccessToken(user);
return res.json({ accessToken: newAccess });


After (rotate and detect reuse):

// Remove old token entry and rotate token
const sessionIdx = user.refreshTokens.findIndex((rt) => tokensMatch(rt.token, token));
if (sessionIdx === -1) {
  // Reuse detected – revoke all refresh tokens
  user.refreshTokens = [];
  await user.save();
  return res.status(403).json({ message: "Refresh token reuse detected. Please login again." });
}
// Generate new refresh token and replace the old one
const newRefresh = generateRefreshToken(user);
const hashedNew = hashRefreshToken(newRefresh);
user.refreshTokens[sessionIdx] = { token: hashedNew, userAgent: req.headers['user-agent'] || '' };
await user.save();
setRefreshCookie(res, newRefresh);
return res.json({ accessToken: generateAccessToken(user) });


Hardening Suggestions:

Limit the number of concurrent refresh tokens per user (e.g., one per device). Reject or revoke when the limit is exceeded.

Set a shorter expiry on refresh tokens (e.g., 1–2 weeks) and require reauthentication thereafter.

Consider binding refresh tokens to device information (IP, UA) and checking for anomalies.

1.2 Account Enumeration in OTP & Registration Flow

Severity: 🔴 High

Vulnerable: OTP send and registration endpoints (authController.sendOtp, requestRegistration, verifyRegistrationOtp)

Exploit: sendOtp returns 404 when the email does not exist
github.com
, and requestRegistration / verifyRegistrationOtp return specific messages when a user already exists
github.com
github.com
. Attackers can iterate through email addresses and differentiate between registered and unregistered users, enabling targeted phishing or credential stuffing. OWASP warns that differing error messages allow user enumeration
owasp.org
.

Fix: Always return a generic response regardless of whether the account exists. For example, respond with “If the account exists, an OTP has been sent.” and never reveal that an account is missing.

Code Example (before → after):

Before (sendOtp):

const user = await User.findOne({ email });
if (!user) return res.status(404).json({ message: "User with this email not found" });


After:

const user = await User.findOne({ email });
// Always respond with success to prevent enumeration
if (!user) {
  // Introduce a small delay to equalize timing
  await new Promise(resolve => setTimeout(resolve, 300));
  return res.json({ success: true, message: "If the account exists, an OTP has been sent." });
}
// Continue with normal OTP generation for valid users


Before (requestRegistration / verifyRegistrationOtp):
These return 400 or 409 when user exists
github.com
github.com
.

After:

// At the start of requestRegistration
const existing = await User.findOne({ ... });
if (existing) {
  // Always return a generic message
  return res.status(202).json({ success: true, message: "If registration is possible, you will receive an OTP." });
}


Similarly modify verifyRegistrationOtp to always return a generic success or failure message.

Hardening Suggestions:

Add rate limiting per email/phone for OTP requests to prevent brute‑force enumeration.

Log enumeration attempts for monitoring and alerting.

1.3 Refresh Token Accumulation & Logout

Severity: 🔴 Medium

Vulnerable: loginUser and verifyOtp append refresh tokens to user.refreshTokens without limit
github.com
github.com
.

Exploit: Attackers can generate many refresh tokens by repeatedly logging in or sending OTP codes. If an attacker compromises one token, they can maintain access even after the user logs out because other tokens remain valid. Additionally, there is no automatic removal of expired refresh tokens.

Fix: Limit the number of stored refresh tokens per user and clean up expired ones. When issuing a new token, remove the oldest or least recently used tokens beyond a configured limit (e.g., five). Add expiry timestamps to refresh token records.

Code Example (simple limit):

// When storing new refresh token
const maxTokens = 5;
const hashed = hashRefreshToken(refreshToken);
user.refreshTokens.push({ token: hashed, createdAt: Date.now(), userAgent });
// Remove oldest if over limit
if (user.refreshTokens.length > maxTokens) {
  user.refreshTokens = user.refreshTokens.slice(-maxTokens);
}
await user.save();


Hardening Suggestions:

Periodically prune refreshTokens array of expired tokens based on createdAt.

Provide a “revoke all sessions” feature so users can invalidate all active tokens.

1.4 SameSite Cookie & Session Fixation

Severity: 🟡 Low

Vulnerable: setRefreshCookie sets sameSite: 'Lax'
github.com
. If the application needs cross‑site requests (e.g., hosted on a subdomain and consumed by another domain), Lax may be insufficient; if cross‑site uses are not needed, Lax is safe. Cookies are cleared on logout, but there is no session ID rotation.

Exploit: Attackers could attempt session fixation by forcing a victim to use a known refresh token cookie. Without rotating session IDs on login, the risk is low but existent.

Fix: Rotate refresh cookies on login/OTP verification (already done when issuing tokens). Ensure secure: true and httpOnly remain set; change SameSite to Strict if cross‑site access is not required. If cross‑site is required, set SameSite=None and ensure TLS is always used.

2. Authorization (Post‑Registration)
2.1 Insecure Direct Object Reference (IDOR)

Severity: 🔴 High

Vulnerable: Workshop participant endpoints return raw MongoDB _id values for users and family members
github.com
github.com
. OWASP recommends using unguessable identifiers and performing ownership checks
cheatsheetseries.owasp.org
.

Exploit: An authenticated user can enumerate internal IDs from the participants list and attempt unauthorized actions against those IDs (e.g., unsubscribe another user, craft requests with guessed IDs). Even if endpoints verify ownership, exposing IDs reveals the total number of users/family members and aids enumeration.

Fix: Never return raw _id fields to non‑admin clients. Use hashed entityKey values everywhere. Update getWorkshopById and getWorkshopParticipants to map _id fields to entityKey (already computed via hashId) before sending responses.

Code Example:

// Modify normalization of participants in getWorkshopParticipants
const participants = (workshop.participants || []).map((u) => ({
  entityKey: u.entityKey || hashId('user', String(u._id)),
  name: u.name,
  email: u.email || '',
  // ... other fields
}));

// For family registrations
const familyRegistrations = (workshop.familyRegistrations || []).map((f) => {
  const fm = f.familyMemberId || {};
  return {
    entityKey: fm.entityKey || hashId('family', String(fm._id)),
    parentKey: f.parentUser?.entityKey || hashId('user', String(f.parentUser?._id)),
    // ... other fields
  };
});


Similarly, update normalize participants in getWorkshopById to use hashed keys instead of converting _id to string.

Hardening Suggestions:

Use UUIDs or opaque tokens for all user‑facing identifiers.

Implement ownership checks at the database query level (e.g., always query Workshop.findOne({ _id, participants: userId }) instead of checking after retrieval).

2.2 Unrestricted Participants Endpoint Exposes PII

Severity: 🔴 High

Vulnerable: GET /api/workshops/:id/participants is protected by authentication but not by admin authorization
github.com
. It returns names, emails, phones, ID numbers, birth dates and payment flags for all participants and family members
github.com
.

Exploit: An authenticated attacker can call this endpoint on every workshop to harvest personal information of all participants (names, phone numbers, ID numbers) for spam, identity theft or other malicious actions. Since there is no role check, any user can scrape the entire participant database.

Fix: Restrict the endpoint to admins only or to the owner of the workshop (e.g., the coach). At minimum, return only non‑sensitive fields (name) for normal users and keep sensitive fields (phone, ID number, birth date) for admin.

Code Example:

// Add authorizeAdmin middleware to route
router.get('/:id/participants', protect, authorizeAdmin, workshopController.getWorkshopParticipants);

// Or apply role check inside controller
if (req.user.role !== 'admin') {
  return res.status(403).json({ message: 'Forbidden' });
}


If regular users need to see participants, remove sensitive fields:

const safeParticipants = participants.map(p => ({ name: p.name }));


Hardening Suggestions:

Apply field‑level filtering based on user role using a serializer (e.g., sanitizeUserForResponse).

Audit all endpoints to verify that authorizeAdmin is applied wherever sensitive data is returned.

2.3 Optional Authentication on Workshop Listing

Severity: 🟠 Medium

Vulnerable: getAllWorkshops uses attachUserIfPresent which does not require authentication
github.com
. Unauthenticated users can query all workshops (names, dates, capacities), albeit with limited fields.

Exploit: While not directly a vulnerability, attackers can scrape workshop metadata and monitor capacities to identify busy periods or plan targeted spamming.

Fix: Decide if listing workshops is intended for unauthenticated users. If not, require authentication by applying the protect middleware. If yes, ensure the response does not include PII or internal counts.

3. Post‑Registration Business Logic Abuse
3.1 Workshop Capacity & Waitlist Abuse

Severity: 🟡 Medium

Vulnerable: The registerEntityToWorkshop function checks capacity and waitlist size but does not lock documents during concurrent updates
github.com
. Multiple rapid registrations could race past capacity and oversubscribe the workshop.

Exploit: An attacker could send concurrent registration requests to register multiple family members simultaneously, bypassing maxParticipants and waitlist constraints. Because MongoDB updates are not atomic across arrays, race conditions could allow over‑registration.

Fix: Use atomic operations or transactions when checking capacity and updating participants. For example, perform an updateOne with $addToSet conditioned on participants.length < maxParticipants. Alternatively, wrap registration logic in a [MongoDB transaction] with proper session.startTransaction() and abort if over capacity.

Code Example:

// pseudo-code using findOneAndUpdate
const result = await Workshop.findOneAndUpdate(
  { _id: workshop._id, $expr: { $lt: [ { $size: "$participants" }, "$maxParticipants" ] } },
  { $addToSet: { participants: parentId } },
  { new: true }
);
if (!result) return res.status(400).json({ message: 'Workshop full' });


Hardening Suggestions:

Apply similar atomic logic to waitlist operations.

Use optimistic concurrency control (check __v version) or database transactions when modifying multiple documents (workshop and user).

3.2 Family Member/Parent Confusion

Severity: 🟠 Medium

Vulnerable: The logic for checking ownership uses assertOwnershipOrAdmin which verifies that ownerId === req.user._id
github.com
. However, family members are linked only through parentKey/entityKey; attackers might attempt to act on behalf of a family member by guessing entityKey or bypassing checks. Because getWorkshopParticipants returns raw _id values for family members
github.com
, an attacker could craft a unregisterEntityFromWorkshop request with a family member’s ID.

Exploit: A malicious user obtains another family member’s _id and sends a DELETE /api/workshops/:id/unregister-entity with that entityKey. Without verifying that the family member belongs to the authenticated user, the system could unregister someone else.

Fix: Ensure that resolveEntityByKey returns both the user and member document, and assertOwnershipOrAdmin always checks that ownerId matches the current user’s ID. Remove acceptance of raw _id or familyMemberId from client and rely solely on hashed keys. The existing resolveEntityByKey does not accept raw ObjectIds, but since getWorkshopParticipants leaks _ids, fix that first.

4. API Security & Input Validation
4.1 Mass Assignment & Forbidden Fields

Severity: 🟢 Low (fixed)

Observation: Controllers explicitly reject forbidden fields and pick only allowed fields for updates (rejectForbiddenFields and allowed arrays)
github.com
github.com
. This prevents mass assignment vulnerabilities. No action needed.

4.2 Injection Risks

Severity: 🟢 Low (mitigated)

Observation: Input validation uses Joi patterns and sanitizes user input to exclude <, >, $, {, } to prevent injection
github.com
. Mongo queries are parameterized and never directly concatenate user input. No direct NoSQL injection was found. Continue to monitor.

4.3 Error Leakage

Severity: 🟡 Low

Vulnerable: Some error responses include stack traces or error messages in non‑production environments (e.g., registerEntityToWorkshop returns err.message when NODE_ENV !== 'production'
github.com
). In production, they are suppressed, which is safe. Ensure that NODE_ENV is set to production in deployment.

5. Data Security
5.1 PII Exposure via Workshop Participants

Severity: 🔴 High

Vulnerable: As noted in section 2.2, the participants endpoint discloses sensitive information (full name, phone number, ID number, birth date, canCharge)
github.com
. This violates data minimization. It is also returned via exportWorkshopExcel (admin only) which is acceptable.

Fix: Restrict this endpoint to admin only and mask or omit sensitive fields for regular users. Return only name and optionally entityKey. For admin exports, send via secure channels (already done via email service). Avoid returning ID numbers to the client.

5.2 Sensitive Data in Logs

Severity: 🟠 Medium

Observation: Logging functions attempt to sanitize tokens and sensitive fields before writing to log files, but developers should audit logs for accidental leakage. Ensure no JWTs, refresh tokens, or OTP codes are logged. Consider using structured logging with built‑in redaction.

5.3 Encryption & Secrets

Severity: 🟢 Low

Observation: The code uses HTTPS/TLS for deployment and sets cookies with secure: true in production
github.com
. JWT secrets and API keys are stored in environment variables. Ensure they are not committed to source control and that the environment is properly configured. Consider using a secret management service.

6. Rate Limiting & Abuse Prevention
6.1 Insufficient Authenticated Rate Limits

Severity: 🟠 Medium

Vulnerable: The server implements global and route‑specific rate limiters in server.js. However, rate limits are primarily IP‑based. After authentication, an attacker can bypass per‑IP limits by using a single account across many IP addresses (botnet) or by being whitelisted via the special workshopWriteLimiter for admin IDs. An authenticated user could flood endpoints like searchWorkshops or registerEntityToWorkshop without hitting limits.

Fix: Implement per‑user or per‑token rate limiting using identifiers extracted from JWT claims. For example, integrate express-rate-limit with a Redis store keyed by userId. Set stricter limits on endpoints that modify data (registrations, waitlist, OTP requests). Provide Retry-After headers as recommended
dzone.com
.

Code Example:

const rateLimit = require('express-rate-limit');
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  keyGenerator: (req) => req.user?.id || req.ip,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/workshops/:id/register-entity', protect, authLimiter);


Hardening Suggestions:

Combine IP‑based and user‑based limits to deter distributed attacks.

Log rate‑limit violations and ban abusive accounts.

6.2 OTP Resend Abuse

Severity: 🟠 Medium

Observation: Although there is route‑level rate limiting for OTP sends, an attacker could register many accounts and request OTP codes repeatedly, consuming resources or sending spam. Add per‑account daily limits and CAPTCHA or email verification to reduce abuse.

7. Headers & Transport Security
7.1 HTTP Security Headers

Severity: 🟢 Low (mostly implemented)

Observation: The server uses helmet to set common security headers and configures CORS. Ensure that Strict-Transport-Security (HSTS) is enabled and that Content‑Security‑Policy (CSP) is defined to mitigate XSS. Ensure cookies use secure, httpOnly and appropriate SameSite flags
expressjs.com
.

Fix: Add HSTS and CSP in server.js:

app.use(helmet());
app.use(helmet.hsts({ maxAge: 31536000, includeSubDomains: true }));
app.use(helmet.contentSecurityPolicy({ directives: { defaultSrc: ["'self'"] } }));

7.2 CORS Configuration

Severity: 🟢 Low

Observation: CORS is configured to allow specific origins via ALLOWED_ORIGINS and PUBLIC_URL and disables CORS in development. Ensure that no wildcard origins are allowed in production and that credentials is set properly. Always specify allowed methods and headers.

8. Deployment & Configuration
8.1 Environment Variable Leaks

Severity: 🟠 Medium

Observation: The code reads process.env variables for secrets; ensure that environment files are never exposed via the frontend or served statically. Use build‑time variables only on the server. Avoid committing .env files to the repository.

8.2 Debug Flags

Severity: 🟢 Low

Observation: Verbose logging is enabled when NODE_ENV !== 'production'. Ensure that the production environment sets NODE_ENV=production to disable debug logs and stack traces.

8.3 Proxy & TLS

Severity: 🟠 Medium

Observation: If running behind proxies (e.g., Render or Nginx), call app.set('trust proxy', 1) and enforce HTTPS redirection. Ensure TLS termination is handled correctly and that secure cookies work.

9. Dependency & Supply‑Chain Risks

Severity: 🟠 Medium

Observation: The project uses many dependencies (Mongoose, Joi, ExcelJS, Resend, etc.). There is no automated supply‑chain scanning in the repository. Outdated packages with known CVEs may exist. For example, early versions of jsonwebtoken had algorithm confusion vulnerabilities, and express-rate-limit has had DoS issues.

Fix:

Run npm audit or integrate a tool like Snyk to identify vulnerable packages
expressjs.com
.

Upgrade to the latest LTS versions of dependencies.

Remove unused packages and separate dev dependencies from production dependencies.

Hardening Suggestions:

Use npm's --production flag
 or Docker multi‑stage builds to avoid shipping dev tools to production.

Enable Dependabot alerts in GitHub to receive CVE notifications.

Prioritized Checklist
Priority	Action
1	Eliminate account enumeration: Normalize responses in OTP and registration flows; adopt generic messages
github.com
github.com
.
2	Secure refresh tokens: Implement rotation and reuse detection and limit the number of active tokens per user
github.com
.
3	Restrict participants endpoint: Add authorizeAdmin to /workshops/:id/participants and remove sensitive fields for non‑admins
github.com
github.com
.
4	Stop leaking internal IDs: Use hashed entityKey instead of raw _id in all responses
github.com
.
5	Add per‑user rate limiting: Implement rate limits keyed by user ID or token for authenticated endpoints
dzone.com
.
6	Audit & update dependencies: Run npm audit/Snyk and upgrade vulnerable packages
expressjs.com
.
7	Atomic workshop registration: Use transactions or atomic updates to enforce capacity and waitlist limits
github.com
.
8	Harden cookie & security headers: Add HSTS and CSP; consider SameSite=Strict for refresh cookies
expressjs.com
.
9	Prune refresh tokens & support session revocation: Limit stored tokens and provide user‑initiated session invalidation.
10	Implement per‑account OTP limits: e.g., max X OTPs per day.
Breaking Changes to Watch For

Refresh token rotation will require front‑end changes: the client must replace its stored refresh token after each refresh. All existing refresh tokens will be invalidated on deployment.

Participants endpoint authorization may break client features that expect full participant lists for normal users. Update the frontend to handle limited data or restrict access.

Hashed identifiers: When switching from raw _id to entityKey, adjust all front‑end code to send the hashed key.

Rate limiting keyed by user may throttle legitimate high‑throughput admin actions; configure separate limits for admins.

Use of CSP and HSTS might require adjusting resource loading or third‑party scripts.

Production‑Ready Security Baseline

Authentication: Use short‑lived access tokens (≤15 min). Employ refresh token rotation with reuse detection; limit concurrent refresh tokens per user. Enforce multi‑factor authentication for admin accounts.

Authorization: Always enforce server‑side role and ownership checks. Use hashed identifiers for all client‑visible references. Limit sensitive endpoints to admins. Consistently validate that the authenticated user owns or is allowed to act on the resource.

Input Validation: Validate and sanitize all user input via a schema (already implemented with Joi). Reject unknown fields and enforce type/format constraints.

Data Minimization: Never expose passwords, tokens, ID numbers, or phone numbers to unauthorized clients. Use sanitizeUserForResponse to strip sensitive fields
github.com
github.com
.

Rate Limiting: Apply IP‑ and user‑based rate limiting to all endpoints, with strict limits on OTP and registration attempts. Respond with HTTP 429 and Retry‑After headers.

Logging: Implement centralized logging with sensitive data redaction. Monitor logs for unusual patterns such as many OTP requests or refresh token reuses.

Transport Security: Enforce HTTPS everywhere. Set Secure and HttpOnly cookie flags and appropriate SameSite attributes. Add HSTS and CSP headers to mitigate man‑in‑the‑middle and XSS attacks.

Dependency Management: Perform continuous dependency scanning using npm audit, Snyk or Dependabot. Pin versions and avoid vulnerable packages.

Secrets Management: Store secrets (JWT keys, API keys) in a secure vault or environment variables not accessible to the client. Rotate secrets periodically.

Monitoring & Incident Response: Instrument metrics (failed logins, refresh token reuse) and set up alerts. Provide a mechanism to revoke sessions or disable accounts quickly.

Top Post‑Registration Exploits to Monitor in Production

Data Scraping by Authenticated Users: Attackers may register legitimately and use the participants endpoint to harvest PII. Monitor for high volumes of /workshops/:id/participants requests and unusual patterns. Implement rate limits and role checks to detect and block scraping.

Refresh Token Abuse: Attackers may steal or reuse refresh tokens to maintain long‑term access. Detect repeated use of the same refresh token; on reuse, revoke all tokens and force reauthentication. Log suspicious refresh attempts and notify the security team.

Privilege Escalation via ID Guessing: Attackers may guess or obtain internal IDs (_id) and attempt to unregister other users or access their data. Using hashed entityKey values and strict ownership checks will mitigate this, but monitor for requests referencing unknown keys or mismatched owners.

Excessive API Usage by a Single User: Monitor for high request rates from authenticated users (e.g., continuous searchWorkshops calls) indicating bot or DoS behaviour. Apply per‑user rate limiting and temporarily block abusive accounts.

Workshop Over‑Registration: Attackers could exploit race conditions to register multiple times or bypass capacity constraints. Monitor for spikes in concurrent registration requests and ensure atomic updates in the database.

Enumeration via OTP/Registration: Even after mitigating enumeration, monitor for patterns of OTP or registration requests from the same IP or email range that could signal automated attacks.

By addressing the vulnerabilities and implementing the above recommendations, the application will be better protected against both common web threats and abuses by authenticated users.
