import React, { useEffect, useState, useCallback } from "react";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useAuth } from "../../layouts/AuthLayout";

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

export default function WorkshopParticipantsModal({ workshop, onClose }) {
  const { registerEntityToWorkshop, unregisterEntityFromWorkshop, fetchWorkshops } = useWorkshops();
  const { user, refreshMe } = useAuth();

  const [participants, setParticipants] = useState([]);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);

  /** 🧩 Fetch participants and family from server */
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
        fetch(`/api/users/me`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      const [participantsData, familyData] = await Promise.all([
        participantsRes.json(),
        familyRes.json(),
      ]);

      if (!participantsRes.ok)
        throw new Error(participantsData.message || "שגיאה בטעינת משתתפים");
      if (!familyRes.ok)
        throw new Error(familyData.message || "שגיאה בטעינת בני משפחה");

      const merged = [
        ...(participantsData.participants || []),
        ...(participantsData.familyRegistrations || []).map((f) => ({
          ...f,
          isFamily: true,
          _id: f._id ?? f.familyMemberId,
          parentEmail: f.parentEmail,
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

  /** ✅ Close modal and refresh workshop grid */
  const handleCloseModal = async () => {
    await fetchWorkshops(); // refresh main grid after close
    onClose();
  };

  /** ✅ Add family member */
  const handleAddFamily = async () => {
    if (!selectedFamilyId) return setMessage("⚠️ בחר בן משפחה להוספה");
    try {
      const result = await registerEntityToWorkshop(workshop._id, selectedFamilyId);
      if (result.success) {
        setMessage("✅ בן המשפחה נרשם בהצלחה!");
        setSelectedFamilyId("");
        await refreshMe();
        await fetchAll(); // re-fetch from server
      } else {
        setMessage(result.message || "❌ שגיאה בהרשמת בן משפחה");
      }
    } catch (err) {
      console.error("❌ handleAddFamily error:", err);
      setMessage("❌ שגיאה בהרשמת בן משפחה");
    }
  };

  /** ✅ Remove family member */
  const handleRemoveFamily = async (familyId) => {
    try {
      const confirmed = window.confirm("להסיר בן משפחה זה מהסדנה?");
      if (!confirmed) return;

      const result = await unregisterEntityFromWorkshop(workshop._id, familyId);
      if (result.success) {
        setMessage("🚫 בן המשפחה הוסר בהצלחה");
        await refreshMe();
        await fetchAll(); // refresh from server
      } else {
        setMessage(result.message || "❌ שגיאה בהסרת בן משפחה");
      }
    } catch (err) {
      console.error("❌ handleRemoveFamily error:", err);
      setMessage("❌ שגיאה בהסרת בן משפחה");
    }
  };

  /** ✅ Remove current user */
  const handleRemoveUser = async () => {
    try {
      const confirmed = window.confirm("להסיר את המשתמש מהסדנה?");
      if (!confirmed) return;

      const result = await unregisterEntityFromWorkshop(workshop._id);
      if (result.success) {
        setMessage("🚫 ההרשמה בוטלה בהצלחה");
        await refreshMe();
        await fetchAll(); // refresh from server
      } else {
        setMessage(result.message || "❌ שגיאה בביטול ההרשמה");
      }
    } catch (err) {
      console.error("❌ handleRemoveUser error:", err);
      setMessage("❌ שגיאה בביטול ההרשמה");
    }
  };

  /** 🧩 Participant card */
  const renderParticipant = (p) => {
    const email = p.email || p.parentEmail || "-";
    const age = calcAge(p.birthDate);
    return (
      <div
        key={p._id}
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
        <p className="text-sm text-gray-600">{email}</p>
        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
          <p>טלפון: {p.phone || "-"}</p>
          <p>עיר: {p.city || "-"}</p>
          <p>
            תאריך לידה:{" "}
            {p.birthDate ? new Date(p.birthDate).toLocaleDateString("he-IL") : "-"}
            {typeof age === "number" && <> — גיל: {age}</>}
          </p>
          <p>ת.ז: {p.idNumber || "-"}</p>
        </div>
        <div className="flex justify-between items-center mt-3">
          {p.isFamily ? (
            <button
              onClick={() => handleRemoveFamily(p._id)}
              className="text-red-600 hover:underline text-xs"
            >
              הסר בן משפחה
            </button>
          ) : (
            <button
              onClick={handleRemoveUser}
              className="text-red-600 hover:underline text-xs"
            >
              בטל הרשמה
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={handleCloseModal}
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
            onClick={handleCloseModal}
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
                      (p) => p._id === f._id || p.familyMemberId === f._id
                    )
                )
                .map((f) => (
                  <option key={f._id} value={f._id}>
                    {f.name} {f.relation ? `(${f.relation})` : ""}
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
            {participants.map(renderParticipant)}
          </div>
        ) : (
          <p className="text-center text-gray-500">
            אין משתתפים רשומים עדיין.
          </p>
        )}
      </div>
    </div>
  );
}
