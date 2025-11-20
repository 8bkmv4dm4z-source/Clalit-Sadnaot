/**
 * WorkshopCard.jsx — Context-Only Data Source
 * --------------------------------------------------------------------
 * כל הנתונים על הסדנה (משתתפים, רשימת המתנה, הרשמות, משפחה וכו')
 * מגיעים רק מה-WorkshopContext (workshops, userWorkshopMap, familyWorkshopMap...).
 *
 * הפרופס היחידים שמשפיעים על לוגיקה:
 *   - _id          ← מזהה הסדנה
 *   - searchQuery  ← לטובת highlight בחיפוש (לא דאטה לוגי)
 */

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

// -------- UI days mapping --------
const hebDaysLetters = {
  Sunday: "א",
  Monday: "ב",
  Tuesday: "ג",
  Wednesday: "ד",
  Thursday: "ה",
  Friday: "ו",
  Saturday: "ש",
};

export default function WorkshopCard({ _id, searchQuery = "" }) {
  /* ---------------- Context ---------------- */
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

  // לוקחים את הסדנה העדכנית מתוך ה-Context
  const workshop = useMemo(
    () => (Array.isArray(workshops) ? workshops.find((w) => str(w._id) === wid) || {} : {}),
    [workshops, wid]
  );

  /* ---------------- Local UI state ---------------- */
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

  /* ---------------- Derived data from workshop (context) ---------------- */
  const userId = str(user?._id);

  const {
    title = "",
    type,
    description,
    ageGroup,
    coach,
    city,
    address,
    studio,
    days = [],
    hour,
    price,
    image,
    available = true,
    participants = [],
    waitingList = [],
    waitingListMax = 0,
    participantsCount: participantsCountRaw,
    maxParticipants: maxParticipantsRaw = 0,
    startDate,
    endDate,
    sessionsCount,
    inactiveDates = [],
    userFamilyRegistrations = [],
  } = workshop;

  const participantsArr = useMemo(
    () => (Array.isArray(participants) ? participants : []),
    [participants]
  );
  const participantsCount =
    typeof participantsCountRaw === "number"
      ? participantsCountRaw
      : participantsArr.length;

  const maxParticipants = Number(maxParticipantsRaw) || 0;

  const daysStr =
    (Array.isArray(days) && days.length
      ? days.map((d) => hebDaysLetters[d] || d).join(", ")
      : "—") || "—";

  const startDateStr = startDate ? new Date(startDate).toLocaleDateString("he-IL") : "";
  const endDateStr = endDate ? new Date(endDate).toLocaleDateString("he-IL") : "";
  const inactiveStr =
    Array.isArray(inactiveDates) && inactiveDates.length
      ? inactiveDates.map((d) => new Date(d).toLocaleDateString("he-IL")).join(", ")
      : null;

  // סט רשומים (self) מהנתונים של המופע עצמו רק כ-fallback
  const participantIdSet = useMemo(() => {
    return new Set(participantsArr.map((p) => str(p)).filter(Boolean));
  }, [participantsArr]);

  // טורי רשימת המתנה: מחלץ userId + familyId מכל אובייקט ברשימה
  const waitRows = useMemo(() => {
    const list = Array.isArray(waitingList) ? waitingList : [];
    return list.map((w) => {
      const ids = getEntityIdentifiers({
        ...w,
        parentUserId: w?.parentUser?._id ?? w?.parentUser,
        familyMemberId:
          w?.familyMemberId?._id ??
          w?.familyMemberId ??
          w?.familyMember?._id ??
          w?.familyMember,
      });
      return {
        userId: str(ids.userId),
        familyId: str(ids.familyId),
      };
    });
  }, [waitingList]);

  // אני עצמי ברשימת המתנה (רק parent, בלי בן משפחה)
  const selfOnWaitlist = useMemo(
    () => waitRows.some((e) => e.userId === userId && !e.familyId),
    [waitRows, userId]
  );

  const isWorkshopFull =
    maxParticipants > 0 && Number(participantsCount || 0) >= maxParticipants;

  const isWaitlistFull =
    Number(waitingListMax) > 0 && waitRows.length >= Number(waitingListMax);

  /* ---------------- Registered state (SELF) ---------------- */
  const isSelfRegistered = useMemo(() => {
    if (!userId || !wid) return false;

    // 1) ids שנשלפים מהשרת לפי הרשמה
    if (Array.isArray(registeredWorkshopIds) && registeredWorkshopIds.includes(wid)) {
      return true;
    }

    // 2) מפה שנגזרת מה-Context (מחושבת על workshops)
    const mapVal = userWorkshopMap ? userWorkshopMap[wid] : undefined;
    if (typeof mapVal === "boolean") return mapVal;

    // 3) fallback: אם מישהו שם isUserRegistered ב-workshop עצמו
    if (workshop?.isUserRegistered) return true;

    // 4) fallback אחרון: מופיע ב-participants
    return participantIdSet.has(userId);
  }, [registeredWorkshopIds, userWorkshopMap, wid, workshop, participantIdSet, userId]);

  /* ---------------- Registered state (FAMILY) ---------------- */
  const familyRegisteredIdSet = useMemo(() => {
    const fromMap =
      familyWorkshopMap && Array.isArray(familyWorkshopMap[wid])
        ? familyWorkshopMap[wid]
        : undefined;
    const src = fromMap ?? userFamilyRegistrations ?? [];
    const normalizeId = (entry) => getEntityIdentifiers(entry).familyId || str(entry);
    return new Set((src || []).map(normalizeId).filter(Boolean));
  }, [familyWorkshopMap, wid, userFamilyRegistrations]);

  /* ---------------- Button factory (self / family) ---------------- */
  const getEntityButton = (entity) => {
    // אם זה בן משפחה, יש לו _id; אם זה "אני" → אין familyId
    const familyId = typeof entity === "object" ? str(entity?._id) : "";
    const isSelf = !familyId;

    const memberRegistered = familyId ? familyRegisteredIdSet.has(familyId) : false;
    const memberOnWaitlist = familyId
      ? waitRows.some((e) => e.userId === userId && e.familyId === familyId)
      : false;

    const registered = isSelf ? isSelfRegistered : memberRegistered;
    const onWaitlist = isSelf ? selfOnWaitlist : memberOnWaitlist;

    if (!available) {
      return {
        label: "לא ניתן להירשם",
        color: "bg-gray-300 text-gray-600 cursor-not-allowed shadow-none hover:shadow-none",
        action: null,
      };
    }

    if (registered) {
      return {
        label: "בטל הרשמה",
        color: "bg-yellow-400 text-gray-900 hover:bg-yellow-500 shadow-md hover:shadow-lg",
        action: async () => unregisterEntityFromWorkshop(wid, familyId || undefined),
      };
    }

    if (onWaitlist) {
      return {
        label: "בטל רשימת המתנה",
        color: "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg",
        action: async () => unregisterFromWaitlist(wid, familyId || undefined),
      };
    }

    if (isWorkshopFull) {
      if (isWaitlistFull) {
        return {
          label: "לא ניתן להירשם",
          color: "bg-gray-300 text-gray-600 cursor-not-allowed shadow-none hover:shadow-none",
          action: null,
        };
      }
      return {
        label: "הצטרף לרשימת המתנה",
        color: "bg-amber-500 text-white hover:bg-amber-600 shadow-md hover:shadow-lg",
        action: async () => registerToWaitlist(wid, familyId || undefined),
      };
    }

    return {
      label: "הירשם",
      color: "bg-indigo-600 text-white hover:bg-indigo-700 shadow-md hover:shadow-lg",
      action: async () => registerEntityToWorkshop(wid, familyId || undefined),
    };
  };

  const runEntityAction = async (entity) => {
    const btn = getEntityButton(entity);
    if (loading || !btn?.action) return;
    setLoading(true);
    try {
      const result = await btn.action();
      if (result?.success === false) {
        throw new Error(result?.message || "הפעולה נכשלה");
      }
      setFeedback(`✅ ${btn.label.includes("בטל") ? "עודכן בהצלחה" : "נרשמת בהצלחה"}`);
    } catch (e) {
      setFeedback(`❌ ${e?.message || "שגיאה בביצוע פעולה"}`);
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2200);
    }
  };

  /* ---------------- UI ---------------- */

  // אם עדיין אין סדנה (לפני fetch) – אפשר להחזיר skeleton קטן
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

        {/* Content */}
        <div className="p-4 flex flex-col gap-3 text-right">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-indigo-800 truncate flex-1">
              {highlight(title, searchQuery)}
            </h3>

            {isAdmin && (
              <AdminMenu
                adminMenuRef={adminMenuRef}
                adminOpen={adminOpen}
                setAdminOpen={setAdminOpen}
                workshopId={wid}
              />
            )}
          </div>

          {type && (
            <div className="text-[11px] font-semibold text-indigo-700 bg-indigo-100 rounded-full px-3 py-1 w-max ml-auto shadow-sm">
              {highlight(type, searchQuery)}
            </div>
          )}

          {/* Info rows */}
          <div className="flex flex-col gap-2 mt-1 text-sm">
            {/* Address */}
            <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                <MapPin size={16} />
                כתובת
              </span>

              <span className="flex items-center gap-2 text-gray-800 truncate max-w-[65%] text-right">
                {highlight(
                  city && address ? `${city}, ${address}` : city || address || "—",
                  searchQuery
                )}

                {(city || address) && (
                  <a
                    href={`https://www.google.com/maps?q=${encodeURIComponent(
                      `${address || ""}, ${city || ""}`.trim()
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="פתח במפות Google"
                    className="text-indigo-500 hover:text-indigo-700 transition-colors shrink-0"
                  >
                    🌍
                  </a>
                )}
              </span>
            </div>

            {/* Coach & Studio */}
            <div className="grid grid-cols-1 gap-2">
              <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
                <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                  <Dumbbell size={16} />
                  מאמן
                </span>
                <span className="text-gray-800 truncate max-w-[65%] text-right">
                  {highlight(coach || "—", searchQuery)}
                </span>
              </div>

              <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
                <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                  <Building2 size={16} />
                  סטודיו
                </span>
                <span className="text-gray-800 truncate max-w-[65%] text-right">
                  {highlight(studio || "—", searchQuery)}
                </span>
              </div>
            </div>

            {/* Days + Hour */}
            <div className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2">
              <span className="flex items-center gap-1.5 font-bold text-indigo-900">
                <Calendar size={16} />
                ימים ושעה
              </span>
              <span className="text-gray-800 truncate max-w-[65%] inline-flex items-center gap-1">
                {highlight(daysStr, searchQuery)}
                <span className="text-gray-400">|</span>
                <Clock size={14} className="text-gray-500 shrink-0" />
                {highlight(hour || "—", searchQuery)}
              </span>
            </div>

            {/* Participants ↔ Waitlist toggle */}
            <button
              type="button"
              onClick={() => setShowWaitlist((p) => !p)}
              className="flex items-center justify-between bg-white/70 backdrop-blur border border-indigo-100 rounded-xl px-3 py-2 hover:bg-indigo-50 transition text-right"
              title="החלף בין משתתפים לבין רשימת המתנה"
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
                    {showWaitlist ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </>
                ) : (
                  <>
                    <Users size={16} className="text-indigo-700" />
                    {`${Number(participantsCount || 0)}/${maxParticipants || "∞"}`}
                    {showWaitlist ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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

          {/* Primary action (self) */}
          {isLoggedIn && (
            <button
              onClick={() => runEntityAction(userId)}
              disabled={loading || !getEntityButton(userId)?.action}
              className={`w-full mt-1.5 py-2 font-semibold rounded-xl transition-all disabled:opacity-60 ${
                getEntityButton(userId).color
              }`}
            >
              {loading ? "..." : getEntityButton(userId).label}
            </button>
          )}

          {/* Family modal trigger */}
          {user?.familyMembers?.length > 0 && (
            <button
              onClick={() => setShowFamilyModal(true)}
              className="w-full py-2 font-medium bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-xl"
            >
              👨‍👩‍👧 רישום בני משפחה
            </button>
          )}

          {/* Feedback */}
          {feedback && (
            <p
              className={`text-sm mt-2 text-center font-medium ${
                feedback.startsWith("✅") ? "text-green-600" : "text-red-600"
              }`}
            >
              {feedback}
            </p>
          )}
        </div>
      </div>

      {/* Family Modal */}
      {showFamilyModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl w-[92%] max-w-md text-right">
            <h2 className="text-lg font-bold text-indigo-800 mb-4 border-b border-indigo-100 pb-2">
              רישום בני משפחה לסדנה "{title}"
            </h2>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1.5">
              {(user?.familyMembers || []).map((member) => {
                const key = str(member?._id);
                const familyId = key;
                const isRegisteredFamily = familyRegisteredIdSet.has(familyId);
                const isWL = waitRows.some(
                  (e) => e.userId === userId && e.familyId === familyId
                );
                const btn = getEntityButton(member);
                const isActionable = !!btn?.action;

                return (
                  <div
                    key={key}
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
                            <span className="truncate">{member.relation}</span>
                          )}
                          {isRegisteredFamily && (
                            <span className="inline-flex items-center gap-1 text-green-700">
                              <Check size={12} /> רשום
                            </span>
                          )}
                          {!isRegisteredFamily && isWL && (
                            <span className="inline-flex items-center gap-1 text-amber-600">
                              <Hourglass size={12} /> ממתין
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {btn?.label && (
                      <button
                        onClick={() => runEntityAction(member)}
                        disabled={loading || !isActionable}
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

      {/* Description Modal */}
      {showDescriptionModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 shadow-2xl max-w-lg w-[92%] text-right relative">
            <h2 className="text-lg font-bold text-indigo-800 mb-3 border-b border-indigo-100 pb-1">
              {title}
            </h2>
            <div className="overflow-y-auto max-h-[70vh] pr-1.5">
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap text-sm break-words">
                {description || "אין תיאור לסדנה זו."}
              </p>

              {(startDateStr || endDateStr || inactiveStr) && (
                <div className="mt-4 text-xs text-gray-600 space-y-1">
                  {startDateStr && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-indigo-600 shrink-0" />
                      <span>תאריך התחלה: {startDateStr}</span>
                    </div>
                  )}
                  {endDateStr && (
                    <div className="flex items-center gap-2">
                      <Calendar size={14} className="text-indigo-600 shrink-0" />
                      <span>תאריך סיום: {endDateStr}</span>
                    </div>
                  )}
                  {inactiveStr && (
                    <div className="flex items-start gap-2">
                      <Hourglass size={14} className="mt-0.5 text-amber-600 shrink-0" />
                      <span>חופשות/אי-פעילות: {inactiveStr}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              onClick={() => setShowDescriptionModal(false)}
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

/* ---------- Admin menu extracted for clarity ---------- */
function AdminMenu({ adminMenuRef, adminOpen, setAdminOpen, workshopId }) {
  // נשים את ה־callbacks בדפים שמרנדרים את WorkshopCard (כמו קודם)
  // דרך onManageParticipants / onEditWorkshop / onDeleteWorkshop שעוברים ב־props
  // כאן פשוט נשתמש ב-CustomEvent כדי לא לשבור API:
  const handleEmit = (type) => {
    window.dispatchEvent(
      new CustomEvent("workshop-admin-action", {
        detail: { type, workshopId },
      })
    );
  };

  useEffect(() => {
    const handler = (e) => {
      // no-op placeholder; הדפים themselves מאזינים לאיבנט אם צריכים
    };
    window.addEventListener("workshop-admin-action", handler);
    return () => window.removeEventListener("workshop-admin-action", handler);
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
            onClick={() => {
              setAdminOpen(false);
              handleEmit("edit");
            }}
            className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50"
          >
            ✏️ ערוך
          </button>
          <button
            onClick={() => {
              setAdminOpen(false);
              handleEmit("manage");
            }}
            className="w-full text-right px-3 py-2 text-sm hover:bg-indigo-50"
          >
            👥 משתתפים
          </button>
          <button
            onClick={() => {
              setAdminOpen(false);
              handleEmit("delete");
            }}
            className="w-full text-right px-3 py-2 text-sm text-red-600 hover:bg-red-50"
          >
            🗑️ מחק
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------- small util ---------- */
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
