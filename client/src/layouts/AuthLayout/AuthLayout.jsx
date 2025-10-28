// src/layouts/AuthLayout/AuthLayout.jsx
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

/* ------------------------------ Logger ------------------------------ */
const log = (...args) => {
  const time = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${time}] [AUTH]`, "color:#1976d2;font-weight:bold;", ...args);
};

/* ----------------------------- Events ------------------------------- */
function fireAuthReady(loggedIn, extra = {}) {
  // Backwards-compat event + payload for anyone listening
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
     🔁 Refresh Access Token (via refresh cookie)
     ============================================================ */
  const refreshAccessToken = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/refresh", {
        method: "POST",
        credentials: "include", // REQUIRED so refresh cookie is sent
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) throw new Error(`Failed to refresh token (${res.status})`);
      const data = await res.json();

      if (data?.accessToken) {
        localStorage.setItem("accessToken", data.accessToken);
        setAccessToken(data.accessToken);
        log("🔄 Token refreshed successfully");
        return data.accessToken;
      }
      throw new Error("No access token in refresh response");
    } catch (err) {
      log("⚠️ refreshAccessToken failed:", err.message);
      // do NOT recurse; perform a clean logout
      await logout(true); // silent
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

      let res = await fetch(url, { ...options, headers });

      if (res.status === 401) {
        log("⚠️ 401 detected — attempting refresh...");
        const newToken = await refreshAccessToken();
        if (!newToken) throw new Error("Session expired");
        const headers2 = { ...headers, Authorization: `Bearer ${newToken}` };
        res = await fetch(url, { ...options, headers: headers2 });
      }

      return res;
    },
    [accessToken, refreshAccessToken]
  );

  /* ============================================================
     👤 fetchMe — load current user by access token
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
      const res = await fetch("/api/users/me", {
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
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
      // fire auth-ready with current state
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
      return res.ok
        ? { success: true, data }
        : { success: false, message: data.message };
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
        credentials: "include", // send/receive refresh cookie
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
  const completeLogin = async (newToken) => {
    if (!newToken) return;

    localStorage.setItem("accessToken", newToken);
    setAccessToken(newToken);
    log("💾 Access token stored, loading user directly...");

    await fetchMe(newToken);

    // fire both the legacy signal and explicit "logged-in"
    fireAuthReady(true, { phase: "login-complete" });
    fireLoggedIn({ userId: String(user?.id || user?._id || "") });

    // redirect after successful login
    navigate("/workshops");
  };

  /* ============================================================
     🚪 Logout (server + local) with global signals
     ============================================================ */
  const logout = async (silent = false) => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (_) {
      // ignore network error; still clear client state
    }

    localStorage.removeItem("accessToken");
    setAccessToken(null);
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);

    log("🚪 Logged out (local + server)");

    // fire both events so other contexts can react (e.g., WorkshopContext)
    fireAuthReady(false, { phase: "logout" });
    fireLoggedOut();

    if (!silent) navigate("/workshops");
  };

  /* ============================================================
    
    ♻️ Refresh Me
     ============================================================ */

  const refreshMe = async () => {
    await fetchMe();
    // עדכן את האפליקציה כולה שמידע המשתמש רוענן
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

      // גם אם זה לא המשתמש הנוכחי—אפשר לשדר לכל האפליקציה שהתרחשה עדכון
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
  );}
  // src/layouts/AuthLayout/AuthLayout.jsx
export const useAuth = () => useContext(AuthContext);

