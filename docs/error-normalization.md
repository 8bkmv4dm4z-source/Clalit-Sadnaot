# Error Normalization Mapping

This document defines the canonical error normalization behavior for UI-safe rendering.

## Status → Kind

| HTTP Status | Kind       | Retryable |
|-----------:|------------|-----------|
| 401        | Auth       | No        |
| 403        | Forbidden  | No        |
| 404        | NotFound   | No        |
| 409        | Conflict   | Yes       |
| 429        | Conflict   | Yes       |
| 400 / 422  | Validation | No        |
| 5xx        | Server     | Yes       |
| Network / timeout | Network | Yes |
| Other / unknown | Unknown | No |

## User-visible Messages

The UI may only render `NormalizedError.message`, which is sanitized and length-limited.
Allowlisted server messages (if safe) include:

- Workshop is full
- Already registered
- Request already in progress
- High traffic, try again
- Workshop not found
- Entity not found
- Entity already registered
- Entity already in waiting list
- Waiting list is full

All other server messages are replaced with a safe fallback by kind:

- Network → “Network error. Please check your connection and try again.”
- Auth → “Your session has expired. Please sign in again.”
- Forbidden → “You do not have permission to perform this action.”
- NotFound → “The requested resource was not found.”
- Conflict → “Request conflict. Please try again.”
- Validation → “Please check your input and try again.”
- Server → “Server error. Please try again later.”
- Unknown → “Something went wrong. Please try again.”

## Notes

- `NormalizedError.raw` is always `null` to prevent UI leakage of backend payloads.
- In production mode, non-allowlisted server messages are never shown.
