/**
 * Workshops.jsx — Smart Search Edition (Context-Only API Calls)
 * -----------------------------------------------------------------------
 * This component renders the Workshops page with advanced search capabilities.
 * It leverages the WorkshopContext for all data fetching and state management,
 * ensuring a clean separation of concerns and maintainable code.
 */
import React, { useState, useMemo, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import WorkshopCard from "../../components/WorkshopCard";
import WorkshopShowcaseCard from "../../components/WorkshopCard/WorkshopShowcaseCard";
import WorkshopParticipantsModal from "../../components/WorkshopParticipantsModal";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import { AnimatedTestimonials } from "@/components/ui/animated-testimonials";
import { getWorkshopImage } from "../../constants/workshopImages";
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Search,
} from "lucide-react";
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

const WORKSHOP_STYLE_KEY = "workshopsPreferredPageStyle";
const WORKSHOP_STYLE_ACTIVE_KEY = "workshopsActivePageStyle";
const WORKSHOP_STYLE_PREF_EVENT = "workshop-style-preference-change";
const WORKSHOP_STYLE_ACTIVE_EVENT = "workshop-style-active-change";
const normalizeWorkshopStyle = (value) =>
  value === "classic" || value === "showcase" ? value : null;
const scopeStyleKey = (scope) => `${WORKSHOP_STYLE_KEY}:${scope || "public"}`;

