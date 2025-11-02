import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import {
  validateEmail,
  validatePasswordComplexity,
  validatePasswordConfirmation,
  validateRequired,
} from "../../utils/validation";

function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

const tokenPattern = /^[a-f0-9]{64}$/i;
const otpPattern = /^\d{6}$/;

export default function ResetPassword() {
  const query = useQueryParams();
  const navigate = useNavigate();
  const { completePasswordReset } = useAuth();

  const initialEmail = query.get("email") ? query.get("email").trim() : "";
  const initialToken = query.get("token") ? query.get("token").trim() : "";

  const [email, setEmail] = useState(initialEmail);
  const [token, setToken] = useState(initialToken);
  const [otp, setOtp] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    email: "",
    token: "",
    otp: "",
    password: "",
    confirmPassword: "",
  });
  const [touched, setTouched] = useState({
    email: Boolean(initialEmail),
    token: Boolean(initialToken),
    otp: false,
    password: false,
    confirmPassword: false,
  });

  useEffect(() => {
    if (initialEmail) {
      setFieldErrors((prev) => ({
        ...prev,
        email: validateEmail(initialEmail).message,
      }));
    }
    if (initialToken) {
      setFieldErrors((prev) => ({
        ...prev,
        token: tokenPattern.test(initialToken)
          ? ""
          : "אסימון האיפוס אינו תקין.",
      }));
    }
  }, [initialEmail, initialToken]);

  const hasToken = Boolean(token.trim());
  const hasOtp = Boolean(otp.trim());

  const canSubmit = useMemo(() => {
    const emailOk = email && !fieldErrors.email;
    const passwordOk = password && !fieldErrors.password;
    const confirmOk = confirmPassword && !fieldErrors.confirmPassword;
    const tokenOk = hasToken ? !fieldErrors.token : true;
    const otpOk = hasOtp ? !fieldErrors.otp : true;
    const challengeProvided = hasToken || hasOtp;

    return (
      emailOk &&
      passwordOk &&
      confirmOk &&
      tokenOk &&
      otpOk &&
      challengeProvided &&
      status !== "submitting"
    );
  }, [
    email,
    password,
    confirmPassword,
    fieldErrors,
    hasToken,
    hasOtp,
    status,
  ]);

  const validateField = (field, value) => {
    let message = "";
    switch (field) {
      case "email": {
        const required = validateRequired(value, "כתובת אימייל");
        if (!required.valid) {
          message = required.message;
          break;
        }
        const emailCheck = validateEmail(value);
        message = emailCheck.valid ? "" : emailCheck.message;
        break;
      }
      case "password": {
        const result = validatePasswordComplexity(value);
        message = result.valid ? "" : result.message;
        break;
      }
      case "confirmPassword": {
        const result = validatePasswordConfirmation(password, value);
        message = result.valid ? "" : result.message;
        break;
      }
      case "token": {
        if (!value) {
          message = "";
          break;
        }
        message = tokenPattern.test(value)
          ? ""
          : "אסימון האיפוס צריך להיות באורך 64 תווים הקסדצימליים.";
        break;
      }
      case "otp": {
        if (!value) {
          message = "";
          break;
        }
        message = otpPattern.test(value)
          ? ""
          : "קוד ה-OTP חייב לכלול 6 ספרות.";
        break;
      }
      default:
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    return !message;
  };

  const markTouched = (field) =>
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));

  const handleSubmit = async (evt) => {
    evt.preventDefault();

    const emailValid = validateField("email", email);
    const passwordValid = validateField("password", password);
    const confirmValid = validateField("confirmPassword", confirmPassword);
    const tokenValid = validateField("token", token.trim());
    const otpValid = validateField("otp", otp.trim());

    setTouched({
      email: true,
      password: true,
      confirmPassword: true,
      token: hasToken,
      otp: hasOtp,
    });

    const challengeProvided = token.trim() || otp.trim();

    if (!emailValid || !passwordValid || !confirmValid || !tokenValid || !otpValid) {
      return;
    }

    if (!challengeProvided) {
      setFieldErrors((prev) => ({
        ...prev,
        token: "נדרש אסימון מהקישור או קוד OTP שהתקבל במייל.",
      }));
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      email: email.trim(),
      newPassword: password,
      token: token.trim() || undefined,
      otp: otp.trim() || undefined,
    };

    const result = await completePasswordReset(payload);

    if (result?.success) {
      setSuccessMsg("הסיסמה עודכנה בהצלחה! ניתן להתחבר עם הסיסמה החדשה.");
      setToken("");
      setOtp("");
      setPassword("");
      setConfirmPassword("");
    } else {
      setErrorMsg(result?.message || "איפוס הסיסמה נכשל. בדקו את הפרטים ונסו שוב.");
    }

    setStatus("idle");
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-50 via-white to-blue-50 p-6"
    >
      <div className="w-full max-w-2xl bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-indigo-100 p-10 space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-indigo-700">איפוס סיסמה</h1>
          <p className="text-gray-600 text-sm">
            הזינו סיסמה חדשה. ניתן להשתמש או בקישור שנשלח במייל או בקוד ה-OTP החד־פעמי.
          </p>
        </header>

        <form onSubmit={handleSubmit} className="grid gap-6">
          <div>
            <label className="block text-sm font-semibold text-indigo-700 mb-2">
              כתובת אימייל
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (touched.email) validateField("email", e.target.value);
              }}
              onBlur={() => {
                markTouched("email");
                validateField("email", email);
              }}
              className={`w-full px-4 py-2 rounded-xl border bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                fieldErrors.email && touched.email
                  ? "border-rose-400"
                  : "border-indigo-100"
              }`}
              placeholder="example@gmail.com"
            />
            {fieldErrors.email && touched.email && (
              <p className="mt-2 text-xs text-rose-600">{fieldErrors.email}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-indigo-700 mb-2">
                אסימון מהקישור (Token)
              </label>
              <input
                type="text"
                value={token}
                onChange={(e) => {
                  setToken(e.target.value.trim());
                  validateField("token", e.target.value.trim());
                }}
                onBlur={() => {
                  markTouched("token");
                  validateField("token", token.trim());
                }}
                className={`w-full px-4 py-2 rounded-xl border bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  fieldErrors.token && touched.token
                    ? "border-rose-400"
                    : "border-indigo-100"
                }`}
                placeholder="הדביקו כאן את האסימון מהקישור"
              />
              {fieldErrors.token && touched.token && (
                <p className="mt-2 text-xs text-rose-600">{fieldErrors.token}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-indigo-700 mb-2">
                או הזינו קוד OTP
              </label>
              <input
                type="text"
                value={otp}
                onChange={(e) => {
                  setOtp(e.target.value.replace(/[^0-9]/g, ""));
                  validateField("otp", e.target.value.replace(/[^0-9]/g, ""));
                }}
                onBlur={() => {
                  markTouched("otp");
                  validateField("otp", otp.trim());
                }}
                inputMode="numeric"
                maxLength={6}
                className={`w-full px-4 py-2 rounded-xl border bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  fieldErrors.otp && touched.otp
                    ? "border-rose-400"
                    : "border-indigo-100"
                }`}
                placeholder="123456"
              />
              {fieldErrors.otp && touched.otp && (
                <p className="mt-2 text-xs text-rose-600">{fieldErrors.otp}</p>
              )}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-semibold text-indigo-700 mb-2">
                סיסמה חדשה
              </label>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    validateField("password", e.target.value);
                    if (touched.confirmPassword) {
                      validateField("confirmPassword", confirmPassword);
                    }
                  }}
                  onBlur={() => {
                    markTouched("password");
                    validateField("password", password);
                  }}
                  className={`w-full px-4 py-2 rounded-xl border bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                    fieldErrors.password && touched.password
                      ? "border-rose-400"
                      : "border-indigo-100"
                  }`}
                  placeholder="••••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600"
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
              {fieldErrors.password && touched.password && (
                <p className="mt-2 text-xs text-rose-600">{fieldErrors.password}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-indigo-700 mb-2">
                אימות סיסמה
              </label>
              <input
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  validateField("confirmPassword", e.target.value);
                }}
                onBlur={() => {
                  markTouched("confirmPassword");
                  validateField("confirmPassword", confirmPassword);
                }}
                className={`w-full px-4 py-2 rounded-xl border bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 ${
                  fieldErrors.confirmPassword && touched.confirmPassword
                    ? "border-rose-400"
                    : "border-indigo-100"
                }`}
                placeholder="הקלידו שוב את הסיסמה"
              />
              {fieldErrors.confirmPassword && touched.confirmPassword && (
                <p className="mt-2 text-xs text-rose-600">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>
          </div>

          {errorMsg && (
            <p className="text-sm text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-3">
              ❌ {errorMsg}
            </p>
          )}

          {successMsg && (
            <p className="text-sm text-emerald-700 bg-emerald-50 border border-emerald-100 rounded-lg p-3">
              ✅ {successMsg}
            </p>
          )}

          <button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg transition-all ${
              canSubmit
                ? "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
                : "bg-gray-400 cursor-not-allowed"
            }`}
          >
            {status === "submitting" ? "מעדכן..." : "שמור סיסמה חדשה"}
          </button>
        </form>

        <div className="text-center text-sm text-gray-600 space-y-2">
          <p>חוזרים להתחברות?</p>
          <button
            onClick={() => navigate("/login")}
            className="text-indigo-600 font-semibold hover:underline"
          >
            אל מסך ההתחברות
          </button>
        </div>
      </div>
    </div>
  );
}
