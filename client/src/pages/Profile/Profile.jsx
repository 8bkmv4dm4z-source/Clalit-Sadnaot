/**
 * Profile.jsx — User Profile Page (Full DB-Sync, Hebrew UI + English Notes)
 * -----------------------------------------------------------------------
 * ✅ Updates user via /api/users/update-entity (AuthContext updateEntity)
 * ✅ Always fetches /api/users/getMe on mount (single source of truth)
 * ✅ Keeps full design, modal, and Hebrew layout intact
 * ✅ Prevents local-only updates (server is always authority)
 */

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { apiFetch } from "../../utils/apiFetch";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import EditEntityModal from "../../components/people/EditEntityModal";

const normalizeBirthDate = (value) => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const asString = String(value).trim();
  if (!asString) return "";

  const [datePart] = asString.split("T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
};

const normalizeProfilePayload = (payload = {}) => ({
  entityKey: payload.entityKey || "",
  name: payload.name || "",
  email: payload.email || "",
  phone: payload.phone || "",
  city: payload.city || "",
  birthDate: normalizeBirthDate(payload.birthDate),
});

export default function Profile() {
  const { user, updateEntity } = useAuth();
  const { fetchWorkshops } = useWorkshops();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();

  // 🔹 Local UI state
  const [form, setForm] = useState(normalizeProfilePayload(user));
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingFamilyMember, setEditingFamilyMember] = useState(null);
  const [familyEntityKeys, setFamilyEntityKeys] = useState([]);
  const [familyEntities, setFamilyEntities] = useState([]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users/getMe");
      const data = await res.json();
      if (res.ok && data?.data?.entityKey) {
        const payload = data.data;
        setForm(normalizeProfilePayload(payload));
        const keys = Array.isArray(payload.familyMembers)
          ? payload.familyMembers.map((member) => member?.entityKey).filter(Boolean)
          : [];
        setFamilyEntityKeys(keys);
      }
    } catch (err) {
      console.warn("⚠️ Failed to refresh user data:", err.message);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setForm(normalizeProfilePayload(user));
      const keys = Array.isArray(user.familyMembers)
        ? user.familyMembers.map((member) => member?.entityKey).filter(Boolean)
        : [];
      setFamilyEntityKeys(keys);
    }
  }, [user]);

  /* ------------------------------------------------------------
     🔄 Refresh user info from backend (single source of truth)
  ------------------------------------------------------------ */
  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

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
        phone: form.phone,
        city: form.city,
        birthDate: normalizeBirthDate(form.birthDate) || null,
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
    setForm(normalizeProfilePayload(user));
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

  const familyMembers = useMemo(() => familyEntities, [familyEntities]);

  const canEditFamily = !!user?.entityKey && (!isChecking && (canAccessAdmin || user?.entityKey === form.entityKey));

  const fetchEntityDetails = useCallback(async (entityKey) => {
    const res = await apiFetch(`/api/users/entity/${encodeURIComponent(entityKey)}`);
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.message || "Failed to load entity");
    }
    return data;
  }, []);

  useEffect(() => {
    let alive = true;
    const loadFamilyEntities = async () => {
      if (!familyEntityKeys.length) {
        if (alive) setFamilyEntities([]);
        return;
      }
      try {
        const results = await Promise.all(
          familyEntityKeys.map((key) => fetchEntityDetails(key).catch(() => null))
        );
        if (!alive) return;
        setFamilyEntities(results.filter(Boolean));
      } catch (err) {
        if (!alive) return;
        console.warn("⚠️ Failed to load family entities:", err.message);
        setFamilyEntities([]);
      }
    };
    loadFamilyEntities();
    return () => {
      alive = false;
    };
  }, [familyEntityKeys, fetchEntityDetails]);

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
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <ProfileField
            label="שם מלא"
            value={form.name}
            editMode={editMode}
            onChange={(v) => handleChange("name", v)}
          />
          <ProfileField label="אימייל" value={form.email} editMode={false} />
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
        </div>

        {/* Family members */}
        <div className="mt-6 p-4 rounded-xl border border-indigo-200 bg-indigo-50">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">בני משפחה</h3>
          <p className="text-sm text-gray-600 mb-3">
            ניתן לערוך בני משפחה באמצעות כפתור עריכה לצד כל כרטיס.
          </p>
          {familyMembers.length === 0 ? (
            <p className="text-gray-600 text-sm">לא נמצאו בני משפחה.</p>
          ) : (
            <div className="space-y-3">
              {familyMembers.map((member) => (
                <div
                  key={member.entityKey}
                  className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-white/80 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-gray-800 font-semibold">
                        {member.name || "ללא שם"}
                      </div>
                      {member.relation && (
                        <div className="text-xs text-gray-500">
                          קשר: {member.relation}
                        </div>
                      )}
                    </div>
                    {canEditFamily && (
                      <button
                        type="button"
                        className="btn btn-secondary px-3 py-1.5 text-xs"
                        onClick={async () => {
                          try {
                            const entity = await fetchEntityDetails(member.entityKey);
                            setEditingFamilyMember(entity);
                          } catch (err) {
                            alert(`❌ שגיאה בטעינת פרטי בן המשפחה: ${err.message}`);
                          }
                        }}
                      >
                        ✏️ ערוך
                      </button>
                    )}
                  </div>
                  <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                    <span>ת.ז: {member.idNumber || "-"}</span>
                    <span>טלפון: {member.phone || "-"}</span>
                    <span>עיר: {member.city || "-"}</span>
                    <span>
                      תאריך לידה:{" "}
                      {member.birthDate
                        ? new Date(member.birthDate).toLocaleDateString("he-IL")
                        : "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
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
            </>
          )}
        </div>
      </div>

      {editingFamilyMember && (
        <EditEntityModal
          entity={editingFamilyMember}
          onClose={() => setEditingFamilyMember(null)}
          onSave={async () => {
            setEditingFamilyMember(null);
            await refreshUser();
          }}
        />
      )}
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
