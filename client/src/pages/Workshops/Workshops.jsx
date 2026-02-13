/**
 * Workshops.jsx — Smart Search Edition (Context-Only API Calls)
 * -----------------------------------------------------------------------
 * This component renders the Workshops page with advanced search capabilities.
 * It leverages the WorkshopContext for all data fetching and state management,
 * ensuring a clean separation of concerns and maintainable code.
 */
/* global IntersectionObserver */

import React, { useState, useMemo, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import WorkshopCard from "../../components/WorkshopCard";
import WorkshopParticipantsModal from "../../components/WorkshopParticipantsModal";
import { AnimatePresence, motion } from "framer-motion";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";

export default function Workshops() {
  const navigate = useNavigate();
  const { isLoggedIn, user } = useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();

  // 🔹 Local state
  const [searchBy, setSearchBy] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [feedback, setFeedback] = useState(null);
  const [cities, setCities] = useState([]);
  const [viewport, setViewport] = useState("desktop");

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
  } = useWorkshops();
  const errorMessage = typeof error === "string" ? error : error?.message;

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
    if (typeof setAccessScope === "function") setAccessScope(scope);
  }, [canAccessAdmin, isChecking, isLoggedIn, setAccessScope]);

  // 🔽 Infinite scroll / swipe-to-load for mobile
  const loadMoreRef = useRef(null);
  useEffect(() => {
    if (!loadMoreRef.current || viewMode !== "all") return undefined;

    const observer = new IntersectionObserver(
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

    const related = filteredWorkshops.filter(
      (w) =>
        w.isUserRegistered ||
        (Array.isArray(w.userFamilyRegistrations) && w.userFamilyRegistrations.length > 0)
    );

    const map = {};

    // Self
    map[user._id] = {
      name: user.fullName || user.name || "אני",
      relation: "",
      workshops: related.filter((w) => w.isUserRegistered),
    };

    // Family members
    (user.familyMembers || []).forEach((member) => {
      const memberWorkshops = related.filter((w) =>
        (w.userFamilyRegistrations || []).some(
          (r) => String(r) === String(member._id)
        )
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
  }, [user, filteredWorkshops]);

  /* ============================================================
     ⚙️ Handlers
  ============================================================ */
  const handleSearch = (e) => setSearchQuery(e.target.value);

  const handleDeleteWorkshop = async (id) => {
    if (!window.confirm("למחוק את הסדנה לצמיתות?")) return;
    const result = await deleteWorkshop(id);
    setFeedback(result.success ? "✅ הסדנה נמחקה בהצלחה" : `❌ ${result.message}`);
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleEditWorkshop = (id) =>
    navigate(`/editworkshop/${id}`, { state: { cities } });

  const handleManageParticipants = (id) => {
    const found = displayedWorkshops.find((w) => w._id === id);
    if (found) setSelectedWorkshop(found);
  };

  const handleModalClose = async () => {
    setSelectedWorkshop(null);
    await fetchWorkshops({ force: true, scope: accessScope });
  };

  /* ============================================================
     🖼️ UI
  ============================================================ */
  const titleText = viewMode === "mine" ? "הסדנאות שלי" : "כל הסדנאות";
  const subtitleText =
    viewMode === "mine"
      ? "צפו בהרשמות שלכם ושל בני המשפחה לפי שם"
      : "חיפוש חכם לפי שם, עיר, יום או מאמן";

  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-gray-50 p-4 md:p-8 transition-all"
    >
      {/* 🏷 Header */}
      <div className="max-w-6xl mx-auto text-center mb-8">
        <h2 className="text-4xl font-extrabold bg-gradient-to-r from-indigo-700 via-blue-700 to-sky-500 bg-clip-text text-transparent mb-2">
          {titleText}
        </h2>
<h3 className="text-lg md:text-xl font-semibold text-gray-700 mt-2">
  {subtitleText}
</h3>
      </div>

      {/* 🔍 Smart Search Bar */}
      {viewMode === "all" && (
        <motion.div
          layout
          initial={{ opacity: 0, y: -10, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="max-w-6xl mx-auto bg-white/90 backdrop-blur-md border border-indigo-100 shadow-lg rounded-2xl p-4 md:p-6 flex flex-col sm:flex-row justify-center items-center gap-4 mb-8"
        >
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-indigo-200 bg-gray-50 text-sm focus:ring-2 focus:ring-indigo-400"
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

          <div className="relative w-full sm:w-72">
            <input
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
              className="w-full pl-10 pr-4 py-2 rounded-xl border border-indigo-200 bg-gray-50 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-gray-900 transition"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-500 text-lg">
              🔍
            </span>
          </div>
        </motion.div>
      )}

      {/* 📣 Feedback */}
      {feedback && (
        <div className="max-w-6xl mx-auto text-center mt-2">
          <p
            className={`inline-block px-4 py-2 rounded-xl text-sm font-medium shadow-sm ${
              feedback.startsWith("✅")
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {feedback}
          </p>
        </div>
      )}

      {/* 🧩 Workshops Grid */}
      {loading ? (
        <p className="text-center text-gray-500 mt-10 animate-pulse">
          ⏳ טוען סדנאות...
        </p>
      ) : errorMessage ? (
        <p className="text-center text-red-500 font-medium mt-10">
          ❌ {errorMessage}
        </p>
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
                    onDeleteWorkshop={() => handleDeleteWorkshop(w._id)}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-600 mt-10">
            לא נמצאו סדנאות רשומות.
          </p>
        )
      ) : (
        <>
          <motion.div layout className={`${gridClass} mt-10`}>
            <AnimatePresence mode="popLayout">
              {filteredWorkshops.map((w) => (
                <motion.div
                  key={w._id}
                  layout
                  initial={{ opacity: 0, y: 14, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -12, scale: 0.98 }}
                  transition={{ duration: 0.25, ease: "easeOut" }}
                  className="h-full"
                >
                  <WorkshopCard
                    _id={w._id}
                    isLoggedIn={isLoggedIn}
                    searchQuery={searchQuery}
                    onManageParticipants={() => handleManageParticipants(w._id)}
                    onEditWorkshop={() => handleEditWorkshop(w._id)}
                    onDeleteWorkshop={() => handleDeleteWorkshop(w._id)}
                  />
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
          <div className="max-w-6xl mx-auto flex flex-col items-center gap-3 mt-8">
            {loadingMore && (
              <p className="text-sm text-gray-500">⏳ טוען עוד סדנאות...</p>
            )}
            {!loading && !loadingMore && pagination?.hasMore && (
              <button
                onClick={loadMoreWorkshops}
                className="px-4 py-2 rounded-lg bg-indigo-600 text-white shadow hover:bg-indigo-700 transition"
              >
                טען עוד סדנאות
              </button>
            )}
            {!loading && !loadingMore && !pagination?.hasMore && (
              <p className="text-sm text-gray-500">הצגת כל הסדנאות הזמינות</p>
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
    </div>
  );
}
