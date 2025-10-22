/**
 * WorkshopParticipantsModal.jsx — Full Server-Driven Version (Final)
 * -----------------------------------------------------------------
 * ✅ מציג משתתפים ורשימת המתנה
 * ✅ מאפשר עריכה, ביטול, הוספה, וקידום מרשימת המתנה
 * ✅ מונע קידום אם אין מקום
 * ✅ משתמש אך ורק ב-apiFetch (ללא props לוגיים)
 */

import React, { useEffect, useState, useCallback } from "react";
import { apiFetch } from "../../utils/apiFetch";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useAuth } from "../../layouts/AuthLayout";
import AllProfiles from "../../pages/AllProfiles";

const calcAge = (d) => {
  if (!d) return null;
  const x = new Date(d);
  if (isNaN(x)) return null;
  const t = new Date();
  let a = t.getFullYear() - x.getFullYear();
  const m = t.getMonth() - x.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < x.getDate())) a--;
  return a;
};

/** 🔹 QuickEdit modal */
function QuickEdit({ person, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: person?.name || "",
    phone: person?.phone || "",
    city: person?.city || "",
    birthDate: person?.birthDate ? String(person.birthDate).slice(0, 10) : "",
    idNumber: person?.idNumber || "",
    relation: person?.relation || "",
  }));
  const [saving, setSaving] = useState(false);
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    try {
      setSaving(true);
      const payload = person.isFamily
        ? {
            familyId: person._id,
            parentUserId: person.parentId || person.parentUser?._id,
            updates: { ...form },
          }
        : {
            userId: person._id,
            updates: { ...form },
          };

      const res = await apiFetch("/api/users/update-entity", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "עדכון נכשל");

      onSaved?.({ _id: person._id, ...form });
      onClose?.();
    } catch (e) {
      alert("❌ שגיאה בעדכון: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-white rounded-2xl shadow-2xl p-5"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-lg font-bold text-gray-800">עריכת משתתף</h4>
          <button
            onClick={onClose}
            className="text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-1"
          >
            ✕
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {["name", "phone", "city", "birthDate", "idNumber"].map((key) => (
            <label key={key} className="flex flex-col">
              {key === "birthDate"
                ? "תאריך לידה:"
                : key === "idNumber"
                ? "ת.ז:"
                : key === "name"
                ? "שם:"
                : key === "phone"
                ? "טלפון:"
                : "עיר:"}
              <input
                type={key === "birthDate" ? "date" : "text"}
                className="mt-1 border rounded-lg px-3 py-2"
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
          {person.isFamily && (
            <label className="flex flex-col">
              קרבה:
              <input
                className="mt-1 border rounded-lg px-3 py-2"
                value={form.relation}
                onChange={(e) => update("relation", e.target.value)}
              />
            </label>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            ביטול
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 🔹 Main Modal */
export default function WorkshopParticipantsModal({ workshop, onClose }) {
  const { fetchWorkshops } = useWorkshops();
  const { refreshMe } = useAuth();

  const [participants, setParticipants] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [view, setView] = useState("participants");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [editPerson, setEditPerson] = useState(null);
  const [showProfiles, setShowProfiles] = useState(false);

  /** Load both lists */
  const fetchAll = useCallback(async () => {
    if (!workshop?._id) return;
    setLoading(true);
    try {
      const [resP, resW] = await Promise.all([
        apiFetch(`/api/workshops/${workshop._id}/participants`),
        apiFetch(`/api/workshops/${workshop._id}/waitlist`),
      ]);
      const [dataP, dataW] = await Promise.all([resP.json(), resW.json()]);
      if (!resP.ok) throw new Error(dataP.message || "שגיאה בטעינת משתתפים");
      setParticipants(Array.isArray(dataP.participants) ? dataP.participants : []);
      setWaitlist(Array.isArray(dataW) ? dataW : []);
    } catch (e) {
      console.error("❌ fetchAll:", e);
      setMessage("❌ " + e.message);
    } finally {
      setLoading(false);
    }
  }, [workshop?._id]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Remove entity */
  const handleUnregister = async (person, fromWaitlist = false) => {
    if (!window.confirm("לבטל הרשמה למשתתף זה?")) return;
    try {
      const payload = person.isFamily ? { familyId: person._id } : {};
      const endpoint = fromWaitlist
        ? `/api/workshops/${workshop._id}/waitlist-entity`
        : `/api/workshops/${workshop._id}/unregister-entity`;
      const res = await apiFetch(endpoint, {
        method: "DELETE",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה בביטול");
      setMessage("🚫 בוטל בהצלחה");
      await fetchAll();
      await fetchWorkshops();
    } catch (e) {
      alert("❌ " + e.message);
    }
  };

  /** Promote from waitlist → participants */
  const handlePromote = async (wl) => {
    try {
      const payload = wl.familyMemberId ? { familyId: wl.familyMemberId } : {};

      // בדיקת מקום
      const isFull =
        (workshop.participantsCount ??
          (workshop.participants?.length || 0) +
            (workshop.familyRegistrations?.length || 0)) >=
        (workshop.maxParticipants || 0);
      if (isFull) {
        alert("❌ אין מקום פנוי לקידום משתתף זה.");
        return;
      }

      // שלב 1: הסר מרשימת ההמתנה
      await apiFetch(`/api/workshops/${workshop._id}/waitlist-entity`, {
        method: "DELETE",
        body: JSON.stringify(payload),
      });

      // שלב 2: רשום לרשימת המשתתפים
      const res = await apiFetch(`/api/workshops/${workshop._id}/register-entity`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה בקידום מהרשימה");

      setMessage("✅ הועבר בהצלחה מרשימת המתנה לרשומים");
      await fetchAll();
      await fetchWorkshops();
    } catch (e) {
      alert("❌ " + e.message);
    }
  };

  /** Export */
  const handleExport = async () => {
    const type = view === "participants" ? "current" : "waitlist";
    try {
      const res = await apiFetch(`/api/workshops/${workshop._id}/export?type=${type}`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה ביצוא דו\"ח");
      alert("📤 דו\"ח נשלח למייל שלך!");
    } catch (e) {
      alert("❌ " + e.message);
    }
  };

  /** Render waitlist item */
 const renderWaitlistItem = (wl) => {
  const age = calcAge(wl.birthDate);

  const isFull =
    (workshop.participantsCount ??
      (workshop.participants?.length || 0) +
        (workshop.familyRegistrations?.length || 0)) >=
    (workshop.maxParticipants || 0);

  // 🧩 הגדרת ערכי fallback מהאב
  const phone = wl.phone || wl.parentUser?.phone || "-";
  const email = wl.email || wl.parentUser?.email || "-";
  const city = wl.city || wl.parentUser?.city || "-";

  return (
    <div
      key={wl._id}
      className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition"
    >
      <div className="flex justify-between items-center mb-2">
        <h4 className="text-lg font-semibold text-gray-800">{wl.name}</h4>
        <div className="flex gap-3 text-xs">
          {!isFull && (
            <button
              onClick={() => handlePromote(wl)}
              className="text-green-600 hover:underline"
            >
              קדם לרשימה
            </button>
          )}
          <button
            onClick={() => handleUnregister(wl, true)}
            className="text-red-600 hover:underline"
          >
            בטל המתנה
          </button>
        </div>
      </div>

      <p className="text-sm text-gray-600">{email}</p>

      <div className="text-xs text-gray-500 mt-1 space-y-0.5">
        <p>טלפון: {phone}</p>
        <p>עיר: {city}</p>
        <p>
          תאריך לידה:{" "}
          {wl.birthDate ? new Date(wl.birthDate).toLocaleDateString("he-IL") : "-"}{" "}
          {typeof age === "number" && <>— גיל: {age}</>}
        </p>
        <p>ת.ז: {wl.idNumber || "-"}</p>
        {wl.relation && <p>קרבה: {wl.relation}</p>}
      </div>
    </div>
  );
};


  const renderParticipant = (p) => {
    const age = calcAge(p.birthDate);
    return (
      <div
        key={p._id}
        className="border border-gray-200 rounded-xl p-4 bg-white shadow-sm hover:shadow-md transition"
      >
        <div className="flex justify-between items-start gap-3">
          <h4 className="text-lg font-semibold text-gray-800">{p.name}</h4>
          <button
            onClick={() => setEditPerson(p)}
            className="text-indigo-600 hover:underline text-xs"
          >
            ערוך
          </button>
        </div>
        <p className="text-sm text-gray-600">{p.email || "-"}</p>
        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
          <p>טלפון: {p.phone || "-"}</p>
          <p>עיר: {p.city || "-"}</p>
          <p>
            תאריך לידה:{" "}
            {p.birthDate ? new Date(p.birthDate).toLocaleDateString("he-IL") : "-"}{" "}
            {typeof age === "number" && <>— גיל: {age}</>}
          </p>
          <p>ת.ז: {p.idNumber || "-"}</p>
        </div>
        <div className="flex justify-end mt-3">
          <button
            onClick={() => handleUnregister(p)}
            className="text-red-600 hover:underline text-xs"
          >
            בטל הרשמה
          </button>
        </div>
      </div>
    );
  };

  const handleClose = async () => {
    await fetchWorkshops();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/50 p-4 flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-5xl rounded-2xl bg-white shadow-2xl p-6 overflow-y-auto max-h-[90vh]"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between mb-6 gap-2">
          <h3 className="text-xl font-bold text-gray-800">
            {view === "participants" ? "משתתפים בסדנה" : "רשימת המתנה"}:{" "}
            <span className="text-indigo-600">{workshop.title}</span>
          </h3>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              onClick={() => setView("participants")}
              className={`px-3 py-1 rounded-lg text-sm ${
                view === "participants"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              משתתפים
            </button>
            <button
              onClick={() => setView("waitlist")}
              className={`px-3 py-1 rounded-lg text-sm ${
                view === "waitlist"
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-100 text-gray-700"
              }`}
            >
              המתנה
            </button>
            <button
              onClick={handleExport}
              className="px-3 py-1 rounded-lg bg-green-600 text-white text-sm hover:bg-green-700"
            >
              📤 יצוא
            </button>
            <button
              onClick={() => setShowProfiles((s) => !s)}
              className={`px-3 py-1 rounded-lg text-sm font-medium transition ${
                showProfiles ? "bg-red-600 text-white" : "bg-indigo-600 text-white"
              }`}
            >
              {showProfiles ? "❌ סגור רשימת משתמשים" : "➕ הוסף משתתף"}
            </button>
            <button
              onClick={handleClose}
              className="rounded-lg px-3 py-1 text-sm text-gray-600 hover:bg-gray-100"
            >
              ✕ סגור
            </button>
          </div>
        </div>

        {showProfiles && (
          <div className="border border-indigo-100 rounded-xl bg-indigo-50/30 mb-6 p-4">
            <AllProfiles
              mode="select"
              onSelectUser={async (p) => {
                try {
                  const payload = p.isFamily ? { familyId: p._id } : {};
                  const res = await apiFetch(
                    `/api/workshops/${workshop._id}/register-entity`,
                    {
                      method: "POST",
                      body: JSON.stringify(payload),
                    }
                  );
                  const data = await res.json();
                  if (!res.ok) throw new Error(data.message || "שגיאה בהרשמה");
                  setShowProfiles(false);
                  await fetchAll();
                  await fetchWorkshops();
                  alert("✅ נוסף בהצלחה!");
                } catch (e) {
                  alert("❌ " + e.message);
                }
              }}
              existingIds={participants.map((p) => p._id)}
            />
          </div>
        )}

        {message && (
          <p
            className={`mb-3 text-sm ${
              message.startsWith("❌")
                ? "text-red-600"
                : message.startsWith("✅")
                ? "text-green-600"
                : "text-gray-600"
            }`}
          >
            {message}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-gray-600">⏳ טוען נתונים...</p>
        ) : view === "participants" ? (
          participants.length ? (
            <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
              {participants.map(renderParticipant)}
            </div>
          ) : (
            <p className="text-center text-gray-500">אין משתתפים רשומים.</p>
          )
        ) : waitlist.length ? (
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2">
            {waitlist.map(renderWaitlistItem)}
          </div>
        ) : (
          <p className="text-center text-gray-500">אין רשימת המתנה.</p>
        )}
      </div>

      {editPerson && (
        <QuickEdit
          person={editPerson}
          onClose={() => setEditPerson(null)}
          onSaved={async () => {
            await refreshMe();
            await fetchAll();
          }}
        />
      )}
    </div>
  );
}
