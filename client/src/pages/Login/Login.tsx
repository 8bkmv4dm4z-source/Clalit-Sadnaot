import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import {
  validateEmail,
  validatePasswordComplexity,
  validateRequired,
} from "../../utils/validation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function Login() {
  const navigate = useNavigate();
  const { isLoggedIn, loginWithPassword } = useAuth() as any;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [inlineDetails, setInlineDetails] = useState<string[]>([]);
  const [fieldErrors, setFieldErrors] = useState({ email: "", password: "" });
  const [touched, setTouched] = useState({ email: false, password: false });
  const GENERIC_LOGIN_ERROR = "לא ניתן להתחבר כרגע. בדקו את הפרטים ונסו שוב.";

  const runValidation = (field: string, value: string) => {
    switch (field) {
      case "email": {
        const required = validateRequired(value, "כתובת אימייל");
        if (!required.valid) return required;
        return validateEmail(value);
      }
      case "password": {
        const required = validateRequired(value, "סיסמה");
        if (!required.valid) return required;
        return validatePasswordComplexity(value);
      }
      default:
        return { valid: true, message: "" };
    }
  };

  const canSubmit = useMemo(() => {
    const trimmedEmail = email.trim();
    if (!trimmedEmail || password.length === 0) return false;
    return Object.values(fieldErrors).every((msg) => !msg) && status !== "submitting";
  }, [email, password, fieldErrors, status]);

  const handleValidation = (field: string, value: string) => {
    const result = runValidation(field, value);
    setFieldErrors((prev) => ({ ...prev, [field]: result.message }));
    if (errorMsg) setErrorMsg("");
    return result.valid;
  };

  const markTouched = (field: string) =>
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));

  useEffect(() => {
    if (isLoggedIn) navigate("/workshops", { replace: true });
  }, [isLoggedIn, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emailValid = handleValidation("email", email);
    const passwordValid = handleValidation("password", password);
    setTouched({ email: true, password: true });
    if (!emailValid || !passwordValid) return;

    setStatus("submitting");
    setErrorMsg("");
    setInlineDetails([]);

    try {
      const result = await loginWithPassword({
        email: email.trim(),
        password,
      });

      if (!result?.success) {
        setErrorMsg(result?.message || GENERIC_LOGIN_ERROR);
        if (Array.isArray(result?.details) && result.details.length) {
          setInlineDetails(result.details);
        }
      }
    } catch (err: any) {
      setErrorMsg(err.message || GENERIC_LOGIN_ERROR);
    } finally {
      setStatus("idle");
    }
  };

  const gotoOtp = () => {
    const trimmedEmail = email.trim();
    if (trimmedEmail) {
      navigate("/verify", { state: { prefillEmail: trimmedEmail } });
      return;
    }
    navigate("/verify");
  };
  const gotoForgotPassword = () => navigate("/forgot-password", { state: { email } });

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-white p-6"
    >
      <div className="w-full max-w-md bg-white/90 backdrop-blur-lg rounded-3xl border border-indigo-100 shadow-2xl p-10 animate-fade-in transition hover:shadow-indigo-200">
        <div className="text-center space-y-2 mb-6">
          <h2 className="text-4xl font-extrabold tracking-tight text-indigo-700">
            התחברות לחשבון
          </h2>
          <p className="text-gray-600 text-sm">
            הזן את פרטיך כדי להיכנס למערכת
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-6">
          <div className="pb-4 border-b border-indigo-50">
            <Label className="block mb-2 text-sm font-semibold text-indigo-700 tracking-wide">
              כתובת אימייל
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                handleValidation("email", e.target.value);
              }}
              onBlur={() => markTouched("email")}
              required
              className={`rounded-xl bg-gray-50 focus-visible:ring-indigo-400 ${
                fieldErrors.email && touched.email ? "border-rose-400" : ""
              }`}
              placeholder="example@gmail.com"
            />
            {fieldErrors.email && touched.email && (
              <p className="mt-2 text-xs text-rose-600">{fieldErrors.email}</p>
            )}
          </div>

          <div className="pb-4 border-b border-indigo-50">
            <Label className="block mb-2 text-sm font-semibold text-indigo-700 tracking-wide">
              סיסמה
            </Label>
            <div className="relative">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  handleValidation("password", e.target.value);
                }}
                onBlur={() => markTouched("password")}
                required
                className={`rounded-xl bg-gray-50 focus-visible:ring-indigo-400 pr-10 ${
                  fieldErrors.password && touched.password ? "border-rose-400" : ""
                }`}
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
            {fieldErrors.password && touched.password && (
              <p className="mt-2 text-xs text-rose-600">{fieldErrors.password}</p>
            )}
            <div className="mt-2 text-left">
              <Button
                type="button"
                variant="link"
                onClick={gotoForgotPassword}
                className="text-sm text-indigo-600 hover:text-indigo-800 font-semibold p-0 h-auto"
              >
                שכחת סיסמה?
              </Button>
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

          <Button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3 h-auto rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
              !canSubmit
                ? "bg-gray-400 cursor-not-allowed hover:bg-gray-400"
                : "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
            }`}
          >
            {status === "submitting" ? "מתחבר..." : "התחבר"}
          </Button>
        </form>

        <div className="text-center mt-6 space-y-3">
          <p className="text-gray-500 text-sm font-medium">
            או התחבר עם קוד חד־פעמי (OTP)
          </p>
          <Button
            variant="link"
            onClick={gotoOtp}
            className="text-indigo-600 hover:text-indigo-800 font-semibold"
          >
            שלח קוד למייל →
          </Button>
        </div>

        <div className="my-6 border-t border-gray-200"></div>

        <p className="text-center text-sm text-gray-600">
          אין לך חשבון עדיין?{" "}
          <Button
            variant="link"
            onClick={() => navigate("/register")}
            className="text-indigo-600 hover:text-indigo-800 font-medium underline p-0 h-auto"
          >
            הירשם עכשיו
          </Button>
        </p>
      </div>
    </div>
  );
}
