# Agent Instructions: MERN Workshop App
This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## WHAT & WHY
**Project:** Full-stack MERN workshop registration app (React + Express + MongoDB).
**Structure:** Two independent packages in `client/` and `server/` — not a monorepo, no shared workspace tooling.
**Environment:** Node >=18.18.0 required. Deployed on Render.com (`render.yaml`).

---

## HOW (Universal Workflow & Commands)
*These rules apply to every session. Follow them strictly.*

**1. Branching First**
Before implementing any code changes, you MUST create and check out a descriptively named git branch. Do not write code directly on `main`.

**2. Formatting & Linting (Do not act as a linter)**
Do not waste context or time manually fixing code styles. Rely entirely on deterministic tools. Run `npm run lint` in the respective directory to analyze and fix formatting issues.

**3. Testing Strategy**
Both client and server use Node.js built-in `node:test` exclusively. Strictly NO Jest or Mocha.
- **Client Tests** (`client/tests/`): `npm test` runs `node --test tests/**/*.test.js`
- **Server Tests** (`server/tests/unit/` and `server/tests/integration/`): `npm test` runs `NODE_ENV=test node --test` (all tests)
- **Single Server Test:** `cd server && cross-env NODE_ENV=test node --test tests/unit/someFile.test.js`

**4. Commands**
- **Client (`client/`):** - `npm run dev` # Vite dev server on :5173, proxies /api → :5000
  - `npm run build` # Production build to client/dist/
  - `npm run lint` # ESLint (flat config, .js/.jsx)
- **Server (`server/`):** - `npm run dev` # Nodemon + NODE_ENV=development on :5000
  - `npm start` # NODE_ENV=production
  - `npm run k6` # k6 load tests
  - `npm run artillery` # Artillery load tests

---

## PROGRESSIVE DISCLOSURE (Context Map)
*IMPORTANT: The following context may or may not be relevant to your tasks. You should not read or respond to these specific sections unless they are highly relevant to your current task.*

### 🖥️ Domain: Client (Frontend)
*Read this if working on React, UI, Frontend State, or Client API calls.*
- **Stack:** React 18 with React Compiler (via Babel plugin in Vite), React Router v6, Tailwind CSS v3.
- **Module system:** ESM (`"type": "module"`).
- **Environment:** Client env vars prefixed with `VITE_` (Vite convention).
- **State:** Context API stack ordered in `main.jsx`: Event → Auth → AdminCapability → Profile → Workshop.
- **API layer:** `src/utils/apiFetch.js` — wraps fetch with Bearer token injection, silent 401 refresh via `/api/auth/refresh`, CSRF token management, and error normalization.
- **Routing:** Protected routes gated by `isLoggedIn` (AuthContext) and `canAccessAdmin` (AdminCapabilityContext). Fallback redirects to `/workshops`.
- **Structure:** Pages in `src/pages/`, layouts in `src/layouts/`, reusable UI in `src/components/`.

### ⚙️ Domain: Server (Backend)
*Read this if working on Express, MongoDB, Middleware, or Server Config.*
- **Stack:** Express 4 with CommonJS (`"type": "commonjs"`, `require()`).
- **Database:** MongoDB via Mongoose 8 (Atlas in prod).
- **Environment:** Reads `.env` via dotenv (MONGODB_URI, JWT_SECRET, JWT_REFRESH_SECRET, ALLOWED_ORIGINS, etc.).
- **Middleware stack** (`server.js`): trust proxy → CORS → Helmet → compression → body parsing → cookies → mongo sanitize → body sanitize → rate limiting → HPP → routes → error handler.
- **Auth:** JWT access tokens + HTTP-only refresh token cookies. Admin scope derived from `User.authorities`, never exposed to clients.
- **Validation:** Celebrate + Joi middleware in `middleware/validation.js`.
- **Audit:** `services/AuditLogService.js` logs mutations with HMAC-hashed subject keys, 14-day retention, 12-hour dedup window.

### 🔒 Domain: Security & API Contracts
*Read this if working on Data fetching, Admin access, User Privacy, or API Responses.*
- **No Admin Hints:** No `isAdmin` boolean or admin hints in API payloads — see `server/ADMIN_ACCESS.md`.
- **Entity keys:** Raw MongoDB `_id` values are never exposed. `utils/hashId.js` produces deterministic hashed keys (`entityKey`) used in URLs and responses.
- **Response guards:** `contracts/responseGuards.js` strips forbidden fields (`_id`, `passwordHash`, `authorities`, `adminHidden`, etc.) from all API responses. Context-aware allowlisting derives permitted fields from HTTP method + route.
- **Data Privacy:** Contact fields (email, phone, idNumber, birthDate) are stripped from participant lists via `CONTACT_FORBIDDEN_FIELDS`.
- **Error Handling:** Error messages are allowlisted for UI display — see `docs/error-normalization.md`.
