import React, { useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
// After reorganising files, the family editor modal lives under
// `src/components/people`. Update the import path accordingly.
import FamilyEditorModal from "../../components/people/FamilyEditorModal";

export default function Profile() {
  const { user, updateEntity } = useAuth();
  const { fetchWorkshops } = useWorkshops();

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
      const payload = {
        userId: user._id,
        updates: {
          name: form.name,
          idNumber: form.idNumber,
          phone: form.phone,
          city: form.city,
          birthDate: form.birthDate,
          canCharge: form.canCharge,
        },
      };
      const result = await updateEntity(payload);
      if (!result.success) throw new Error(result.message);

      // עדכון גלובלי (רענון גרידים/טבלאות שמאזינים)
      window.dispatchEvent(new Event("entity-updated"));
      await fetchWorkshops();

      alert("✅ הנתונים עודכנו בהצלחה!");
      setEditMode(false);
    } catch (err) {
      alert("❌ שגיאה בעדכון הפרופיל: " + err.message);
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

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        ⏳ טוען נתוני משתמש...
      </div>
    );
  }

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
              {user.name || "משתמש"}
            </h2>
            <p className="text-gray-600 mt-1">
              {user.role === "admin" ? "מנהל מערכת" : "משתמש רגיל"}
            </p>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <ProfileField
            label="תעודת זהות"
            editMode={editMode}
            value={form.idNumber}
            onChange={(v) => handleChange("idNumber", v)}
          />
          <ProfileField
            label="שם מלא"
            editMode={editMode}
            value={form.name}
            onChange={(v) => handleChange("name", v)}
          />
          <ProfileField label="אימייל" editMode={false} value={user.email} />
          <ProfileField
            label="תאריך לידה"
            editMode={editMode}
            type="date"
            value={form.birthDate}
            onChange={(v) => handleChange("birthDate", v)}
            displayExtra={
              !editMode && form.birthDate ? `(${calcAge(form.birthDate)} שנים)` : ""
            }
          />
          <ProfileField
            label="עיר"
            editMode={editMode}
            value={form.city}
            onChange={(v) => handleChange("city", v)}
          />
          <ProfileField
            label="טלפון"
            editMode={editMode}
            value={form.phone}
            onChange={(v) => handleChange("phone", v)}
          />

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
                הרשאה לגבייה: <strong>{user.canCharge ? "✅ כן" : "❌ לא"}</strong>
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
                className={`btn btn-primary px-5 py-2.5 ${saving ? "cursor-not-allowed bg-gray-400" : ""}`}
              >
                {saving ? "שומר..." : "💾 שמור"}
              </button>
              <button
                onClick={handleCancel}
                className="btn btn-secondary px-5 py-2.5"
              >
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

        {/* רק מודאל ניהול בני משפחה – בלי רשימה נוספת בדף */}
        {showFamilyModal && (
          <FamilyEditorModal
            user={user}
            onClose={() => setShowFamilyModal(false)}
            onSave={(newFamilyList) =>
              updateEntity({
                userId: user._id,
                updates: { familyMembers: newFamilyList },
              })
            }
          />
        )}
      </div>
    </div>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  editMode,
  type = "text",
  displayExtra = "",
}) {
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
