# Security Identity Review

## Scope & Method
- Reviewed server-side code in the `server/controllers`, `middleware`, `routes`, `services/entities`, and `services/workshop*` areas for `_id` usage, identity resolution, and authorization flows.
- Classified each `_id` usage under the rule: ✅ storage-only after auth, ⚠️ transitional/fallback, ❌ used for access/identity decisions.

## ✅ Confirmed Safe Usages
- `middleware/authMiddleware.authenticate` authenticates solely via `entityKey` JWT subjects; `_id` appears only in logs and integrity hashes.
- Controller handlers in `controllers/workshopController.js`, `controllers/userController.js`, `controllers/authController.js`, `controllers/adminHubController.js`, and `controllers/workshop.participants.js` perform authorization with `entityKey` (either via `hasAuthority` or `assertOwnershipOrAdmin`) and use Mongo `_id` strictly for database mutations or lookups post-auth.
- `services/workshopRegistration` and related participant mutations use `_id` values only inside database operations after the caller’s entityKey has been authorized.
- Admin log responses (`controllers/adminHubController.js`, `services/AuditLogService.js`) strip `_id` before sending payloads.

## ⚠️ Transitional / Fallback Usages
- `routes/profile.js` uses `req.user._id` when proxying to `updateEntity`; the route is already authenticated via entityKey, but the injected Mongo `_id` keeps a legacy code path alive.
- `middleware/perUserRateLimit.js` builds rate-limit keys from `req.user._id` (or email/entityKey fallback). Identity is entityKey-based upstream, so this should eventually prefer `entityKey` to avoid `_id` reliance.
- `services/entities/resolveEntity.js` accepts raw ObjectId strings in addition to `entityKey` to support legacy callers; safe today but should be retired once clients fully send entityKey values.
- `services/entities/hydration.js` and `controllers/workshopController.js` (`toEntityKey`, participant/waitlist formatting) hash `_id` values when an entityKey is missing to keep responses opaque during migration.
- `services/workshopAuditService.js` falls back to hashed `_id` values when rebuilding participant/waitlist integrity; used for repair tasks, not for live authorization.

## ❌ Violations
- None observed. Access control and ownership checks consistently hinge on `entityKey`, and no permission decisions were found that compare or trust raw Mongo `_id`.

## Transitional Helpers (purpose & retirement path)
- `toEntityKey` (workshop controller) and entity hydration helpers hash `_id` values when entityKey is absent so responses remain opaque; remove once all documents store entityKey.
- `resolveEntity`/`resolveEntityByKey` allow ObjectId lookups for backward compatibility; restrict to entityKey-only once clients and data are fully migrated.
- `resolveEntityKey` logic inside `workshopAuditService` ensures audits can run even if some records lack entityKey; safe for internal repair but can be simplified post-migration.

## Recommended Follow-ups
- Update `routes/profile` to pass `entityKey` into `updateEntity` and stop depending on `req.user._id`.
- Switch `perUserRateLimit` key generation to `entityKey` (with email fallback) to avoid `_id` reliance.
- Phase out ObjectId acceptance in entity resolution once remaining clients migrate; then remove hashed `_id` fallbacks in hydration/participant formatters.
