// WorkshopCard.jsx — FIXED FINAL VERSION

import React, { useMemo, useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { getEntityIdentifiers } from "../../utils/entityTypes";
import { useNavigate } from "react-router-dom";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";

// 1. Import the Image Helper
import { getWorkshopImage } from "../../constants/workshopImages";

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
  Eye,
  EyeOff,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

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
}) {
  const { user, isLoggedIn } = useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();
  const navigate = useNavigate();

  const {
    workshops,
    registeredWorkshopIds,
    userWorkshopMap,
    familyWorkshopMap,
    registerEntityToWorkshop,
    unregisterEntityFromWorkshop,
    registerToWaitlist,
    unregisterFromWaitlist,
    updateWorkshop,
  } = useWorkshops();

  const wid = str(_id);

  // -------- Workshop lookup (no memo → always fresh from context) --------
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const workshop = Array.isArray(workshops)
    ? workshops.find((w) => str(w._id) === wid) || {}
    : {};

  const adminEnabled = !isChecking && canAccessAdmin;

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
    adminHidden = false,
    participants = [],
    waitingList = [],
    waitingListMax = 0,
    participantsCount: participantsCountRaw,
    waitingListCount = 0,
    familyRegistrationsCount = 0,
    registrationStatus = "not_registered",
    isUserInWaitlist = false,
    maxParticipants: maxParticipantsRaw,
    startDate,
    endDate,
    inactiveDates = [],
    userFamilyRegistrations = [],
  } = workshop;
