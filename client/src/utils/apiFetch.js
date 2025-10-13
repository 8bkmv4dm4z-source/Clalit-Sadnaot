/**
 * apiFetch.js — Unified Secure Fetch Wrapper
 * -------------------------------------------
 * ✅ Automatically includes:
 *   - Authorization header with access token
 *   - credentials: "include" for refresh-token cookies
 * ✅ Handles 401 Unauthorized by refreshing access token
 * ✅ Replays the original request if refresh succeeded
 */

export async function apiFetch(url, options = {}) {
  const token = localStorage.getItem("token");

  // Merge headers with token and defaults
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };

  // Send initial request
  let res = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // ✅ sends refresh cookie automatically
  });

  // If access token expired — try refreshing it
  if (res.status === 401) {
    console.warn("[apiFetch] Access token expired, attempting refresh...");

    try {
      const refreshRes = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // send refresh cookie
      });

      const refreshData = await refreshRes.json();
      if (refreshRes.ok && refreshData.accessToken) {
        console.info("[apiFetch] ✅ Access token refreshed successfully");

        // Save new access token
        localStorage.setItem("token", refreshData.accessToken);

        // Retry original request with new token
        headers.Authorization = `Bearer ${refreshData.accessToken}`;
        res = await fetch(url, {
          ...options,
          headers,
          credentials: "include",
        });
      } else {
        console.warn("[apiFetch] ❌ Refresh failed, forcing logout");
        localStorage.removeItem("token");
      }
    } catch (err) {
      console.error("[apiFetch] Refresh error:", err);
      localStorage.removeItem("token");
    }
  }

  return res;
}
