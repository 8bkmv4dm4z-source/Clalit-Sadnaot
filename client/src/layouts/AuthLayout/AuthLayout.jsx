// src/layouts/AuthLayout/AuthLayout.jsx
/**
 * DATA FLOW (authentication lifecycle)
 * ------------------------------------
 * • Source: Credentials originate from login/register/OTP forms in pages/Login and pages/Register
 *   and are passed into AuthContext callbacks (loginWithPassword, completeLogin, registerUser,
 *   verifyOtp). The context stores access tokens in localStorage and keeps user + role metadata in
 *   React state.
 * • Path: Each auth action delegates to apiFetch -> backend /api/auth/* endpoints. Successful
 *   responses are normalized (flattenUserEntities) and stored via setUser/setIsLoggedIn/setIsAdmin
 *   before bubbling updates through context consumers (AppRoutes uses useAuth to gate routes).
 * • Transformations: normalizeUserPayload flattens entity structure; refreshAccessToken rewrites
 *   Authorization headers; authFetch retries once on 401. Logout clears state and localStorage and
 *   navigates to /workshops.
 * • Downstream: Context values propagate to any component calling useAuth (e.g., AppShell,
 *   Profile page). Callbacks bubble events upward through window events and an EventBus so other
 *   parts (WorkshopContext) can refetch when auth changes.
 *
 * API FLOW
 * --------
 * • Endpoints: /api/auth/login, /api/auth/verify, /api/auth/register, /api/auth/logout,
 *   /api/auth/refresh, /api/auth/request-password-reset, /api/auth/reset-password.
 * • Methods/Bodies: login/register send JSON credentials; verifyOtp posts { email, otp };
 *   refresh uses POST with cookies for refresh token; logout POST clears server session.
 * • Middleware: Uses apiFetch which automatically prefixes VITE_API_URL and includes credentials;
 *   authFetch injects Authorization: Bearer <token> and retries after hitting refresh endpoint.
 * • Responses: Expected JSON containing accessToken, user payload, and message; errors are
 *   translated via translateAuthError/translateNetworkError for user-friendly UI.
 *
 * COMPONENT LOGIC
 * ---------------
 * • Purpose: Provide AuthContext with stateful login/logout helpers and mount children under
 *   <AuthProvider> so routing can check authentication. It also emits browser events signalling
 *   auth-ready/login/logout for other modules.
 * • State: isLoggedIn, isAdmin, user, filters/searchQuery (used by Workshops filter), loading,
 *   accessToken. These states coordinate API requests, control which routes display, and persist
 *   tokens between reloads.
 * • Effects: useEffect on mount to verify existing access token and fetch /api/auth/me; also uses
 *   refs to avoid duplicate verification. Navigation side-effects occur after login/logout.
 * • Props: Accepts children to render; does not receive external props.
 * • Visual states: Upstream components show loading placeholders while AuthProvider resolves
 *   loading=true → false.
 */
/**
 * AuthLayout.jsx — Authentication provider
 * -----------------------------------------
 * ✅ Centralized login/logout/OTP/token refresh logic
 * ✅ Now routes all backend calls through apiFetch()
 * ✅ Works automatically with VITE_API_URL (.env)
 */

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
import { useEventBus } from "../EventContext";
import {
  translateAuthError,
  translateNetworkError,
} from "../../utils/errorTranslator";
import { flattenUserEntities } from "../../utils/entityTypes";

