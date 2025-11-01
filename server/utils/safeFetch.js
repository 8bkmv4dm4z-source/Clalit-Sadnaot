let cachedFetch = typeof global.fetch === "function" ? global.fetch : null;

async function ensureFetchImplementation() {
  if (cachedFetch) return cachedFetch;
  const { fetch: undiciFetch } = await import("node:undici");
  cachedFetch = undiciFetch;
  return cachedFetch;
}

async function safeFetch(url, options = {}) {
  const impl = await ensureFetchImplementation();
  const { timeout = 10000, ...restOptions } = options;

  let controller = restOptions.signal
    ? null
    : typeof AbortController === "function"
    ? new AbortController()
    : null;

  if (controller) {
    restOptions.signal = controller.signal;
  }

  let timer = null;
  if (controller && timeout > 0) {
    timer = setTimeout(() => controller.abort(), timeout);
  }

  try {
    const response = await impl(url, restOptions);
    return response;
  } catch (err) {
    if (err && err.name === "AbortError") {
      err.message = err.message || `Request to ${url} timed out after ${timeout}ms`;
    }
    throw err;
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = { safeFetch };
