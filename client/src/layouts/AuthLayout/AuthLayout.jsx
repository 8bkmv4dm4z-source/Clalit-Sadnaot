// src/layouts/AuthLayout/AuthLayout.jsx
import React, { createContext, useContext, useEffect, useRef, useState } from "react";

const AuthContext = createContext({
  isLoggedIn: false,
  isAdmin: false,
  loading: true,
  filters: {},
  searchQuery: "",
  user: null, // ✅ נוסף — כדי לדעת מי המשתמש המחובר
  // פונקציות ברירת מחדל
  setIsLoggedIn: () => {},
  setIsAdmin: () => {},
  setFilters: () => {},
  setSearchQuery: () => {},
  setUser: () => {}, // ✅ חדש
  logout: () => {},
  completeLogin: async () => {},
  registerUser: async () => {},
  sendOtp: async () => {},
  verifyOtp: async () => {},
});

export const AuthProvider = ({ children }) => {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [filters, setFilters] = useState({});
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState(null); // ✅ חדש
  const didVerifyRef = useRef(false);

  /* =======================================================
   * ✅ מביא את פרטי המשתמש דרך /api/auth/me
   * ======================================================= */
  const fetchMe = async () => {
  const token = localStorage.getItem("token");
  if (!token) {
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    return;
  }

  try {
    const res = await fetch("/api/users/me", { // ✅ שונה מ־auth ל־users
      headers: { Authorization: `Bearer ${token}` },
    });

    if (res.ok) {
      const userData = await res.json();
      setUser(userData); // ✅ שומר את כל פרטי המשתמש
      setIsAdmin(userData?.role === "admin");
      setIsLoggedIn(true);
    } else {
      localStorage.removeItem("token");
      setUser(null);
      setIsLoggedIn(false);
      setIsAdmin(false);
    }
  } catch (err) {
    console.error("❌ Error verifying user:", err);
    localStorage.removeItem("token");
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
  }
};
  /* =======================================================
   * ✅ נטען פעם אחת בתחילת האפליקציה
   * ======================================================= */
  useEffect(() => {
    if (didVerifyRef.current) return;
    didVerifyRef.current = true;

    (async () => {
      try {
        await fetchMe();
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /* =======================================================
   * ✅ רישום משתמש חדש
   * ======================================================= */
  const registerUser = async (payload) => {
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Registration failed");
      return { success: true, data };
    } catch (err) {
      console.error("❌ registerUser error:", err);
      return { success: false, message: err.message };
    }
  };

  /* =======================================================
   * 🧩 שליחת OTP (אם רוצים להפריד מ־Verify)
   * ======================================================= */
  const sendOtp = async (email) => {
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

  /* =======================================================
   * 🧩 אימות OTP
   * ======================================================= */
  const verifyOtp = async (email, otp) => {
    try {
      const res = await fetch("/api/auth/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, otp }),
      });
      const data = await res.json();

      if (res.ok && data?.token) {
        await completeLogin(data.token);
        return { success: true, data };
      }
      return { success: false, message: data.message };
    } catch (err) {
      return { success: false, message: err.message };
    }
  };

  /* =======================================================
   * ✅ התנתקות מלאה
   * ======================================================= */
  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setIsLoggedIn(false);
    setIsAdmin(false);
    setFilters({});
  };

  /* =======================================================
   * ✅ התחברות אחרי אימות OTP / Login
   * ======================================================= */
  const completeLogin = async (token) => {
    if (token) localStorage.setItem("token", token);
    await fetchMe(); // ✅ יביא שוב את פרטי המשתמש המלאים
  };
    /* =======================================================
   * ✅ עדכון פרופיל משתמש מחובר
   * ======================================================= */
  const updateProfile = async (updates) => {
  try {
    const token = localStorage.getItem("token");
    if (!token) throw new Error("Missing token");

    const bodyData = {
      ...updates,
      familyMembers: updates.familyMembers || [],
    };

    const res = await fetch("/api/profile/edit", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(bodyData),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Profile update failed");

    // 🟢 נבדוק אם הנתונים מגיעים כ- {user: {...}}
    const updatedUser = data.user || data;

    setUser((prev) => ({
      ...prev,
      ...updatedUser,
      familyMembers: updatedUser.familyMembers || prev.familyMembers || [],
    }));

    return { success: true, data: updatedUser };
  } catch (err) {
    console.error("❌ updateProfile error:", err);
    return { success: false, message: err.message };
  }
};




  /* =======================================================
   * 🔹 חשיפת הקונטקסט לכל האפליקציה
   * ======================================================= */
  return (
    <AuthContext.Provider
      value={{
        isLoggedIn,
        isAdmin,
        user, // ✅ נגיש לכל הרכיבים (כולל Workshops)
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
        updateProfile, // ✅ חדש
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
