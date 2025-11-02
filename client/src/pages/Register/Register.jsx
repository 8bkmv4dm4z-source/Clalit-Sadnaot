// src/pages/Auth/Register.jsx
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
} from "../../utils/validation";

/**
 * Register.jsx — Strict Schema-Aligned Version (2025)
 * ---------------------------------------------------
 * ✅ Every field matches UserSchema exactly.
 * ✅ No "email or phone" fallback — both fields exist.
 * ✅ city, canCharge, idNumber, birthDate, familyMembers — all present.
 */

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
  const [familyMembers, setFamilyMembers] = useState([]);
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

  const navigate = useNavigate();
  const { registerUser } = useAuth();

  const runValidation = (field, value, nextAccount = account) => {
    switch (field) {
      case "name":
        return validateRequired(value, "שם מלא");
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
      default:
        return { valid: true, message: "" };
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;
    const nextAccount = { ...account, [name]: nextValue };
    setAccount(nextAccount);
    setSubmitError("");
    setSubmitSuccess("");

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

  const markTouched = (field) =>
    setTouched((prev) => ({
      ...prev,
      [field]: true,
    }));

  const handleFamilyChange = (index, field, value) => {
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

  const removeFamilyMember = (index) => {
    setFamilyMembers((prev) => prev.filter((_, i) => i !== index));
  };

  const validateForm = () => {
    const validationResults = {
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

    return Object.values(validationResults).every((res) => res.valid);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitError("");
    setSubmitSuccess("");

    if (!validateForm()) return;

    const trimmedName = account.name.trim();
    const trimmedEmail = account.email.trim().toLowerCase();
    const trimmedPhone = account.phone.trim();
    const trimmedId = account.idNumber.trim();
    const trimmedCity = account.city.trim();

    const payload = {
      name: trimmedName,
      email: trimmedEmail,
      password: account.password,
      canCharge: account.canCharge,
      role: "user",
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
    const result = await registerUser(payload);
    setLoading(false);

    if (result.success) {
      setSubmitSuccess("✅ נרשמת בהצלחה! ניתן להתחבר כעת.");
      setAccount({ ...initialAccount });
      setFamilyMembers([]);
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
      setTimeout(() => navigate("/login"), 600);
    } else {
      setSubmitError(`❌ ${result.message || "שגיאה בהרשמה"}`);
    }
  };

  const canSubmit = useMemo(() => {
    const requiredFields = ["name", "email", "phone", "password", "confirm", "idNumber"];
    const allFilled = requiredFields.every((field) => Boolean(String(account[field] || "").trim()));
    const noErrors = Object.values(errors).every((msg) => !msg);
    return allFilled && noErrors && !loading;
  }, [account, errors, loading]);

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
        </div>

        {/* Main User Info */}
        <div className="p-6 border border-indigo-200 rounded-2xl bg-gradient-to-br from-indigo-50/70 to-white shadow-md space-y-3 hover:shadow-lg hover:border-indigo-300 transition-all">
          <h3 className="text-lg font-bold text-indigo-700 border-b border-indigo-100 pb-1">
            פרטי משתמש ראשי
          </h3>

          <input
            name="name"
            value={account.name}
            onChange={handleChange}
            onBlur={() => markTouched("name")}
            required
            placeholder="שם מלא"
            className={`w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${
              errors.name && touched.name ? "border-rose-400" : ""
            }`}
          />
          {errors.name && touched.name && (
            <p className="text-xs text-rose-600">{errors.name}</p>
          )}

          <input
            name="email"
            type="email"
            value={account.email}
            onChange={handleChange}
            onBlur={() => markTouched("email")}
            required
            placeholder="אימייל"
            className={`w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${
              errors.email && touched.email ? "border-rose-400" : ""
            }`}
          />
          {errors.email && touched.email && (
            <p className="text-xs text-rose-600">{errors.email}</p>
          )}

          <input
            name="phone"
            type="tel"
            value={account.phone}
            onChange={handleChange}
            onBlur={() => markTouched("phone")}
            required
            placeholder="טלפון"
            className={`w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${
              errors.phone && touched.phone ? "border-rose-400" : ""
            }`}
          />
          {errors.phone && touched.phone && (
            <p className="text-xs text-rose-600">{errors.phone}</p>
          )}

          <input
            type="password"
            name="password"
            value={account.password}
            onChange={handleChange}
            onBlur={() => markTouched("password")}
            required
            placeholder="סיסמה (לפחות 10 תווים, אות גדולה ותו מיוחד)"
            className={`w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${
              errors.password && touched.password ? "border-rose-400" : ""
            }`}
          />
          {errors.password && touched.password && (
            <p className="text-xs text-rose-600">{errors.password}</p>
          )}

          <input
            type="password"
            name="confirm"
            value={account.confirm}
            onChange={handleChange}
            onBlur={() => markTouched("confirm")}
            required
            placeholder="אימות סיסמה"
            className={`w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${
              errors.confirm && touched.confirm ? "border-rose-400" : ""
            }`}
          />
          {errors.confirm && touched.confirm && (
            <p className="text-xs text-rose-600">{errors.confirm}</p>
          )}

          <input
            name="idNumber"
            value={account.idNumber}
            onChange={handleChange}
            onBlur={() => markTouched("idNumber")}
            required
            placeholder="תעודת זהות"
            className={`w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none ${
              errors.idNumber && touched.idNumber ? "border-rose-400" : ""
            }`}
          />
          {errors.idNumber && touched.idNumber && (
            <p className="text-xs text-rose-600">{errors.idNumber}</p>
          )}

          <input
            type="date"
            name="birthDate"
            value={account.birthDate}
            onChange={handleChange}
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="city"
            value={account.city}
            onChange={handleChange}
            placeholder="עיר מגורים"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <label className="flex items-center gap-2 text-gray-700 mt-1">
            <input
              type="checkbox"
              name="canCharge"
              checked={account.canCharge}
              onChange={handleChange}
              className="w-5 h-5 accent-indigo-600"
            />
            הרשאה לגבייה
          </label>
        </div>

        {/* Family Members */}
        <div className="pt-5 border-t border-indigo-100">
          <button
            type="button"
            onClick={() => setShowFamily(!showFamily)}
            className="w-full text-indigo-600 font-semibold text-sm hover:underline"
          >
            {showFamily ? "➖ הסתר בני משפחה" : "➕ הוסף בני משפחה"}
          </button>

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
                    <button
                      type="button"
                      onClick={() => removeFamilyMember(index)}
                      className="text-red-500 text-sm hover:underline"
                    >
                      הסר
                    </button>
                  </div>

                  <input
                    type="text"
                    placeholder="שם מלא"
                    value={member.name}
                    onChange={(e) =>
                      handleFamilyChange(index, "name", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="קרבה (אח, בת, אב...)"
                    value={member.relation}
                    onChange={(e) =>
                      handleFamilyChange(index, "relation", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="תעודת זהות"
                    value={member.idNumber}
                    onChange={(e) =>
                      handleFamilyChange(index, "idNumber", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                  <input
                    type="date"
                    value={member.birthDate}
                    onChange={(e) =>
                      handleFamilyChange(index, "birthDate", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                  <input
                    type="email"
                    placeholder="אימייל (אופציונלי)"
                    value={member.email}
                    onChange={(e) =>
                      handleFamilyChange(index, "email", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                  <input
                    type="tel"
                    placeholder="טלפון (אופציונלי)"
                    value={member.phone}
                    onChange={(e) =>
                      handleFamilyChange(index, "phone", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                  <input
                    type="text"
                    placeholder="עיר (אופציונלי)"
                    value={member.city}
                    onChange={(e) =>
                      handleFamilyChange(index, "city", e.target.value)
                    }
                    className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                  />
                </div>
              ))}

              <button
                type="button"
                onClick={addFamilyMember}
                className="w-full mt-2 py-2.5 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 shadow-md transition-all duration-300 transform hover:scale-[1.02] hover:shadow-lg hover:brightness-105 active:scale-[0.98]"
              >
                ➕ הוסף בן משפחה
              </button>
            </div>
          )}
        </div>

        {/* Submit */}
        {submitError && (
          <div className="bg-rose-50 text-rose-600 text-sm rounded-lg p-3 border border-rose-100">
            {submitError}
          </div>
        )}
        {submitSuccess && (
          <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 border border-emerald-100">
            {submitSuccess}
          </div>
        )}
        <button
          type="submit"
          disabled={!canSubmit}
          className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            !canSubmit
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-gradient-to-r from-indigo-600 via-blue-600 to-sky-500 hover:brightness-105"
          }`}
        >
          {loading ? "שומר..." : "סיום הרשמה"}
        </button>
      </form>
    </div>
  );
}
