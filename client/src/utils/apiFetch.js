/**
 * apiFetch.js — Unified Secure Fetch Wrapper (with backend URL)
 * -------------------------------------------------------------
 * ✅ Adds API base automatically from VITE_API_URL
 * ✅ Handles access token + refresh flow
 */

const API_BASE = import.meta.env.VITE_API_URL || "";

const ACCESS_TOKEN_KEY = "accessToken";

export async function apiFetch(path, options = {}) {
  const token = localStorage.getItem(ACCESS_TOKEN_KEY);

  // ✅ Normalize and prepend API base
  const url = path.startsWith("http")
    ? path
    : `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;

  // Merge headers with token and defaults
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Initial request
  let res = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // ✅ sends refresh cookie automatically
  });

  // Handle token refresh if needed
  if (res.status === 401) {
    if (import.meta.env.MODE !== "production") {
      console.warn("[apiFetch] Access token expired, attempting refresh...");
    }
    try {
      const refreshRes = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData.accessToken) {
        if (import.meta.env.MODE !== "production") {
          console.info("[apiFetch] ✅ Access token refreshed successfully");
        }
        localStorage.setItem(ACCESS_TOKEN_KEY, refreshData.accessToken);
        headers.Authorization = `Bearer ${refreshData.accessToken}`;

        // Retry original request
        res = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
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
