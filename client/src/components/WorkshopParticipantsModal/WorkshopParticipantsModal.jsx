/**
 * WorkshopParticipantsModal.jsx — Participant & Waitlist Management
 * -----------------------------------------------------------------
 * This modal allows administrators to view and manage the participants
 * and waitlist of a specific workshop.  It leverages the
 * WorkshopContext to perform all mutating actions (register,
 * unregister, promote) so that after each operation the context
 * refetches data from the server and updates the UI.  Direct
 * apiFetch calls are only used to fetch the read-only lists of
 * participants and waitlist entries; all writes go through
 * WorkshopContext functions to enforce the invariant that the
 * client never mutates state locally.
 *
 * Features:
 * - Lists current participants and waitlist entries for the selected workshop.
 * - Allows adding existing users/family members to a workshop via
 *   the AllProfiles component.
 * - Supports unregistering participants or waitlist entries and
 *   promoting waitlisted entries into participants, with capacity
 *   checks.
 * - Provides CSV/Excel export of the lists (handled server-side).
 *
 * Data Flow:
 * - Read operations (fetching participants/waitlist) call the server
 *   directly via apiFetch.
 * - Mutations (registering, unregistering, promoting) call helper
 *   functions from WorkshopContext, which send the appropriate
 *   request to the server and trigger a refetch of global workshop
 *   data.  The modal itself then refreshes its own local lists.
 *
 * See README for more information about the overarching data flow.
 */

