// src/layouts/AuthLayout/AuthLayout.jsx
/**
 * AuthLayout.jsx — Authentication provider
 * -----------------------------------------
 * ✅ Centralized login/logout/OTP/token refresh logic
 * ✅ Now routes all backend calls through apiFetch()
 * ✅ Works automatically with VITE_API_URL (.env)
 */

import { View } from "lucide-react";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "../../utils/apiFetch"; // ✅ Unified backend handler

/* ------------------------------ Logger ------------------------------ */
const log = (...args) => {
  const time = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${time}] [AUTH]`, "color:#1976d2;font-weight:bold;", ...args);
};

async function safeJson(res) {
  try {
    return await res.json();
  } catch (err) {
    log("⚠️ Failed to parse JSON:", err?.message || err);
    return null;
  }
}

/* ----------------------------- Events ------------------------------- */
function fireAuthReady(loggedIn, extra = {}) {
  window.dispatchEvent(
    new CustomEvent("auth-ready", { detail: { loggedIn: !!loggedIn, ...extra } })
  );
}
function fireLoggedIn(extra = {}) {
  window.dispatchEvent(new CustomEvent("auth-logged-in", { detail: { ...extra } }));
}
function fireLoggedOut(extra = {}) {
  window.dispatchEvent(new CustomEvent("auth-logged-out", { detail: { ...extra } }));
}

/* --------------------------- Context Shape -------------------------- */
const AuthContext = createContext({
  isLoggedIn: false,
  isAdmin: false,
  loading: true,
  user: null,
  filters: {},
  searchQuery: "",
  setIsLoggedIn: () => {},
  setIsAdmin: () => {},
  setUser: () => {},
  setFilters: () => {},
  setSearchQuery: () => {},
  logout: () => {},
  completeLogin: async () => {},
  registerUser: async () => {},
  sendOtp: async () => {},
  verifyOtp: async () => {},
  updateEntity: async () => {},
  saveEntity: async () => {},
  refreshMe: async () => {},
});

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(
    localStorage.getItem("accessToken") || null
  );

  const didVerifyRef = useRef(false);

  /* ============================================================
     🔁 Refresh Access Token
     ============================================================ */
  const refreshAccessToken = useCallback(async () => {
    try {
      const res = await apiFetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.message || "Refresh token invalid");
      }
      if (data?.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
        setAccessToken(data.accessToken);
        log("🔄 Token refreshed successfully");
        return data.accessToken;
      }
      throw new Error("No access token in refresh response");
    } catch (err) {
      log("⚠️ refreshAccessToken failed:", err.message);
      await logout(true);
      return null;
    }
  }, []);

  /* ============================================================
     🔐 authFetch helper — auto refresh on 401 once
     ============================================================ */
  const authFetch = useCallback(
  async (url, options = {}) => {
    const token = accessToken || localStorage.getItem("accessToken");
    const headers = {
      ...(options.headers || {}),
      Authorization: token ? `Bearer ${token}` : undefined,
      "Content-Type": "application/json",
    };

    try {
      // ✅ Always include credentials so refresh cookies work
      let res = await apiFetch(url, { 
        ...options, 
        headers, 
        credentials: "include" 
      });

      // ⚠️ If unauthorized, try refresh once
      if (res.status === 401) {
        log("⚠️ 401 detected — attempting refresh...");
        const newToken = await refreshAccessToken();
        if (!newToken) throw new Error("Session expired");

        const headers2 = { ...headers, Authorization: `Bearer ${newToken}` };
        res = await apiFetch(url, { 
          ...options, 
          headers: headers2, 
          credentials: "include" // 🔁 include again on retry
        });
      }

      return res;
    } catch (e) {
      log("❌ authFetch error:", e.message);
      throw e;
    }
  },
  [accessToken, refreshAccessToken]
);


  /* ============================================================
     👤 fetchMe — load current user
     ============================================================ */
  const fetchMe = async (tokenOverride = null) => {
    const token =
      tokenOverride || accessToken || localStorage.getItem("accessToken");
    log("fetchMe called | token:", token ? "✅ found" : "❌ none");

    if (!token) {
      setUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
      return;
    }

    try {
      const res = await apiFetch("/api/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const data = await safeJson(res);

      if (!res.ok || !data) {
        throw new Error(data?.message || "Failed to load profile");
      }

      setUser(data);
      setIsLoggedIn(true);
      setIsAdmin(data.role === "admin");
      log("✅ User loaded:", data?.name || data?.email, "| role:", data.role);
    } catch (err) {
      log("❌ fetchMe error:", err.message);
      localStorage.removeItem("accessToken");
      setAccessToken(null);
      setUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  };

  /* ============================================================
     🚀 On Mount
     ============================================================ */
  useEffect(() => {
    if (didVerifyRef.current) return;
    didVerifyRef.current = true;
    log("🔹 Mounted AuthProvider");

    (async () => {
      await fetchMe();
      setLoading(false);
      fireAuthReady(!!(accessToken || localStorage.getItem("accessToken")));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
     📝 Register
     ============================================================ */
  const registerUser = async (payload) => {
    log("📩 registerUser called:", payload?.email);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.message || "Registration failed");
      }
      return { success: true, data };
    } catch (err) {
      log("❌ registerUser error:", err.message);
      return { success: false, message: err.message };
    }
  };

  /* ============================================================
     🔐 OTP Flow
     ============================================================ */
  const sendOtp = async (email) => {
    log("📤 sendOtp:", email);
    try {
      const res = await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to send OTP");
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const verifyOtp = async (email, otp) => {
    log("🔐 verifyOtp called:", email, otp);
    try {
      const res = await apiFetch("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
        credentials: "include",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.message || "OTP verification failed");
      }
      if (data?.accessToken) {
        await completeLogin(data.accessToken);
        return { success: true, data };
      }
      return { success: false, message: data?.message || "Missing access token" };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  /* ============================================================
     ✅ Complete Login
     ============================================================ */
  const completeLogin = async (newToken) => {
    if (!newToken) return;

    localStorage.setItem("accessToken", newToken);
    setAccessToken(newToken);
    log("💾 Access token stored, loading user directly...");

    await fetchMe(newToken);
    fireAuthReady(true, { phase: "login-complete" });
    fireLoggedIn({ userId: String(user?.id || user?._id || "") });
    navigate("/workshops");
  };

  /* ============================================================
     🚪 Logout
     ============================================================ */
  const logout = async (silent = false) => {
    try {
      await apiFetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }

    localStorage.removeItem("accessToken");
    setAccessToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);

    log("🚪 Logged out (local + server)");

    fireAuthReady(false, { phase: "logout" });
    fireLoggedOut();

    if (!silent) navigate("/workshops");
  };

  /* ============================================================
     ♻️ Refresh Me
     ============================================================ */
  const refreshMe = async () => {
    await fetchMe();
    window.dispatchEvent(
      new CustomEvent("auth-user-updated", {
        detail: { at: Date.now(), userId: String(user?._id || "") },
      })
    );
  };

  /* ============================================================
     ✏️ Save Entity (User / Family)
     ============================================================ */
  const saveEntity = async (payload, { refreshMeIfCurrent = true } = {}) => {
    log("✏️ saveEntity called:", payload);
    try {
      const res = await authFetch("/api/users/update-entity", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");

      const isCurrentUserUpdate =
        payload.userId && user && String(payload.userId) === String(user._id);
      const isCurrentFamilyUpdate =
        payload.familyId &&
        user?.familyMembers?.some((m) => String(m._id) === String(payload.familyId));

      if (refreshMeIfCurrent && (isCurrentUserUpdate || isCurrentFamilyUpdate)) {
        await refreshMe();
      }

      window.dispatchEvent(
        new CustomEvent("auth-user-updated", {
          detail: {
            at: Date.now(),
            userId: String(user?._id || ""),
            affected: {
              userId: payload.userId ? String(payload.userId) : null,
              familyId: payload.familyId ? String(payload.familyId) : null,
            },
          },
        })
      );

      log("✅ saveEntity success:", data);
      return { success: true, data };
    } catch (err) {
      log("❌ saveEntity error:", err.message);
      return { success: false, message: err.message };
    }
  };

  const updateEntity = async (payload) =>
    await saveEntity(payload, { refreshMeIfCurrent: true });

  /* ============================================================
     🎯 Provide Context
     ============================================================ */
  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        isAdmin,
        user,
        loading,
        filters,
        searchQuery,
        setUser,
        setIsLoggedIn,
        setIsAdmin,
        setFilters,
        setSearchQuery,
        logout,
        completeLogin,
        registerUser,
        sendOtp,
        verifyOtp,
        updateEntity,
        saveEntity,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
