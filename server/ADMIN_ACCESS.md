# Admin access transport contract

This project does not expose a raw `isAdmin` boolean (or any admin hints) in API
payloads or headers. Admin awareness is inferred only because admin endpoints
succeed, keeping authorization strictly server-side.

## What is sent to clients
- **Headers**: none (admin scope is never broadcast to clients).
- **Payloads**: no admin metadata is returned. Legacy `isAdmin` flags remain
  intentionally absent.

## How to consume it
- Admin-only UI should attempt privileged endpoints and react based on success
  or failure only.
- Ignore any inbound `isAdmin` or `role` values from client payloads; server
  middleware derives scope from persisted authorities and will not trust those
  fields.
