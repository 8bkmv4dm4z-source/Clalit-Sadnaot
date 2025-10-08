/**
 * Login.jsx — Tailwind Business Edition
 * -------------------------------------
 * - Logic preserved entirely.
 * - Styled with Tailwind for consistency with Verify & Register.
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function Login() {
  const navigate = useNavigate();
  const { isLoggedIn, completeLogin } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (isLoggedIn) navigate("/workshops", { replace: true });
  }, [isLoggedIn, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setStatus("submitting");
    setErrorMsg("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();

      if (!res.ok || !data?.token)
        throw new Error(data?.message || "פרטי ההתחברות שגויים");

      await completeLogin(data.token);
      navigate("/workshops", { replace: true });
    } catch (err) {
      setErrorMsg(err.message || "שגיאה בהתחברות");
      setStatus("error");
    } finally {
      if (status !== "error") setStatus("idle");
    }
  };

  const gotoOtp = () => navigate("/verify", { state: { email } });

  /* ==================== UI ==================== */
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 p-8"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 animate-fade-in">
        {/* Title */}
        <h2 className="text-3xl font-bold text-gray-900 text-center font-[Poppins] mb-2">
          התחברות לחשבון
        </h2>
        <p className="text-gray-600 text-center mb-6">
          הזן את פרטיך כדי להיכנס למערכת
        </p>

        {/* Form */}
        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <label className="block text-gray-700 mb-1 font-medium">
              מייל
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              placeholder="example@gmail.com"
            />
          </div>

          <div>
            <label className="block text-gray-700 mb-1 font-medium">
              סיסמה
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                required
                className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xl"
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 text-rose-600 text-sm rounded-lg p-2 px-3 border border-rose-100 animate-fade-in">
              ❌ {errorMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={status === "submitting"}
            className={`w-full py-2.5 rounded-xl font-semibold text-white shadow-sm transition-all ${
              status === "submitting"
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
            }`}
          >
            {status === "submitting" ? "מתחבר..." : "התחבר"}
          </button>
        </form>

        {/* Alternative login */}
        <div className="text-center mt-6">
          <p className="text-gray-500 text-sm mb-2">
            או התחבר עם קוד חד־פעמי (OTP)
          </p>
          <button
            onClick={gotoOtp}
            className="text-indigo-600 hover:text-indigo-800 hover:underline font-medium transition"
          >
            שלח קוד למייל →
          </button>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-gray-200"></div>

        {/* Register link */}
        <p className="text-center text-sm text-gray-600">
          אין לך חשבון עדיין?{" "}
          <button
            onClick={() => navigate("/register")}
            className="text-indigo-600 hover:text-indigo-800 font-medium underline"
          >
            הירשם עכשיו
          </button>
        </p>
      </div>
    </div>
  );
}
