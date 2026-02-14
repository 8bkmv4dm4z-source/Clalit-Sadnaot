import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { validateEmail, validateRequired } from "../../utils/validation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

export default function ForgotPassword() {
  const navigate = useNavigate();
  const { requestPasswordReset } = useAuth() as any;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [fieldError, setFieldError] = useState("");
  const [touched, setTouched] = useState(false);

  const canSubmit = useMemo(() => {
    if (!email.trim()) return false;
    return !fieldError && status !== "submitting";
  }, [email, fieldError, status]);

  const runValidation = (value: string) => {
    const required = validateRequired(value, "כתובת אימייל");
    if (!required.valid) return required.message;
    const emailCheck = validateEmail(value);
    return emailCheck.valid ? "" : emailCheck.message;
  };

  const handleBlur = () => {
    setTouched(true);
    setFieldError(runValidation(email));
  };

  const onSubmit = async (evt: React.FormEvent) => {
    evt.preventDefault();
    const validationMessage = runValidation(email);
    setFieldError(validationMessage);
    setTouched(true);
    if (validationMessage) return;

    setStatus("submitting");
    setErrorMsg("");
    setSuccessMsg("");

    const result = await requestPasswordReset(email.trim());
    if (result?.success) {
      setSuccessMsg(
        "אם החשבון קיים, נשלח קישור מאובטח לאיפוס הסיסמה. בתהליך תתבקשו לאשר את מספר הטלפון ששמור במערכת."
      );
    } else {
      setErrorMsg(result?.message || "שליחת הבקשה נכשלה. אנא נסו שוב.");
    }

    setStatus("idle");
  };

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-white to-indigo-100 p-6"
    >
      <div className="w-full max-w-lg bg-white/95 backdrop-blur rounded-3xl shadow-2xl border border-indigo-100 p-10 space-y-6">
        <header className="text-center space-y-2">
          <h1 className="text-3xl font-extrabold text-indigo-700">
            שכחת סיסמה?
          </h1>
          <p className="text-gray-600 text-sm">
            הזינו את כתובת האימייל ונשלח קישור לאיפוס הסיסמה.
          </p>
        </header>

        <form onSubmit={onSubmit} className="space-y-5">
          <div>
            <Label className="block text-sm font-semibold text-indigo-700 mb-2">
              כתובת אימייל
            </Label>
            <Input
              type="email"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (touched) {
                  setFieldError(runValidation(e.target.value));
                }
              }}
              onBlur={handleBlur}
              className={`rounded-xl bg-gray-50 focus-visible:ring-indigo-400 ${
                fieldError && touched ? "border-rose-400" : "border-indigo-100"
              }`}
              placeholder="example@gmail.com"
            />
            {fieldError && touched && (
              <p className="mt-2 text-xs text-rose-600">{fieldError}</p>
            )}
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
            {status === "submitting" ? "שולח בקשה..." : "שלחו לי קישור"}
          </Button>
        </form>

        <div className="text-center text-sm text-gray-600 space-y-2">
          <p>נזכרתם בסיסמה?</p>
          <Button
            variant="link"
            onClick={() => navigate("/login")}
            className="text-indigo-600 font-semibold"
          >
            חזרה למסך התחברות
          </Button>
        </div>
      </div>
    </div>
  );
}
