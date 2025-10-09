import React, { useEffect, useState, useCallback } from "react";
import { useWorkshops } from "../../layouts/WorkshopContext";

/**
 * WorkshopParticipantsModal.jsx — Unified Logic Edition
 * ----------------------------------------------------
 * Uses the same unified functions as WorkshopCard:
 * - registerEntityToWorkshop
 * - unregisterEntityFromWorkshop
 * for both users and family members.
 */

export default function WorkshopParticipantsModal({ workshop, onClose }) {
  const {
    registerEntityToWorkshop,
    unregisterEntityFromWorkshop,
    fetchWorkshops,
  } = useWorkshops();

  const [participants, setParticipants] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [editingUserId, setEditingUserId] = useState(null);
  const [editForm, setEditForm] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  /** 🔹 Fetch all modal data */
  const fetchAll = useCallback(async () => {
    if (!workshop?._id) return;
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem("token");

      const [participantsRes, familyRes] = await Promise.all([
        fetch(`/api/workshops/${workshop._id}/participants`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      const [participantsData, familyData] = await Promise.all([
        participantsRes.json(),
        familyRes.json(),
      ]);

      if (!participantsRes.ok)
        throw new Error(participantsData.message || "שגיאה בטעינת משתתפים");
      if (!familyRes.ok)
        throw new Error(familyData.message || "שגיאה בטעינת בני משפחה");

      let merged = Array.isArray(participantsData)
        ? participantsData
        : [
            ...(participantsData.participants || []),
            ...(participantsData.familyRegistrations || []).map((f) => ({
              ...f,
              isFamily: true,
            })),
          ];

      setParticipants(merged);
      setFamilyMembers(familyData.familyMembers || []);
    } catch (err) {
      console.error("❌ [Modal] Fetch error:", err);
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [workshop?._id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** 🔹 Save edits (unchanged) */
  const handleEditToggle = (user) => {
    if (editingUserId === user._id) {
      setEditingUserId(null);
      setEditForm({});
    } else {
      setEditingUserId(user._id);
      setEditForm({ ...user });
    }
  };

  const handleChange = (key, value) => {
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSaveUser = async () => {
    try {
      setSaving(true);
      const token = localStorage.getItem("token");
      const res = await fetch(`/api/users/${editingUserId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה בעדכון המשתמש");

      setMessage("✅ המשתמש עודכן בהצלחה");
      setEditingUserId(null);
      setEditForm({});
      await fetchAll();
    } catch (err) {
      setMessage(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  /** 🔹 Add / Remove family (Unified) */
  const handleAddFamily = async () => {
    if (!selectedFamilyId) return setMessage("⚠️ בחר בן משפחה להוספה");
    try {
      const result = await registerEntityToWorkshop(
        workshop._id,
        selectedFamilyId
      );
      if (result.success) {
        setMessage("✅ בן המשפחה נרשם בהצלחה!");
        setSelectedFamilyId("");
        await fetchAll();
        await fetchWorkshops();
      } else {
        setMessage(result.message || "❌ שגיאה בהרשמת בן משפחה");
      }
    } catch (err) {
      console.error("❌ handleAddFamily error:", err);
      setMessage("❌ שגיאה בהרשמת בן משפחה");
    }
  };

  const handleRemoveFamily = async (familyId) => {
    try {
      const result = await unregisterEntityFromWorkshop(
        workshop._id,
        familyId
      );
      if (result.success) {
        setMessage("🚫 בן המשפחה הוסר בהצלחה");
        await fetchAll();
        await fetchWorkshops();
      } else {
        setMessage(result.message || "❌ שגיאה בהסרת בן משפחה");
      }
    } catch (err) {
      console.error("❌ handleRemoveFamily error:", err);
      setMessage("❌ שגיאה בהסרת בן משפחה");
    }
  };

  // ---------- Sub-render ----------
  const renderEditForm = (p) => (
    <div key={p._id} className="border border-gray-200 rounded-xl p-4 bg-gray-50 shadow-sm">
      <h4 className="text-lg font-semibold text-gray-800 mb-2">עריכת {p.name}</h4>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {["name", "email", "city", "phone"].map((field) => (
          <input
            key={field}
            className="border rounded-lg px-2 py-1 text-sm"
            value={editForm[field] || ""}
            onChange={(e) => handleChange(field, e.target.value)}
          />
        ))}
        <input
          type="date"
          className="border rounded-lg px-2 py-1 text-sm"
          value={editForm.birthDate?.split("T")[0] || ""}
          onChange={(e) => handleChange("birthDate", e.target.value)}
        />
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={!!editForm.canCharge}
            onChange={(e) => handleChange("canCharge", e.target.checked)}
            className="w-4 h-4 accent-indigo-500"
          />
          הרשאה לגבייה
        </label>
      </div>
      <div className="flex justify-end gap-2 mt-4">
        <button
          onClick={() => handleEditToggle(p)}
          className="px-4 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          ביטול
        </button>
        <button
          onClick={handleSaveUser}
          className="px-4 py-1.5 rounded-lg text-sm bg-green-600 text-white hover:bg-green-700"
        >
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );

  const renderParticipant = (p) => (
    <div
      key={p._id || p.familyMemberId}
      className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition"
    >
      <h4 className="text-lg font-semibold text-gray-800">
        {p.name}{" "}
        {p.isFamily && (
          <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
            בן משפחה
          </span>
        )}
      </h4>
      <p className="text-sm text-gray-600">{p.email}</p>
      <div className="text-xs text-gray-500 mt-1">
        
        <p>תעודת זהות: {p.idNumber || "-"}</p>

        <p>טלפון: {p.phone || "-"}</p>
        <p>עיר: {p.city || "-"}</p>
        <p>
          תאריך לידה:{" "}
          {p.birthDate ? new Date(p.birthDate).toLocaleDateString("he-IL") : "-"}
        </p>
        <p>
          גבייה:{" "}
          <span
            className={`font-bold ${
              p.canCharge ? "text-green-600" : "text-red-500"
            }`}
          >
            {p.canCharge ? "✅ כן" : "🚫 לא"}
          </span>
        </p>
      </div>
      <div className="flex justify-between items-center mt-3">
        <button
          onClick={() => handleEditToggle(p)}
          className="px-3 py-1.5 text-sm rounded-lg bg-indigo-600 text-white hover:bg-indigo-700"
        >
          ערוך
        </button>
        {p.isFamily ? (
  <button
    onClick={() => handleRemoveFamily(p.familyMemberId || p._id)}
    className="text-red-600 hover:underline text-xs"
  >
    הסר בן משפחה
  </button>
) : (
  <button
    onClick={() => handleRemoveFamily(null)}
    className="text-red-600 hover:underline text-xs"
  >
    בטל הרשמה
  </button>
)}
      </div>
    </div>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl p-6 animate-[fadeIn_.15s_ease]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800">
            משתתפים בסדנה:{" "}
            <span className="text-indigo-600">{workshop.title}</span>
          </h3>
          <button
            onClick={onClose}
            className="rounded-lg px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            ✕ סגור
          </button>
        </div>

        {familyMembers.length > 0 && (
          <div className="mb-6 flex gap-3 items-center">
            <select
              value={selectedFamilyId}
              onChange={(e) => setSelectedFamilyId(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">בחר בן משפחה להוספה...</option>
              {familyMembers
                .filter(
                  (f) =>
                    !participants.some(
                      (p) => p.familyMemberId === f._id || p._id === f._id
                    )
                )
                .map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} ({f.relation})
                  </option>
                ))}
            </select>
            <button
              onClick={handleAddFamily}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              ➕ הוסף לסדנה
            </button>
          </div>
        )}

        {message && (
          <p
            className={`mb-3 text-sm font-medium ${
              message.startsWith("✅") || message.startsWith("🚫")
                ? "text-green-600"
                : message.startsWith("⚠️")
                ? "text-amber-600"
                : "text-red-600"
            }`}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-gray-600">⏳ טוען משתתפים...</p>
        ) : participants.length > 0 ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {participants.map((p) =>
              editingUserId === p._id ? renderEditForm(p) : renderParticipant(p)
            )}
          </div>
        ) : (
          <p className="text-center text-gray-500">אין משתתפים רשומים עדיין.</p>
        )}
      </div>
    </div>
  );
}
