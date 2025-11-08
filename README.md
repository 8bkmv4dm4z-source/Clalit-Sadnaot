# Clalit Workshops Platform

This repository hosts the Clalit Workshops web platform. It contains a Vite/React
front-end (in `client/`) and an Express/MongoDB back-end (in `server/`). Recent
hardening work focused on eliminating authentication secrets from logs and
persistent storage while diagnosing outbound email delivery issues.

## Security Hardening Highlights

The authentication controller now hashes every refresh token before it is saved
to MongoDB. Timing-safe comparisons keep legacy plaintext entries compatible
while refusing mismatched tokens, preventing disclosure of long-lived session
secrets even if the database is exfiltrated.

```js
// server/controllers/authController.js
user.refreshTokens.push({
  token: hashRefreshToken(refreshToken),
  userAgent: req.headers["user-agent"] || "",
});
```

Additional safeguards include:

- Sanitised authentication logging that only emits diagnostic data in non-prod
  environments.
- Password-reset tokens that are generated with `crypto.randomBytes`, hashed
  with SHA-256, and given a short TTL.
- OTP codes that are cleared immediately after successful verification and
  capped by attempt counters.

See the inline `hashRefreshToken` comment for cross-references to this section.

## Email Delivery Status & Plan

The backend currently prefers the [Resend](https://resend.com) API and falls
back to Gmail when explicitly enabled. In the production environment only the
sandbox sender `Clalit Workshops <onboarding@resend.dev>` is configured, so
messages are dropped unless the recipient belongs to the verified sandbox list.

Action plan:

1. **Verify a custom sending domain inside Resend.** Update `MAIL_FROM`
   (or `RESEND_FROM_EMAIL`) to use that domain once verification succeeds.
2. **Keep the Gmail SMTP fallback enabled** (`USE_GMAIL=true`) until domain
   verification is complete so critical flows continue working.
3. **Add monitoring around email dispatch** (Resend dashboard or structured
   logs) to flag domain-related failures quickly.

## Project Structure

- `client/` – React application powered by Vite.
- `server/` – Express API, authentication controllers, and integration tests.
- `public/` – Static assets served by the client build.

## Local Development

Install dependencies once at the repository root:

```bash
npm install
npm --prefix server install
```

### Run the web client

```bash
npm run dev
```

### Run the API server

```bash
npm --prefix server run dev
```

### Tests & Linting

```bash
# Server unit tests
npm --prefix server test

# Server lint placeholder (prints a status message)
npm --prefix server run lint

# Front-end ESLint checks
npm run lint
```

The back-end tests rely on Node's built-in test runner and avoid mutating the
real filesystem or external mail providers. The lint command at `server/` is a
placeholder until an ESLint configuration is adopted.
