import React, { useState, useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function Verify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { sendOtp, verifyOtp } = useAuth();
  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [status, setStatus] = useState("idle");

  useEffect(() => {
    if (location.state?.prefillEmail) {
      setEmail(location.state.prefillEmail);
    }
  }, [location.state]);

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

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-white p-6"
    >
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl border border-indigo-100 shadow-2xl p-10 animate-fade-in transition hover:shadow-indigo-200">
        {step === 1 ? (
          <>
            {/* Header */}
            <div className="text-center mb-6 space-y-2">
              <h2 className="text-3xl font-extrabold text-indigo-700 tracking-tight">
                כניסה באמצעות מייל
              </h2>
              <p className="text-gray-600 text-sm font-medium">
                הזן את כתובת המייל שלך ונשלח אליך קוד אימות חד־פעמי
              </p>
            </div>

            {/* Email Input */}
            <form onSubmit={handleSendOtp} className="space-y-6">
              <div className="pb-4 border-b border-indigo-50">
                <label className="block mb-2 text-sm font-semibold text-indigo-700 tracking-wide">
                  כתובת אימייל
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@gmail.com"
                  required
                  className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={status === "sending"}
                className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
                  status === "sending"
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
                }`}
              >
                {status === "sending" ? "שולח..." : "שלח קוד אימות"}
              </button>
            </form>
          </>
        ) : (
          <>
            {/* Header */}
            <div className="text-center mb-6 space-y-2">
              <h2 className="text-3xl font-extrabold text-indigo-700 tracking-tight">
                אימות קוד
              </h2>
              <p className="text-gray-600 text-sm font-medium">
                הקוד נשלח לכתובת:{" "}
                <span className="font-semibold text-indigo-700">{email}</span>
              </p>
            </div>

            {/* Code Input */}
            <form onSubmit={handleVerifyCode} className="space-y-6">
              <div className="pb-4 border-b border-indigo-50">
                <label className="block mb-2 text-sm font-semibold text-indigo-700 tracking-wide">
                  הזן את הקוד שהתקבל במייל
                </label>
                <input
                  type="text"
                  value={code}
                  maxLength="6"
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="6 ספרות"
                  required
                  className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none text-center tracking-widest font-mono"
                />
              </div>

              <button
                type="submit"
                disabled={status === "verifying"}
                className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
                  status === "verifying"
                    ? "bg-gray-400 cursor-not-allowed"
                    : "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
                }`}
              >
                {status === "verifying" ? "מאמת..." : "אמת קוד"}
              </button>
            </form>

            <button
              onClick={() => setStep(1)}
              className="mt-6 text-indigo-600 hover:underline block text-center font-medium"
            >
              ← חזרה להזנת מייל
            </button>
          </>
        )}
      </div>
    </div>
  );
}
