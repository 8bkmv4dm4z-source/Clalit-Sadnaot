import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

const initialAccount = {
  name: "",
  email: "",
  password: "",
  confirm: "",
  idNumber: "",
  birthDate: "",
  canCharge: false,
};

export default function Register() {
  const [account, setAccount] = useState({ ...initialAccount });
  const [familyMembers, setFamilyMembers] = useState([]);
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();
  const { registerUser } = useAuth(); // 👈 מתחבר לקונטקסט

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setAccount((prev) => ({
      ...prev,
      [name]: type === "checkbox" ? checked : value,
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (account.password !== account.confirm)
      return alert("הסיסמאות אינן תואמות");

    const payload = {
      ...account,
      email: account.email.trim().toLowerCase(),
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
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 p-8"
      dir="rtl"
    >
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white shadow-xl rounded-2xl p-8 space-y-5 animate-fade-in"
      >
        <h2 className="text-2xl font-bold text-center text-gray-900 font-[Poppins] mb-2">
          הרשמה למערכת
        </h2>
        <p className="text-center text-gray-600 mb-4">
          מלא את פרטיך האישיים כדי ליצור חשבון חדש
        </p>

        <div className="space-y-3">
          <label className="block">
            <span className="text-gray-700">שם מלא:</span>
            <input
              name="name"
              value={account.name}
              onChange={handleChange}
              required
              className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-gray-700">אימייל:</span>
            <input
              type="email"
              name="email"
              value={account.email}
              onChange={handleChange}
              required
              className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-gray-700">סיסמה:</span>
            <input
              type="password"
              name="password"
              value={account.password}
              onChange={handleChange}
              required
              minLength={8}
              className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-gray-700">אימות סיסמה:</span>
            <input
              type="password"
              name="confirm"
              value={account.confirm}
              onChange={handleChange}
              required
              className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-gray-700">תעודת זהות:</span>
            <input
              name="idNumber"
              value={account.idNumber}
              onChange={handleChange}
              required
              className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </label>

          <label className="block">
            <span className="text-gray-700">תאריך לידה:</span>
            <input
              type="date"
              name="birthDate"
              value={account.birthDate}
              onChange={handleChange}
              className="w-full mt-1 px-3 py-2 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </label>

          <label className="flex items-center gap-2 text-gray-700">
            <input
              type="checkbox"
              name="canCharge"
              checked={account.canCharge}
              onChange={handleChange}
              className="w-5 h-5 accent-indigo-500"
            />
            הרשאה לגבייה
          </label>
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-2.5 rounded-xl font-semibold text-white shadow-sm transition ${
            loading
              ? "bg-gray-400 cursor-not-allowed"
              : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
          }`}
        >
          {loading ? "שומר..." : "סיום הרשמה"}
        </button>
      </form>
    </div>
  );
}
