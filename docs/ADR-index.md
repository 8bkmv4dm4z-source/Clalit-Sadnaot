# ADR Index and Decision Log

This file tracks architecture/security decisions that should remain explicit over time.

## How to Use

- Add one entry per decision/change.
- Link to code/docs that implement the decision.
- Keep superseded entries; mark status instead of deleting history.

## Status Values

- `Accepted`: active decision.
- `Proposed`: drafted, not yet adopted.
- `Superseded`: replaced by another ADR entry.
- `Deprecated`: no longer recommended for new work.

## ADR Template

```md
### ADR-00X: <Title>
- Date: YYYY-MM-DD
- Status: Proposed | Accepted | Superseded | Deprecated
- Context: <problem/constraints>
- Decision: <what was chosen>
- Consequences: <tradeoffs, risks, operational impact>
- References: <files/docs/PRs>
```

## Decision Log

### ADR-001: Opaque Entity Keys Instead of Raw Mongo IDs
- Date: 2026-02-21
- Status: Accepted
- Context: API responses should not expose internal `_id` values.
- Decision: Use HMAC-derived `entityKey`/`hashedId` as external identity tokens.
- Consequences: Improves data-minimization and ID opacity; requires stable secret management (`PUBLIC_ID_SECRET`).
- References: `server/utils/hashId.js`, `server/models/User.js`, `server/models/Workshop.js`, `docs/security.md`

### ADR-002: JWT + Rotating Refresh Sessions
- Date: 2026-02-21
- Status: Accepted
- Context: Need stateless access auth with revocable long-lived sessions.
- Decision: Short-lived access JWTs plus refresh token rotation and reuse detection.
- Consequences: Better session security with higher implementation complexity in refresh/session lifecycle.
- References: `server/controllers/authController.js`, `server/services/refreshTokenService.js`, `docs/security.md`

### ADR-003: Response Contract Guard for Sensitive Field Stripping
- Date: 2026-02-21
- Status: Accepted
- Context: Controllers can accidentally return privileged/internal fields.
- Decision: Enforce response contract in `res.json` wrapper and strip forbidden fields.
- Consequences: Reduces data leakage risk; development mode may fail fast on contract violations.
- References: `server/contracts/responseGuards.js`, `server/server.js`, `docs/security.md`

### ADR-004: Security Middleware Stack Scoped to `/api/**`
- Date: 2026-02-21
- Status: Accepted
- Context: API endpoints need consistent protection without over-securing static assets.
- Decision: Keep CORS/Helmet/body parsing global and apply API-focused hardening to `/api/**` router.
- Consequences: Clear security boundary; route mount changes must preserve middleware ordering.
- References: `server/server.js`, `docs/api-flow.md`, `docs/security.md`

### ADR-005: Admin Capability Is Server-Authoritative (No `isAdmin` Transport Flag)
- Date: 2026-02-21
- Status: Accepted
- Context: Client-visible admin booleans can leak authorization metadata and be abused.
- Decision: Do not expose raw admin hints; derive admin behavior from protected endpoint access.
- Consequences: Client logic must probe authorized endpoints; keeps authorization state private.
- References: `server/ADMIN_ACCESS.md`, `server/middleware/authMiddleware.js`

## Change Log (Newest First)

- 2026-02-21: Initialized ADR index and seeded baseline accepted decisions from current implementation.
