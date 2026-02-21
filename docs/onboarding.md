# Onboarding and Environment Matrix

This guide is for first-time setup and day-2 local development in this repository.

## Quick Setup Flow

1. Install dependencies.

```bash
npm install
cd client && npm install
cd ../server && npm install
```

2. Configure environment files in place:
- edit `server/.env`
- edit `client/.env`

The app currently reads those two files directly. Keep real secrets out of git.

3. Run the backend.

```bash
cd server
npm run dev
```

4. Run the frontend.

```bash
cd client
npm run dev
```

5. Validate baseline.

```bash
cd client && npm test
cd server && npm test
npm run lint
```

## Environment Matrix

### Server (`server/.env`)

| Variable | Required | Default in code | Used for |
|---|---|---|---|
| `JWT_SECRET` | Yes | none | Access token signing |
| `JWT_EXPIRY` | Yes | none | Access token TTL (`15m` style) |
| `JWT_REFRESH_SECRET` | Yes | none | Refresh token signing |
| `JWT_REFRESH_EXPIRY` | Yes | none | Refresh token TTL (`7d` style) |
| `PUBLIC_ID_SECRET` | Yes | none | HMAC entity key generation (`hashId`) |
| `MONGODB_URI` or `MONGO_URI` | Recommended | `mongodb://127.0.0.1:27017/ClalitData` | Mongo connection string |
| `ALLOWED_ORIGINS` | Recommended (prod) | empty | Explicit CORS allowlist |
| `CLIENT_URL` or `PUBLIC_CLIENT_URL` | Recommended | fallback to request origin/localhost | Password reset URL base |
| `REFRESH_COOKIE_NAME` | Optional | `refreshToken` | Refresh cookie name |
| `REFRESH_COOKIE_SAMESITE` | Optional | `Strict` | Refresh cookie policy |
| `ACCESS_COOKIE_NAME` | Optional | `accessToken` | Access cookie name |
| `ACCESS_COOKIE_SAMESITE` | Optional | refresh cookie value | Access cookie policy |
| `ACCESS_COOKIE_SECURE` | Optional | prod=true | Access cookie security |
| `COOKIE_SECURE` | Optional | prod=true | Refresh cookie security |
| `ADMIN_HUB_PASSWORD` | Optional | none | Admin hub password gate |
| `CAPTCHA_PROVIDER` + provider secret | Optional | none | CAPTCHA checks on auth flows |
| `RESEND_API_KEY` | Optional | none | Transactional email sending |
| `EMAIL_FROM` | Optional | `info@sadnaot.online` | Sender address |
| `AUDIT_HMAC_SECRET` | Optional | falls back to `PUBLIC_ID_SECRET` | Audit subject hashing |
| `ROLE_HASH_SECRET` | Optional | falls back to `JWT_SECRET` + static fallback | Role integrity hash |

Required means startup/runtime will fail or hard-error without it (`validateAuthEnv` and `hashId` paths).

### Client (`client/.env`)

| Variable | Required | Default in code | Used for |
|---|---|---|---|
| `VITE_API_URL` | Optional | empty | API origin prefix in `apiFetch` |
| `VITE_RECAPTCHA_SITE_KEY` | Optional | none | CAPTCHA widget site key |

If `VITE_API_URL` is unset in local development, client calls relative `/api/*` routes (works with Vite proxy setup).

## Conventions

- Node version: `>=18.18.0`.
- Client uses ESM; server uses CommonJS.
- Use app-local scripts (`client/package.json`, `server/package.json`) for day-to-day work.
- Keep business logic in `server/services`, not in route files.
- Add tests for bug fixes, especially auth/permissions/workshop flows.
- Run lint/tests before PR:

```bash
npm run lint
cd client && npm test
cd server && npm test
```
