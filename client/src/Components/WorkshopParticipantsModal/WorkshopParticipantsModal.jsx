import React, { useEffect, useState, useCallback } from "react";
import { useWorkshops } from "../../layouts/WorkshopContext";

/**
 * WorkshopParticipantsModal.jsx — Debug Edition
 * ---------------------------------------------
 * Same logic, only added console logs for every important step:
 * - Fetch participants
 * - Edit / save / add / remove family
 * - Close modal & refetch behavior
 */

export default function WorkshopParticipantsModal({ workshop, onClose }) {
  const { registerFamilyMember, unregisterFamilyMember, fetchWorkshops } = useWorkshops();

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
    console.log("🔄 [Modal] Fetching all data for workshop:", workshop?._id, workshop?.title);
    if (!workshop?._id) {
      console.warn("⚠️ [Modal] No workshop ID provided — skipping fetch");
      return;
    }
    setLoading(true);
    setMessage(null);
    try {
      const token = localStorage.getItem("token");
      console.log("🔑 [Modal] Token exists:", !!token);

      const [participantsRes, familyRes] = await Promise.all([
        fetch(`/api/workshops/${workshop._id}/participants`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
        fetch(`/api/users/me`, {
          headers: { Authorization: `Bearer ${token}` },
        }),
      ]);

      console.log("📡 [Modal] Participants status:", participantsRes.status, "Family status:", familyRes.status);

      const [participantsData, familyData] = await Promise.all([
        participantsRes.json(),
        familyRes.json(),
      ]);

      console.log("📦 [Modal] Participants data:", participantsData);
      console.log("📦 [Modal] Family data:", familyData);

      if (!participantsRes.ok)
        throw new Error(participantsData.message || "שגיאה בטעינת משתתפים");
      if (!familyRes.ok)
        throw new Error(familyData.message || "שגיאה בטעינת בני משפחה");

      let merged = [];

// אם זה כבר מערך ישיר
if (Array.isArray(participantsData)) {
  merged = participantsData;
} else {
  merged = [
    ...(participantsData.participants || []),
    ...(participantsData.familyRegistrations || []).map((f) => ({
      ...f,
      isFamily: true,
    })),
  ];
}

console.log("✅ [Modal] Merged participants count:", merged.length);
console.log("👀 [Modal] Merged data:", merged);

      setParticipants(merged);
      setFamilyMembers(familyData.familyMembers || []);
    } catch (err) {
      console.error("❌ [Modal] Fetch error:", err);
      setMessage(`❌ ${err.message}`);
    } finally {
      setLoading(false);
    }
  }, [workshop?._id]);

  /** 🔁 Load once + after changes */
  useEffect(() => {
    console.log("🧭 [Modal] useEffect triggered for fetchAll()");
    fetchAll();
  }, [fetchAll]);

  /** 🔹 Edit toggle & change handlers */
  const handleEditToggle = (user) => {
    console.log("✏️ [Modal] Toggle edit mode for user:", user.name, user._id);
    if (editingUserId === user._id) {
      console.log("↩️ [Modal] Closing edit mode");
      setEditingUserId(null);
      setEditForm({});
    } else {
      console.log("📝 [Modal] Opening edit mode");
      setEditingUserId(user._id);
      setEditForm({ ...user });
    }
  };

  const handleChange = (key, value) => {
    console.log("⌨️ [Modal] Edit field changed:", key, "=", value);
    setEditForm((prev) => ({ ...prev, [key]: value }));
  };

  /** 🔹 Save user edits */
  const handleSaveUser = async () => {
    console.log("💾 [Modal] Saving edited user:", editingUserId, editForm);
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
      console.log("📡 [Modal] PUT /users status:", res.status);
      const data = await res.json();
      console.log("📦 [Modal] Save response:", data);
      if (!res.ok) throw new Error(data.message || "שגיאה בעדכון המשתמש");

      setMessage("✅ המשתמש עודכן בהצלחה");
      setEditingUserId(null);
      setEditForm({});
      await fetchAll();
    } catch (err) {
      console.error("❌ [Modal] Save user error:", err);
      setMessage(`❌ ${err.message}`);
    } finally {
      setSaving(false);
    }
  };

  /** 🔹 Add family member */
  const handleAddFamily = async () => {
    console.log("➕ [Modal] Add family clicked. Selected:", selectedFamilyId);
    if (!selectedFamilyId) {
      console.warn("⚠️ [Modal] No family selected");
      return setMessage("⚠️ בחר בן משפחה להוספה");
    }
    try {
      await registerFamilyMember(workshop._id, selectedFamilyId);
      console.log("✅ [Modal] Family member added successfully!");
      setMessage("✅ בן המשפחה נרשם בהצלחה!");
      setSelectedFamilyId("");
      await fetchAll();
      await fetchWorkshops();
    } catch (err) {
      console.error("❌ [Modal] Error adding family:", err);
      setMessage("❌ שגיאה בהרשמת בן משפחה");
    }
  };

  /** 🔹 Remove family */
  const handleRemoveFamily = async (familyId) => {
    console.log("🚫 [Modal] Remove family clicked:", familyId);
    try {
      await unregisterFamilyMember(workshop._id, familyId);
      console.log("✅ [Modal] Family member removed successfully");
      setMessage("🚫 בן המשפחה הוסר בהצלחה");
      await fetchAll();
      await fetchWorkshops();
    } catch (err) {
      console.error("❌ [Modal] Error removing family:", err);
      setMessage("❌ שגיאה בהסרת בן משפחה");
    }
  };

  // ---------- Sub-render: Edit Form ----------
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
            placeholder={field === "name" ? "שם מלא" : field}
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
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-sm border border-gray-300 text-gray-700 hover:bg-gray-100"
        >
          ביטול
        </button>
        <button
          onClick={handleSaveUser}
          disabled={saving}
          className="px-4 py-1.5 rounded-lg text-sm bg-green-600 text-white hover:bg-green-700"
        >
          {saving ? "שומר..." : "שמור"}
        </button>
      </div>
    </div>
  );

  // ---------- Sub-render: Participant Card ----------
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
        {p.isFamily && (
          <button
            onClick={() => handleRemoveFamily(p.familyMemberId || p._id)}
            className="text-red-600 hover:underline text-xs"
          >
            הסר בן משפחה
          </button>
        )}
      </div>
    </div>
  );

  // ---------- JSX ----------
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={() => {
        console.log("❎ [Modal] Clicked outside — closing modal");
        onClose();
      }}
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-white shadow-2xl p-6 animate-[fadeIn_.15s_ease]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="mb-6 flex items-center justify-between">
          <h3 className="text-xl font-bold text-gray-800 font-[Poppins]">
            משתתפים בסדנה:{" "}
            <span className="text-indigo-600">{workshop.title}</span>
          </h3>
          <button
            onClick={() => {
              console.log("❎ [Modal] Close button clicked");
              onClose();
            }}
            className="rounded-lg px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
          >
            ✕ סגור
          </button>
        </div>

        {/* Family dropdown */}
        {familyMembers.length > 0 && (
          <div className="mb-6 flex gap-3 items-center">
            <select
              value={selectedFamilyId}
              onChange={(e) => {
                console.log("👨‍👩‍👧 [Modal] Selected family ID:", e.target.value);
                setSelectedFamilyId(e.target.value);
              }}
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

        {/* Feedback */}
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

        {/* Content */}
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
