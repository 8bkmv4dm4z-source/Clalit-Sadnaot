# Project Resume

## High-level Architecture
- **Frontend:** React single-page app bootstrapped with Vite. Authenticated navigation flows through `AppRoutes`, which decides between the public layout and the authenticated shell with admin-only branches for profile and workshop management.【F:client/src/routes/AppRoutes/AppRoutes.jsx†L1-L84】
- **State Management:** Shared context providers wrap the UI—`AuthProvider` handles identity, token refresh, and account mutations, `WorkshopProvider` normalizes workshop data plus registration maps, `ProfileProvider` flattens user + family data for admin tables, and `EventProvider` exposes a toast bus for user feedback.【F:client/src/layouts/AuthLayout/AuthLayout.jsx†L70-L219】【F:client/src/layouts/WorkshopContext/WorkshopContext.jsx†L40-L645】【F:client/src/layouts/ProfileContext/ProfileContext.jsx†L40-L220】【F:client/src/layouts/EventContext/EventContext.jsx†L1-L135】
- **Backend:** Express API (`server.js`) mounts versioned routers under `/api`, applying security middleware, rate-limits, and admin bypass logic for workshop write operations before delegating to controller modules such as `workshopController`.【F:server/server.js†L1-L210】【F:server/routes/workshops.js†L1-L114】

## Core Client Flows & Components
- **AppShell & Header:** Authenticated pages share a sticky header that reacts to scroll and exposes navigation shortcuts, binding the workshops view toggle and logout to context actions.【F:client/src/layouts/AppShell.jsx†L1-L33】【F:client/src/components/Header/Header.jsx†L1-L135】
- **Workshops Directory:** `Workshops.jsx` fetches and filters the workshop list exclusively through `WorkshopContext`, drives Hebrew-aware search, and executes registration/waitlist mutations that refresh data and admin modals.【F:client/src/pages/Workshops/Workshops.jsx†L1-L218】【F:client/src/layouts/WorkshopContext/WorkshopContext.jsx†L85-L645】
- **Family Calendar:** `MyWorkshopsSimpleGcal` first gates on authentication/map readiness, then renders desktop/mobile calendars fed by user/family registration maps from the context for entity-colored scheduling.【F:client/src/pages/MyWorkshops/MyWorkshopsSimpleGcal.jsx†L1-L220】
- **Auth Screens:** `Login.jsx` validates credentials client-side before invoking `loginWithPassword`, while `Register.jsx` builds a schema-aligned payload including optional family members for the `registerUser` action.【F:client/src/pages/Login/Login.jsx†L1-L105】【F:client/src/pages/Register/Register.jsx†L1-L220】

## Shared Logic & Data Handling
- **Authentication Lifecycle:** The auth provider centralizes logout, token refresh, guarded `authFetch`, OTP verification, and entity updates, raising custom DOM events so other contexts (workshops, profiles) can respond to login-state changes and re-fetch sensitive datasets.【F:client/src/layouts/AuthLayout/AuthLayout.jsx†L94-L334】【F:client/src/layouts/WorkshopContext/WorkshopContext.jsx†L180-L408】
- **Workshop Mutations:** Registration, waitlist, and CRUD helpers in `WorkshopContext` call the REST API, trigger workshop/profile refetches, and maintain maps used by grid and calendar pages so UI stays consistent after each operation.【F:client/src/layouts/WorkshopContext/WorkshopContext.jsx†L410-L641】
- **Profile Management:** Admin-facing providers flatten parent/family entities, warm search caches, and expose incremental search that merges API results with cached data to support large rosters.【F:client/src/layouts/ProfileContext/ProfileContext.jsx†L74-L220】
- **Notifications:** Event bus publishes dismissible toasts with optional detail lists, allowing auth and workshop flows to surface validation responses without coupling UI components.【F:client/src/layouts/EventContext/EventContext.jsx†L11-L135】

## Server Responsibilities
- **Routing Layer:** Workshop routes cover public listings, authenticated registration flows, waitlists, and admin CRUD/export endpoints guarded by authentication and validation middleware.【F:server/routes/workshops.js†L20-L114】
- **Controller Logic:** `workshopController` enriches listings with per-user registration flags, auto-promotes waitlists, normalizes queries, and feeds metadata back to the client for pagination while coordinating with registration services.【F:server/controllers/workshopController.js†L1-L220】
- **Infrastructure:** The Express bootstrap configures logging, sanitization, rate-limiting, CORS allow-lists, and router mounting order to serve both API and static SPA assets from configurable paths.【F:server/server.js†L33-L220】

## Page & Data Interactions
- **Navigation Graph:** App routes link workshops, calendar, and profile views; admins gain edit/profile dashboards, and public users are redirected to the workshop catalogue when unauthenticated.【F:client/src/routes/AppRoutes/AppRoutes.jsx†L32-L84】
- **Context Reactions:** Workshop context listens for auth lifecycle events (`auth-ready`, `auth-logged-in`, `auth-user-updated`) to rebuild registration maps and filtered lists, ensuring My Workshops and admin modals stay in sync with the authenticated user state.【F:client/src/layouts/WorkshopContext/WorkshopContext.jsx†L180-L408】
- **Admin Tools:** Header buttons toggle workshop view modes, link to profile management, and reset editing state in localStorage before routing to the workshop editor, tying layout components to admin flows.【F:client/src/components/Header/Header.jsx†L62-L129】

## Current Test & Quality Status
- **Client tests:** `npm test` (client) executes eight validation unit tests—all passing—which cover password complexity and Israeli ID helpers.【ce09af†L1-L16】
- **Server tests:** `npm test` (server) runs OTP/email workflow tests under Node’s test runner; all four pass while emitting expected warnings about missing email transports in test mode.【c1aba1†L1-L24】
- **Lint:** Monorepo lint (`npm run lint` at root) currently fails with extensive style, hook, and module-boundary warnings across client and server sources, indicating cleanup is required before CI compliance.【777697†L1-L120】
