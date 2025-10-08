/**
 * EditProfile.jsx — Tailwind Admin Edition
 * ----------------------------------------
 * Fetch one user (GET /api/users/:id)
 * Edit and update all fields (PUT /api/users/:id)
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function EditProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin } = useAuth();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // 🟢 Fetch profile by ID
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch(`/api/users/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "User not found");
        setForm(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [id]);

  const handleChange = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 🟢 Save updated profile
  const handleSave = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem("token");

      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(form),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");

      alert("✅ הנתונים עודכנו בהצלחה!");
      navigate("/profiles");
    } catch (err) {
      alert("❌ שגיאה בעדכון המשתמש: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 animate-pulse">
        ⏳ טוען נתונים...
      </div>
    );
  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 font-medium">
        ❌ {error}
      </div>
    );
  if (!form)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        ❌ לא נמצא משתמש לעריכה.
      </div>
    );

  /* ==================== UI ==================== */
  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 px-4"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 animate-subtle-fade">
        {/* --- Title --- */}
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center font-[Poppins]">
          עריכת פרופיל
        </h2>

        {/* --- Form --- */}
        <div className="space-y-4">
          <label className="block">
            <span className="text-gray-700 font-medium">שם מלא:</span>
            <input
              value={form.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-gray-700 font-medium">אימייל:</span>
            <input
              type="email"
              value={form.email || ""}
              onChange={(e) => handleChange("email", e.target.value)}
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-gray-700 font-medium">סיסמה חדשה:</span>
            <input
              type="password"
              placeholder="השאר ריק אם לא מעדכן"
              onChange={(e) => handleChange("password", e.target.value)}
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-gray-700 font-medium">תאריך לידה:</span>
            <input
              type="date"
              value={form.birthDate || ""}
              onChange={(e) => handleChange("birthDate", e.target.value)}
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-gray-700 font-medium">עיר:</span>
            <input
              value={form.city || ""}
              onChange={(e) => handleChange("city", e.target.value)}
              className="input mt-1"
            />
          </label>

          <label className="block">
            <span className="text-gray-700 font-medium">טלפון:</span>
            <input
              value={form.phone || ""}
              onChange={(e) => handleChange("phone", e.target.value)}
              className="input mt-1"
            />
          </label>

          {isAdmin && (
            <>
              <label className="flex items-center gap-3 text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={!!form.canCharge}
                  onChange={(e) =>
                    handleChange("canCharge", e.target.checked)
                  }
                  className="w-5 h-5 accent-indigo-600"
                />
                הרשאה לגבייה
              </label>

              <label className="block">
                <span className="text-gray-700 font-medium">תפקיד:</span>
                <select
                  value={form.role || "user"}
                  onChange={(e) => handleChange("role", e.target.value)}
                  className="input mt-1"
                >
                  <option value="user">משתמש</option>
                  <option value="admin">מנהל</option>
                </select>
              </label>
            </>
          )}
        </div>

        {/* --- Buttons --- */}
        <div className="flex justify-between mt-8">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`btn btn-primary px-6 py-2 ${
              saving ? "opacity-70 cursor-not-allowed" : ""
            }`}
          >
            {saving ? "שומר..." : "💾 שמור"}
          </button>

          <button
            onClick={() => navigate("/profiles")}
            className="btn btn-secondary px-6 py-2"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
