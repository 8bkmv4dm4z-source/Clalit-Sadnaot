// src/layouts/AuthLayout/AuthLayout.jsx
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";

/** 🧩 Logger with timestamp */
const log = (...args) => {
  const time = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${time}] [AUTH]`, "color:#1976d2;font-weight:bold;", ...args);
};

/** 🧭 Context Shape */
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
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [accessToken, setAccessToken] = useState(localStorage.getItem("accessToken") || null);
  const didVerifyRef = useRef(false);

  /* ============================================================
     🧠 Refresh Access Token using Refresh Cookie
     ============================================================ */
  const refreshAccessToken = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // מאפשר שליחת ה-cookie
      });
      if (!res.ok) throw new Error("Failed to refresh token");
      const data = await res.json();

      if (data?.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
        setAccessToken(data.accessToken);
        log("🔄 Token refreshed successfully");
        return data.accessToken;
      }
    } catch (err) {
      log("⚠️ refreshAccessToken failed:", err.message);
      logout();
      return null;
    }
  }, []);

  /* ============================================================
     🧩 Helper: Authenticated Fetch with Auto-Refresh
     ============================================================ */
  const authFetch = useCallback(
    async (url, options = {}) => {
      const token = accessToken || localStorage.getItem("accessToken");
      const headers = {
        ...(options.headers || {}),
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      };

      let res = await fetch(url, { ...options, headers });

      // אם הטוקן פג תוקף — ננסה לחדש
      if (res.status === 401) {
        log("⚠️ 401 detected — attempting refresh...");
        const newToken = await refreshAccessToken();
        if (!newToken) throw new Error("Session expired");
        headers.Authorization = `Bearer ${newToken}`;
        res = await fetch(url, { ...options, headers });
      }

      return res;
    },
    [accessToken, refreshAccessToken]
  );

  /* ============================================================
     👤 Fetch logged-in user info
     ============================================================ */
  const fetchMe = async () => {
    log("fetchMe called | token:", accessToken ? "✅ found" : "❌ none");

    if (!accessToken) {
      setUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
      return;
    }

    try {
      const res = await authFetch("/api/users/me");
      const data = await res.json();

      if (res.ok) {
        setUser(data);
        setIsLoggedIn(true);
        setIsAdmin(data.role === "admin");
        log("✅ User loaded:", data?.name || data?.email, "| role:", data.role);
      } else {
        localStorage.removeItem("accessToken");
        setAccessToken(null);
        setUser(null);
        setIsLoggedIn(false);
        setIsAdmin(false);
        log("❌ Invalid token removed");
      }
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
      window.dispatchEvent(new Event("auth-ready"));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ============================================================
     📝 Register
     ============================================================ */
  const registerUser = async (payload) => {
    log("📩 registerUser called:", payload?.email);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
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
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      return res.ok ? { success: true, data } : { success: false, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const verifyOtp = async (email, otp) => {
    log("🔐 verifyOtp called:", email, otp);
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
        credentials: "include", // שולח את refresh cookie
      });
      const data = await res.json();

      if (res.ok && data.accessToken) {
        await completeLogin(data.accessToken);
        return { success: true, data };
      }
      return { success: false, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  /* ============================================================
     ✅ Complete Login
     ============================================================ */
  const completeLogin = async (accessToken) => {
    if (accessToken) {
      localStorage.setItem("accessToken", accessToken);
      setAccessToken(accessToken);
    }
    log("💾 Access token stored, reloading user...");
    await fetchMe();
    window.dispatchEvent(new Event("auth-ready"));
  };

  /* ============================================================
     🚪 Logout (clears cookie + local)
     ============================================================ */
  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch {}
    localStorage.removeItem("accessToken");
    setAccessToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    log("🚪 Logged out (local + server)");
    window.dispatchEvent(new Event("auth-ready"));
  };

  /* ============================================================
     ♻️ Refresh Me
     ============================================================ */
  const refreshMe = async () => {
    await fetchMe();
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

      log("✅ saveEntity success:", data);
      return { success: true, data };
    } catch (err) {
      log("❌ saveEntity error:", err.message);
      return { success: false, message: err.message };
    }
  };

  const updateEntity = async (payload) => await saveEntity(payload, { refreshMeIfCurrent: true });

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
