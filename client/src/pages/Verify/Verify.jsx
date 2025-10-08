/**
 * Verify.jsx — Tailwind + useAuth Integration
 * --------------------------------------------
 * - Uses sendOtp() and verifyOtp() from AuthLayout context.
 * - Fully styled with Tailwind (no legacy CSS).
 * - Logic preserved 100% (steps, status, navigation).
 */

import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function Verify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOtp, verifyOtp } = useAuth(); // ✅ שימוש בקונטקסט
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");

  // אם הגענו מדף ההתחברות עם מייל מוכן
  useEffect(() => {
    if (location.state?.email) {
      setEmail(location.state.email);
      setStep(2);
    }
  }, [location.state]);

  /* ==================== שלב 1: שליחת קוד ==================== */
  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!email) return alert("נא להזין מייל תקין.");
    setStatus("sending");

    const result = await sendOtp(email);
    setStatus("idle");

    if (result.success) {
      alert("✅ נשלח קוד למייל שלך!");
      setStep(2);
    } else {
      alert(result.message || "שגיאה בשליחת הקוד.");
    }
  };

  /* ==================== שלב 2: אימות קוד ==================== */
  const handleVerifyCode = async (e) => {
    e.preventDefault();
    if (!code) return alert("נא להזין את הקוד שהתקבל במייל.");
    setStatus("verifying");

    const result = await verifyOtp(email, code);
    setStatus("idle");

    if (result.success) {
      alert("✅ התחברת בהצלחה!");
      navigate("/workshops");
    } else {
      alert(result.message || "❌ קוד שגוי או פג תוקף.");
    }
  };

  /* ==================== עיצוב וממשק ==================== */
  return (
    <div
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 p-8"
      dir="rtl"
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 animate-fade-in">
        {step === 1 ? (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2 font-[Poppins]">
              כניסה באמצעות מייל
            </h2>
            <p className="text-gray-600 text-center mb-6">
              הזן את כתובת המייל שלך ונשלח אליך קוד אימות חד־פעמי
            </p>

            <form onSubmit={handleSendOtp} className="space-y-4">
              <label className="block text-gray-700">
                כתובת אימייל:
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  required
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </label>

              <button
                type="submit"
                disabled={status === "sending"}
                className={`w-full py-2.5 rounded-xl font-semibold text-white shadow-sm transition ${
                  status === "sending"
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                }`}
              >
                {status === "sending" ? "שולח..." : "שלח קוד אימות"}
              </button>
            </form>
          </>
        ) : (
          <>
            <h2 className="text-2xl font-bold text-gray-900 text-center mb-2 font-[Poppins]">
              אימות קוד
            </h2>
            <p className="text-gray-600 text-center mb-4">
              הקוד נשלח לכתובת: <strong>{email}</strong>
            </p>

            <form onSubmit={handleVerifyCode} className="space-y-4">
              <label className="block text-gray-700">
                הזן את הקוד שקיבלת:
                <input
                  type="text"
                  value={code}
                  maxLength="6"
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 ספרות"
                  required
                  className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none text-center tracking-widest font-mono"
                />
              </label>

              <button
                type="submit"
                disabled={status === "verifying"}
                className={`w-full py-2.5 rounded-xl font-semibold text-white shadow-sm transition ${
                  status === "verifying"
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
                }`}
              >
                {status === "verifying" ? "מאמת..." : "אמת קוד"}
              </button>
            </form>

            <button
              onClick={() => setStep(1)}
              className="mt-5 text-indigo-600 hover:underline block text-center"
            >
              ← חזרה להזנת מייל
            </button>
          </>
        )}
      </div>
    </div>
  );
}
