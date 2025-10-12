// src/layouts/AuthLayout/AuthLayout.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

/** Console logger with timestamp */
const log = (...args) => {
  const time = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${time}] [AUTH]`, "color:#1976d2;font-weight:bold;", ...args);
};

/** Public shape (includes saveEntity + refreshMe) */
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
  updateEntity: async () => {}, // legacy alias (delegates to saveEntity)
  saveEntity: async () => {},   // ✅ canonical updater
  refreshMe: async () => {},    // ✅ expose fetchMe
});

export const AuthProvider = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const didVerifyRef = useRef(false);

  /** Fetch the logged-in user (if token exists) */
  const fetchMe = async () => {
    const token = localStorage.getItem("token");
    log("fetchMe called | token:", token ? "✅ found" : "❌ none");

    if (!token) {
      setUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
      log("No token → logged out state");
      return;
    }

    try {
      const res = await fetch("/api/users/me", {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();

      if (res.ok) {
        setUser(data);
        setIsAdmin(data.role === "admin");
        setIsLoggedIn(true);
        log("✅ User loaded:", data?.name || data?.email || data?._id, "| role:", data.role);
      } else {
        localStorage.removeItem("token");
        setUser(null);
        setIsLoggedIn(false);
        setIsAdmin(false);
        log("❌ Invalid token removed");
      }
    } catch (err) {
      log("❌ fetchMe error:", err.message);
      localStorage.removeItem("token");
      setUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  };

  /** On mount: verify auth once and signal 'auth-ready' */
  useEffect(() => {
    if (didVerifyRef.current) return;
    didVerifyRef.current = true;
    log("🔹 Mounted AuthProvider");

    (async () => {
      await fetchMe();
      setLoading(false);
      // Broadcast that auth is ready so other contexts can safely start
      window.dispatchEvent(new Event("auth-ready"));
      log("🔸 Auth loading complete | user:", !!user, "| admin:", isAdmin);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Register */
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
      log("✅ registerUser success");
      return { success: true, data };
    } catch (err) {
      log("❌ registerUser error:", err.message);
      return { success: false, message: err.message };
    }
  };

  /** OTP flow */
  const sendOtp = async (email) => {
    log("📤 sendOtp:", email);
    try {
      const res = await fetch("/api/auth/send-otp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      log("sendOtp result:", data);
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
      });
      const data = await res.json();

      if (res.ok && data.token) {
        log("✅ OTP verified | token saved");
        await completeLogin(data.token);
        return { success: true, data };
      }
      log("❌ OTP verify failed:", data.message);
      return { success: false, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  /** Complete login: store token, reload user, broadcast readiness */
  const completeLogin = async (token) => {
    if (token) localStorage.setItem("token", token);
    log("💾 Token stored, reloading user...");
    await fetchMe();
    window.dispatchEvent(new Event("auth-ready"));
  };

  /** Logout: clear state and broadcast readiness (so dependents reset) */
  const logout = () => {
    localStorage.removeItem("token");
    log("🚪 Logout triggered");
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    window.dispatchEvent(new Event("auth-ready"));
  };

  /** Expose fetchMe so other contexts can request a refresh */
  const refreshMe = async () => {
    await fetchMe();
  };

  /**
   * ✅ Canonical updater (user or family)
   * payload: { userId?: string, familyId?: string, updates: {...} }
   * options: { refreshMeIfCurrent?: boolean } (default true)
   */
  const saveEntity = async (payload, { refreshMeIfCurrent = true } = {}) => {
    log("✏️ saveEntity called:", payload);
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Missing token");

      const res = await fetch("/api/users/update-entity", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");

      // If current user or one of their family members was updated, refresh me
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

  /** Backward-compat: keep updateEntity but delegate to saveEntity */
  const updateEntity = async (payload) => {
    return await saveEntity(payload, { refreshMeIfCurrent: true });
  };

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
        updateEntity, // legacy alias
        saveEntity,   // ✅ canonical
        refreshMe,    // ✅ exposed fetchMe
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
