/**
 * EditProfile.jsx — Unified User & Family Editor
 * ----------------------------------------------
 * - Edits both users and family members
 * - Shows family list for main users
 * - Updates via PUT /api/users/:id
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function EditProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { isAdmin, user } = useAuth();

  const [form, setForm] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [editingFamilyId, setEditingFamilyId] = useState(null);
  const [familyForm, setFamilyForm] = useState({});
  const [addingFamily, setAddingFamily] = useState(false);

  /* 🟢 Fetch profile by ID */
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

  /* 🟢 Save profile */
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

  /* 🧩 Handle family edits */
  const handleFamilyChange = (key, value) =>
    setFamilyForm((prev) => ({ ...prev, [key]: value }));

  const saveFamilyMember = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      const updated = { ...form };

      if (addingFamily) {
        updated.familyMembers = [
          ...(updated.familyMembers || []),
          { ...familyForm },
        ];
      } else {
        updated.familyMembers = (updated.familyMembers || []).map((f) =>
          f._id === editingFamilyId ? { ...f, ...familyForm } : f
        );
      }

      const res = await fetch(`/api/users/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(updated),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Family update failed");
      setForm(data.user || updated);
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
    setEditingFamilyId(f._id);
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
      birthDate: "",
    });
    setAddingFamily(true);
  };

  const cancelFamilyEdit = () => {
    setEditingFamilyId(null);
    setAddingFamily(false);
    setFamilyForm({});
  };

  /* ==================== UI ==================== */
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

  const isFamilyProfile = !!form.parentId; // אם זה בן משפחה בפני עצמו

  return (
    <div
      dir="rtl"
      className="min-h-screen flex items-center justify-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 px-4"
    >
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-xl p-8 animate-subtle-fade">
        <h2 className="text-3xl font-bold text-gray-900 mb-6 text-center font-[Poppins]">
          {isFamilyProfile ? "עריכת בן משפחה" : "עריכת פרופיל משתמש"}
        </h2>

        {/* --- Main User Fields --- */}
        <div className="space-y-4">
          <label className="block">
            <span className="text-gray-700 font-medium">שם מלא:</span>
            <input
              value={form.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
              className="input mt-1"
            />
          </label>

          {!isFamilyProfile && (
            <>
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
            </>
          )}

          <label className="block">
            <span className="text-gray-700 font-medium">תאריך לידה:</span>
            <input
              type="date"
              value={form.birthDate?.split("T")[0] || ""}
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

          {/* Extra fields for family */}
          {isFamilyProfile && (
            <>
              <label className="block">
                <span className="text-gray-700 font-medium">קשר משפחתי:</span>
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

          {isAdmin && !isFamilyProfile && (
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

        {/* --- Family Section --- */}
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
                        {f.name} ({f.relation})
                      </p>
                      <p className="text-xs text-gray-600">
                        ת.ז {f.idNumber || "-"} | {f.phone || "-"}
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
                  {["name", "relation", "idNumber", "phone", "birthDate"].map(
                    (key) => (
                      <input
                        key={key}
                        type={key === "birthDate" ? "date" : "text"}
                        placeholder={key}
                        value={familyForm[key] || ""}
                        onChange={(e) =>
                          handleFamilyChange(key, e.target.value)
                        }
                        className="border rounded-lg px-3 py-2 text-sm"
                      />
                    )
                  )}
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
