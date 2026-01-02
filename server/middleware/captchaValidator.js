const PROVIDERS = {
  recaptcha: {
    url: "https://www.google.com/recaptcha/api/siteverify",
    secret: () => process.env.RECAPTCHA_SECRET,
    field: "g-recaptcha-response",
  },
  hcaptcha: {
    url: "https://hcaptcha.com/siteverify",
    secret: () => process.env.HCAPTCHA_SECRET,
    field: "h-recaptcha-response",
  },
};

const resolveProvider = () => {
  if (process.env.HCAPTCHA_SECRET) return "hcaptcha";
  if (process.env.RECAPTCHA_SECRET) return "recaptcha";
  return null;
};

const verifyToken = async ({ provider, token, remoteip }) => {
  const config = PROVIDERS[provider];
  if (!config) return { ok: false, reason: "unsupported_provider" };
  const secret = config.secret();
  if (!secret) return { ok: false, reason: "missing_secret" };

  const form = new URLSearchParams();
  form.append("secret", secret);
  form.append("response", token || "");
  if (remoteip) form.append("remoteip", remoteip);

  const res = await fetch(config.url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
  });

  if (!res.ok) return { ok: false, reason: "provider_http_error" };
  const data = await res.json();
  const success = !!data.success;
  return { ok: success, score: data.score, reason: success ? null : "provider_rejected" };
};

/**
 * Enforce bot detection for sensitive auth endpoints.
 * - Supports Google reCAPTCHA v3 or hCaptcha based on env secrets.
 * - Rejects missing/failed tokens in production to avoid silent bypasses.
 */
const requireCaptcha = async (req, res, next) => {
  const provider = resolveProvider();

  if (!provider) {
    // In production we require a provider to avoid silent bypass; dev can skip for velocity.
    if (process.env.NODE_ENV === "production") {
      return res.status(503).json({ message: "Captcha validation unavailable" });
    }
    return next();
  }

  const token =
    req.body?.captchaToken ||
    req.headers["x-captcha-token"] ||
    req.body?.[PROVIDERS[provider].field];

  if (!token) {
    return res.status(400).json({ message: "Captcha verification required" });
  }

  try {
    const result = await verifyToken({
      provider,
      token,
      remoteip: req.ip,
    });

    if (!result.ok) {
      return res.status(403).json({ message: "Captcha validation failed" });
    }

    return next();
  } catch (err) {
    return res.status(503).json({ message: "Captcha service unavailable" });
  }
};

module.exports = { requireCaptcha, verifyToken };
