/**
 * apiFetch.js — Unified Secure Fetch Wrapper (with backend URL)
 * -------------------------------------------------------------
 * DATA FLOW
 * - Call sites across the app (contexts, pages, components) invoke `apiFetch(path, options)` instead of `fetch`.
 * - The helper injects API_BASE + Authorization header (from localStorage) → performs fetch → may refresh token via
 *   /api/auth/refresh → retries original request → returns the Response for caller-side JSON parsing.
 * - Consumers typically follow: const res = await apiFetch(...); const data = await res.json(); and branch on res.ok.
 *
 * AUTH / API FLOW
 * - Outbound request uses Bearer accessToken (if present) and includes cookies for refresh tokens.
 * - On 401, a silent refresh POST /api/auth/refresh is attempted; success updates localStorage and retries the
 *   initial request with the new Authorization header, keeping UI state alive without forcing logout.
 * - If refresh fails (non-200 or missing token), the access token is cleared so the next auth guard redirects the
 *   user to login.
 */

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  (typeof globalThis !== "undefined" && globalThis.process?.env?.VITE_API_URL) ||
  "";

import { normalizeError } from "./normalizeError.js";

const ACCESS_TOKEN_KEY = "accessToken";
const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const isUnsafeMethod = (method = "GET") =>
  !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method.toUpperCase());

const readCookie = (name) => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const ensureCsrfToken = async () => {
  const existing = readCookie(CSRF_COOKIE_NAME);
  if (existing) return existing;

  const res = await fetch(`${API_BASE}/api/auth/csrf`, {
    method: "GET",
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = await res.json().catch(() => ({}));
  return data.csrfToken || readCookie(CSRF_COOKIE_NAME);
};

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);
  const method = (options.method || "GET").toUpperCase();

  // ✅ Normalize and prepend API base so callers can pass "/api/..." or absolute URLs interchangeably
  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  // Merge headers with token and defaults; caller-specified headers win but we always default to JSON.
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Pre-flight CSRF for unsafe methods that rely on cookies (refresh, logout, reset, etc.)
  if (isUnsafeMethod(method) && options.credentials !== "omit") {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  const attachNormalizedError = async (response) => {
    if (!response || response.ok) return response;
    const payload = await response.clone().json().catch(() => null);
    response.normalizedError = normalizeError(null, {
      status: response.status,
      payload,
    });
    return response;
  };

  // Initial request
  let res = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials || "include", // ✅ sends refresh cookie automatically so /refresh endpoint can rotate tokens
  });

  res = await attachNormalizedError(res);

  // Handle token refresh if needed
  if (res.status === 401) {
    if (import.meta.env.MODE !== "production") {
      console.warn("[apiFetch] Access token expired, attempting refresh...");
    }
    try {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include", // include refresh cookie so server can validate
      });

      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData.accessToken) {
        if (import.meta.env.MODE !== "production") {
          console.info("[apiFetch] ✅ Access token refreshed successfully");
        }
        localStorage.setItem(ACCESS_TOKEN_KEY, refreshData.accessToken);
        headers.Authorization = `Bearer ${refreshData.accessToken}`;

        // Retry original request with the new token so the caller's logic remains unchanged.
        res = await fetch(url, {
          ...options,
          headers,
          credentials: options.credentials || "include",
        });
        res = await attachNormalizedError(res);
      } else {
        if (import.meta.env.MODE !== "production") {
          console.warn("[apiFetch] ❌ Refresh failed, forcing logout");
        }
        localStorage.removeItem(ACCESS_TOKEN_KEY);
      }
    } catch (err) {
      if (import.meta.env.MODE !== "production") {
        console.error("[apiFetch] Refresh error:", err);
      }
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }
  }

  return res;
}
