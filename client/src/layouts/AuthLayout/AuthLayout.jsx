// src/layouts/AuthLayout/AuthLayout.jsx
/**
 * DATA FLOW (authentication lifecycle)
 * ------------------------------------
 * • Source: Credentials originate from login/register/OTP forms in pages/Login and pages/Register
 *   and are passed into AuthContext callbacks (loginWithPassword, completeLogin, registerUser,
 *   verifyOtp). The context keeps user metadata in React state while auth cookies are browser-managed.
 *   state.
 * • Path: Each auth action delegates to apiFetch -> backend /api/auth/* endpoints. Successful
 *   responses are normalized via normalizeMePayload (whitelisted fields only) and stored via
 *   setUser/setIsLoggedIn before bubbling updates through context consumers (AppRoutes uses useAuth
 *   to gate routes).
 * • Transformations: normalizeMePayload unwraps { success, data } and strips role/authority fields;
 *   authFetch delegates retries to apiFetch (cookie + refresh flow). Logout clears local auth state
 *   and navigates to /workshops.
 * • Downstream: Context values propagate to any component calling useAuth (e.g., AppShell,
 *   Profile page). Callbacks bubble events upward through window events and an EventBus so other
 *   parts (WorkshopContext) can refetch when auth changes.
 *
 * API FLOW
 * --------
 * • Endpoints: /api/auth/login, /api/auth/verify, /api/auth/register, /api/auth/logout,
 *   /api/auth/refresh, /api/auth/request-password-reset, /api/auth/reset-password,
 *   /api/users/getme (returns { success, data } with minimal identity fields + access envelope).
 * • Methods/Bodies: login/register send JSON credentials; verifyOtp posts { email, otp };
 *   refresh uses POST with cookies for refresh token; logout POST clears server session.
 * • Middleware: Uses apiFetch which automatically prefixes VITE_API_URL, includes credentials,
 *   and performs refresh-retry when the access cookie expires.
 * • Responses: /getme is
 *   normalized to a whitelisted shape (entityKey + contact details) to avoid rehydrating privileged
 *   fields; errors are translated via translateAuthError/translateNetworkError for user-friendly
 *   UI.
 *
 * COMPONENT LOGIC
 * ---------------
 * • Purpose: Provide AuthContext with stateful login/logout helpers and mount children under
 *   <AuthProvider> so routing can check authentication. It also emits browser events signalling
 *   auth-ready/login/logout for other modules.
 * • State: isLoggedIn, user, filters/searchQuery (used by Workshops filter), loading.
 *   These states coordinate API requests, control which routes display, and persist tokens between
 *   reloads.
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
import { normalizeError } from "../../utils/normalizeError";
import { normalizeMePayload } from "../../utils/entityTypes";
import { getCaptchaToken } from "../../utils/captcha";

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

/* --------------------------- Context Shape -------------------------- */
const AuthContext = createContext({
  isLoggedIn: false,
  loading: true,
  logoutInProgress: false,
  user: null,
  filters: {},
  searchQuery: "",
  setIsLoggedIn: () => {},
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

export { AuthContext };

export const AuthProvider = ({ children }) => {
  const navigate = useNavigate();
  const { publish: publishEvent } = useEventBus();

  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [logoutInProgress, setLogoutInProgress] = useState(false);
  const didVerifyRef = useRef(false);
  const logoutInProgressRef = useRef(false);
  const fetchMeRequestIdRef = useRef(0);
  const capabilityProbePendingRef = useRef(false);

  useEffect(() => {
    logoutInProgressRef.current = logoutInProgress;
  }, [logoutInProgress]);

  useEffect(() => {
    const handler = (event) => {
      capabilityProbePendingRef.current = !!event?.detail?.isChecking;
    };
    window.addEventListener("admin-capability-checking", handler);
    return () => window.removeEventListener("admin-capability-checking", handler);
  }, []);

  /* ============================================================
     🚪 Logout
     ============================================================ */
  const logout = useCallback(
    async (silent = false) => {
      setLogoutInProgress(true);
      try {
        await apiFetch("/api/auth/logout", {
          method: "POST",
          credentials: "include",
        });
      } catch {
        /* ignore */
      }

      setUser(null);
      setIsLoggedIn(false);

      log("🚪 Logged out (local + server)");

      fireAuthReady(false, { phase: "logout" });
      fireLoggedOut();

      logoutInProgressRef.current = false;
      setLogoutInProgress(false);

      if (!silent) navigate("/workshops");
    },
    [navigate]
  );

  const normalizeResponseError = useCallback((res, payload, fallbackMessage) => {
    return (
      res?.normalizedError ||
      normalizeError(null, {
        status: res?.status,
        payload,
        fallbackMessage,
      })
    );
  }, []);

  /* ============================================================
     🔐 authFetch helper — auto refresh on 401 once
     ============================================================ */
  const authFetch = useCallback(
  async (url, options = {}) => {
    if (logoutInProgressRef.current) {
      throw new Error("Logout in progress");
    }
    const fetchOptions = options;

    try {
      const res = await apiFetch(url, {
        ...fetchOptions,
        credentials: "include",
      });
      return res;
    } catch (e) {
      log("❌ authFetch error:", e.message);
      throw e;
    }
  },
  []
  );

  /* ============================================================
   👤 fetchMe — load current user (MINIMAL, SERVER-AUTHORITATIVE)
   ============================================================ */
  const fetchMe = useCallback(
    async ({ allowDuringLoading = false } = {}) => {
      if (logoutInProgressRef.current) {
        log("⚠️ fetchMe skipped: logout in progress");
        return null;
      }
      if (!allowDuringLoading && loading) {
        log("⚠️ fetchMe skipped: auth loading");
        return null;
      }
      if (capabilityProbePendingRef.current) {
        log("⚠️ fetchMe skipped: capability probe pending");
        return null;
      }

      const requestId = ++fetchMeRequestIdRef.current;

      try {
        const res = await authFetch("/api/users/getMe");

        const raw = await safeJson(res);

        if (!res.ok || !raw) {
          const normalized = normalizeResponseError(res, raw, "Failed to load profile");
          throw new Error(normalized.message);
        }

        const normalized = normalizeMePayload(raw);
        if (!normalized?.entityKey) {
          throw new Error(
            normalizeError(null, { fallbackMessage: "Invalid /getme payload" }).message
          );
        }

        if (
          logoutInProgressRef.current ||
          requestId !== fetchMeRequestIdRef.current
        ) {
          log("⚠️ fetchMe ignored: stale response");
          return null;
        }

        setUser(normalized);
        setIsLoggedIn(true);

        log("✅ getme loaded:", normalized.entityKey);
        return normalized;
      } catch (err) {
        log("❌ fetchMe error:", err.message);
        if (!logoutInProgressRef.current) {
          await logout(true);
        }
        return null;
      }
    },
    [authFetch, loading, logout, normalizeResponseError]
  );

  /* ============================================================
     🚀 On Mount
     ============================================================ */
  useEffect(() => {
    if (didVerifyRef.current) return;
    didVerifyRef.current = true;
    log("🔹 Mounted AuthProvider");

    (async () => {
      const me = await fetchMe({ allowDuringLoading: true });
      setLoading(false);
      fireAuthReady(!!me);
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
        message:
          "אם ההרשמה זכאית, התחלנו את תהליך האימות. בדקו את האימייל להמשך ההנחיות.",
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
      const captchaToken = await getCaptchaToken("send_otp");
      const res = await apiFetch("/api/auth/send-otp", {
        method: "POST",
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const normalized = normalizeResponseError(res, data, "Failed to send OTP");
        throw new Error(normalized.message);
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const verifyOtp = async (email, otp) => {
    log("🔐 verifyOtp called:", email, otp);
    try {
      const captchaToken = await getCaptchaToken("verify_otp");
      const res = await apiFetch("/api/auth/verify", {
        method: "POST",
        body: JSON.stringify({ email, otp, captchaToken }),
        credentials: "include",
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const normalized = normalizeResponseError(res, data, "OTP verification failed");
        throw new Error(normalized.message);
      }
      await completeLogin();
      return { success: true, data };
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
      const captchaToken = await getCaptchaToken("password_reset_request");
      const res = await apiFetch("/api/auth/password/request", {
        method: "POST",
        body: JSON.stringify({ email, captchaToken }),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const normalized = normalizeResponseError(res, data, "Failed to send reset instructions");
        throw new Error(normalized.message);
      }
      return { success: true, data };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  const completePasswordReset = async ({ newPassword, token, phoneAnswer }) => {
    log("🔁 completePasswordReset invoked", {
      hasToken: Boolean(token),
      hasPhoneAnswer: Boolean(phoneAnswer),
    });

    try {
      const captchaToken = await getCaptchaToken("password_reset_complete");
      const payload = {
        newPassword,
        token,
        phoneAnswer,
        captchaToken,
      };

      const res = await apiFetch("/api/auth/reset", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await safeJson(res);
      if (!res.ok) {
        const normalized = normalizeResponseError(res, data, "Password reset failed");
        throw new Error(normalized.message);
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
    async () => {
      const data = await fetchMe({ allowDuringLoading: true });
      if (!data) {
        return;
      }
      fireAuthReady(true, { phase: "login-complete" });
      fireLoggedIn({ userId: String(data?._id || data?.id || "") });
      navigate("/workshops");
      return data;
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
        const captchaToken = await getCaptchaToken("login");
        const res = await apiFetch("/api/auth/login", {
          method: "POST",
          body: JSON.stringify({ email, password, captchaToken }),
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

        const me = await completeLogin();
        if (!me) {
          return {
            success: false,
            status: res.status,
            message: "Session validation failed",
          };
        }
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
    const data = await fetchMe();
    if (!data) return;
    window.dispatchEvent(
      new CustomEvent("auth-user-updated", {
detail: { at: Date.now(), entityKey: user?.entityKey }
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
      if (!res.ok) {
        const normalized = normalizeResponseError(res, data, "Update failed");
        throw new Error(normalized.message);
      }

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
        user,
        loading,
        filters,
        searchQuery,
        setUser,
        setIsLoggedIn,
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
      logoutInProgress,
    }}
  >
    {children}
  </AuthContext.Provider>
  );
};

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthContext);
