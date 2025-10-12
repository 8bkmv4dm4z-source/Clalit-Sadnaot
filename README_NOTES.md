# Workshop & Profiles Enhancements

This repository received a number of changes across both the client and server to improve
performance, correctness and UX.  The following summary outlines what was added or
modified, how to roll back, and how to verify the acceptance criteria from the task.

## What Changed

### Client (React)

1. **Debounced search and view state**
   - Added a generic hook `useDebouncedValue` in `src/src/hooks/useDebouncedValue.js`.  It
     returns a debounced copy of any value after a configurable delay (defaults to 350ms).
   - Introduced `ViewContext` (`src/src/contexts/ViewContext.jsx`) to hold transient UI state
     such as the current search query and selected search field.  Wrapping the
     application in `ViewProvider` keeps these concerns separate from auth and business
     logic contexts.
   - Updated `main.jsx` to wrap `App` in `ViewProvider` underneath existing
     providers.
2. **WaitPill component**
   - Added `WaitPill` in `src/src/Components/common/WaitPill.jsx`.  It renders a small
     “typing…” pill when the search input is debouncing.  It is used in the
     workshops page next to the search bar.
3. **Workshops page refactor**
   - `Workshops.jsx` now pulls `searchQuery`, `setSearchQuery`, `searchBy` and
     `setSearchBy` from `ViewContext` instead of `AuthContext` and uses
     `useDebouncedValue` to reduce grid re‑renders while typing.
   - Added `<WaitPill visible={searchQuery !== debouncedSearch} />` to show the
     typing indicator.
   - Filtering now runs off of the debounced value and respects the selected
     `searchBy` field from the context.
4. **Registration & waitlist UX**
   - `WorkshopCard.jsx` has been hardened to treat `participantsCount` as a number
     and `userFamilyRegistrations` as an array of strings.  `isFull` is
     calculated from these values once per render.
   - When a register request is successful but does not return a workshop
     (meaning the server placed the user on a waiting list), the card shows
     “נוסף לרשימת המתנה” and does **not** mark the user/family as registered
     locally.  This ensures that waitlisted entries aren’t displayed as active
     registrations.
   - Family registrations in `WorkshopCard` honour the same waitlist logic.
5. **AllProfiles entity truth**
   - Each family row now contains a `parentId` field.  When clicking “סדנאות”
     on a family member row, the client calls
     `/api/users/:parentId/workshops?familyId=<familyId>`; for user rows it
     continues to call `/api/users/:id/workshops`.
6. **Minor safety tweaks**
   - `EditWorkshop.jsx` now explicitly strips `familyRegistrations` in addition
     to `participants` and `participantsCount` from the outgoing payload.

### Server (Express / Mongoose)

1. **Per‑entity workshop lists**
   - `GET /api/users/:id/workshops` now accepts an optional query parameter
     `familyId`.  When provided, the route treats `:id` as a parent user and
     returns only workshops for that family member.  If omitted, it retains the
     previous behaviour of resolving `:id` as either a user or family member.
2. **Participants count source of truth**
   - Added a static method `Registration.recalcParticipantsCount` to
     `models/Registration.js`.  It recomputes the count from both
     `participants` and `familyRegistrations` and persists it on the
     `Workshop` document.
   - `registerEntityToWorkshop` and `unregisterEntityFromWorkshop` now call
     this helper after modifying a workshop.  Counts are therefore
     immediately up to date when returned to the client.
   - `PUT /api/workshops/:id` recomputes `participantsCount` from
     `participants` **plus** `familyRegistrations` to avoid stale values.
3. **Logging**
   - Introduced a simple `logWs` helper in `controllers/workshopController.js`.
     The register/unregister handlers log the workshop id, user id,
     optional family id, the new participants count, capacity and waiting list
     length.  These messages are also written to `server/logs/server.log` via
     the existing console override.
4. **Waitlist handling**
   - When a workshop is full, registration requests now recalculate counts
     (even though they don’t change) and log a `waitlisted` event.  The
     response retains the shape `{ success: true, message: "Added to waiting
     list", position }` so the client can distinguish a waitlist from a
     normal registration.
5. **User workshop retrieval**
   - The users controller now validates the parent user and family member
     existence when `familyId` is supplied.  It returns 404s when either
     entity is not found.

## Rolling Back

To revert these changes:

1. Remove `ViewProvider` from `main.jsx` and delete
   `src/src/contexts/ViewContext.jsx` and `src/src/hooks/useDebouncedValue.js`.  Restore
   `searchQuery` handling to `AuthContext` and adjust `Workshops.jsx`
   accordingly.
2. Delete `WaitPill.jsx` and remove its usage in `Workshops.jsx`.
3. Replace the updated `registerEntityToWorkshop`,
   `unregisterEntityFromWorkshop`, and `getUserWorkshopsList` functions in the
   server with their previous implementations.
4. Remove the `Registration.recalcParticipantsCount` static method and the
   associated calls in the controllers.
5. Revert additions to the allowed fields in `updateWorkshop` and the
   recomputation of `participantsCount`.

## Testing the Acceptance Criteria

1. **Counts on WorkshopCard reflect true values immediately**:
   - Register yourself or a family member to a workshop.  The displayed
     participant counts should update instantly without needing a full page
     refresh.  Unregister and verify the counts decrement correctly.
   - Open the participants modal, add or remove participants, then close the
     modal.  The cards should refresh automatically.
2. **AllProfiles → סדנאות shows only the selected entity’s workshops**:
   - In the admin AllProfiles page, click “סדנאות” on a user row and verify
     only the user’s own registrations are listed.  Click on a family row and
     verify only that family member’s workshops are listed (no mixture of
     siblings/parent).  Remove the `?familyId` parameter from the request to
     check that mixed results return as before.
3. **Debounced search**:
   - Type quickly in the workshops search bar.  The grid should not flicker
     per keystroke and the small “typing…” pill should appear while typing.
   - Pause for >350 ms and confirm that the pill disappears and the results
     update.
4. **Waitlist UX**:
   - Fill a workshop to capacity by registering enough participants.  When
     trying to register another participant, the primary button label reads
     “הצטרף לרשימת המתנה”.  Upon clicking, the success toast indicates
     addition to the waiting list and the card remains unregistered.
   - If the server has no waiting list (or it is at capacity), the
     registration fails gracefully with an error message.  No broken flows
     occur.
5. **EditWorkshop persistence**:
   - Edit an existing workshop.  Fields including capacity and waitlist
     maximum persist when saved.  Family and participants arrays are never
     sent from the client.
6. **Server logs**:
   - Check `server/logs/server.log` after registering or unregistering.  Each
     action should log the workshop id, user id, optional family id, current
     participants count, capacity and waitlist length.

## Additional Notes

These changes were kept intentionally small and additive: existing routes,
component names and flows remain unchanged.  Should you wish to expand upon
this foundation, consider implementing full schema validation using a shared
zod schema on both client and server, rate limiting on authentication routes,
and automated promotion from the waiting list.