export default function Workshops() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();

  // 🔹 Local state
  const [searchBy, setSearchBy] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [pendingDeleteWorkshopId, setPendingDeleteWorkshopId] = useState(null);
  const [cities, setCities] = useState([]);
  const [viewport, setViewport] = useState("desktop");
  const [pageStyle, setPageStyle] = useState("classic");
  const previousScopeRef = useRef(null);
  const previousViewModeRef = useRef("all");
  const lastForcedFetchRef = useRef({ key: "", at: 0 });

  // 🔹 Context state
  const {
    displayedWorkshops,
    setRegisteredWorkshopIds,
    fetchWorkshops,
    fetchRegisteredWorkshops,
    deleteWorkshop,
    loading,
    error,
    viewMode,
    fetchAvailableCities,
    selectedWorkshop,
    setSelectedWorkshop,
    loadMoreWorkshops,
    loadingMore,
    pagination,
    accessScope,
    setAccessScope,
    userWorkshopMap,
    familyWorkshopMap,
  } = useWorkshops();
  const currentScope =
    accessScope || (canAccessAdmin ? "admin" : isLoggedIn ? "user" : "public");
  const errorMessage = typeof error === "string" ? error : error?.message;
  const effectivePageStyle = pageStyle;
  const runForcedWorkshopsFetch = useCallback(
    (key, args) => {
      const now = Date.now();
      const last = lastForcedFetchRef.current;
      if (last.key === key && now - last.at < 1200) return;
      lastForcedFetchRef.current = { key, at: now };
      fetchWorkshops(args);
    },
    [fetchWorkshops]
  );

  /* ============================================================
     🧩 Initial Data Fetch
  ============================================================ */
  useEffect(() => {
    const loadCities = async () => {
      const result = await fetchAvailableCities();
      if (Array.isArray(result)) setCities(result);
    };
    loadCities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    previousScopeRef.current = currentScope;
  }, [currentScope]);

  useEffect(() => {
    const syncPreference = (event) => {
      const next = normalizeWorkshopStyle(event?.detail?.style);
      if (!next) return;
      const resolved = next;
      setPageStyle(resolved);
      try {
        localStorage.setItem(scopeStyleKey(currentScope), resolved);
      } catch {
        /* ignore scope preference persistence failures */
      }
    };
    window.addEventListener(WORKSHOP_STYLE_PREF_EVENT, syncPreference);
    return () => {
      window.removeEventListener(WORKSHOP_STYLE_PREF_EVENT, syncPreference);
    };
  }, [currentScope]);

  useEffect(() => {
    try {
      localStorage.setItem(scopeStyleKey(currentScope), pageStyle);
    } catch {
      /* ignore scope preference persistence failures */
    }
  }, [pageStyle, currentScope]);

  useEffect(() => {
    try {
      localStorage.setItem(WORKSHOP_STYLE_ACTIVE_KEY, pageStyle);
      window.dispatchEvent(
        new CustomEvent(WORKSHOP_STYLE_ACTIVE_EVENT, {
          detail: { activeStyle: pageStyle, at: Date.now() },
        })
      );
    } catch {
      /* ignore preference persistence failures */
    }
  }, [pageStyle]);

  useEffect(() => {
    if (!isLoggedIn) {
      setRegisteredWorkshopIds([]);
      return;
    }
    fetchRegisteredWorkshops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoggedIn]);

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
    if (isChecking && isLoggedIn) return;
    const scope = canAccessAdmin ? "admin" : isLoggedIn ? "user" : "public";

    if (scope !== accessScope) {
      if (typeof setAccessScope === "function") setAccessScope(scope);
      runForcedWorkshopsFetch(`scope-sync:${scope}`, { force: true, scope });
    }
  }, [canAccessAdmin, isChecking, isLoggedIn, setAccessScope, accessScope, runForcedWorkshopsFetch]);

  // 🔽 Infinite scroll / swipe-to-load for mobile
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (!loadMoreRef.current || viewMode !== "all") return undefined;
    if (typeof window === "undefined" || typeof window.IntersectionObserver !== "function") {
      return undefined;
    }

    const observer = new window.IntersectionObserver(
      (entries) => {
        const first = entries[0];
        if (
          first.isIntersecting &&
          pagination?.hasMore &&
          !loading &&
          !loadingMore
        ) {
          loadMoreWorkshops();
        }
      },
      { rootMargin: "200px" }
    );

    observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [
    viewMode,
    pagination?.hasMore,
    loadMoreWorkshops,
    loading,
    loadingMore,
  ]);

  useEffect(() => {
    if (!searchQuery.trim()) return;
    if (viewMode !== "all") return;
    if (!pagination?.hasMore) return;
    if (loading || loadingMore) return;
    loadMoreWorkshops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery]);

  useEffect(() => {
    const switchedFromMineToAll =
      previousViewModeRef.current === "mine" && viewMode === "all";
    if (viewMode !== "all") return;
    if (pageStyle !== "showcase") return;
    if (loading || loadingMore) return;
    if (!pagination?.hasMore) return;
    if (switchedFromMineToAll && (displayedWorkshops?.length || 0) > 0) return;
    loadMoreWorkshops();
  }, [
    viewMode,
    pageStyle,
    pagination?.hasMore,
    loading,
    loadingMore,
    loadMoreWorkshops,
    displayedWorkshops,
  ]);

  useEffect(() => {
    previousViewModeRef.current = viewMode;
  }, [viewMode]);

  /* ============================================================
     🔍 Smart Filter Logic (Hebrew-aware)
  ============================================================ */
  const filteredWorkshops = useMemo(() => {
    if (!displayedWorkshops) return [];

    let list = [...displayedWorkshops];
    
    // 🔒 Filter out hidden workshops for non-admin users
    if (!canAccessAdmin) {
      list = list.filter((w) => !w.adminHidden);
    }
    
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    // 🧠 Handle Hebrew day mapping (e.g. "יום ה" / "ימים ב,ד")
    if (searchBy === "days" && q) {
      const normalized = q
        .replace(/[ ,]+/g, ",")
        .replace(/יום/g, "")
        .replace(/ימים/g, "")
        .replace(/א/g, "Sunday")
        .replace(/ב/g, "Monday")
        .replace(/ג/g, "Tuesday")
        .replace(/ד/g, "Wednesday")
        .replace(/ה/g, "Thursday")
        .replace(/ו/g, "Friday")
        .replace(/שבת/g, "Saturday")
        .split(",")
        .map((d) => d.trim())
        .filter(Boolean);

      return list.filter(
        (w) => Array.isArray(w.days) && normalized.some((n) => w.days.includes(n))
      );
    }

    // 🌍 General wide search
    return list.filter((w) => {
      const fields =
        searchBy === "all"
          ? [
              w.title,
              w.type,
              w.ageGroup,
              w.city,
              w.studio,
              w.coach,
              Array.isArray(w.days) ? w.days.join(", ") : "",
              w.hour,
              w.description,
              String(w.price),
              String(w.sessionsCount),
            ]
          : [Array.isArray(w[searchBy]) ? w[searchBy].join(", ") : w[searchBy]];

      return fields
        .filter(Boolean)
        .some((f) => f.toString().toLowerCase().includes(q));
    });
  }, [displayedWorkshops, searchBy, searchQuery, canAccessAdmin]);

  const isMobile = viewport === "mobile";
  const isTablet = viewport === "tablet";
  const gridClass = `grid ${
    isMobile ? "gap-4" : isTablet ? "gap-6" : "gap-6 sm:gap-8"
  } grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 max-w-6xl mx-auto`;

  /* ============================================================
     👨‍👩 Group by user/family for "mine" view
  ============================================================ */
  const workshopsByEntity = useMemo(() => {
    if (!user) return {};
    const registered = (displayedWorkshops || []).filter(
      (w) =>
        !!userWorkshopMap[w._id] ||
        ((familyWorkshopMap[w._id] || []).length > 0)
    );

    const map = {};

    // Self
    map[user._id] = {
      name: user.fullName || user.name || "אני",
      relation: "",
      workshops: registered.filter((w) => !!userWorkshopMap[w._id]),
    };

    // Family members
    (user.familyMembers || []).forEach((member) => {
      const memberKey = String(member?.entityKey || member?._id || "");
      const memberWorkshops = registered.filter((w) =>
        (familyWorkshopMap[w._id] || []).some((r) => String(r) === memberKey)
      );
      if (memberWorkshops.length) {
        map[member._id] = {
          name: member.name,
          relation: member.relation || "",
          workshops: memberWorkshops,
        };
      }
    });

    return map;
  }, [user, displayedWorkshops, userWorkshopMap, familyWorkshopMap]);

  /* ============================================================
     ⚙️ Handlers
  ============================================================ */
  const handleSearch = (e) => setSearchQuery(e.target.value);

  const requestDeleteWorkshop = (id) => setPendingDeleteWorkshopId(id);

  const handleConfirmDeleteWorkshop = async () => {
    if (!pendingDeleteWorkshopId) return;
    const result = await deleteWorkshop(pendingDeleteWorkshopId);
    setFeedback(result.success ? "✅ הסדנה נמחקה בהצלחה" : `❌ ${result.message}`);
    setPendingDeleteWorkshopId(null);
    setTimeout(() => setFeedback(null), 2500);
  };

  const pendingDeleteWorkshop = pendingDeleteWorkshopId
    ? displayedWorkshops?.find((workshop) => workshop._id === pendingDeleteWorkshopId)
    : null;

  const handleEditWorkshop = (id) =>
    navigate(`/editworkshop/${id}`, { state: { cities } });

  const handleManageParticipants = (id) => {
    const found = displayedWorkshops.find((w) => w._id === id);
    if (found) setSelectedWorkshop(found);
  };

  const handleShowcaseOpen = (workshop) => {
    if (!isLoggedIn) {
      navigate("/register", {
        state: {
          from: "/workshops",
          workshopId: workshop?._id,
          workshopTitle: workshop?.title || "",
        },
      });
      return;
    }
    setPageStyle("classic");
    if (workshop?.title) setSearchQuery(workshop.title);
  };

  const handleModalClose = async () => {
    setSelectedWorkshop(null);
    await fetchWorkshops({ force: true, scope: accessScope });
  };

  /* ============================================================
     🖼️ UI
  ============================================================ */
  const headerTitle = "ברוכים הבאים לסדנאות";
  const headerSubtitle =
    accessScope === "public"
      ? "כאן תוכלו לחפש כל סדנה זמינה."
      : "ניהול סדנאות עבורכם ועבור בני המשפחה.";
  const showcaseCards = useMemo(() => {
    const cards = filteredWorkshops.map((w) => ({
        _id: w._id,
        title: w.title,
        coach: w.coach,
        city: w.city,
        hour: w.hour,
        days: w.days,
        participantsCount:
          typeof w.participantsCount === "number"
            ? w.participantsCount
            : Array.isArray(w.participants)
              ? w.participants.length
              : 0,
        maxParticipants: Number(w.maxParticipants) || 0,
        imageUrl: getWorkshopImage(w.image),
        description: w.description,
      }));

    return cards;
  }, [filteredWorkshops]);
  const testimonialSlides = useMemo(
    () =>
      showcaseCards.slice(0, 10).map((w) => ({
        quote:
          w.description?.trim() ||
          "סדנה מבוקשת עם יחס אישי, הדרכה מקצועית וקבוצות בגודל שמתאים לתרגול איכותי.",
        name: w.title || "סדנה",
        designation: `${w.coach || "מאמן צוות"} • ${w.city || "מיקום יעודכן"}`,
        src: w.imageUrl,
      })),
    [showcaseCards]
  );

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-gray-50 p-4 md:p-8 transition-all"
    >
      {/* 🏷 Header */}
      <div className="mx-auto mb-8 max-w-6xl">
        <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
          <h2 className="text-3xl font-black tracking-tight text-transparent bg-gradient-to-l from-sky-600 via-blue-700 to-slate-900 bg-clip-text md:text-5xl">
            {headerTitle}
          </h2>
          <p className="mt-3 text-base text-slate-600 md:text-lg">{headerSubtitle}</p>
        </div>
      </div>

      {/* 🔍 Smart Search Bar */}
      {viewMode === "all" && (
        <div
          className="mx-auto mb-8 flex max-w-6xl flex-col items-stretch gap-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:flex-row md:items-center md:justify-between md:p-5"
        >
          <div className="flex w-full flex-col gap-3 sm:flex-row md:w-auto">
            <label htmlFor="workshops-search-scope" className="sr-only">
              סינון חיפוש לפי
            </label>
            <select
              id="workshops-search-scope"
              value={searchBy}
              onChange={(e) => setSearchBy(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition focus:border-slate-500 focus:bg-white focus:outline-none sm:w-auto"
            >
              <option value="all">חפש בכל</option>
              <option value="title">שם</option>
              <option value="type">סוג</option>
              <option value="city">עיר</option>
              <option value="coach">מאמן</option>
              <option value="days">ימים</option>
              <option value="hour">שעה</option>
              <option value="sessionsCount">מספר מפגשים</option>
              <option value="price">מחיר</option>
            </select>

            <div className="relative w-full sm:min-w-80">
              <label htmlFor="workshops-search-input" className="sr-only">
                חיפוש סדנאות
              </label>
              <input
                id="workshops-search-input"
                type="text"
                placeholder={
                  searchBy === "days"
                    ? "לדוגמה: יום ה / ימים א,ה"
                    : "חפש לפי " +
                      ({
                        all: "כל השדות",
                        title: "שם",
                        city: "עיר",
                        coach: "מאמן",
                        type: "סוג",
                        hour: "שעה",
                        price: "מחיר",
                        sessionsCount: "מספר מפגשים",
                      }[searchBy] || "מילה")
                }
                value={searchQuery}
                onChange={handleSearch}
                className="w-full rounded-xl border border-slate-300 bg-slate-50 py-2 pl-10 pr-4 text-sm font-medium text-slate-900 placeholder:font-normal placeholder:text-slate-400 shadow-sm transition focus:border-slate-500 focus:bg-white focus:outline-none"
              />
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            </div>
          </div>
        </div>
      )}

      {/* 📣 Feedback */}
      {feedback && (
        <div className="mx-auto mt-2 max-w-6xl">
          <div
            className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium shadow-sm ${
              feedback.startsWith("✅")
                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                : "border-rose-200 bg-rose-50 text-rose-700"
            }`}
          >
            {feedback.startsWith("✅") ? (
              <CheckCircle2 size={16} />
            ) : (
              <AlertTriangle size={16} />
            )}
            <span>{feedback}</span>
          </div>
        </div>
      )}

      {/* 🧩 Workshops Grid */}
      {loading ? (
        <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-sm">
          <p className="inline-flex items-center gap-2 text-sm font-medium text-slate-600">
            <Loader2 size={16} className="animate-spin" />
            טוען סדנאות...
          </p>
        </div>
      ) : errorMessage ? (
        <div className="mx-auto mt-10 max-w-2xl rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 shadow-sm">
          <p className="inline-flex items-center gap-2 text-sm font-semibold text-rose-700">
            <AlertTriangle size={16} />
            {errorMessage}
          </p>
        </div>
      ) : viewMode === "mine" ? (
        Object.keys(workshopsByEntity).length > 0 ? (
          Object.entries(workshopsByEntity).map(([entityId, info]) => (
            <div key={entityId} className="mb-10">
              <h3 className="text-2xl font-bold text-indigo-800 text-center mb-4 border-b border-indigo-100 pb-1">
                {info.name} {info.relation ? `(${info.relation})` : ""}
              </h3>

              <div className={gridClass}>
                {info.workshops.map((w) => (
                  <WorkshopCard
                    key={w._id}
                    _id={w._id}
                    isLoggedIn={isLoggedIn}
                    searchQuery={searchQuery}
                    onManageParticipants={() => handleManageParticipants(w._id)}
                    onEditWorkshop={() => handleEditWorkshop(w._id)}
                    onDeleteWorkshop={() => requestDeleteWorkshop(w._id)}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <div className="mx-auto mt-10 max-w-md rounded-2xl border border-slate-200 bg-white px-5 py-4 text-center shadow-sm">
            <p className="text-sm font-medium text-slate-600">לא נמצאו סדנאות רשומות.</p>
          </div>
        )
      ) : (
        <>
          {effectivePageStyle === "showcase" && testimonialSlides.length > 0 && (
            <div className="max-w-6xl mx-auto rounded-3xl border border-indigo-100 bg-white/70 backdrop-blur-sm mb-8">
              <AnimatedTestimonials testimonials={testimonialSlides} autoplay />
            </div>
          )}
          {effectivePageStyle === "classic" ? (
            <div className={`${gridClass} mt-10`}>
              {filteredWorkshops.map((w) => (
                <div key={w._id} className="h-full">
                  <WorkshopCard
                    _id={w._id}
                    isLoggedIn={isLoggedIn}
                    searchQuery={searchQuery}
                    onManageParticipants={() => handleManageParticipants(w._id)}
                    onEditWorkshop={() => handleEditWorkshop(w._id)}
                    onDeleteWorkshop={() => requestDeleteWorkshop(w._id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-10 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
              {showcaseCards.map((workshop) => (
                <WorkshopShowcaseCard
                  key={workshop._id}
                  workshop={workshop}
                  onOpen={() => handleShowcaseOpen(workshop)}
                />
              ))}
            </div>
          )}
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-3 mt-8">
            {loadingMore && (
              <p className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 shadow-sm">
                <Loader2 size={15} className="animate-spin" />
                טוען עוד סדנאות...
              </p>
            )}
            {effectivePageStyle === "classic" && !loading && !loadingMore && pagination?.hasMore && (
              <button
                onClick={loadMoreWorkshops}
                className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow transition hover:bg-slate-700"
              >
                טען עוד סדנאות
              </button>
            )}
            {!loading && !loadingMore && !pagination?.hasMore && (
              <p className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-500 shadow-sm">
                הצגת כל הסדנאות הזמינות
              </p>
            )}
            <div ref={loadMoreRef} className="h-1 w-full" />
          </div>
        </>
      )}

      {/* 🪟 Participants Modal */}
      {selectedWorkshop && (
        <WorkshopParticipantsModal
          workshop={selectedWorkshop}
          onClose={handleModalClose}
          refreshWorkshops={fetchWorkshops}
          accessScope={accessScope}
        />
      )}

      <AlertDialog
        open={Boolean(pendingDeleteWorkshopId)}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setPendingDeleteWorkshopId(null);
        }}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת סדנה</AlertDialogTitle>
            <AlertDialogDescription>
              למחוק לצמיתות את הסדנה
              {" "}
              <span className="font-semibold text-slate-900">
                {pendingDeleteWorkshop?.title || "שנבחרה"}
              </span>
              ?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDeleteWorkshop}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              מחק לצמיתות
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
