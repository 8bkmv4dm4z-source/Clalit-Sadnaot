// src/pages/Register/Register.tsx
import React, { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import {
  validateEmail,
  validateIsraeliId,
  validatePasswordComplexity,
  validatePasswordConfirmation,
  validatePhone,
  validateRequired,
  validateSafeText,
} from "../../utils/validation";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

const initialAccount = {
  name: "",
  email: "",
  phone: "",
  password: "",
  confirm: "",
  idNumber: "",
  birthDate: "",
  city: "",
  canCharge: false,
};

export default function Register() {
  const [account, setAccount] = useState({ ...initialAccount });
  const [familyMembers, setFamilyMembers] = useState<any[]>([]);
  const [showFamily, setShowFamily] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
    confirm: "",
    idNumber: "",
  });
  const [touched, setTouched] = useState({
    name: false,
    email: false,
    phone: false,
    password: false,
    confirm: false,
    idNumber: false,
  });
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [serverDetails, setServerDetails] = useState<string[]>([]);
  const [lastPayload, setLastPayload] = useState<any>(null);

  const [phase, setPhase] = useState("form");
  const [pendingEmail, setPendingEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState("");
  const [otpSuccess, setOtpSuccess] = useState("");
  const [otpDetails, setOtpDetails] = useState<string[]>([]);
  const [otpLoading, setOtpLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const navigate = useNavigate();
  const { startRegistration, confirmRegistration } = useAuth() as any;
  const conflictMessage =
    'הערך שסופק כבר קיים במערכת. נסה/י דוא"ל או ת"ז אחרת.';

  const applyConflictHint = (status: number) => {
    if (status !== 409) return;
    setTouched((prev) => ({
      ...prev,
      email: true,
      idNumber: true,
    }));
    setErrors((prev) => ({
      ...prev,
      email: prev.email || conflictMessage,
      idNumber: prev.idNumber || conflictMessage,
    }));
  };

  const runValidation = (field: string, value: any, nextAccount = account) => {
    switch (field) {
      case "name":
        {
          const required = validateRequired(value, "שם מלא");
          if (!required.valid) return required;
          return validateSafeText(value, "שם מלא");
        }
      case "email": {
        const required = validateRequired(value, "כתובת אימייל");
        if (!required.valid) return required;
        return validateEmail(value);
      }
      case "phone": {
        const required = validateRequired(value, "מספר טלפון");
        if (!required.valid) return required;
        return validatePhone(value);
      }
      case "password": {
        const required = validateRequired(value, "סיסמה");
        if (!required.valid) return required;
        return validatePasswordComplexity(value);
      }
      case "confirm":
        return validatePasswordConfirmation(nextAccount.password, value);
      case "idNumber": {
        const required = validateRequired(value, "תעודת זהות");
        if (!required.valid) return required;
        return validateIsraeliId(value);
      }
      case "city":
        return validateSafeText(value, "שם העיר");
      default:
        return { valid: true, message: "" };
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;
    const nextAccount = { ...account, [name]: nextValue };
    setAccount(nextAccount);
    setSubmitError("");
    setSubmitSuccess("");
    setServerDetails([]);
    setOtpError("");
    setOtpDetails([]);
    setLastPayload(null);
    if (name === "email" && phase === "otp") {
      setPhase("form");
      setPendingEmail("");
      setOtpCode("");
    }

    const result = runValidation(name, nextValue, nextAccount);
    setErrors((prev) => {
      const updated = { ...prev, [name]: result.message };
      if (name === "password" || name === "confirm") {
        const confirmResult = runValidation("confirm", nextAccount.confirm, nextAccount);
        updated.confirm = confirmResult.message;
      }
      return updated;
    });
  };

  const markTouched = (field: string) => {
    if (field === "email" || field === "idNumber") return;
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));
  };

  const handleFamilyChange = (index: number, field: string, value: string) => {
    setFamilyMembers((prev) =>
      prev.map((m, i) => (i === index ? { ...m, [field]: value } : m))
    );
  };

  const addFamilyMember = () => {
    setFamilyMembers((prev) => [
      ...prev,
      {
        name: "",
        relation: "",
        idNumber: "",
        birthDate: "",
        email: "",
        phone: "",
        city: "",
      },
    ]);
  };

  const removeFamilyMember = (index: number) => {
    setFamilyMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const validationResults: Record<string, any> = {
      name: runValidation("name", account.name),
      email: runValidation("email", account.email),
      phone: runValidation("phone", account.phone),
      password: runValidation("password", account.password),
      confirm: runValidation("confirm", account.confirm),
      idNumber: runValidation("idNumber", account.idNumber),
    };

    setErrors((prev) => ({
      ...prev,
      ...Object.fromEntries(
        Object.entries(validationResults).map(([field, result]) => [
          field,
          result.message,
        ])
      ),
    }));
    setTouched({
      name: true,
      email: true,
      phone: true,
      password: true,
      confirm: true,
      idNumber: true,
    });

    return Object.values(validationResults).every((res: any) => res.valid);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setSubmitError("");
    setSubmitSuccess("");
    setServerDetails([]);

    if (phase === "otp" && lastPayload) {
      setLoading(true);
      const resendResult = await startRegistration(lastPayload);
      setLoading(false);

      if (resendResult.success) {
        setSubmitSuccess("📨 שלחנו שוב את קוד האימות אליך.");
        setOtpError("");
        setServerDetails([]);
      } else {
        setSubmitError(`❌ ${resendResult.message || "שגיאה בשליחת קוד חדש"}`);
        setServerDetails(resendResult.details || []);
        applyConflictHint(resendResult.status);
      }
      return;
    }

    if (!validateForm()) return;

    const trimmedName = account.name.trim();
    const trimmedEmail = account.email.trim().toLowerCase();
    const trimmedPhone = account.phone.trim();
    const trimmedId = account.idNumber.trim();
    const trimmedCity = account.city.trim();

    const payload: any = {
      name: trimmedName,
      email: trimmedEmail,
      password: account.password,
      canCharge: account.canCharge,
      familyMembers: familyMembers
        .map((member) => ({
          name: String(member.name || "").trim(),
          relation: String(member.relation || "").trim(),
          idNumber: String(member.idNumber || "").trim(),
          phone: String(member.phone || "").trim() || trimmedPhone,
          email: String(member.email || "").trim() || trimmedEmail,
          city: String(member.city || "").trim() || trimmedCity,
          birthDate: member.birthDate || "",
        }))
        .filter((member) => member.name && member.idNumber),
    };

    if (trimmedPhone) payload.phone = trimmedPhone;
    if (trimmedId) payload.idNumber = trimmedId;
    if (account.birthDate) payload.birthDate = account.birthDate;
    if (trimmedCity) payload.city = trimmedCity;

    setLoading(true);
    const result = await startRegistration(payload);
    setLoading(false);

    if (result.success) {
      setSubmitSuccess("📨 ההרשמה התקבלה! שלחנו אליך קוד אימות להמשך.");
      setPhase("otp");
      setPendingEmail(trimmedEmail);
      setOtpCode("");
      setOtpError("");
      setOtpDetails([]);
      setLastPayload(payload);
    } else {
      setSubmitError(`❌ ${result.message || "שגיאה בהרשמה"}`);
      setServerDetails(result.details || []);
      applyConflictHint(result.status);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setOtpError("");
    setOtpSuccess("");
    setOtpDetails([]);

    const normalizedEmail =
      pendingEmail || account.email.trim().toLowerCase() || "";

    if (!normalizedEmail) {
      setOtpError("❌ יש למלא כתובת אימייל תקינה בשלב הראשון.");
      return;
    }

    if (!otpCode.trim()) {
      setOtpError("❌ יש להזין את קוד האימות שקיבלת.");
      return;
    }

    setOtpLoading(true);
    const result = await confirmRegistration({
      email: normalizedEmail,
      otp: otpCode.trim(),
    });
    setOtpLoading(false);

    if (result.success) {
      setOtpSuccess("✅ ההרשמה הושלמה! ניתן להתחבר כעת.");
      setSubmitSuccess("");
      setAccount({ ...initialAccount });
      setFamilyMembers([]);
      setPhase("form");
      setPendingEmail("");
      setOtpCode("");
      setTouched({
        name: false,
        email: false,
        phone: false,
        password: false,
        confirm: false,
        idNumber: false,
      });
      setErrors({
        name: "",
        email: "",
        phone: "",
        password: "",
        confirm: "",
        idNumber: "",
      });
      setLastPayload(null);
      setTimeout(() => navigate("/login"), 800);
    } else {
      setOtpError(`❌ ${result.message || "אימות הקוד נכשל"}`);
      setOtpDetails(result.details || []);
    }
  };

  const canSubmit = useMemo(() => {
    const requiredFields = ["name", "email", "phone", "password", "confirm", "idNumber"];
    const allFilled = requiredFields.every((field) => Boolean(String((account as any)[field] || "").trim()));
    const noErrors = Object.values(errors).every((msg) => !msg);
    return allFilled && noErrors && !loading;
  }, [account, errors, loading]);

  const inputClasses = "w-full rounded-lg bg-gray-50 shadow-inner text-sm focus-visible:ring-indigo-400";
  const familyInputClasses = "w-full rounded-lg text-sm focus-visible:ring-indigo-400";

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-white p-6"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md sm:max-w-lg backdrop-blur-xl bg-white/90 border border-indigo-100 shadow-2xl rounded-3xl p-10 space-y-8 transition-all hover:shadow-indigo-200"
      >
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-4xl font-extrabold tracking-tight text-indigo-700">
            הרשמה למערכת
          </h2>
          <p className="text-gray-600 text-sm font-medium">
            מלא את{" "}
            <span className="font-semibold text-indigo-600">
              פרטיך האישיים
            </span>{" "}
            כדי ליצור חשבון חדש
          </p>
          <div className="flex items-center justify-center gap-2 text-xs font-semibold">
            <span
              className={`px-3 py-1 rounded-full border ${
                phase === "form"
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-indigo-50 text-indigo-700 border-indigo-200"
              }`}
            >
              שלב 1: פרטי הרשמה
            </span>
            <span
              className={`px-3 py-1 rounded-full border ${
                phase === "otp"
                  ? "bg-emerald-600 text-white border-emerald-600"
                  : "bg-emerald-50 text-emerald-700 border-emerald-200"
              }`}
            >
              שלב 2: אימות קוד
            </span>
          </div>
        </div>

        {/* Main User Info */}
        <div className="p-6 border border-indigo-200 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-white shadow-md space-y-3 hover:shadow-lg hover:border-indigo-300 transition-all">
          <h3 className="text-lg font-bold text-indigo-700 border-b border-indigo-100 pb-1">
            פרטי משתמש ראשי
          </h3>

          <Input
            name="name"
            value={account.name}
            onChange={handleChange}
            onBlur={() => markTouched("name")}
            required
            placeholder="שם מלא"
            className={`${inputClasses} ${
              errors.name && touched.name ? "border-rose-400" : ""
            }`}
          />
          {errors.name && touched.name && (
            <p className="text-xs text-rose-600">{errors.name}</p>
          )}

          <Input
            name="email"
            type="email"
            value={account.email}
            onChange={handleChange}
            onBlur={() => markTouched("email")}
            required
            placeholder="אימייל"
            className={`${inputClasses} ${
              errors.email && touched.email ? "border-rose-400" : ""
            }`}
          />
          {errors.email && touched.email && (
            <p className="text-xs text-rose-600">{errors.email}</p>
          )}

          <Input
            name="phone"
            type="tel"
            value={account.phone}
            onChange={handleChange}
            onBlur={() => markTouched("phone")}
            required
            placeholder="טלפון"
            className={`${inputClasses} ${
              errors.phone && touched.phone ? "border-rose-400" : ""
            }`}
          />
          {errors.phone && touched.phone && (
            <p className="text-xs text-rose-600">{errors.phone}</p>
          )}

          <div className="relative">
            <Input
              type={showPassword ? "text" : "password"}
              name="password"
              value={account.password}
              onChange={handleChange}
              onBlur={() => markTouched("password")}
              required
              placeholder="סיסמה (לפחות 8 תווים, אות גדולה, ספרה ותו)"
              className={`${inputClasses} pr-10 ${
                errors.password && touched.password ? "border-rose-400" : ""
              }`}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 text-lg"
              aria-label={showPassword ? "הסתר סיסמה" : "הצג סיסמה"}
            >
              {showPassword ? "🙈" : "👁️"}
            </button>
          </div>
          {errors.password && touched.password && (
            <p className="text-xs text-rose-600">{errors.password}</p>
          )}

          <div className="relative">
            <Input
              type={showConfirmPassword ? "text" : "password"}
              name="confirm"
              value={account.confirm}
              onChange={handleChange}
              onBlur={() => markTouched("confirm")}
              required
              placeholder="אימות סיסמה"
              className={`${inputClasses} pr-10 ${
                errors.confirm && touched.confirm ? "border-rose-400" : ""
              }`}
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((prev) => !prev)}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-indigo-600 text-lg"
              aria-label={showConfirmPassword ? "הסתר אימות סיסמה" : "הצג אימות סיסמה"}
            >
              {showConfirmPassword ? "🙈" : "👁️"}
            </button>
          </div>
          {errors.confirm && touched.confirm && (
            <p className="text-xs text-rose-600">{errors.confirm}</p>
          )}

          <Input
            name="idNumber"
            value={account.idNumber}
            onChange={handleChange}
            onBlur={() => markTouched("idNumber")}
            required
            placeholder="תעודת זהות"
            className={`${inputClasses} ${
              errors.idNumber && touched.idNumber ? "border-rose-400" : ""
            }`}
          />
          {errors.idNumber && touched.idNumber && (
            <p className="text-xs text-rose-600">{errors.idNumber}</p>
          )}

          <Input
            type="date"
            name="birthDate"
            value={account.birthDate}
            onChange={handleChange}
            className={inputClasses}
          />

          <Input
            name="city"
            value={account.city}
            onChange={handleChange}
            placeholder="עיר מגורים"
            className={inputClasses}
          />

          <Label className="flex items-center gap-2 text-gray-700 mt-1">
            <input
              type="checkbox"
              name="canCharge"
              checked={account.canCharge}
              onChange={handleChange as any}
              className="w-5 h-5 accent-indigo-600"
            />
            הרשאה לגבייה
          </Label>
        </div>

        {/* Family Members */}
        <div className="pt-5 border-t border-indigo-100">
          <Button
            type="button"
            variant="link"
            onClick={() => setShowFamily(!showFamily)}
            className="w-full text-indigo-600 font-semibold text-sm"
          >
            {showFamily ? "➖ הסתר בני משפחה" : "➕ הוסף בני משפחה"}
          </Button>

          {showFamily && (
            <div className="mt-4 space-y-4">
              {familyMembers.map((member, index) => (
                <div
                  key={index}
                  className="p-4 border border-indigo-100 rounded-xl bg-gradient-to-br from-blue-50 to-white shadow-sm space-y-2 hover:shadow-md hover:border-indigo-300 transition-all"
                >
                  <div className="flex justify-between items-center">
                    <h4 className="font-semibold text-gray-700">
                      בן משפחה {index + 1}
                    </h4>
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => removeFamilyMember(index)}
                      className="text-red-500 text-sm p-0 h-auto"
                    >
                      הסר
                    </Button>
                  </div>

                  <Input
                    type="text"
                    placeholder="שם מלא"
                    value={member.name}
                    onChange={(e) =>
                      handleFamilyChange(index, "name", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                  <Input
                    type="text"
                    placeholder="קרבה (אח, בת, אב...)"
                    value={member.relation}
                    onChange={(e) =>
                      handleFamilyChange(index, "relation", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                  <Input
                    type="text"
                    placeholder="תעודת זהות"
                    value={member.idNumber}
                    onChange={(e) =>
                      handleFamilyChange(index, "idNumber", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                  <Input
                    type="date"
                    value={member.birthDate}
                    onChange={(e) =>
                      handleFamilyChange(index, "birthDate", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                  <Input
                    type="email"
                    placeholder="אימייל (אופציונלי)"
                    value={member.email}
                    onChange={(e) =>
                      handleFamilyChange(index, "email", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                  <Input
                    type="tel"
                    placeholder="טלפון (אופציונלי)"
                    value={member.phone}
                    onChange={(e) =>
                      handleFamilyChange(index, "phone", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                  <Input
                    type="text"
                    placeholder="עיר (אופציונלי)"
                    value={member.city}
                    onChange={(e) =>
                      handleFamilyChange(index, "city", e.target.value)
                    }
                    className={familyInputClasses}
                  />
                </div>
              ))}

              <Button
                type="button"
                onClick={addFamilyMember}
                className="w-full rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 shadow-md transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:brightness-105 active:scale-[0.98]"
              >
                ➕ הוסף בן משפחה
              </Button>
            </div>
          )}
        </div>

        {phase === "otp" && (
          <div className="p-6 border border-emerald-200 rounded-2xl bg-emerald-50/60 shadow-md space-y-3">
            <h3 className="text-lg font-bold text-emerald-700 border-b border-emerald-100 pb-1">
              אימות קוד שנשלח אליך
            </h3>
            <p className="text-sm text-emerald-900">
              קוד האימות נשלח לכתובת{" "}
              <span className="font-semibold">{pendingEmail || account.email}</span>. יש
              להקליד אותו כדי להשלים את פתיחת החשבון.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-end">
              <Input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="הקלד/י את קוד האימות"
                className="flex-1 bg-white shadow-inner text-sm focus-visible:ring-emerald-400"
              />
              <Button
                type="button"
                onClick={handleVerifyOtp as any}
                className="w-full sm:w-auto rounded-xl font-semibold text-white bg-gradient-to-r from-emerald-600 via-green-600 to-teal-500 shadow-md transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:brightness-105 active:scale-[0.98]"
                disabled={otpLoading}
              >
                {otpLoading ? "מאמת..." : "אימות קוד והשלמת הרשמה"}
              </Button>
            </div>
            {otpError && (
              <div className="bg-rose-50 text-rose-700 text-sm rounded-lg p-3 border border-rose-100">
                {otpError}
              </div>
            )}
            {otpDetails.length > 0 && (
              <ul className="bg-amber-50 text-amber-800 text-xs rounded-lg p-3 border border-amber-100 space-y-1 list-disc list-inside">
                {otpDetails.map((detail, idx) => (
                  <li key={idx}>{detail}</li>
                ))}
              </ul>
            )}
            {otpSuccess && (
              <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 border border-emerald-100">
                {otpSuccess}
              </div>
            )}
          </div>
        )}

        {/* Submit */}
        {submitError && (
          <div className="bg-rose-50 text-rose-600 text-sm rounded-lg p-3 border border-rose-100">
            {submitError}
          </div>
        )}
        {serverDetails.length > 0 && (
          <ul className="bg-amber-50 text-amber-800 text-xs rounded-lg p-3 border border-amber-100 space-y-1 list-disc list-inside">
            {serverDetails.map((detail, idx) => (
              <li key={idx}>{detail}</li>
            ))}
          </ul>
        )}
        {submitSuccess && (
          <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 border border-emerald-100">
            {submitSuccess}
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
          {loading
            ? "שומר..."
            : phase === "otp"
            ? "שליחת קוד חדש"
            : "שלח קוד אימות"}
        </Button>
      </form>
    </div>
  );
}
