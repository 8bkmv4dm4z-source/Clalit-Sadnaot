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
import { normalizeError } from "../../utils/normalizeError";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useAuth } from "../../layouts/AuthLayout";
import AllProfiles from "../../pages/AllProfiles";
import { getEntityIdentifiers } from "../../utils/entityTypes";
import { normalizeEntity } from "../../utils/normalizeEntity";
import { formatParticipantContact } from "../../utils/participantDisplay";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** 🔹 QuickEdit modal */
function QuickEdit({ person, onClose, onSaved }) {
  const [form, setForm] = useState(() => ({
    name: person?.name || "",
    phone: person?.phone || "",
    email: person?.email || "",
  }));
  const [saving, setSaving] = useState(false);
  const update = (k, v) => setForm((p) => ({ ...p, [k]: v }));

  const save = async () => {
    try {
      setSaving(true);
      const payload = {
        entityKey: person.entityKey,
        updates: { ...form },
      };

      const res = await apiFetch("/api/users/update-entity", {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw (
          res.normalizedError ||
          normalizeError(null, {
            status: res.status,
            payload: data,
            fallbackMessage: "עדכון נכשל",
          })
        );
      }

      onSaved?.({ entityKey: person.entityKey, ...form });
      onClose?.();
    } catch (e) {
      const normalized = normalizeError(e, { fallbackMessage: "עדכון נכשל" });
      toast.error("שגיאה בעדכון: " + normalized.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold text-gray-800">עריכת משתתף</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          {["name", "email", "phone"].map((key) => (
            <label key={key} className="flex flex-col">
              {key === "name"
                ? "שם:"
                : key === "email"
                ? "אימייל:"
                : key === "phone"
                ? "טלפון:"
                : ""}
              <Input
                type="text"
                className="mt-1"
                value={form[key]}
                onChange={(e) => update(key, e.target.value)}
              />
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** 🔹 Main Modal */
export default function WorkshopParticipantsModal({
  workshop,
  onClose,
  accessScope = "public",
}) {
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
    exportWorkshop,
    workshops,
    selectedWorkshop: selectedWorkshopFromContext,
    setSelectedWorkshop,
  } = useWorkshops();
  const { refreshMe } = useAuth();

  const [participants, setParticipants] = useState([]);
  const [waitlist, setWaitlist] = useState([]);
  const [view, setView] = useState("participants");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState(null);
  const [editPerson, setEditPerson] = useState(null);
  const [showProfiles, setShowProfiles] = useState(false);
  const [unregisterConfirm, setUnregisterConfirm] = useState(null);

  const dedupeByEntityKey = (list) => {
    const map = new Map();
    for (const item of list) {
      const key = item.__entityKey || getEntityIdentifiers(item).key;
      if (!key) continue;
      if (!map.has(key)) map.set(key, item);
    }
    return [...map.values()];
  };


  /* --------------------------------------------------------
   WORKSHOP ID NORMALIZATION (USE hashedId ONLY)
   -------------------------------------------------------- */

  /** pick source workshop */
  const resolvedWorkshop = useMemo(
    () => workshop || selectedWorkshopFromContext || {},
    [workshop, selectedWorkshopFromContext]
  );

  /** client-facing workshop ID = hashedId = _id */
  const workshopId = useMemo(
    () => String(resolvedWorkshop?._id || ""),
    [resolvedWorkshop]
  );

  /** resolve workshop from context using hashedId */
  const contextWorkshop = useMemo(() => {
    if (!workshopId) return null;
    return (
      (workshops || []).find((w) => String(w?._id) === workshopId) || null
    );
  }, [workshops, workshopId]);

  /** final workshop object */
  const activeWorkshop = useMemo(
    () => contextWorkshop || resolvedWorkshop || {},
    [contextWorkshop, resolvedWorkshop]
  );

  /**
   * ALWAYS use the normalized workshop entity key for server routes.
   * The button "ייצא לקובץ אקסל" relies on the existing entity-key based
   * export endpoint, so prefer the entityKey/workshopKey before falling
   * back to hashed IDs.
   */
  const activeWorkshopKey = useMemo(() => {
    const { entityKey } = getEntityIdentifiers(activeWorkshop);

    return (
      entityKey ||
      activeWorkshop?.workshopKey ||
      activeWorkshop?.hashedId ||
      activeWorkshop?._id ||
      workshopId ||
      ""
    );
  }, [activeWorkshop, workshopId]);

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
    if (typeof activeWorkshop.waitingListCount === "number") {
      return activeWorkshop.waitingListCount;
    }
    if (Array.isArray(activeWorkshop.waitingList)) {
      return activeWorkshop.waitingList.length;
    }
    return 0;
  }, [waitlist, activeWorkshop]);

  const existingKeys = useMemo(
    () =>
      [...participants, ...waitlist].map(
        (p) => p.__entityKey || getEntityIdentifiers(p).key
      ),
    [participants, waitlist]
  );

  const isCapacityFull = useMemo(() => {
    if (!capacityLimit) return false;
    return participantsTotal >= capacityLimit;
  }, [participantsTotal, capacityLimit]);

  /** Load both lists */
  const fetchAll = useCallback(
    async () => {
      if (!activeWorkshopKey) return;
      setLoading(true);
      try {
        const [resP, resW] = await Promise.all([
          apiFetch(`/api/workshops/${activeWorkshopKey}/participants`),
          apiFetch(`/api/workshops/${activeWorkshopKey}/waitlist`),
        ]);
        const [dataP, dataW] = await Promise.all([resP.json(), resW.json()]);
        if (!resP.ok) {
          throw (
            resP.normalizedError ||
            normalizeError(null, {
              status: resP.status,
              payload: dataP,
              fallbackMessage: "שגיאה בטעינת משתתפים",
            })
          );
        }
        if (!resW.ok) {
          throw (
            resW.normalizedError ||
            normalizeError(null, {
              status: resW.status,
              payload: dataW,
              fallbackMessage: "שגיאה בטעינת רשימת המתנה",
            })
          );
        }

        const participantList = Array.isArray(dataP.participants)
          ? dataP.participants
          : [];
        const cleanedParticipants = dedupeByEntityKey(
          participantList.map(normalizeEntity)
        );
        setParticipants(cleanedParticipants);

        const normalizedWaitlist = Array.isArray(dataW?.waitingList)
          ? dataW.waitingList
          : Array.isArray(dataW)
          ? dataW
          : [];

        const cleanedWaitlist = dedupeByEntityKey(
          normalizedWaitlist.map(normalizeEntity)
        );
        setWaitlist(cleanedWaitlist);
      } catch (e) {
        const normalized = normalizeError(e, { fallbackMessage: "שגיאה בטעינת נתונים" });
        console.error("❌ fetchAll", e?.message || e);
        setMessage("❌ " + normalized.message);
      } finally {
        setLoading(false);
      }
    },
    [activeWorkshopKey]
  );

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  /** Remove entity (participant or waitlist) — triggered by AlertDialog confirm */
  const confirmUnregister = async () => {
    if (!unregisterConfirm) return;
    const { person, fromWaitlist } = unregisterConfirm;
    setUnregisterConfirm(null);

    try {
      const { entityKey } = getEntityIdentifiers(person);

      if (!entityKey) throw new Error("Missing entityKey");

      let result;

      if (fromWaitlist) {
        result = await unregisterFromWaitlist(activeWorkshopKey, entityKey);
      } else {
        result = await unregisterEntityFromWorkshop(activeWorkshopKey, entityKey);
      }

      if (!result?.success) {
        throw new Error(result?.message || "שגיאה בביטול");
      }

      setMessage("🚫 בוטל בהצלחה");
      await fetchAll();
      await fetchWorkshops({ force: true, scope: accessScope });
    } catch (e) {
      const normalized = normalizeError(e, { fallbackMessage: "שגיאה בביטול" });
      toast.error(normalized.message);
    }
  };

  /** Request unregister — opens confirmation AlertDialog */
  const handleUnregister = (person, fromWaitlist = false) => {
    setUnregisterConfirm({ person, fromWaitlist });
  };

  /** Promote from waitlist → participants */
  const handlePromote = async (wl) => {
    try {
      const { entityKey } = getEntityIdentifiers(wl);

      if (!entityKey) throw new Error("Missing entityKey");

      if (isCapacityFull) {
        toast.error("אין מקום פנוי לקידום משתתף זה.");
        return;
      }

      const unres = await unregisterFromWaitlist(activeWorkshopKey, entityKey);
      if (!unres?.success) {
        throw new Error(unres?.message || "שגיאה בהסרת משתמש מהרשמת המתנה");
      }

      const regRes = await registerEntityToWorkshop(
        activeWorkshopKey,
        entityKey
      );
      if (!regRes?.success) {
        throw new Error(regRes?.message || "שגיאה בקידום מהרשימה");
      }

      setMessage("✅ הועבר בהצלחה מרשימת המתנה לרשומים");
      await fetchAll();
      await fetchWorkshops({ force: true, scope: accessScope });
    } catch (e) {
      const normalized = normalizeError(e, { fallbackMessage: "שגיאה בקידום" });
      toast.error(normalized.message);
    }
  };

  /** Export */
  const handleExport = useCallback(async () => {
    const type = view === "participants" ? "current" : "waitlist";
    const audience = accessScope === "admin" ? "admin" : "participant";

    try {
      const result = await exportWorkshop(activeWorkshopKey, type, audience);
      if (!result?.success) {
        throw new Error(result?.message || 'שגיאה ביצוא דו"ח');
      }

      toast.success('דו"ח נשלח למייל שלך!');
    } catch (e) {
      toast.error(e.message);
    }
  }, [accessScope, exportWorkshop, activeWorkshopKey, view]);

  /** Render waitlist item */
  const renderWaitlistItem = (wl) => {
    const { email, phone } = formatParticipantContact(wl);
    const key = wl.__entityKey || getEntityIdentifiers(wl).key || wl.entityKey || wl.name;
    return (
      <div
        key={key}
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

        <p className="text-sm text-gray-600">{email || "-"}</p>

        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
          <p>טלפון: {phone || "-"}</p>
        </div>
      </div>
    );
  };

  const renderParticipant = (p) => {
    const { email, phone } = formatParticipantContact(p);
    const key = p.__entityKey || getEntityIdentifiers(p).key || p.entityKey || p.name;
    return (
      <div
        key={key}
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
        <p className="text-sm text-gray-600">{email || "-"}</p>
        <div className="text-xs text-gray-500 mt-1 space-y-0.5">
          <p>טלפון: {phone || "-"}</p>
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
    await fetchWorkshops({ force: true, scope: accessScope });
    if (typeof setSelectedWorkshop === "function") {
      setSelectedWorkshop(null);
    }
    onClose?.();
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
              📤 ייצא לקובץ אקסל
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
                  const { entityKey } = getEntityIdentifiers(p);
                  if (!entityKey) throw new Error("Missing entityKey");

                  const res = await registerEntityToWorkshop(
                    activeWorkshopKey,
                    entityKey
                  );
                  if (!res?.success) {
                    throw new Error(res?.message || "שגיאה בהרשמה");
                  }

                  setShowProfiles(false);
                  await fetchAll();
                  await fetchWorkshops();
                  toast.success("נוסף בהצלחה!");
                } catch (e) {
                  toast.error(e.message);
                }
              }}
              existingIds={existingKeys}
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

      {/* Unregister Confirmation */}
      <AlertDialog open={!!unregisterConfirm} onOpenChange={(open) => { if (!open) setUnregisterConfirm(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ביטול הרשמה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך לבטל את ההרשמה של{" "}
              {unregisterConfirm?.person?.name || "משתתף זה"}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmUnregister}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              בטל הרשמה
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
