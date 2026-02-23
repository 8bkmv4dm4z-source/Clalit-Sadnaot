/**
 * apiFetch.ts — Unified secure fetch wrapper
 * ------------------------------------------
 * Browser auth is cookie-based (httpOnly auth cookies + CSRF double-submit header).
 */

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  (typeof globalThis !== "undefined" && (globalThis as any).process?.env?.VITE_API_URL) ||
  "";

import { normalizeError } from "./normalizeError.ts";

const CSRF_COOKIE_NAME = "XSRF-TOKEN";
const isUnsafeMethod = (method = "GET"): boolean =>
  !["GET", "HEAD", "OPTIONS", "TRACE"].includes(method.toUpperCase());

const readCookie = (name: string): string | null => {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
};

const ensureCsrfToken = async (): Promise<string | null> => {
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

export async function apiFetch(path: string, options: RequestInit & { headers?: Record<string, string> } = {}): Promise<Response> {
  const method = (options.method || "GET").toUpperCase();

  // Normalize and prepend API base so callers can pass "/api/..." or absolute URLs interchangeably
  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  // Merge headers and defaults; caller-specified headers win.
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  // Pre-flight CSRF for unsafe methods that rely on cookies (refresh, logout, reset, etc.)
  if (isUnsafeMethod(method) && options.credentials !== "omit") {
    const csrf = await ensureCsrfToken();
    if (csrf) {
      headers["X-CSRF-Token"] = csrf;
    }
  }

  const attachNormalizedError = async (response: Response): Promise<Response> => {
    if (!response || response.ok) return response;
    const payload = await response.clone().json().catch(() => null);
    (response as any).normalizedError = normalizeError(null, {
      status: response.status,
      payload,
    });
    return response;
  };

  // Initial request
  let res = await fetch(url, {
    ...options,
    headers,
    credentials: options.credentials || "include",
  });

  res = await attachNormalizedError(res);

  // Handle token refresh if needed
  if (res.status === 401) {
    if (import.meta.env.MODE !== "production") {
      console.warn("[apiFetch] Access token expired, attempting refresh...");
    }
    try {
      const refreshHeaders: Record<string, string> = {};
      const refreshCsrf = await ensureCsrfToken();
      if (refreshCsrf) {
        refreshHeaders["X-CSRF-Token"] = refreshCsrf;
      }
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: refreshHeaders,
        credentials: "include",
      });

      if (refreshRes.ok) {
        if (import.meta.env.MODE !== "production") {
          console.info("[apiFetch] Access token refreshed successfully");
        }

        // Retry original request after refreshing cookie-based access.
        res = await fetch(url, {
          ...options,
          headers,
          credentials: options.credentials || "include",
        });
        res = await attachNormalizedError(res);
      }
    } catch (err) {
      if (import.meta.env.MODE !== "production") {
        console.error("[apiFetch] Refresh error:", err);
      }
    }
  }

  return res;
}
