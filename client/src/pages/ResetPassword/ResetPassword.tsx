import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import {
  validatePasswordComplexity,
  validatePasswordConfirmation,
  validateRequired,
} from "../../utils/validation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

function useQueryParams() {
  const { search } = useLocation();
  return useMemo(() => new URLSearchParams(search), [search]);
}

const phoneDigitsPattern = /^[0-9]{4,15}$/;

export default function ResetPassword() {
  const query = useQueryParams();
  const navigate = useNavigate();
  const { completePasswordReset } = useAuth() as any;

  const initialToken = query.get("token") ? query.get("token")!.trim() : "";

  const [token, setToken] = useState(initialToken);
  const [phoneAnswer, setPhoneAnswer] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState({
    phoneAnswer: "",
    password: "",
    confirmPassword: "",
  });
  const [touched, setTouched] = useState({
    phoneAnswer: false,
    password: false,
    confirmPassword: false,
  });

  useEffect(() => {
    setToken(initialToken);
  }, [initialToken]);

  const hasToken = Boolean(token.trim());

  const canSubmit = useMemo(() => {
    const phoneOk = phoneAnswer && !fieldErrors.phoneAnswer;
    const passwordOk = password && !fieldErrors.password;
    const confirmOk = confirmPassword && !fieldErrors.confirmPassword;

    return (
      phoneOk &&
      passwordOk &&
      confirmOk &&
      hasToken &&
      status !== "submitting"
    );
  }, [phoneAnswer, password, confirmPassword, fieldErrors, hasToken, status]);

  const validateField = (field: string, value: string) => {
    let message = "";
    switch (field) {
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
      case "phoneAnswer": {
        if (!value) {
          message = validateRequired(value, "מספר טלפון לאימות").message;
          break;
        }
        message = phoneDigitsPattern.test(value)
          ? ""
          : "יש להקליד את הספרות האחרונות של מספר הטלפון (לפחות 4 ספרות).";
        break;
      }
      default:
        break;
    }
    setFieldErrors((prev) => ({ ...prev, [field]: message }));
    return !message;
  };

  const markTouched = (field: string) =>
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));

  const handleSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();

    const passwordValid = validateField("password", password);
    const confirmValid = validateField("confirmPassword", confirmPassword);
    const phoneValid = validateField("phoneAnswer", phoneAnswer.trim());

    setTouched((prev) => ({
      ...prev,
      password: true,
      confirmPassword: true,
      phoneAnswer: true,
    }));

    if (!passwordValid || !confirmValid || !phoneValid) {
      return;
    }

    if (!hasToken) {
      setErrorMsg("הקישור מתוך המייל נדרש כדי לאפס את הסיסמה. ודאו שנכנסתם דרך המייל.");
      return;
    }

    setStatus("submitting");
    setErrorMsg("");
    setSuccessMsg("");

    const payload = {
      newPassword: password,
      token: token.trim(),
      phoneAnswer: phoneAnswer.trim(),
    };

    const result = await completePasswordReset(payload);

    if (result?.success) {
      setSuccessMsg("הסיסמה עודכנה בהצלחה! ניתן להתחבר עם הסיסמה החדשה.");
      setToken("");
      setPhoneAnswer("");
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
            הזינו סיסמה חדשה. האיפוס יתבצע דרך הקישור שנשלח למייל ויאומת באמצעות מספר הטלפון ששמרתם במערכת.
          </p>
        </header>

        <div className="rounded-xl bg-indigo-50 border border-indigo-100 p-4 text-sm text-indigo-800">
          <p>
            הקישור נועד לפתיחה מאובטחת גם ב-Gmail. לא נבקש קוד OTP או אסימון גלוי, רק אימות של ספרות מהטלפון ששמור אצלנו.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="grid gap-6">
          <div>
            <Label className="block text-sm font-semibold text-indigo-700 mb-2">
              ספרות אחרונות של מספר הטלפון
            </Label>
            <Input
              type="text"
              value={phoneAnswer}
              onChange={(e) => {
                const digitsOnly = e.target.value.replace(/[^0-9]/g, "");
                setPhoneAnswer(digitsOnly);
                validateField("phoneAnswer", digitsOnly);
              }}
              onBlur={() => {
                markTouched("phoneAnswer");
                validateField("phoneAnswer", phoneAnswer.trim());
              }}
              inputMode="numeric"
              maxLength={15}
              className={`rounded-xl bg-gray-50 focus-visible:ring-indigo-400 ${
                fieldErrors.phoneAnswer && touched.phoneAnswer
                  ? "border-rose-400"
                  : "border-indigo-100"
              }`}
              placeholder="הקלידו את הספרות האחרונות לשם אימות"
            />
            {fieldErrors.phoneAnswer && touched.phoneAnswer && (
              <p className="mt-2 text-xs text-rose-600">{fieldErrors.phoneAnswer}</p>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label className="block text-sm font-semibold text-indigo-700 mb-2">
                סיסמה חדשה
              </Label>
              <div className="relative">
                <Input
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
                  className={`rounded-xl bg-gray-50 focus-visible:ring-indigo-400 ${
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
              <Label className="block text-sm font-semibold text-indigo-700 mb-2">
                אימות סיסמה
              </Label>
              <Input
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
                className={`rounded-xl bg-gray-50 focus-visible:ring-indigo-400 ${
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

          <Button
            type="submit"
            disabled={!canSubmit}
            className={`w-full py-3 h-auto rounded-xl font-semibold text-white shadow-lg transition-all ${
              canSubmit
                ? "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
                : "bg-gray-400 cursor-not-allowed hover:bg-gray-400"
            }`}
          >
            {status === "submitting" ? "מעדכן..." : "שמור סיסמה חדשה"}
          </Button>
        </form>

        <div className="text-center text-sm text-gray-600 space-y-2">
          <p>חוזרים להתחברות?</p>
          <Button
            variant="link"
            onClick={() => navigate("/login")}
            className="text-indigo-600 font-semibold"
          >
            אל מסך ההתחברות
          </Button>
        </div>
      </div>
    </div>
  );
}
