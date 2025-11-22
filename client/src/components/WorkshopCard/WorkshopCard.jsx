// WorkshopCard.jsx — FIXED FINAL VERSION

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { getEntityIdentifiers } from "../../utils/entityTypes";

import {
  MapPin,
  Users,
  Hourglass,
  Calendar,
  Clock,
  Dumbbell,
  Building2,
  Coins,
  Info,
  ChevronDown,
  ChevronUp,
  MoreVertical,
  User as UserIcon,
  Check,
} from "lucide-react";

const str = (v) => (v === 0 || v ? String(v) : "");

// -------- UI day letters --------
const hebDaysLetters = {
  Sunday: "א",
  Monday: "ב",
  Tuesday: "ג",
  Wednesday: "ד",
  Thursday: "ה",
  Friday: "ו",
  Saturday: "ש",
};

export default function WorkshopCard({
  _id,
  searchQuery = "",
  onManageParticipants,
  onEditWorkshop,
  onDeleteWorkshop,
  isAdmin: isAdminProp,
}) {
  const { user, isLoggedIn, isAdmin } = useAuth();

  const {
    workshops,
    registeredWorkshopIds,
    userWorkshopMap,
    familyWorkshopMap,
    registerEntityToWorkshop,
    unregisterEntityFromWorkshop,
    registerToWaitlist,
    unregisterFromWaitlist,
  } = useWorkshops();

  const wid = str(_id);

  // -------- Workshop lookup (no memo → always fresh from context) --------
  const workshop = Array.isArray(workshops)
    ? workshops.find((w) => str(w._id) === wid) || {}
    : {};

  const adminEnabled = typeof isAdminProp === "boolean" ? isAdminProp : isAdmin;

  // -------- UI state --------
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);

  const adminMenuRef = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (adminMenuRef.current && !adminMenuRef.current.contains(e.target)) {
        setAdminOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // -------- Workshop props --------
  const {
    title = "",
    type = "",
    description = "",
    coach = "",
    city = "",
    address = "",
    studio = "",
    days = [],
    hour,
    price,
    image,
    available = true,
    participants = [],
    waitingList = [],
    waitingListMax = 0,
    participantsCount: participantsCountRaw,
    maxParticipants: maxParticipantsRaw,
    startDate,
    endDate,
    inactiveDates = [],
    userFamilyRegistrations = [],
  } = workshop;

  const userKey = str(user?.entityKey);

  const participantsArr = Array.isArray(participants) ? participants : [];

  const participantsCount =
    typeof participantsCountRaw === "number"
      ? participantsCountRaw
      : participantsArr.length;

  const maxParticipants = Number(maxParticipantsRaw) || 0;

  const daysStr =
    days?.length ? days.map((d) => hebDaysLetters[d] || d).join(", ") : "—";

  const startDateStr = startDate
    ? new Date(startDate).toLocaleDateString("he-IL")
    : "";
  const endDateStr = endDate
    ? new Date(endDate).toLocaleDateString("he-IL")
    : "";

  const inactiveStr =
    inactiveDates?.length
      ? inactiveDates
          .map((d) => new Date(d).toLocaleDateString("he-IL"))
          .join(", ")
      : null;

  const participantIdSet = useMemo(
    () => new Set(participantsArr.map((p) => str(p))),
    [participantsArr]
  );

  // -------- Normalize waitlist --------
  const waitRows = useMemo(() => {
    const list = Array.isArray(waitingList) ? waitingList : [];

    return list.map((w) => {
      const ids = getEntityIdentifiers({
        entityKey: w?.familyMemberKey || w?.entityKey || w?.familyMemberId,
        parentKey: w?.parentKey,
      });
      return {
        parentKey: str(ids.parentKey),
        entityKey: str(ids.entityKey),
      };
    });
  }, [waitingList]);

  // -------- FIXED: true self waitlist logic --------
  // For self entries from backend/formatRegistration:
  // parentKey === userKey, entityKey === userKey, familyMemberKey === null
  const selfOnWaitlist = useMemo(
    () =>
      !!userKey &&
      waitRows.some(
        (e) => e.parentKey === userKey && e.entityKey === userKey
      ),
    [waitRows, userKey]
  );

  const isWorkshopFull =
    maxParticipants > 0 && participantsCount >= maxParticipants;

  // -------- FIXED: self registered logic (per-entity only) --------
  const isSelfRegistered = useMemo(() => {
    if (!userKey || !wid) return false;

    if (registeredWorkshopIds?.includes(wid)) return true;
    if (userWorkshopMap?.[wid] === true) return true;
    if (workshop?.isUserRegistered) return true;

    // participants array is normalized to entityKey strings from backend
    return participantIdSet.has(userKey);
  }, [
    userKey,
    wid,
    registeredWorkshopIds,
    userWorkshopMap,
    workshop,
    participantIdSet,
  ]);

  // -------- FIXED: family registered set (entityKey-based) --------
  const familyRegisteredIdSet = useMemo(() => {
    const src =
      familyWorkshopMap?.[wid] ??
      (Array.isArray(userFamilyRegistrations) ? userFamilyRegistrations : []);

    const normalizeId = (entry) =>
      getEntityIdentifiers(entry).entityKey || str(entry);

    return new Set(src.map(normalizeId).filter(Boolean));
  }, [familyWorkshopMap, wid, userFamilyRegistrations]);

  // -------- FIXED: button logic (per entity) --------
  const getEntityButton = (entity) => {
    const entityKey =
      typeof entity === "object" ? str(entity?.entityKey) : userKey;

    const isSelf = typeof entity !== "object";

    const registered = isSelf
      ? isSelfRegistered
      : familyRegisteredIdSet.has(entityKey);

    const memberOnWaitlist = waitRows.some(
      (e) => e.parentKey === userKey && e.entityKey === entityKey
    );

    const onWaitlist = isSelf ? selfOnWaitlist : memberOnWaitlist;

    if (registered) {
      return {
        label: "בטל הרשמה",
        color:
          "bg-yellow-400 text-gray-900 hover:bg-yellow-500 shadow-md hover:shadow-lg",
        action: async () => unregisterEntityFromWorkshop(wid, entityKey),
      };
    }

    if (onWaitlist) {
      return {
        label: "בטל רשימת המתנה",
        color:
          "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg",
        action: async () => unregisterFromWaitlist(wid, entityKey),
      };
    }

    if (isWorkshopFull) {
      return {
        label: "הירשם לרשימת המתנה",
        color:
          "bg-emerald-500 text-white hover:bg-emerald-600 shadow-md hover:shadow-lg",
        action: async () => registerToWaitlist(wid, entityKey),
      };
    }

    return {
      label: "הירשם",
      color:
        "bg-indigo-500 text-white hover:bg-indigo-600 shadow-md hover:shadow-lg",
      action: async () => registerEntityToWorkshop(wid, entityKey),
    };
  };

  const selfButton = useMemo(() => getEntityButton(userKey), [
    userKey,
    isSelfRegistered,
    selfOnWaitlist,
    isWorkshopFull,
    familyRegisteredIdSet,
    waitRows,
  ]);

  // ---------- Execute action ----------
  const runEntityAction = (entity) => {
    const btn = getEntityButton(entity);
    if (!btn?.action || loading) return;

    // argument is unused by the action, but kept for clarity
    const ek = typeof entity === "object" ? str(entity?.entityKey) : userKey;

    setLoading(true);

    btn
      .action(ek)
      .then((res) => {
        if (!res?.success) {
          setFeedback(`❌ ${res?.message || "הפעולה נכשלה"}`);
        } else {
          setFeedback(`✅ עודכן בהצלחה`);
        }
      })
      .catch((err) => {
        setFeedback(`❌ ${err?.message || "שגיאה בביצוע פעולה"}`);
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => setFeedback(null), 2000);
      });
  };

  // ---------- Skeleton ----------
  if (!workshop || !wid) {
    return (
      <div className="relative rounded-2xl border border-indigo-100 shadow-sm overflow-hidden bg-gradient-to-br from-indigo-50 via-blue-50/40 to-white p-4 animate-pulse">
        <div className="h-44 w-full bg-gray-100 mb-3" />
        <div className="h-4 bg-gray-200 rounded w-2/3 mb-2" />
        <div className="h-3 bg-gray-200 rounded w-1/2 mb-1" />
        <div className="h-3 bg-gray-200 rounded w-1/3" />
      </div>
    );
  }

  return (
    <>
      {/* ===================== CARD ===================== */}
      <div
        className="
        relative rounded-2xl border border-indigo-100 shadow-sm overflow-hidden
        bg-gradient-to-br from-indigo-50 via-blue-50/40 to-white
        hover:shadow-indigo-200 hover:-translate-y-[2px] transition-all"
      >
        {/* Price */}
        {price !== undefined && price !== null && price !== "" && (
          <div className="absolute top-3 left-3 z-10">
            <div className="bg-indigo-600/95 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg">
              <span className="inline-flex items-center gap-1">
                <Coins size={14} />
                {Number(price)} ₪
              </span>
            </div>
          </div>
        )}

        {/* Image */}
        <div className="relative h-44 w-full overflow-hidden">
          {image ? (
            <img
              src={image}
              alt={title}
              className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400">
              אין תמונה
            </div>
          )}

          {!available && (
            <div className="absolute inset-0 bg-gray-800/70 flex items-center justify-center text-white font-semibold text-base">
              לא זמינה
            </div>
          )}
        </div>

        {/* CONTENT */}
        <div className="p-4 flex flex-col gap-3 text-right">
          {/* Title + Admin */}
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-indigo-800 truncate flex-1">
              {highlight(title, searchQuery)}
            </h3>

            {adminEnabled && (
              <AdminMenu
                adminMenuRef={adminMenuRef}
                adminOpen={adminOpen}
                setAdminOpen={setAdminOpen}
                workshopId={wid}
                onManageParticipants={onManageParticipants}
                onEditWorkshop={onEditWorkshop}
                onDeleteWorkshop={onDeleteWorkshop}
              />
            )}
          </div>

          {/* Type */}
          {type && (
            <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 rounded-full px-3 py-1 w-max ml-auto shadow-sm">
              {highlight(type, searchQuery)}
            </div>
          )}

          {/* INFO ROWS */}
          <div className="flex flex-col gap-2 mt-1 text-sm">
            {/* Address */}
            <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                <MapPin size={16} /> כתובת
              </span>

              <span className="flex items-center gap-2 text-gray-800 truncate max-w-[65%] text-right">
                {highlight(
                  city && address
                    ? `${city}, ${address}`
                    : city || address || "—",
                  searchQuery
                )}

                {(city || address) && (
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(
                      `${address || ""}, ${city || ""}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="פתח מפות"
                    className="text-indigo-500 hover:text-indigo-700 shrink-0"
                  >
                    🌍
                  </a>
                )}
              </span>
            </div>

            {/* Coach */}
            <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                <Dumbbell size={16} /> מאמן
              </span>
              <span className="text-gray-800 truncate max-w-[65%]">
                {highlight(coach || "—", searchQuery)}
              </span>
            </div>

            {/* Studio */}
            <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                <Building2 size={16} /> סטודיו
              </span>
              <span className="text-gray-800 truncate max-w-[65%]">
                {highlight(studio || "—", searchQuery)}
              </span>
            </div>

            {/* Days + Hour */}
            <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                <Calendar size={16} /> ימים ושעה
              </span>
              <span className="text-gray-800 truncate max-w-[65%] inline-flex items-center gap-1">
                {highlight(daysStr, searchQuery)}
                <span className="text-gray-400">|</span>
                <Clock size={14} className="text-gray-500 shrink-0" />
                {highlight(hour || "—", searchQuery)}
              </span>
            </div>

            {/* Participants / Waitlist toggle */}
            <button
              type="button"
              onClick={() => setShowWaitlist((p) => !p)}
              className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2 hover:bg-indigo-50 transition text-right"
            >
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                {showWaitlist ? <Hourglass size={16} /> : <Users size={16} />}
                {showWaitlist ? "רשימת המתנה" : "משתתפים"}
              </span>

              <span className="inline-flex items-center gap-2 font-semibold text-gray-800">
                {showWaitlist ? (
                  <>
                    <Hourglass size={16} className="text-amber-600" />
                    {`${waitRows.length}/${waitingListMax || "∞"}`}
                    <ChevronUp size={16} />
                  </>
                ) : (
                  <>
                    <Users size={16} className="text-indigo-700" />
                    {`${participantsCount}/${maxParticipants || "∞"}`}
                    <ChevronDown size={16} />
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Description CTA */}
          {description && (
            <button
              onClick={() => setShowDescriptionModal(true)}
              className="w-full text-indigo-700 hover:text-indigo-900 text-sm font-semibold inline-flex items-center justify-center gap-1"
            >
              <Info size={16} /> קרא עוד על הסדנה
            </button>
          )}

          {/* --------------------- SELF BUTTON --------------------- */}
          {isLoggedIn && (
            <button
              onClick={() => runEntityAction(userKey)}
              disabled={loading || !selfButton?.action}
              className={`w-full mt-1.5 py-2 font-semibold rounded-xl transition-all disabled:opacity-60 ${selfButton.color}`}
            >
              {loading ? "..." : selfButton.label}
            </button>
          )}

          {/* FAMILY BUTTON */}
          {user?.familyMembers?.length > 0 && (
            <button
              onClick={() => setShowFamilyModal(true)}
              className="w-full py-2 font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-xl"
            >
              👨‍👩‍👧 רישום בני משפחה
            </button>
          )}

          {/* FEEDBACK */}
          {feedback && (
            <p
              className={`text-sm mt-2 text-center font-medium ${
                feedback.startsWith("✅")
                  ? "text-green-600"
                  : "text-red-600"
              }`}
            >
              {feedback}
            </p>
          )}
        </div>
      </div>

      {/* ===================== FAMILY MODAL ===================== */}
      {showFamilyModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-[92%] max-w-md text-right">
            <h2 className="text-lg font-bold text-indigo-800 mb-4 border-b border-indigo-100 pb-2">
              רישום בני משפחה לסדנה "{title}"
            </h2>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1.5">
              {(user?.familyMembers || []).map((member) => {
                const memberId = str(member?.entityKey);

                const isRegistered = familyRegisteredIdSet.has(memberId);
                const isWL = waitRows.some(
                  (e) => e.parentKey === userKey && e.entityKey === memberId
                );

                const btn = getEntityButton(member);

                return (
                  <div
                    key={memberId}
                    className="flex items-center justify-between bg-indigo-50/60 border border-indigo-100 rounded-xl px-3 py-2"
                  >
                    <div className="min-w-0 flex items-center gap-2">
                      <div className="h-8 w-8 rounded-full bg-indigo-200/60 flex items-center justify-center text-indigo-800">
                        <UserIcon size={16} />
                      </div>
                      <div className="min-w-0">
                        <div className="font-semibold text-indigo-900 truncate">
                          {member.name}
                        </div>

                        <div className="flex items-center gap-2 text-[11px] text-gray-600">
                          {member.relation && (
                            <span className="truncate">
                              {member.relation}
                            </span>
                          )}

                          {isRegistered && (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <Check size={12} /> רשום
                            </span>
                          )}

                          {!isRegistered && isWL && (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Hourglass size={12} /> ממתין
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* BUTTON */}
                    {btn?.label && (
                      <button
                        onClick={() => runEntityAction(member)}
                        disabled={loading || !btn?.action}
                        className={`px-2.5 py-1.5 text-xs font-semibold rounded-xl shadow ${btn.color} disabled:opacity-60`}
                      >
                        {loading ? "..." : btn.label}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            <button
              onClick={() => setShowFamilyModal(false)}
              className="mt-5 w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 transition-all"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/* ---------- Admin Menu ---------- */
function AdminMenu({
  adminMenuRef,
  adminOpen,
  setAdminOpen,
  workshopId,
  onManageParticipants,
  onEditWorkshop,
  onDeleteWorkshop,
}) {
  const handlers = {
    edit: onEditWorkshop,
    manage: onManageParticipants,
    delete: onDeleteWorkshop,
  };

  const handleAction = (type) => {
    setAdminOpen(false);
    const fn = handlers[type];
    if (typeof fn === "function") {
      fn(workshopId);
      return;
    }

    // fallback broadcast
    window.dispatchEvent(
      new CustomEvent("workshop-admin-action", {
        detail: { type, workshopId },
      })
    );
  };

  useEffect(() => {
    const handler = () => {};
    window.addEventListener("workshop-admin-action", handler);

    return () =>
      window.removeEventListener("workshop-admin-action", handler);
  }, []);

  return (
    <div className="relative" ref={adminMenuRef}>
      <button
        onClick={() => setAdminOpen((s) => !s)}
        className="p-1.5 rounded-lg bg-white/60 border border-indigo-100 hover:bg-white shadow-sm"
        title="אפשרויות ניהול"
      >
        <MoreVertical size={18} className="text-indigo-700" />
      </button>

      {adminOpen && (
        <div className="absolute left-0 top-8 z-20 w-40 bg-white border border-gray-100 rounded-xl shadow-lg overflow-hidden">
          <button
            onClick={() => handleAction("edit")}
            className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50"
          >
            ✏️ ערוך
          </button>

          <button
            onClick={() => handleAction("manage")}
            className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50"
          >
            👥 משתתפים
          </button>

          <button
            onClick={() => handleAction("delete")}
            className="w-full text-right px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            🗑️ מחק
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- Utils ---------- */
function highlight(text = "", query = "") {
  if (!query?.trim()) return text;
  const q = query.toLowerCase();

  return String(text)
    .split(new RegExp(`(${escapeRegExp(query)})`, "gi"))
    .map((part, i) =>
      part.toLowerCase().includes(q) ? (
        <mark key={i} className="bg-indigo-200 text-black rounded px-1">
          {part}
        </mark>
      ) : (
        part
      )
    );
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
