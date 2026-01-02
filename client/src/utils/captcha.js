const RECAPTCHA_SITE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_RECAPTCHA_SITE_KEY) ||
  (typeof globalThis !== "undefined" && globalThis.process?.env?.VITE_RECAPTCHA_SITE_KEY);

const HCAPTCHA_SITE_KEY =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_HCAPTCHA_SITE_KEY) ||
  (typeof globalThis !== "undefined" && globalThis.process?.env?.VITE_HCAPTCHA_SITE_KEY);

const PROVIDER = HCAPTCHA_SITE_KEY ? "hcaptcha" : RECAPTCHA_SITE_KEY ? "recaptcha" : null;

const ensureScript = (() => {
  let loadingPromise = null;
  return () => {
    if (!PROVIDER) return Promise.resolve(false);
    if (loadingPromise) return loadingPromise;

    loadingPromise = new Promise((resolve) => {
      const existing =
        document.querySelector(`script[data-captcha-provider="${PROVIDER}"]`) || null;
      if (existing) return resolve(true);

      const script = document.createElement("script");
      script.async = true;
      script.defer = true;
      script.dataset.captchaProvider = PROVIDER;
      if (PROVIDER === "recaptcha") {
        script.src = `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
        script.onload = () => resolve(true);
      } else {
        script.src = "https://js.hcaptcha.com/1/api.js?render=explicit&recaptchacompat=off";
        script.onload = () => resolve(true);
      }
      script.onerror = () => resolve(false);
      document.head.appendChild(script);
    });
    return loadingPromise;
  };
})();

export async function getCaptchaToken(action = "submit") {
  if (typeof window === "undefined" || !PROVIDER) return null;
  const loaded = await ensureScript();
  if (!loaded) return null;

  if (PROVIDER === "recaptcha" && window.grecaptcha?.ready) {
    return new Promise((resolve) => {
      window.grecaptcha.ready(() => {
        window.grecaptcha
          .execute(RECAPTCHA_SITE_KEY, { action })
          .then((token) => resolve(token))
          .catch(() => resolve(null));
      });
    });
  }

  if (PROVIDER === "hcaptcha" && window.hcaptcha?.execute) {
    try {
      const token = await window.hcaptcha.execute(HCAPTCHA_SITE_KEY, {
        action,
      });
      return token || null;
    } catch {
      return null;
    }
  }

  return null;
}