/* ------------------------------ Logger ------------------------------ */
const AUTH_DEV = import.meta.env.MODE !== "production";
// SECURITY FIX: silence auth logs in production to protect credentials
const log = (...args) => {
  if (!AUTH_DEV) return;
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

const normalizeUserPayload = (payload = {}) => {
  const { userEntity, familyMembers, allEntities } = flattenUserEntities(payload);

  return {
    ...payload,
    ...userEntity,
    familyMembers,
    entities: allEntities,
  };
};

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
  loginWithPassword: async () => {},
  completeLogin: async () => {},
  startRegistration: async () => {},
  confirmRegistration: async () => {},
  registerUser: async () => {},
  sendOtp: async () => {},
  verifyOtp: async () => {},
  requestPasswordReset: async () => {},
  completePasswordReset: async () => {},
  updateEntity: async () => {},
  saveEntity: async () => {},
  refreshMe: async () => {},
});

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const { publish: publishEvent } = useEventBus();

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
     🚪 Logout
     ============================================================ */
  const logout = useCallback(
    async (silent = false) => {
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
    },
    [navigate]
  );

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
  }, [logout]);

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
  const fetchMe = useCallback(
    async (tokenOverride = null) => {
      const token =
        tokenOverride || accessToken || localStorage.getItem("accessToken");
      log("fetchMe called | token:", token ? "✅ found" : "❌ none");

      if (!token) {
        setUser(null);
        setIsLoggedIn(false);
        setIsAdmin(false);
        return null;
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

        const normalizedUser = normalizeUserPayload(data);
        const isAdminFlag = Boolean(
          normalizedUser?.isAdmin || normalizedUser?.role === "admin"
        );

        setUser(normalizedUser);
        setIsLoggedIn(true);
        setIsAdmin(isAdminFlag);
        log(
          "✅ User loaded:",
          normalizedUser?.name || normalizedUser?.email,
          "| admin:",
          isAdminFlag,
          "| fingerprint:",
          normalizedUser?.roleFingerprint
            ? `${String(normalizedUser.roleFingerprint).slice(0, 8)}…`
            : "none"
        );

        return normalizedUser;
      } catch (err) {
        log("❌ fetchMe error:", err.message);
        localStorage.removeItem("accessToken");
        setAccessToken(null);
        setUser(null);
        setIsLoggedIn(false);
        setIsAdmin(false);
        return null;
      }
    },
    [accessToken]
  );

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
     📝 Register (legacy) + two-step flow
     ============================================================ */
  const startRegistration = async (payload) => {
    log("📩 startRegistration called:", payload?.email);
    try {
      const res = await apiFetch("/api/auth/register/request", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        const { message: friendly, details } = translateAuthError(
          "register",
          res.status,
          data
        );
        publishEvent({
          type: "error",
          title: "הרשמה נכשלה",
          message: friendly,
          meta: details?.length ? { details } : undefined,
        });
        return {
          success: false,
          status: res.status,
          message: friendly,
          details: details || [],
        };
      }

      publishEvent({
        type: "info",
        title: "קוד אימות נשלח",
        message: "שלחנו אליך קוד אימות להשלמת ההרשמה.",
        ttl: 6000,
      });
      return { success: true, data };
    } catch (err) {
      const { message: friendly } = translateNetworkError(err);
      log("❌ startRegistration error:", err.message);
      publishEvent({
        type: "error",
        title: "הרשמה נכשלה",
        message: friendly,
      });
      return { success: false, message: friendly };
    }
  };

  const confirmRegistration = async ({ email, otp }) => {
    log("🔐 confirmRegistration called:", email);
    try {
      const res = await apiFetch("/api/auth/register/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp }),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        const { message: friendly, details } = translateAuthError(
          "register",
          res.status,
          data
        );
        publishEvent({
          type: "error",
          title: "אימות קוד נכשל",
          message: friendly,
          meta: details?.length ? { details } : undefined,
        });
        return {
          success: false,
          status: res.status,
          message: friendly,
          details: details || [],
        };
      }

      publishEvent({
        type: "success",
        title: "ההרשמה הושלמה",
        message: "החשבון נוצר בהצלחה! ניתן להתחבר כעת.",
        ttl: 4000,
      });
      return { success: true, data };
    } catch (err) {
      const { message: friendly } = translateNetworkError(err);
      log("❌ confirmRegistration error:", err.message);
      publishEvent({
        type: "error",
        title: "אימות קוד נכשל",
        message: friendly,
      });
      return { success: false, message: friendly };
    }
  };

  const registerUser = async (payload) => {
    log("📩 registerUser called:", payload?.email);
    try {
      const res = await apiFetch("/api/auth/register", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);

      if (!res.ok) {
        const { message: friendly, details } = translateAuthError(
          "register",
          res.status,
          data
        );
        publishEvent({
          type: "error",
          title: "הרשמה נכשלה",
          message: friendly,
          meta: details?.length ? { details } : undefined,
        });
        return {
          success: false,
          status: res.status,
          message: friendly,
          details: details || [],
        };
      }

      publishEvent({
        type: "success",
        title: "הרשמה הושלמה",
        message: "החשבון נוצר בהצלחה! ניתן להתחבר כעת.",
        ttl: 4000,
      });
      return { success: true, data };
    } catch (err) {
      const { message: friendly } = translateNetworkError(err);
      log("❌ registerUser error:", err.message);
      publishEvent({
        type: "error",
        title: "הרשמה נכשלה",
        message: friendly,
      });
      return { success: false, message: friendly };
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
     🔄 Password reset (request + completion)
     ============================================================ */
  const requestPasswordReset = async (email) => {
    log("📨 requestPasswordReset:", email);
    try {
      const res = await apiFetch("/api/auth/password/request", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.message || "Failed to send reset instructions");
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const completePasswordReset = async ({ email, newPassword, token, otp }) => {
    log("🔁 completePasswordReset invoked", {
      email,
      hasToken: Boolean(token),
      hasOtp: Boolean(otp),
    });

    try {
      const payload = {
        email,
        newPassword,
        ...(token ? { token } : {}),
        ...(otp ? { otp } : {}),
      };

      const res = await apiFetch("/api/auth/reset", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        throw new Error(data?.message || "Password reset failed");
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  /* ============================================================
     ✅ Complete Login
     ============================================================ */
  const completeLogin = useCallback(
    async (newToken) => {
      if (!newToken) return;

      localStorage.setItem("accessToken", newToken);
      setAccessToken(newToken);
      log("💾 Access token stored, loading user directly...");

      const data = await fetchMe(newToken);
      fireAuthReady(true, { phase: "login-complete" });
      fireLoggedIn({ userId: String(data?._id || data?.id || "") });
      navigate("/workshops");
    },
    [fetchMe, navigate]
  );

  /* ============================================================
     🔑 Login (Password)
     ============================================================ */
  const loginWithPassword = useCallback(
    async ({ email, password }) => {
      log("🔑 loginWithPassword called:", email);
      try {
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password }),
        });

        const data = await safeJson(res);

        if (!res.ok) {
          const { message: friendly, details } = translateAuthError(
            "login",
            res.status,
            data
          );
          publishEvent({
            type: "error",
            title: "התחברות נכשלה",
            message: friendly,
            meta: details?.length ? { details } : undefined,
          });
          return {
            success: false,
            status: res.status,
            message: friendly,
            details: details || [],
          };
        }

        const token = data?.accessToken || data?.token;
        if (!token) {
          const friendly =
            "תגובת ההתחברות חסרה אסימון גישה. פנו לתמיכה במערכת.";
          publishEvent({
            type: "error",
            title: "התחברות נכשלה",
            message: friendly,
          });
          return { success: false, status: res.status, message: friendly };
        }

        await completeLogin(token);
        publishEvent({
          type: "success",
          title: "התחברות בוצעה",
          message: "ברוך הבא! מפנים אותך ללוח הסדנאות.",
          ttl: 3500,
        });
        return { success: true, data };
      } catch (err) {
        const { message: friendly } = translateNetworkError(err);
        log("❌ loginWithPassword error:", err.message);
        publishEvent({
          type: "error",
          title: "התחברות נכשלה",
          message: friendly,
        });
        return { success: false, message: friendly };
      }
    },
    [completeLogin, publishEvent]
  );

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

    const resolveEntityKey = () => {
      if (!payload) return null;
      if (payload.entityKey) return String(payload.entityKey);
      if (payload.familyEntityKey) return String(payload.familyEntityKey);
      if (payload.userEntityKey) return String(payload.userEntityKey);

      // Legacy support: map `_id` references to the hashed entityKey
      if (payload.userId && user && String(payload.userId) === String(user._id)) {
        return String(user.entityKey || "");
      }

      if (payload.familyId && Array.isArray(user?.familyMembers)) {
        const target = user.familyMembers.find(
          (m) => String(m._id) === String(payload.familyId)
        );
        if (target?.entityKey) return String(target.entityKey);
      }

      return null;
    };

    const entityKey = resolveEntityKey();
    const updates = payload?.updates || {};

    if (!entityKey) {
      log("❌ saveEntity error: missing entityKey for update payload");
      return { success: false, message: "Missing entity key for update" };
    }

    try {
      const res = await authFetch("/api/users/update-entity", {
        method: "PUT",
        body: JSON.stringify({ entityKey, updates }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");

      const isCurrentUserUpdate = user && String(entityKey) === String(user.entityKey);
      const isCurrentFamilyUpdate = Array.isArray(user?.familyMembers)
        ? user.familyMembers.some((m) => String(m.entityKey) === String(entityKey))
        : false;

      if (refreshMeIfCurrent && (isCurrentUserUpdate || isCurrentFamilyUpdate)) {
        await refreshMe();
      }

      window.dispatchEvent(
        new CustomEvent("auth-user-updated", {
          detail: {
            at: Date.now(),
            entityKey,
            userId: String(user?._id || ""),
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
        loginWithPassword,
        completeLogin,
        startRegistration,
        confirmRegistration,
        registerUser,
        sendOtp,
        verifyOtp,
        requestPasswordReset,
        completePasswordReset,
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
