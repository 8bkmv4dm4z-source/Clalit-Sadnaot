/**
 * EditProfile.jsx — Unified User & Family Editor
 * ----------------------------------------------
 * - Edits both users and family members
 * - Works with updateEntity() (server-side unified endpoint)
 * - Admins can edit any user
 */

import React, { useEffect, useState, useMemo } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { apiFetch } from "../../utils/apiFetch";
import {
  useAdminCapability,
  useAdminCapabilityStatus,
} from "../../context/AdminCapabilityContext";

const calcAge = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
};

export default function EditProfile() {
  const { id } = useParams(); // ID יכול להיות user או family
  const navigate = useNavigate();
  const { updateEntity } = useAuth();
  const canAccessAdmin = useAdminCapability();
  const { isChecking } = useAdminCapabilityStatus();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingFamilyId, setEditingFamilyId] = useState(null);
  const [familyForm, setFamilyForm] = useState({});
  const [addingFamily, setAddingFamily] = useState(false);

  /* 🟢 Fetch profile by ID (via apiFetch) */
  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiFetch(`/api/users/${id}`);
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

  const isFamilyProfile = !!form?.parentId;
  const age = useMemo(() => calcAge(form?.birthDate), [form?.birthDate]);

  /* 🟢 Save profile via updateEntity */
  const handleSave = async () => {
    try {
      setSaving(true);

      const entityKey = form?.entityKey || form?._id;
    const payload = isFamilyProfile
      ? {
          entityKey,
          updates: {
            name: form.name,
            relation: form.relation || "",
            idNumber: form.idNumber || "",
            phone: form.phone || "",
            email: form.email || form.parentEmail || "", // ✅ fallback to parent
            birthDate: form.birthDate || "",
            city: form.city || "",
          },
        }
        : {
            entityKey,
            updates: {
              name: form.name,
              idNumber: form.idNumber || "",
              phone: form.phone || "",
              city: form.city || "",
              birthDate: form.birthDate || "",
              ...(canAccessAdmin ? { canCharge: !!form.canCharge } : {}),
            },
          };

      const result = await updateEntity(payload);
      if (!result?.success) throw new Error(result?.message || "Update failed");

      alert("✅ הנתונים עודכנו בהצלחה!");
      navigate("/profiles");
    } catch (err) {
      alert("❌ שגיאה בעדכון המשתמש: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  /* 🧩 Handle family edits locally (before saving full list) */
  const handleFamilyChange = (key, value) =>
    setFamilyForm((prev) => ({ ...prev, [key]: value }));

  const saveFamilyMember = async () => {
    try {
      setSaving(true);

      if (addingFamily) {
        throw new Error("הוספת בני משפחה חדשים דורשת יצירת entityKey מהשרת");
      }

      const familyKey = editingFamilyId || familyForm.entityKey || familyForm._id;
      if (!familyKey) {
        throw new Error("חסר entityKey עבור בן המשפחה");
      }

      const payload = {
        entityKey: familyKey,
        updates: {
          ...familyForm,
          email: familyForm.email || form.email || "", // ✅ fallback for edit
        },
      };

      const result = await updateEntity(payload);
      if (!result?.success) throw new Error(result?.message || "Update failed");

      // refresh local form from server (via apiFetch)
      const res = await apiFetch(`/api/users/${form._id}`);
      const refreshed = await res.json();
      if (!res.ok) throw new Error(refreshed.message || "Failed to refresh user");
      setForm(refreshed);

      setEditingFamilyId(null);
      setFamilyForm({});
      setAddingFamily(false);
      alert("✅ בן המשפחה נשמר בהצלחה!");
    } catch (err) {
      alert("❌ שגיאה: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const startEditFamily = (f) => {
    setEditingFamilyId(f.entityKey || f._id);
    setFamilyForm({ ...f });
    setAddingFamily(false);
  };

  const startAddFamily = () => {
    setEditingFamilyId(null);
    setFamilyForm({
      name: "",
      relation: "",
      idNumber: "",
      phone: "",
      email: form?.email || "", // ✅ default to parent email
      birthDate: "",
      city: "",
    });
    setAddingFamily(true);
  };

  const cancelFamilyEdit = () => {
    setEditingFamilyId(null);
    setAddingFamily(false);
    setFamilyForm({});
  };

  /* ==================== UI ==================== */
  if (isChecking)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 animate-pulse">
        ⏳ בודק הרשאות...
      </div>
    );

  if (!canAccessAdmin)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600">
        ⛔ אין לך הרשאה לערוך משתמשים.
      </div>
    );

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

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 px-4"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 animate-subtle-fade">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center font-[Poppins]">
          {isFamilyProfile ? "עריכת בן משפחה" : "עריכת פרופיל משתמש"}
        </h2>

        {/* --- Main User/Family Fields --- */}
        <div className="space-y-4">
          <label className="block">
            <span className="text-gray-700 font-medium">שם מלא:</span>
            <input
              value={form.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="input mt-1"
            />
          </label>

          {!isFamilyProfile ? (
            <label className="block">
              <span className="text-gray-700 font-medium">אימייל:</span>
              <input
                type="email"
                value={form.email || ""}
                disabled
                className="input mt-1 bg-gray-100 cursor-not-allowed"
              />
            </label>
          ) : (
            <label className="block">
              <span className="text-gray-700 font-medium">אימייל (לא חובה):</span>
              <input
                type="email"
                value={form.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
                className="input mt-1"
              />
            </label>
          )}

          <label className="block">
            <span className="text-gray-700 font-medium">תאריך לידה:</span>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={form.birthDate?.split("T")[0] || ""}
                onChange={(e) => handleChange("birthDate", e.target.value)}
                className="input mt-1"
              />
              <span className="text-sm text-gray-600">גיל: {age ?? "-"}</span>
            </div>
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

          {/* Extra fields for family */}
          {isFamilyProfile && (
            <>
              <label className="block">
                <span className="text-gray-700 font-medium">קשר משפחתי (לא חובה):</span>
                <input
                  value={form.relation || ""}
                  onChange={(e) => handleChange("relation", e.target.value)}
                  className="input mt-1"
                />
              </label>

              <label className="block">
                <span className="text-gray-700 font-medium">ת.ז:</span>
                <input
                  value={form.idNumber || ""}
                  onChange={(e) => handleChange("idNumber", e.target.value)}
                  className="input mt-1"
                />
              </label>
            </>
          )}

          {/* Admin-only for main user */}
          {canAccessAdmin && !isFamilyProfile && (
            <>
              <label className="flex items-center gap-3 text-gray-700 font-medium">
                <input
                  type="checkbox"
                  checked={!!form.canCharge}
                  onChange={(e) => handleChange("canCharge", e.target.checked)}
                  className="w-5 h-5 accent-indigo-600"
                />
                הרשאה לגבייה
              </label>
            </>
          )}
        </div>

        {/* --- Family Section (for main user) --- */}
        {!isFamilyProfile && (
          <div className="mt-8 border-t pt-6">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              בני משפחה
            </h3>

            {(form.familyMembers || []).length > 0 ? (
              <div className="space-y-3">
                {form.familyMembers.map((f) => (
                  <div
                    key={f._id}
                    className="flex justify-between items-center bg-gray-50 border border-gray-200 rounded-lg px-4 py-2"
                  >
                    <div>
                      <p className="font-medium text-gray-800">
                        {f.name} ({f.relation || "—"})
                      </p>
                      <p className="text-xs text-gray-600">
                        ת.ז {f.idNumber || "-"} | {f.phone || "-"} | גיל: {calcAge(f.birthDate) ?? "-"}
                      </p>
                      <p className="text-xs text-gray-500">
                        אימייל: {f.email || form.email || "-"}
                      </p>
                    </div>
                    <button
                      onClick={() => startEditFamily(f)}
                      className="text-indigo-600 hover:underline text-sm"
                    >
                      ערוך
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-500">אין בני משפחה רשומים</p>
            )}

            <button
              onClick={startAddFamily}
              className="mt-4 bg-green-600 hover:bg-green-700 text-white text-sm px-4 py-2 rounded-lg transition"
            >
              ➕ הוסף בן משפחה חדש
            </button>

            {(editingFamilyId || addingFamily) && (
              <div className="mt-6 p-4 border rounded-lg bg-gray-50">
                <h4 className="font-semibold text-gray-800 mb-2">
                  {addingFamily ? "הוספת בן משפחה" : "עריכת בן משפחה"}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    ["name", "שם מלא"],
                    ["relation", "קשר משפחתי (לא חובה)"],
                    ["idNumber", "ת.ז"],
                    ["phone", "טלפון"],
                    ["email", "אימייל (לא חובה)"], // ✅ included
                    ["birthDate", "תאריך לידה"],
                    ["city", "עיר"],
                  ].map(([key, label]) => (
                    <label key={key} className="text-sm">
                      <span className="text-gray-700">{label}:</span>
                      <input
                        type={key === "birthDate" ? "date" : key === "email" ? "email" : "text"}
                        value={familyForm[key] || ""}
                        onChange={(e) => handleFamilyChange(key, e.target.value)}
                        className="border rounded-lg px-3 py-2 w-full mt-1"
                      />
                    </label>
                  ))}
                </div>
                <div className="flex justify-end gap-2 mt-4">
                  <button
                    onClick={cancelFamilyEdit}
                    className="px-4 py-1.5 border rounded-lg text-sm"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={saveFamilyMember}
                    disabled={saving}
                    className="px-4 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700"
                  >
                    {saving ? "שומר..." : "שמור"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

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
