# Admin access transport contract

This project no longer exposes a raw `isAdmin` boolean in API payloads. Admin
awareness is delivered through an access envelope and response headers so
clients can toggle UI safely without introducing new NoSQL injection targets.

## What is sent to clients
- **Headers** (CORS-exposed):  
  - `X-Access-Scope`: `admin`, `user`, or `public`, derived solely from the
    authenticated principal’s authorities.  
  - `X-Access-Proof`: role hash keyed to the caller’s entityKey for
    tamper-evident caching (omitted for anonymous/public responses).
- **Payloads**: `sanitizeUserForResponse` adds an `access` object with the same
  `scope` and `proof`. Legacy `isAdmin` flags are intentionally absent.

## How to consume it
- Prefer `access.scope === "admin"` (or the `X-Access-Scope` header) to drive
  admin-only UI or request parameters.
- Ignore any inbound `isAdmin` or `role` values from client payloads; server
  middleware derives scope from persisted authorities and will not trust those
  fields.
- Error paths and unauthorized responses still emit `X-Access-Scope: public` so
  clients can degrade gracefully without throwing.
