import React, { useState } from "react";

export default function FamilyEditorModal({ user, onClose, onSave }) {
  const token = localStorage.getItem("token");
  const [list, setList] = useState(user.familyMembers || []);
  const [saving, setSaving] = useState(false);

  const updateField = (idx, key, value) => {
    setList((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  const addMember = () => {
    setList((prev) => [
      ...prev,
      {
        name: "",
        relation: "",
        idNumber: "",
        phone: "",
        email: user.email || "", // ✅ default to parent email
        birthDate: "",
        city: "",
      },
    ]);
  };

  const removeMember = (idx) => {
    setList((prev) => prev.filter((_, i) => i !== idx));
  };

  const saveAll = async () => {
    try {
      setSaving(true);

      const normalized = list.map((m) => ({
        ...m,
        email: m.email || user.email || "", // ✅ fallback
      }));

      const res = await fetch("/api/users/update-entity", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          userId: user._id,
          updates: { familyMembers: normalized },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Update failed");
      onSave?.(normalized);
      try { window.dispatchEvent(new Event('entity-updated')); } catch(e) {}
      onClose?.();
    } catch (e) {
      alert("❌ שגיאה בשמירת בני משפחה: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">ניהול בני משפחה</h3>
          <button
            onClick={onClose}
            className="text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-1"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {list.map((m, idx) => (
            <div
              key={m._id || idx}
              className="border border-gray-200 rounded-xl p-4 bg-gray-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="שם"
                  value={m.name || ""}
                  onChange={(e) => updateField(idx, "name", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="קשר"
                  value={m.relation || ""}
                  onChange={(e) => updateField(idx, "relation", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="ת״ז"
                  value={m.idNumber || ""}
                  onChange={(e) => updateField(idx, "idNumber", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="טלפון"
                  value={m.phone || ""}
                  onChange={(e) => updateField(idx, "phone", e.target.value)}
                />
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2"
                  value={(m.birthDate || "").split("T")[0] || ""}
                  onChange={(e) => updateField(idx, "birthDate", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="אימייל (לא חובה)"
                  value={m.email || ""}
                  onChange={(e) => updateField(idx, "email", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="עיר"
                  value={m.city || ""}
                  onChange={(e) => updateField(idx, "city", e.target.value)}
                />
              </div>
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => removeMember(idx)}
                  className="text-red-600 text-sm hover:underline"
                >
                  מחק
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addMember}
            className="w-full py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium"
          >
            ➕ הוסף בן משפחה
          </button>
        </div>

        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            ביטול
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}
