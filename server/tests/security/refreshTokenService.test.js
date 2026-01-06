const { test, strictEqual, ok } = require("node:test");
const jwt = require("jsonwebtoken");
const {
  buildRefreshSession,
  rotateRefreshToken,
  normalizeRefreshSessions,
  tokensMatch,
} = require("../../services/refreshTokenService");

const SECRET = "test-secret";
const TTL_MS = 60 * 60 * 1000; // 1h

const signRefresh = (sub, jti, { expiresIn = "1h" } = {}) =>
  jwt.sign({ sub, jti }, SECRET, { expiresIn });

test("rotation replaces old token and marks it revoked", () => {
  const now = new Date();
  const oldToken = signRefresh("u1", "old");
  const newToken = signRefresh("u1", "new");

  const existing = [buildRefreshSession(oldToken, { refreshTtlMs: TTL_MS, now })];
  const rotated = rotateRefreshToken(existing, {
    token: oldToken,
    newToken,
    userAgent: "agent",
    refreshTtlMs: TTL_MS,
    maxSessions: 5,
    now,
  });

  strictEqual(rotated.reuseDetected, false);
  ok(rotated.sessions.some((s) => tokensMatch(s, newToken)), "new token stored");
  const revoked = rotated.rotatedSession;
  ok(revoked.revokedAt, "old session marked revoked");
  strictEqual(rotated.sessions.length, 2);
});

test("reuse detection clears sessions when token missing", () => {
  const now = new Date();
  const validToken = signRefresh("u1", "j1");
  const otherToken = signRefresh("u1", "other");
  const existing = [buildRefreshSession(validToken, { refreshTtlMs: TTL_MS, now })];

  const rotated = rotateRefreshToken(existing, {
    token: otherToken,
    newToken: signRefresh("u1", "newer"),
    refreshTtlMs: TTL_MS,
    now,
  });

  strictEqual(rotated.reuseDetected, true);
  strictEqual(rotated.sessions.length, 0);
});

test("max sessions cap prunes oldest entries", () => {
  const now = new Date();
  const sessions = [];
  for (let i = 0; i < 6; i += 1) {
    const token = signRefresh("u1", `j${i}`);
    const session = buildRefreshSession(token, { refreshTtlMs: TTL_MS, now });
    session.lastUsedAt = new Date(now.getTime() - i * 1000);
    sessions.push(session);
  }

  const { sessions: capped, prunedCap } = normalizeRefreshSessions(sessions, {
    refreshTtlMs: TTL_MS,
    maxSessions: 3,
    now,
  });

  strictEqual(capped.length, 3);
  strictEqual(prunedCap, 3);
  ok(tokensMatch(capped[0], signRefresh("u1", "j0")), "newest kept first");
});

test("expired tokens are removed during normalization", () => {
  const now = new Date();
  const liveToken = signRefresh("u1", "live", { expiresIn: "1h" });
  const expiredToken = signRefresh("u1", "old", { expiresIn: "1s" });

  const sessions = [
    { ...buildRefreshSession(expiredToken, { refreshTtlMs: TTL_MS, now }), expiresAt: new Date(now.getTime() - 1000) },
    buildRefreshSession(liveToken, { refreshTtlMs: TTL_MS, now }),
  ];

  const { sessions: normalized, prunedExpired } = normalizeRefreshSessions(sessions, {
    refreshTtlMs: TTL_MS,
    maxSessions: 5,
    now,
  });

  strictEqual(prunedExpired >= 1, true);
  strictEqual(normalized.length, 1);
  ok(tokensMatch(normalized[0], liveToken));
});
