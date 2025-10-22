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

  const navigate = useNavigate();
  const { registerUser } = useAuth();

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setAccount((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
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

    // ✅ Basic client validations
    if (account.password !== account.confirm)
      return alert("הסיסמאות אינן תואמות");

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phonePattern = /^[0-9+\-\s]{6,20}$/;

    if (!emailPattern.test(account.email)) {
      return alert("נא להזין כתובת אימייל תקינה");
    }

    if (!phonePattern.test(account.phone)) {
      return alert("נא להזין מספר טלפון תקין");
    }

    if (account.idNumber && !/^[0-9]{5,10}$/.test(account.idNumber)) {
      return alert("מספר תעודת זהות חייב להיות בין 5 ל-10 ספרות");
    }

    if (
      account.password.length < 8 ||
      !/[A-Za-z]/.test(account.password) ||
      !/[0-9]/.test(account.password)
    ) {
      return alert("הסיסמה חייבת להיות באורך 8 תווים לפחות ולכלול אותיות ומספרים");
    }

    // ✅ Build payload identical to UserSchema
    const payload = {
      name: account.name,
      email: account.email.trim().toLowerCase(),
      phone: account.phone.trim(),
      password: account.password,
      idNumber: account.idNumber,
      birthDate: account.birthDate,
      city: account.city,
      canCharge: account.canCharge,
      role: "user",
      familyMembers: familyMembers.filter((m) => m.name && m.idNumber),
    };

    setLoading(true);
    const result = await registerUser(payload);
    setLoading(false);

    if (result.success) {
      alert("✅ נרשמת בהצלחה! ניתן להתחבר כעת.");
      navigate("/login");
    } else {
      alert("❌ " + (result.message || "שגיאה בהרשמה"));
    }
  };

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
            required
            placeholder="שם מלא"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="email"
            type="email"
            value={account.email}
            onChange={handleChange}
            required
            placeholder="אימייל"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="phone"
            type="tel"
            value={account.phone}
            onChange={handleChange}
            required
            placeholder="טלפון"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            type="password"
            name="password"
            value={account.password}
            onChange={handleChange}
            required
            minLength={8}
            placeholder="סיסמה (לפחות 8 תווים)"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            type="password"
            name="confirm"
            value={account.confirm}
            onChange={handleChange}
            required
            placeholder="אימות סיסמה"
            className="w-full px-3 py-2 border rounded-lg bg-gray-50 shadow-inner text-sm focus:ring-2 focus:ring-indigo-400 focus:outline-none"
          />

          <input
            name="idNumber"
            value={account.idNumber}
            onChange={handleChange}
            required
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
        <button
          type="submit"
          disabled={loading}
          className={`w-full py-3 rounded-xl font-semibold text-white shadow-lg transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
            loading
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