import React, { useEffect, useState, useCallback, useMemo } from "react";
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
  // Pull helpers from WorkshopContext.  We deliberately avoid
  // performing workshop mutations via direct apiFetch calls so that
  // the context can refetch and rebuild registration maps after each
  // change.  fetchWorkshops is still used to refresh the global
  // workshop list after operations complete.
  const {
    fetchWorkshops,
    registerEntityToWorkshop,
    unregisterEntityFromWorkshop,
    unregisterFromWaitlist,
    workshops,
  } = useWorkshops();
  const { refreshMe } = useAuth();

  const [participants, setParticipants] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [view, setView] = useState("participants");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [editPerson, setEditPerson] = useState(null);
  const [showProfiles, setShowProfiles] = useState(false);

  const workshopId = useMemo(() => String(workshop?._id ?? ""), [workshop?._id]);

  // FIXED: subscribe to WorkshopContext for live participants/waitlist metadata
  const contextWorkshop = useMemo(() => {
    if (!workshopId) return null;
    return (workshops || []).find((w) => String(w?._id) === workshopId) || null;
  }, [workshops, workshopId]);

  const activeWorkshop = useMemo(() => contextWorkshop || workshop || {}, [
    contextWorkshop,
    workshop,
  ]);

  const activeWorkshopId = useMemo(
    () => activeWorkshop?._id || workshopId,
    [activeWorkshop, workshopId]
  );

  const participantsTotal = useMemo(() => {
    if (participants.length > 0) return participants.length;
    if (typeof activeWorkshop.participantsCount === "number") {
      return activeWorkshop.participantsCount;
    }
    const direct = Array.isArray(activeWorkshop.participants)
      ? activeWorkshop.participants.length
      : 0;
    const family = Array.isArray(activeWorkshop.familyRegistrations)
      ? activeWorkshop.familyRegistrations.length
      : 0;
    return direct + family;
  }, [participants, activeWorkshop]);

  const capacityLimit = useMemo(() => {
    const max = Number(activeWorkshop.maxParticipants || 0);
    return Number.isFinite(max) ? max : 0;
  }, [activeWorkshop]);

  const waitlistLimit = useMemo(() => {
    const max = Number(activeWorkshop.waitingListMax || 0);
    return Number.isFinite(max) ? max : 0;
  }, [activeWorkshop]);

  const waitlistTotal = useMemo(() => {
    if (waitlist.length > 0) return waitlist.length;
    if (Array.isArray(activeWorkshop.waitingList)) {
      return activeWorkshop.waitingList.length;
    }
    return 0;
  }, [waitlist, activeWorkshop]);

  const isCapacityFull = useMemo(() => {
    if (!capacityLimit) return false;
    return participantsTotal >= capacityLimit;
  }, [participantsTotal, capacityLimit]);

  /** Load both lists */
  const fetchAll = useCallback(async () => {
    if (!activeWorkshopId) return;
    setLoading(true);
    try {
      const [resP, resW] = await Promise.all([
        apiFetch(`/api/workshops/${activeWorkshopId}/participants`),
        apiFetch(`/api/workshops/${activeWorkshopId}/waitlist`),
      ]);
      const [dataP, dataW] = await Promise.all([resP.json(), resW.json()]);
      if (!resP.ok) throw new Error(dataP.message || "שגיאה בטעינת משתתפים");
      if (!resW.ok) throw new Error(dataW.message || "שגיאה בטעינת רשימת המתנה");
      setParticipants(Array.isArray(dataP.participants) ? dataP.participants : []);

      // 🐛 server returns an object { success, count, waitingList }.
      // The previous code assumed the response itself was an array,
      // so waitlisted entries were discarded and the modal stayed empty.
      const normalizedWaitlist = Array.isArray(dataW?.waitingList)
        ? dataW.waitingList
        : Array.isArray(dataW)
        ? dataW
        : [];
      setWaitlist(normalizedWaitlist);
    } catch (e) {
      // SECURITY FIX: log only sanitized error messages (no stack traces)
      console.error("❌ fetchAll", e?.message || e);
      setMessage("❌ " + e.message);
    } finally {
      setLoading(false);
    }
  }, [activeWorkshopId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Remove entity */
  const handleUnregister = async (person, fromWaitlist = false) => {
    if (!window.confirm("לבטל הרשמה למשתתף זה?")) return;
    try {
      const familyId = person.isFamily ? person._id : null;
      // Use context helpers depending on whether we remove from waitlist or participants
      let result;
      if (fromWaitlist) {
        result = await unregisterFromWaitlist(activeWorkshopId, familyId);
      } else {
        result = await unregisterEntityFromWorkshop(activeWorkshopId, familyId);
      }
      if (!result || result.success === false) {
        throw new Error(result?.message || "שגיאה בביטול");
      }
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
      const familyId = wl.familyMemberId || null;
      // בדיקת מקום
      if (isCapacityFull) {
        alert("❌ אין מקום פנוי לקידום משתתף זה.");
        return;
      }
      // שלב 1: הסר מרשימת ההמתנה באמצעות context
      const unres = await unregisterFromWaitlist(activeWorkshopId, familyId);
      if (!unres || unres.success === false) {
        throw new Error(unres?.message || "שגיאה בהסרת משתמש מהרשמת המתנה");
      }
      // שלב 2: רשום לרשימת המשתתפים באמצעות context
      const regRes = await registerEntityToWorkshop(activeWorkshopId, familyId);
      if (!regRes || regRes.success === false) {
        throw new Error(regRes?.message || "שגיאה בקידום מהרשימה");
      }
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
      const res = await apiFetch(`/api/workshops/${activeWorkshopId}/export?type=${type}`, {
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
          {!isCapacityFull && (
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
            <span className="text-indigo-600">{activeWorkshop.title}</span>
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

        <div className="flex flex-wrap gap-3 text-xs text-gray-600 mb-4">
          <span className="inline-flex items-center gap-1 bg-indigo-50 px-2 py-1 rounded-lg">
            👥
            {participantsTotal}
            {capacityLimit ? ` / ${capacityLimit}` : ""}
          </span>
          <span className="inline-flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-lg">
            ⏳
            {waitlistTotal}
            {waitlistLimit ? ` / ${waitlistLimit}` : ""}
          </span>
          {isCapacityFull && (
            <span className="inline-flex items-center gap-1 bg-red-50 text-red-600 px-2 py-1 rounded-lg font-medium">
              ⚠️ אין מקומות פנויים
            </span>
          )}
        </div>

        {showProfiles && (
          <div className="border border-indigo-100 rounded-xl bg-indigo-50/30 mb-6 p-4">
            <AllProfiles
              mode="select"
              onSelectUser={async (p) => {
                try {
                  const familyId = p.isFamily ? p._id : null;
                  const res = await registerEntityToWorkshop(workshop._id, familyId);
                  if (!res || res.success === false) {
                    throw new Error(res?.message || "שגיאה בהרשמה");
                  }
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
