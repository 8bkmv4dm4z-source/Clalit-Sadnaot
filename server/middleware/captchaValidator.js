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

const resolveCaptchaProvider = () => {
  const provider = process.env.CAPTCHA_PROVIDER;
  if (provider === "recaptcha") return "recaptcha";
  if (provider === "hcaptcha") return "hcaptcha";
  return null;
};

const validateCaptchaConfiguration = () => {
  const rawProvider = process.env.CAPTCHA_PROVIDER;
  const provider = resolveCaptchaProvider();

  if (rawProvider && !provider) {
    throw new Error(`Unsupported CAPTCHA_PROVIDER value: ${rawProvider}`);
  }

  if (!provider) return null;

  if (provider === "recaptcha" && !process.env.RECAPTCHA_SECRET) {
    throw new Error("CAPTCHA_PROVIDER=recaptcha requires RECAPTCHA_SECRET to be set");
  }

  if (provider === "hcaptcha" && !process.env.HCAPTCHA_SECRET) {
    throw new Error("CAPTCHA_PROVIDER=hcaptcha requires HCAPTCHA_SECRET to be set");
  }

  if (process.env.NODE_ENV !== "production") {
    // Minimal debug to confirm deterministic provider selection; no secrets or tokens logged.
    console.debug(`[SECURITY] Captcha provider resolved: ${provider}`);
  }

  return provider;
};

const ACTIVE_PROVIDER = validateCaptchaConfiguration();

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
 * - Supports Google reCAPTCHA v3 or hCaptcha based on explicit provider selection.
 * - Rejects missing/failed tokens in production to avoid silent bypasses.
 */
const requireCaptcha = async (req, res, next) => {
  const provider = ACTIVE_PROVIDER;

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