const [localHidden, setLocalHidden] = useState(!!adminHidden);

  // -------- UI state --------
  const [showFamilyModal, setShowFamilyModal] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [showWaitlist, setShowWaitlist] = useState(false);
  const [visibilityLoading, setVisibilityLoading] = useState(false);
  const [viewport, setViewport] = useState("desktop");

  useEffect(() => {
    const computeViewport = () => {
      const width = window.innerWidth || 0;
      if (width < 640) return "mobile";
      if (width < 1024) return "tablet";
      return "desktop";
    };

    const handleResize = () => setViewport(computeViewport());
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    setLocalHidden(!!adminHidden);
  }, [adminHidden, wid]);


  
  // 2. Resolve Image URL (Preset ID or Custom URL)
  const imageUrl = getWorkshopImage(image);

  const userKey = str(user?.entityKey);

  // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const participantIdSet = useMemo(() => {
    return new Set(
      participantsArr
        .map((p) => str(p?.entityKey || p))
        .filter(Boolean)
    );
  }, [participantsArr]);

  const isMobile = viewport === "mobile";
  const isTablet = viewport === "tablet";
  const shortDescription = description?.trim()
    ? description.trim()
    : "סדנה פעילה עם הדרכה מקצועית וקבוצה דינמית.";


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

  const waitlistTotal =
    typeof waitingListCount === "number" ? waitingListCount : waitRows.length;

  // -------- true self waitlist logic --------
  const selfOnWaitlist = useMemo(
    () =>
      isUserInWaitlist ||
      (!!userKey &&
        waitRows.some(
          (e) => e.parentKey === userKey && e.entityKey === userKey
        )),
    [waitRows, userKey, isUserInWaitlist]
  );

  const isWorkshopFull =
    maxParticipants > 0 && participantsCount >= maxParticipants;

  const isHidden = localHidden;

  // -------- self registered logic (per-entity only) --------
  const isSelfRegistered = useMemo(() => {
    if (!userKey || !wid) return false;

    if (registrationStatus === "registered") return true;
    if (registeredWorkshopIds?.includes(wid)) return true;
    if (userWorkshopMap?.[wid] === true) return true;
    if (workshop?.isUserRegistered) return true;

    return participantIdSet.has(userKey);
  }, [
    userKey,
    wid,
    registeredWorkshopIds,
    userWorkshopMap,
    workshop,
    participantIdSet,
    registrationStatus,
  ]);

  // -------- family registered set (entityKey-based) --------
  const familyRegisteredIdSet = useMemo(() => {
    const src =
      familyWorkshopMap?.[wid] ??
      (Array.isArray(userFamilyRegistrations) ? userFamilyRegistrations : []);

    const normalizeId = (entry) =>
      getEntityIdentifiers(entry).entityKey || str(entry);

    return new Set(src.map(normalizeId).filter(Boolean));
  }, [familyWorkshopMap, wid, userFamilyRegistrations]);

  // -------- button logic (per entity) --------
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

    if (!available) {
      return {
        label: "לא זמינה",
        color: "bg-gray-200 text-gray-500 shadow-inner",
        action: null,
      };
    }

    if (isHidden) {
      return {
        label: "סדנה מוסתרת",
        color: "bg-gray-200 text-gray-500 shadow-inner",
        action: null,
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const selfButton = useMemo(() => getEntityButton(userKey), [
    userKey,
    isSelfRegistered,
    selfOnWaitlist,
    isWorkshopFull,
    isHidden,
    available,
    familyRegisteredIdSet,
    waitRows,
  ]);

  // ---------- Execute action ----------
  const runEntityAction = (entity) => {
    const btn = getEntityButton(entity);
    if (!btn?.action || loading) return;

    const ek = typeof entity === "object" ? str(entity?.entityKey) : userKey;

    setLoading(true);

    btn
      .action(ek)
      .then((res) => {
        if (!res?.success) {
          setFeedback(` ${res?.message || "הפעולה נכשלה"}`);
        } else {
          setFeedback(` ! הרשמה בוצעה בהצלחה`);
        }
      })
      .catch((err) => {
        setFeedback(` ${err?.message || "הרשמה נכשלה"}`);
      })
      .finally(() => {
        setLoading(false);
        setTimeout(() => setFeedback(null), 2000);
      });
  };

  const toggleVisibility = async (e) => {
    if (e?.stopPropagation) e.stopPropagation();
    if (!adminEnabled || visibilityLoading) return;

    const currentHidden = localHidden;
    const nextHidden = !currentHidden;
    setVisibilityLoading(true);
    setFeedback(null);
    setLocalHidden(nextHidden);

    try {
      const result = await updateWorkshop(wid, { adminHidden: nextHidden });
      if (!result?.success) {
        setLocalHidden(currentHidden);
        setFeedback(`❌ ${result?.message || "עדכון החשיפה נכשל"}`);
      } else {
        setFeedback(
          nextHidden
            ? "✅ הסדנה הוסתרה ממשתמשים"
            : "✅ הסדנה הוחזרה לתצוגה"
        );
      }
    } catch (err) {
      setLocalHidden(currentHidden);
      setFeedback(`❌ ${err?.message || "עדכון החשיפה נכשל"}`);
    } finally {
      setVisibilityLoading(false);
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  // ---------- Skeleton ----------
  if (!workshop || !wid) {
    return (
      <div className="relative rounded-2xl border border-indigo-100/80 shadow-[0_2px_16px_rgba(99,102,241,0.08)] overflow-hidden bg-gradient-to-br from-white via-indigo-50/50 to-blue-50/60 p-4">
        <Skeleton className="h-44 w-full mb-3" />
        <Skeleton className="h-4 w-2/3 mb-2" />
        <Skeleton className="h-3 w-1/2 mb-1" />
        <Skeleton className="h-3 w-1/3" />
      </div>
    );
  }

  return (
    <>
      {/* ===================== CARD ===================== */}
      <div
        onClick={() => {
          if (!isLoggedIn) navigate("/Register");
        }}
        className={`
        group relative overflow-hidden rounded-3xl border border-slate-200
        bg-white shadow-sm hover:-translate-y-1 hover:shadow-xl
        transition-all duration-300 cursor-pointer
        ${isMobile ? "text-[13px]" : isTablet ? "text-[14px]" : "text-sm"}
        `}
      >

        {/* Price */}
        {price !== undefined && price !== null && price !== "" && (
          <div className="absolute top-3 left-3 z-10">
            <div className="rounded-full bg-slate-900/90 px-3 py-1 text-xs font-semibold text-white shadow-lg backdrop-blur-sm">
              <span className="inline-flex items-center gap-1">
                <Coins size={14} />
                {Number(price)} ₪
              </span>
            </div>
          </div>
        )}

        {adminEnabled && localHidden && (
          <div className="absolute top-3 right-3 z-10">
            <div className="bg-rose-600/90 text-white px-3 py-1 rounded-full text-xs font-semibold shadow-lg inline-flex items-center gap-1">
              <EyeOff size={14} />
              מוסתר
            </div>
          </div>
        )}

        {/* Image */}
        <div
          className={`relative w-full overflow-hidden ${
            isMobile ? "h-48" : "h-52 sm:h-56"
          }`}
        >
          {/* 3. Use imageUrl here. The helper ensures a valid URL, so we can render it directly. */}
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={title}
              className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            // This fallback is technically unreachable now if the helper always returns a default, 
            // but kept for strict logic preservation just in case.
            <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400">
              אין תמונה
            </div>
          )}

          {!available && (
            <div className="absolute inset-0 bg-gray-800/70 flex items-center justify-center text-white font-semibold text-base">
              לא זמינה
            </div>
          )}
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/55 to-transparent" />
        </div>

        {/* CONTENT */}
        <div className="space-y-4 p-5 text-right">
          {/* Title + Admin */}
          <div
            className={`flex gap-2 ${
              isMobile ? "flex-col items-start" : "items-center"
            }`}
          >
            <h3
              className={`flex-1 truncate font-semibold tracking-tight text-slate-900 ${
                isMobile ? "text-lg leading-tight" : "text-lg"
              }`}
            >
              {highlight(title, searchQuery)}
            </h3>

            {adminEnabled && (
              <div
                className={`flex items-center gap-2 ${
                  isMobile ? "w-full justify-between flex-wrap" : ""
                }`}
              >
                <AdminVisibilityToggle
                  hidden={localHidden}
                  onToggle={toggleVisibility}
                  loading={visibilityLoading}
                />
                <AdminMenu
                  workshopId={wid}
                  onManageParticipants={onManageParticipants}
                  onEditWorkshop={onEditWorkshop}
                  onDeleteWorkshop={onDeleteWorkshop}
                  className={isMobile ? "self-end" : ""}
                />
              </div>
            )}
          </div>

          <p className="line-clamp-2 text-sm leading-6 text-slate-600">
            {highlight(shortDescription, searchQuery)}
          </p>

          {/* Type */}
          {type && (
            <Badge
              variant="secondary"
              className="ml-auto w-max rounded-full border border-slate-300 bg-slate-100 px-2.5 text-[11px] text-slate-700"
            >
              {highlight(type, searchQuery)}
            </Badge>
          )}

          {/* INFO PILLS */}
          <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5">
              <MapPin size={14} className="text-slate-500" />
              <span className="line-clamp-1">
                {highlight(
                  city && address ? `${city}, ${address}` : city || address || "ללא כתובת",
                  searchQuery
                )}
              </span>
              {(city || address) && (
                <a
                  href={`https://www.google.com/maps?q=${encodeURIComponent(
                    `${address || ""}, ${city || ""}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  title="פתח במפות"
                  className="shrink-0 text-slate-500 hover:text-slate-800"
                  onClick={(e) => e.stopPropagation()}
                >
                  🌍
                </a>
              )}
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5">
              <Dumbbell size={14} className="text-slate-500" />
              <span className="line-clamp-1">{highlight(coach || "מאמן לא צוין", searchQuery)}</span>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5">
              <Building2 size={14} className="text-slate-500" />
              <span className="line-clamp-1">{highlight(studio || "סטודיו לא צוין", searchQuery)}</span>
            </div>

            <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1.5">
              <Calendar size={14} className="text-slate-500" />
              <span className="line-clamp-1">{highlight(daysStr, searchQuery)}</span>
              <span className="text-slate-400">|</span>
              <Clock size={13} className="text-slate-500" />
              <span className="line-clamp-1">{highlight(hour || "שעה לא זמינה", searchQuery)}</span>
            </div>

            {/* Participants / Waitlist toggle */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowWaitlist((p) => !p);
              }}
              className="col-span-2 flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-right transition hover:bg-slate-100"
            >
              <span className="flex items-center gap-1.5 font-semibold tracking-wide text-slate-800">
                {showWaitlist ? <Hourglass size={16} /> : <Users size={16} />}
                {showWaitlist ? "רשימת המתנה" : "משתתפים"}
              </span>

              <span className="inline-flex items-center gap-2 font-semibold text-slate-700">
                {showWaitlist ? (
                  <>
                    <Hourglass size={16} className="text-amber-500" />
                    {`${waitlistTotal}/${waitingListMax || "∞"}`}
                    <ChevronUp size={16} />
                  </>
                ) : (
                  <>
                    <Users size={16} className="text-slate-700" />
                    {`${participantsCount}/${maxParticipants || "∞"}`}
                    <ChevronDown size={16} />
                  </>
                )}
              </span>
            </button>
          </div>

          {/* Description CTA */}
          {description && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowDescriptionModal(true);
                    }}
                    className="inline-flex w-full items-center justify-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                  >
                    <Info size={16} /> קרא עוד על הסדנה
                  </button>
                </TooltipTrigger>
                <TooltipContent>לחץ לצפייה בתיאור המלא</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        
          {/* --------------------- SELF BUTTON --------------------- */}
          {isLoggedIn && (
            <button
              onClick={(e) => {
                  if (!isLoggedIn) return;

                e.stopPropagation();
                runEntityAction(userKey);
              }}
              disabled={loading || !selfButton?.action}
              className={`w-full mt-1.5 py-2 font-semibold rounded-xl transition-all disabled:opacity-60 ${selfButton.color}`}
            >
              {loading ? "..." : selfButton.label}
            </button>
          )}

          {/* FAMILY BUTTON */}
          {user?.familyMembers?.length > 0 && (
            <button
              onClick={(e) => {
                  if (!isLoggedIn) return;

                e.stopPropagation();
                setShowFamilyModal(true);
              }}
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
      <Dialog open={showFamilyModal} onOpenChange={(open) => { if (!open) setShowFamilyModal(false); }}>
        <DialogContent className="max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-indigo-800 border-b border-indigo-100 pb-2">
              רישום בני משפחה לסדנה "{title}"
            </DialogTitle>
          </DialogHeader>

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
                      onClick={(e) => {
                          if (!isLoggedIn) return;

                        e.stopPropagation();
                        runEntityAction(member);
                      }}
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

          <Button
            onClick={(e) => {
                if (!isLoggedIn) return;
              e.stopPropagation();
              setShowFamilyModal(false);
            }}
            className="mt-2 w-full"
          >
            סגור
          </Button>
        </DialogContent>
      </Dialog>

      {/* ===================== DESCRIPTION MODAL ===================== */}
      <Dialog open={showDescriptionModal} onOpenChange={(open) => { if (!open) setShowDescriptionModal(false); }}>
        <DialogContent className="max-w-lg" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-indigo-800 border-b border-indigo-100 pb-2">
              תיאור הסדנה "{title}"
            </DialogTitle>
          </DialogHeader>

          <div className="max-h-[60vh] overflow-y-auto pr-1.5">
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-700">{description}</p>
          </div>

          <Button
            onClick={() => setShowDescriptionModal(false)}
            className="mt-2 w-full"
          >
            סגור
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ---------- Admin Visibility Toggle ---------- */
function AdminVisibilityToggle({ hidden, onToggle, loading }) {
  const pillColors = hidden
    ? "bg-rose-50 text-rose-700 border-rose-200"
    : "bg-emerald-50 text-emerald-700 border-emerald-200";
  const sliderBg = hidden ? "bg-rose-500/80" : "bg-emerald-500/80";
  const knobPosition = hidden ? "translate-x-7" : "translate-x-1";

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (typeof onToggle === "function") onToggle(e);
            }}
            disabled={loading}
            className={`inline-flex items-center gap-2 px-2.5 py-1 rounded-full border text-xs font-semibold transition ${pillColors} disabled:opacity-70 disabled:cursor-not-allowed`}
          >
            <span
              className={`relative inline-flex items-center h-7 w-14 rounded-full ${sliderBg} transition-colors`}
            >
              <span
                className={`absolute h-5 w-5 bg-white rounded-full shadow transform transition-transform ${knobPosition}`}
              />
            </span>
            <span className="inline-flex items-center gap-1">
              {hidden ? <EyeOff size={14} /> : <Eye size={14} />}
              {loading ? "..." : hidden ? "מוסתר" : "גלוי"}
            </span>
          </button>
        </TooltipTrigger>
        <TooltipContent>הצג/הסתר למשתמשים</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/* ---------- Admin Menu ---------- */
function AdminMenu({
  workshopId,
  onManageParticipants,
  onEditWorkshop,
  onDeleteWorkshop,
  className = "",
}) {
  const handlers = {
    edit: onEditWorkshop,
    manage: onManageParticipants,
    delete: onDeleteWorkshop,
  };

  const handleAction = (type) => {
    const fn = handlers[type];
    if (typeof fn === "function") {
      fn(workshopId);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("workshop-admin-action", {
        detail: { type, workshopId },
      })
    );
  };

  return (
    <div className={className} onClick={(e) => e.stopPropagation()}>
      <DropdownMenu dir="rtl">
        <DropdownMenuTrigger asChild>
          <button
            className="p-1.5 rounded-lg bg-white/60 border border-indigo-100 hover:bg-white shadow-sm"
            title="אפשרויות ניהול"
          >
            <MoreVertical size={18} className="text-indigo-700" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40">
          <DropdownMenuItem onClick={() => handleAction("edit")}>
            ✏️ ערוך
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => handleAction("manage")}>
            👥 משתתפים
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleAction("delete")}
            className="text-red-600 focus:text-red-600 focus:bg-red-50"
          >
            🗑️ מחק
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
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
