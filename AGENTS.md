# Repository Guidelines

## Project Structure & Module Organization
This repository is split into two main apps:
- `client/`: Vite + React frontend (`src/components`, `src/pages`, `src/layouts`, `src/utils`, `tests/`).
- `server/`: Express + MongoDB backend (`controllers`, `routes`, `services`, `models`, `middleware`, `tests/`, `scripts/`).

Shared project-level config lives at the root (`eslint.config.js`, root `package.json`, `docs/`, `public/`).

## Build, Test, and Development Commands
Use the package file in each app directory for day-to-day work.
- `npm run dev` (root or `client/`): start Vite dev server.
- `npm run build` (root or `client/`): create production frontend build.
- `npm run lint` (root): lint `client/**/*.{js,jsx}` and `server/**/*.js`.
- `cd client && npm test`: run frontend unit tests with Node test runner.
- `cd server && npm run dev`: run backend with `nodemon`.
- `cd server && npm test`: run backend tests (`node --test`).
- `cd server && npm run k6` / `npm run artillery`: run load/security scenarios when relevant.

## Coding Style & Naming Conventions
- Follow existing style: 2-space indentation, semicolons, ES modules in client, CommonJS in server.
- Components and pages: `PascalCase` (e.g., `WorkshopCard.jsx`).
- Utilities and services: `camelCase` filenames/functions (e.g., `normalizeError.ts`, `auditService.js`).
- Keep route/controller/service separation intact; avoid placing business logic in route files.
- Run `npm run lint` before opening a PR.

## Testing Guidelines
- Primary framework: Node’s built-in test runner (`node --test`).
- Place tests under `client/tests` and `server/tests`.
- Name tests `*.test.js` / `*.test.ts` and co-locate by domain (`unit`, `integration`, `security`, `jobs`, `load`).
- Add regression tests for any bug fix, especially auth, permissions, and workshop flows.

## Commit & Pull Request Guidelines
- Follow Conventional Commits used in history: `feat:`, `fix:`, `docs:`, with optional scope (`feat(client): ...`).
- Keep commits focused and atomic.
- PRs should include:
  - Clear summary and risk/impact notes.
  - Linked issue/ticket.
  - Test evidence (commands run and result).
  - UI screenshots/GIFs for frontend changes.

## Security & Configuration Tips
- Keep secrets in environment variables; never commit credentials or production tokens.
- Review `docs/security.md` and relevant server tests when modifying auth, rate limiting, CSRF, or audit logic.
