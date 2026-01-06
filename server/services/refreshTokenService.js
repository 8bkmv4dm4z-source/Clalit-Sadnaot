const nodeCrypto = require("node:crypto");
const jwt = require("jsonwebtoken");

const DEFAULT_MAX_SESSIONS = Number(process.env.REFRESH_TOKEN_CAP || 5);

const hashRefreshToken = (rawToken = "") =>
  nodeCrypto.createHash("sha256").update(String(rawToken)).digest("hex");

const timingSafeCompare = (a, b) => {
  if (!a || !b) return false;
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  try {
    return nodeCrypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
};

const tokensMatch = (session = {}, candidateToken = "") => {
  if (!candidateToken) return false;
  const candidateHashed = hashRefreshToken(candidateToken);
  const storedHash = session.tokenHash || session.token;
  if (storedHash && timingSafeCompare(storedHash, candidateHashed)) return true;
  if (storedHash && timingSafeCompare(storedHash, candidateToken)) return true;
  return false;
};

const decodeRefresh = (rawToken) => jwt.decode(rawToken) || {};

const buildRefreshSession = (rawToken, { userAgent = "", refreshTtlMs, now = new Date() } = {}) => {
  const payload = decodeRefresh(rawToken);
  const issuedAt = payload.iat ? new Date(payload.iat * 1000) : now;
  const expiresAt = payload.exp
    ? new Date(payload.exp * 1000)
    : new Date(issuedAt.getTime() + (refreshTtlMs || 0));

  return {
    tokenHash: hashRefreshToken(rawToken),
    jti: payload.jti || null,
    issuedAt,
    expiresAt,
    lastUsedAt: now,
    userAgent,
    revokedAt: null,
    replacedByJti: null,
  };
};

const normalizeRefreshSessions = (
  sessions = [],
  { refreshTtlMs, maxSessions = DEFAULT_MAX_SESSIONS, now = new Date() } = {}
) => {
  const normalized = [];
  let prunedExpired = 0;

  for (const session of sessions || []) {
    if (!session) continue;
    const isLegacy = !!session.token && !session.tokenHash;

const issuedAt = session.issuedAt
  ? new Date(session.issuedAt)
  : session.createdAt
    ? new Date(session.createdAt)
    : now;

// 🔓 Legacy tokens get ONE refresh window
const expiresAt =
  session.expiresAt && !Number.isNaN(new Date(session.expiresAt))
    ? new Date(session.expiresAt)
    : isLegacy
      ? new Date(now.getTime() + (refreshTtlMs || 0))
      : refreshTtlMs
        ? new Date(issuedAt.getTime() + refreshTtlMs)
        : null;


    if (expiresAt && expiresAt <= now) {
      prunedExpired += 1;
      continue;
    }

    normalized.push({
      tokenHash: session.tokenHash || session.token || "",
      jti: session.jti || null,
      issuedAt,
      expiresAt,
      lastUsedAt: session.lastUsedAt ? new Date(session.lastUsedAt) : issuedAt,
      userAgent: session.userAgent || "",
      revokedAt: session.revokedAt ? new Date(session.revokedAt) : null,
      replacedByJti: session.replacedByJti || null,
    });
  }

  normalized.sort((a, b) => {
    const aTime = new Date(a.lastUsedAt || a.issuedAt || 0).getTime();
    const bTime = new Date(b.lastUsedAt || b.issuedAt || 0).getTime();
    return bTime - aTime;
  });

  let prunedCap = 0;
  let capped = normalized;
  if (maxSessions && normalized.length > maxSessions) {
    prunedCap = normalized.length - maxSessions;
    capped = normalized.slice(0, maxSessions);
  }

  return { sessions: capped, prunedExpired, prunedCap };
};

const findSession = (sessions = [], rawToken = "") => {
  const idx = sessions.findIndex((s) => tokensMatch(s, rawToken));
  return { session: idx >= 0 ? sessions[idx] : null, index: idx };
};

const rotateRefreshToken = (
  sessions = [],
  {
    token,
    newToken,
    userAgent = "",
    refreshTtlMs,
    maxSessions = DEFAULT_MAX_SESSIONS,
    now = new Date(),
  } = {}
) => {
  const normalizedResult = normalizeRefreshSessions(sessions, { refreshTtlMs, maxSessions, now });
  let normalized = normalizedResult.sessions;

  const { session, index } = findSession(normalized, token);
  if (!session) {
    return { reuseDetected: true, sessions: [], prunedExpired: normalizedResult.prunedExpired };
  }

  if (session.revokedAt) {
    return { reuseDetected: true, sessions: [], prunedExpired: normalizedResult.prunedExpired };
  }

  const nowDate = now instanceof Date ? now : new Date(now);
  session.revokedAt = nowDate;
  session.lastUsedAt = nowDate;

  const newSession = buildRefreshSession(newToken, { userAgent, refreshTtlMs, now: nowDate });
  session.replacedByJti = newSession.jti || null;

  const updated = [...normalized];
  updated[index] = session;
  updated.unshift(newSession);

  const final = normalizeRefreshSessions(updated, { refreshTtlMs, maxSessions, now });

  return {
    reuseDetected: false,
    sessions: final.sessions,
    prunedExpired: normalizedResult.prunedExpired + final.prunedExpired,
    prunedCap: final.prunedCap,
    rotatedSession: session,
    newSession: { ...newSession, rawToken: newToken },
  };
};

module.exports = {
  hashRefreshToken,
  tokensMatch,
  buildRefreshSession,
  normalizeRefreshSessions,
  rotateRefreshToken,
  findSession,
};
