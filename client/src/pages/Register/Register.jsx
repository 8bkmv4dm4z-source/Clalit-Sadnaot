// src/pages/Auth/Register.jsx
import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

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
  const [submitError, setSubmitError] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState("");
  const [submitDetails, setSubmitDetails] = useState([]);

  const navigate = useNavigate();
  const { registerUser } = useAuth();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const nextValue = type === "checkbox" ? checked : value;
    setAccount((prev) => ({ ...prev, [name]: nextValue }));
    setSubmitError("");
    setSubmitSuccess("");
    setSubmitDetails([]);
  };

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

  const handleSubmit = async (e) => {
    e.preventDefault();

    setSubmitError("");
    setSubmitSuccess("");
    setSubmitDetails([]);

    if (
      account.password &&
      account.confirm &&
      account.password !== account.confirm
    ) {
      setSubmitError("הסיסמאות אינן תואמות.");
      return;
    }

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
    try {
      const result = await registerUser(payload);
      if (result.success) {
        setSubmitSuccess("נרשמת בהצלחה! ניתן להתחבר כעת.");
        setAccount({ ...initialAccount });
        setFamilyMembers([]);
        setSubmitDetails([]);
        setTimeout(() => navigate("/login"), 800);
      } else {
        setSubmitError(result.message || "שגיאה בהרשמה.");
        if (Array.isArray(result.details) && result.details.length) {
          setSubmitDetails(result.details);
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const disableSubmit = loading;

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
            placeholder="שם מלא"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="email"
            type="email"
            value={account.email}
            onChange={handleChange}
            placeholder="אימייל"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="phone"
            type="tel"
            value={account.phone}
            onChange={handleChange}
            placeholder="טלפון"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            type="password"
            name="password"
            value={account.password}
            onChange={handleChange}
            placeholder="סיסמה (לפחות 10 תווים, אות גדולה ותו מיוחד)"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            type="password"
            name="confirm"
            value={account.confirm}
            onChange={handleChange}
            placeholder="אימות סיסמה"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="idNumber"
            value={account.idNumber}
            onChange={handleChange}
            placeholder="תעודת זהות"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

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
          <div className="bg-rose-50 text-rose-600 text-sm rounded-lg p-3 border border-rose-100 space-y-2">
            <div>❌ {submitError}</div>
            {submitDetails.length > 0 && (
              <ul className="space-y-1 text-xs list-disc pr-4">
                {submitDetails.map((detail, idx) => (
                  <li key={`register-detail-${idx}`}>{detail}</li>
                ))}
              </ul>
            )}
          </div>
        )}
        {submitSuccess && (
          <div className="bg-emerald-50 text-emerald-700 text-sm rounded-lg p-3 border border-emerald-100">
            ✅ {submitSuccess}
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
          {loading ? "שומר..." : "סיום הרשמה"}
        </button>
      </form>
    </div>
  );
}
