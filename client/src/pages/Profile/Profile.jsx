/**
 * Profile.jsx — Tailwind + FamilyEditorModal Integration
 * ------------------------------------------------------
 * - Displays logged-in user's data (from AuthContext)
 * - Allows edit mode for profile fields
 * - Includes a new Family Management Modal
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import FamilyEditorModal from "../../Components/people/FamilyEditorModal";

export default function Profile() {
  const { user, updateProfile } = useAuth();
  const [form, setForm] = useState(user || {});
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFamilyModal, setShowFamilyModal] = useState(false);

  useEffect(() => {
    if (user) setForm(user);
  }, [user]);

  const handleChange = (key, value) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateProfile(form);
      alert("✅ הנתונים עודכנו בהצלחה!");
      setEditMode(false);
    } catch (err) {
      alert("❌ שגיאה בעדכון הפרופיל");
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(user);
    setEditMode(false);
  };

  const calcAge = (birthDate) => {
    if (!birthDate) return "";
    const diff = new Date() - new Date(birthDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        ⏳ טוען נתוני משתמש...
      </div>
    );

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 flex justify-center"
      dir="rtl"
    >
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-xl p-8 border border-gray-200 animate-fade-in">
        {/* --- Header --- */}
        <div className="flex items-center gap-5 mb-8 border-b pb-5 border-gray-300">
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.name || "משתמש"
            )}&background=6366F1&color=fff&size=120`}
            alt="avatar"
            className="rounded-full w-24 h-24 shadow-md"
          />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 font-[Poppins]">
              {user.name || "משתמש"}
            </h2>
            <p className="text-gray-600 mt-1">
              {user.role === "admin" ? "מנהל מערכת" : "משתמש רגיל"}
            </p>
          </div>
        </div>

        {/* --- Profile Info --- */}
        <div className="space-y-5">
          {/* ת"ז */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-gray-700 font-medium">תעודת זהות:</span>
            {editMode ? (
              <input
                type="text"
                value={form.idNumber || ""}
                onChange={(e) => handleChange("idNumber", e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-gray-800 mt-1">{user.idNumber || "-"}</p>
            )}
          </div>

          {/* שם מלא */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-gray-700 font-medium">שם מלא:</span>
            {editMode ? (
              <input
                type="text"
                value={form.name || ""}
                onChange={(e) => handleChange("name", e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-gray-800 mt-1">{user.name}</p>
            )}
          </div>

          {/* אימייל */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-gray-700 font-medium">אימייל:</span>
            {editMode ? (
              <input
                type="email"
                value={form.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-gray-800 mt-1">{user.email}</p>
            )}
          </div>

          {/* תאריך לידה */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-gray-700 font-medium">תאריך לידה:</span>
            {editMode ? (
              <input
                type="date"
                value={form.birthDate || ""}
                onChange={(e) => handleChange("birthDate", e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-gray-800 mt-1">
                {user.birthDate
                  ? `${user.birthDate} (${calcAge(user.birthDate)} שנים)`
                  : "-"}
              </p>
            )}
          </div>

          {/* עיר */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-gray-700 font-medium">עיר:</span>
            {editMode ? (
              <input
                type="text"
                value={form.city || ""}
                onChange={(e) => handleChange("city", e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-gray-800 mt-1">{user.city || "-"}</p>
            )}
          </div>

          {/* טלפון */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            <span className="text-gray-700 font-medium">טלפון:</span>
            {editMode ? (
              <input
                type="text"
                value={form.phone || ""}
                onChange={(e) => handleChange("phone", e.target.value)}
                className="w-full mt-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
              />
            ) : (
              <p className="text-gray-800 mt-1">{user.phone || "-"}</p>
            )}
          </div>

          {/* גבייה */}
          <div className="p-4 rounded-xl border border-gray-200 bg-gray-50">
            {editMode ? (
              <label className="flex items-center gap-3">
                <input
                  type="checkbox"
                  checked={!!form.canCharge}
                  onChange={(e) => handleChange("canCharge", e.target.checked)}
                  className="w-5 h-5 accent-indigo-500"
                />
                <span className="text-gray-700 font-medium">הרשאה לגבייה</span>
              </label>
            ) : (
              <p className="text-gray-700 font-medium">
                הרשאה לגבייה:{" "}
                <strong>{user.canCharge ? "✅ כן" : "❌ לא"}</strong>
              </p>
            )}
          </div>
        </div>

        {/* --- Actions --- */}
<div className="mt-10 flex flex-wrap gap-3 justify-end">
  {editMode ? (
    <>
      <button
        onClick={handleSave}
        disabled={saving}
        className={`px-5 py-2.5 rounded-xl font-semibold text-white shadow-sm transition-all ${
          saving
            ? "bg-gray-400 cursor-not-allowed"
            : "bg-indigo-600 hover:bg-indigo-700 active:scale-95"
        }`}
      >
        {saving ? "שומר..." : "💾 שמור"}
      </button>
      <button
        onClick={handleCancel}
        className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 active:scale-95 transition"
      >
        ביטול
      </button>
    </>
  ) : (
    <>
      <button
        onClick={() => setEditMode(true)}
        className="px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 active:scale-95 transition"
      >
        ✏️ ערוך פרטים
      </button>

      <button
        onClick={() => setShowFamilyModal(true)}
        className="px-5 py-2.5 rounded-xl border border-indigo-500 text-indigo-700 font-semibold hover:bg-indigo-50 active:scale-95 transition"
      >
        👨‍👩‍👧 ניהול בני משפחה
      </button>
    </>
  )}
</div>

{/* --- Family List (only if exists) --- */}
{user.familyMembers && user.familyMembers.length > 0 && (
  <div className="mt-10 border-t pt-6">
    <h3 className="text-xl font-semibold text-gray-800 mb-3 flex items-center gap-2">
      👨‍👩‍👧 בני משפחה רשומים
    </h3>
    <button
      onClick={() =>
        setShowFamilyModal((prev) => !prev)
      }
      className="mb-4 px-4 py-2 bg-indigo-100 hover:bg-indigo-200 text-indigo-700 font-medium rounded-xl transition active:scale-95"
    >
      {showFamilyModal ? "➖ סגור רשימה" : "👁️ הצג בני משפחה"}
    </button>

    {showFamilyModal && (
      <div className="space-y-3">
        {user.familyMembers.map((member, i) => (
          <div
            key={i}
            className="p-4 border border-gray-200 rounded-xl bg-gray-50"
          >
            <p className="font-semibold text-gray-900">{member.name}</p>
            <p className="text-gray-700 text-sm">
              {member.relation && `${member.relation} `}
              {member.birthDate && `| נולד/ה: ${member.birthDate} `}
              {member.phone && `| טלפון: ${member.phone}`}
            </p>
          </div>
        ))}
      </div>
    )}
  </div>
)}

        {/* --- Family Modal --- */}
        {showFamilyModal && (
          <FamilyEditorModal
            user={user}
            onClose={() => setShowFamilyModal(false)}
            onSave={(newFamily) => updateProfile({ familyMembers: newFamily })}
          />
        )}
      </div>
    </div>
  );
}
