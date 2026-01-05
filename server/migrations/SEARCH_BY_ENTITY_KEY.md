## Migration plan — search by entityKey (UUID-first)

Goal: move all search/lookups to the new UUID-based `entityKey` while keeping Mongo `_id` internal.

### 1) Data backfill
1. Export a list of users missing `entityKey` or `hashedId`.
2. Run a one-time script that loads users in batches and calls `ensureEntityKeys` (already used by the model hooks) so each user and family member receives a hashed `entityKey`.
3. Verify indexes on `entityKey` and `hashedId` exist (both are already defined on `User` and `FamilyMember` subdocuments).

### 2) API/query changes
1. Replace any `_id`-based user lookup with `User.findByEntityKey(entityKey)` and pass projections to avoid over-fetching.
2. Update client code to send `entityKey` exclusively; block `_id` in request payload validation.
3. Ensure authorization checks compare `requester.entityKey` with target entityKey (or derive admin authority).

### 3) Search endpoint
1. Add `entityKey` as an explicit filter option and normalize search inputs to accept UUID-like strings.
2. When matching family members, propagate the parent `entityKey` so responses remain scoped to their owner.
3. Return only sanitized entities (use `sanitizeUserForResponse` with the identity or profile scopes).

### 4) Rollout / validation
1. Deploy behind a feature flag that logs both old/new identifier usage.
2. Monitor error logs for “Entity not found” to catch any missing backfill records.
3. After a stable period, remove fallback `_id` lookups and deprecate routes that still accept them.
