# Security Notes

This patch introduces several measures to protect the application from
common attack vectors and outlines further steps that could be taken to
harden the system.

## Input Sanitization

The server already includes a basic sanitization middleware in
`server/server.js` which recursively removes any keys starting with `$` or
containing a `.` from request bodies and query parameters.  This helps to
mitigate NoSQL injection attacks by preventing unexpected operators from
being passed into MongoDB queries.

When adding new routes or controllers, ensure they do not inadvertently
expose unfiltered user input directly into database queries.  For example,
in `userController.getUserWorkshopsList` we validate both the parent user
and the family member when `familyId` is supplied, returning a 404 if
either is not found.

## Validation

This patch did not add full schema validation via libraries like Joi or
Zod due to time constraints.  However, endpoint payloads are still
whitelisted: the workshop update route only accepts a set of known fields
and recomputes `participantsCount` on the server side.

To strengthen validation further, consider:

- Installing `@hapi/joi` or `zod` and validating request bodies for all
  create/update actions (e.g. workshop creation, user updates, entity
  registration).
- Centralising validation schemas so that the client and server share the
  same definitions, reducing the risk of mismatched expectations.

## Rate Limiting

The server’s existing rate limiter targets write operations on
`/api/workshops`.  If extending the API surface, implement similar
protection on authentication and registration endpoints to prevent abuse.

## Further Hardening Suggestions

- **Helmet**: While a few security headers are set manually, integrating
  `helmet` would provide a broader set of defaults (XSS filter,
  content‑security‑policy, etc.).
- **CSRF Protection**: For state‑changing operations, especially when
  cookies are involved, consider adding CSRF tokens.
- **Express‑mongo‑sanitize**: A dedicated middleware like
  `express-mongo-sanitize` can provide a more robust defence against
  injection attacks than the custom sanitizer.
- **express‑rate‑limit**: Apply stricter limits on login and OTP
  endpoints to deter brute force attacks.