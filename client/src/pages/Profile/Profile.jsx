/**
 * Profile.jsx — User Profile Page (Full DB-Sync, Hebrew UI + English Notes)
 * -----------------------------------------------------------------------
 * ✅ Updates user via /api/users/update-entity (AuthContext updateEntity)
 * ✅ Always fetches /api/users/me on mount (single source of truth)
 * ✅ Keeps full design, modal, and Hebrew layout intact
 * ✅ Prevents local-only updates (server is always authority)
 */

import React, { useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { apiFetch } from "../../utils/apiFetch";
import FamilyEditorModal from "../../components/people/FamilyEditorModal";

export default function Profile() {
  const { user, updateEntity } = useAuth();
  const { fetchWorkshops } = useWorkshops();

  // 🔹 Local UI state
  const [form, setForm] = useState(user || {});
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showFamilyModal, setShowFamilyModal] = useState(false);

  /* ------------------------------------------------------------
     🔄 Refresh user info from backend (single source of truth)
  ------------------------------------------------------------ */
  useEffect(() => {
    const refreshUser = async () => {
      try {
        const res = await apiFetch("/api/users/me");
        const data = await res.json();
        if (res.ok && data?._id) setForm(data);
      } catch (err) {
        console.warn("⚠️ Failed to refresh user data:", err.message);
      }
    };
    refreshUser();
  }, []);

  /* ------------------------------------------------------------
     🧩 Controlled input updates
  ------------------------------------------------------------ */
  const handleChange = (key, value) => setForm((p) => ({ ...p, [key]: value }));

  /* ------------------------------------------------------------
     💾 Save user profile (via update-entity)
  ------------------------------------------------------------ */
  const handleSave = async () => {
    try {
      setSaving(true);

      const updates = {
        name: form.name,
        idNumber: form.idNumber,
        phone: form.phone,
        city: form.city,
        birthDate: form.birthDate,
        canCharge: form.canCharge,
      };

      const payload = { entityKey: user.entityKey, updates };
      const result = await updateEntity(payload);

      if (!result.success) throw new Error(result.message);

      // Refresh dependent UI
      await fetchWorkshops();

      alert("✅ הנתונים עודכנו בהצלחה!");
      setEditMode(false);
    } catch (err) {
      alert("❌ שגיאה בעדכון הפרופיל: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------
     ↩️ Cancel editing
  ------------------------------------------------------------ */
  const handleCancel = () => {
    setForm(user);
    setEditMode(false);
  };

  /* ------------------------------------------------------------
     📆 Calculate age helper
  ------------------------------------------------------------ */
  const calcAge = (birthDate) => {
    if (!birthDate) return "";
    const diff = new Date() - new Date(birthDate);
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  /* ------------------------------------------------------------
     ⏳ Guard: wait for user
  ------------------------------------------------------------ */
  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        ⏳ טוען נתוני משתמש...
      </div>
    );

  /* ------------------------------------------------------------
     🧱 UI Layout
  ------------------------------------------------------------ */
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 flex justify-center"
      dir="rtl"
    >
      <div className="w-full max-w-lg container-box p-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-5 mb-8 border-b pb-5 border-indigo-200">
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.name || "משתמש"
            )}&background=6366F1&color=fff&size=120`}
            alt="avatar"
            className="rounded-full w-24 h-24 shadow-md"
          />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 font-[Poppins]">
              {form.name || "משתמש"}
            </h2>
            <p className="text-gray-600 mt-1">
              {user.isAdmin ? "מנהל מערכת" : "משתמש רגיל"}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <ProfileField
            label="תעודת זהות"
            value={form.idNumber}
            editMode={editMode}
            onChange={(v) => handleChange("idNumber", v)}
          />
          <ProfileField
            label="שם מלא"
            value={form.name}
            editMode={editMode}
            onChange={(v) => handleChange("name", v)}
          />
          <ProfileField label="אימייל" value={user.email} editMode={false} />
          <ProfileField
            label="תאריך לידה"
            type="date"
            value={form.birthDate}
            editMode={editMode}
            onChange={(v) => handleChange("birthDate", v)}
            displayExtra={
              !editMode && form.birthDate ? `(${calcAge(form.birthDate)} שנים)` : ""
            }
          />
          <ProfileField
            label="עיר"
            value={form.city}
            editMode={editMode}
            onChange={(v) => handleChange("city", v)}
          />
          <ProfileField
            label="טלפון"
            value={form.phone}
            editMode={editMode}
            onChange={(v) => handleChange("phone", v)}
          />

          {/* Charge permission */}
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
                הרשאה לגבייה: <strong>{form.canCharge ? "✅ כן" : "❌ לא"}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap gap-3 justify-end">
          {editMode ? (
            <>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`btn btn-primary px-5 py-2.5 ${
                  saving ? "cursor-not-allowed bg-gray-400" : ""
                }`}
              >
                {saving ? "שומר..." : "💾 שמור"}
              </button>
              <button onClick={handleCancel} className="btn btn-secondary px-5 py-2.5">
                ביטול
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setEditMode(true)}
                className="btn btn-primary px-5 py-2.5"
              >
                ✏️ ערוך פרטים
              </button>
              <button
                onClick={() => setShowFamilyModal(true)}
                className="btn btn-outline px-5 py-2.5 border-indigo-500 text-indigo-700"
              >
                👨‍👩‍👧 ניהול בני משפחה
              </button>
            </>
          )}
        </div>

        {/* Family Modal */}
        {showFamilyModal && (
          <FamilyEditorModal
            user={form}
            onClose={() => setShowFamilyModal(false)}
            onSave={(updatedUser) => {
              setForm(updatedUser);
              setShowFamilyModal(false);
            }}
          />
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------
   🧩 ProfileField Subcomponent
------------------------------------------------------------ */
function ProfileField({ label, value, onChange, editMode, type = "text", displayExtra = "" }) {
  return (
    <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50">
      <span className="text-gray-700 font-medium">{label}:</span>
      {editMode ? (
        <input
          type={type}
          value={value || ""}
          onChange={(e) => onChange(e.target.value)}
          className="input mt-2"
        />
      ) : (
        <p className="text-gray-800 mt-1">
          {value || "-"} {displayExtra}
        </p>
      )}
    </div>
  );
}
