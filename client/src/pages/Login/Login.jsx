import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function Login() {
  const navigate = useNavigate();
  const { isLoggedIn, loginWithPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [inlineDetails, setInlineDetails] = useState([]);

  useEffect(() => {
    if (isLoggedIn) navigate("/workshops", { replace: true });
  }, [isLoggedIn, navigate]);

  const onSubmit = async (e) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setErrorMsg("נא להזין כתובת אימייל וסיסמה.");
      setInlineDetails([]);
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    setInlineDetails([]);

    try {
      const result = await loginWithPassword({
        email: trimmedEmail,
        password,
      });

      if (!result.success) {
        setErrorMsg(result.message || "ההתחברות נכשלה.");
        if (Array.isArray(result.details) && result.details.length) {
          setInlineDetails(result.details);
        }
      }
    } finally {
      setStatus("idle");
    }
  };

  const gotoOtp = () => navigate("/verify", { state: { email } });

  const disableSubmit =
    status === "submitting" || !email.trim() || !password.trim();

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-white p-6"
    >
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl border border-indigo-100 shadow-2xl p-10 animate-fade-in transition hover:shadow-indigo-200">
        {/* 🧭 Header */}
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-4xl font-extrabold tracking-tight text-indigo-700">
            התחברות לחשבון
          </h2>
          <p className="text-gray-600 text-sm">
            הזן את פרטיך כדי להיכנס למערכת
          </p>
        </div>

        {/* 🔐 Form */}
        <form onSubmit={onSubmit} className="space-y-6">
          <div className="pb-4 border-b border-indigo-50">
            <label className="block mb-2 text-sm font-semibold text-indigo-700 tracking-wide">
              כתובת אימייל
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
              }}
              className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              placeholder="example@gmail.com"
            />
          </div>

          <div className="pb-4 border-b border-indigo-50">
            <label className="block mb-2 text-sm font-semibold text-indigo-700 tracking-wide">
              סיסמה
            </label>
            <div className="relative">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                }}
                className="w-full px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none pr-10"
                placeholder="••••••••"
              />
              <button
                type="button"
                onClick={() => setShowPw((s) => !s)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 text-lg"
              >
                {showPw ? "🙈" : "👁️"}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="bg-rose-50 text-rose-600 text-sm rounded-lg p-2 px-3 border border-rose-100 animate-fade-in">
              ❌ {errorMsg}
              {inlineDetails.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs list-disc pr-4">
                  {inlineDetails.map((detail, idx) => (
                    <li key={`login-detail-${idx}`}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            type="submit"
            disabled={disableSubmit}
            className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
              disableSubmit
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
            }`}
          >
            {status === "submitting" ? "מתחבר..." : "התחבר"}
          </button>
        </form>

        {/* 🧾 OTP Section */}
        <div className="text-center mt-6 space-y-3">
          <p className="text-gray-500 text-sm font-medium">
            או התחבר עם קוד חד־פעמי (OTP)
          </p>
          <button
            onClick={gotoOtp}
            className="text-indigo-600 hover:text-indigo-800 hover:underline font-semibold transition"
          >
            שלח קוד למייל →
          </button>
        </div>

        {/* Divider */}
        <div className="my-6 border-t border-gray-200"></div>

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
