const crypto = require("crypto");

const isProd = process.env.NODE_ENV === "production";
const SECRET_COOKIE = "csrf-secret";
const TOKEN_COOKIE = "XSRF-TOKEN";

const safeEqual = (a, b) => {
  if (!a || !b) return false;
  const aBuf = Buffer.from(String(a));
  const bBuf = Buffer.from(String(b));
  if (aBuf.length !== bBuf.length) return false;
  try {
    return crypto.timingSafeEqual(aBuf, bBuf);
  } catch {
    return false;
  }
};

// CSRF is scoped per-route (refresh/logout/reset) to avoid impacting non-cookie APIs.
const deriveToken = (secret) =>
  crypto.createHmac("sha256", String(secret)).update("csrf-token").digest("hex");

const ensureSecret = (req, res) => {
  let secret = req.cookies?.[SECRET_COOKIE];
  if (!secret) {
    secret = crypto.randomBytes(32).toString("hex");
    res.cookie(SECRET_COOKIE, secret, {
      httpOnly: true,
      sameSite: "strict",
      secure: isProd,
      path: "/",
    });
  }
  return secret;
};

const issueCsrfToken = (req, res, next) => {
  try {
    const secret = ensureSecret(req, res);
    const token = deriveToken(secret);
    res.cookie(TOKEN_COOKIE, token, {
      httpOnly: false,
      sameSite: "strict",
      secure: isProd,
      path: "/",
    });
    res.locals.csrfToken = token;
    next();
  } catch (err) {
    next(err);
  }
};

const csrfProtection = (req, res, next) => {
  const method = req.method?.toUpperCase?.() || "GET";
  const safeMethod = ["GET", "HEAD", "OPTIONS", "TRACE"].includes(method);

  req.csrfToken = () => {
    const secret = ensureSecret(req, res);
    return deriveToken(secret);
  };

  if (safeMethod) {
    return next();
  }

  const secret = ensureSecret(req, res);
  const expected = deriveToken(secret);
  const candidate =
    req.headers["x-csrf-token"] ||
    req.headers["x-xsrf-token"] ||
    req.body?._csrf ||
    req.query?._csrf;

  if (!candidate || !safeEqual(candidate, expected)) {
    const err = new Error("Invalid CSRF token");
    err.code = "EBADCSRFTOKEN";
    return next(err);
  }

  return next();
};

module.exports = { csrfProtection, issueCsrfToken };
