/**
 * Workshops.jsx — Smart Search Edition (Multi-Sessions + Hebrew Day Logic)
 * -----------------------------------------------------------------------
 * ✅ חיפוש חכם בעברית: "יום ה" / "ימים א,ד"
 * ✅ תפריט יחיד לבחירת קטגוריה (שם, סוג, עיר, מאמן, ימים, מחיר...)
 * ✅ מחיקה, עריכה, הרשמה וביטול — כולם עובדים
 * ✅ עיצוב קומפקטי ונקי (Tailwind)
 */

import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
// After normalising the folder structure, shared UI pieces live under
// `src/components`. Import the workshop card and participants modal from the new
// path. No logic has changed; only the import paths were updated.
import WorkshopCard from "../../components/WorkshopCard";
import WorkshopParticipantsModal from "../../components/WorkshopParticipantsModal";
import { apiFetch } from "../../utils/apiFetch";

export default function Workshops() {
  const navigate = useNavigate();

  // 🔹 State
  const [searchBy, setSearchBy] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [feedback, setFeedback] = useState(null);
const [cities, setCities] = useState([]);
const { isLoggedIn, isAdmin, user } = useAuth();
  // 🔹 Context
  const {
  displayedWorkshops,
  registeredWorkshopIds,
  setRegisteredWorkshopIds,
  fetchWorkshops,
  deleteWorkshopLocal,
  loading,
  error,
  viewMode,
  registerEntityToWorkshop,
  unregisterEntityFromWorkshop,
  registerToWaitlist,
  unregisterFromWaitlist,
  fetchAvailableCities, 
} = useWorkshops();


  /* ============================================================
     🧩 Initial Data Fetch
  ============================================================ */
  useEffect(() => {
  const loadCities = async () => {
    try {
      const result = await fetchAvailableCities();
      if (Array.isArray(result)) setCities(result);
    } catch (err) {
      console.error("❌ Error loading cities:", err);
    }
  };
  loadCities();
}, []);

  useEffect(() => {
    fetchWorkshops();
  }, [viewMode]);

  useEffect(() => {
    if (!isLoggedIn) {
      setRegisteredWorkshopIds([]);
      return;
    }
    const fetchRegistered = async () => {
      try {
        const res = await apiFetch("/api/workshops/registered");
        if (res.status === 401) return;
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load registrations");
        setRegisteredWorkshopIds(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("❌ Error fetching registered workshops:", err);
      }
    };
    fetchRegistered();
  }, [isLoggedIn, setRegisteredWorkshopIds]);

  /* ============================================================
     🔍 Smart Filter Logic (Hebrew-aware)
  ============================================================ */
  const filteredWorkshops = useMemo(() => {
    if (!displayedWorkshops) return [];

    let list = [...displayedWorkshops];
    const q = searchQuery.trim().toLowerCase();
    if (!q) return list;

    // 🧠 Handle Hebrew day mapping (e.g. יום ה / ימים ב,ד)
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

      list = list.filter(
        (w) => Array.isArray(w.days) && normalized.some((n) => w.days.includes(n))
      );
      return list;
    }

    // 🌍 General wide search
    list = list.filter((w) => {
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

    return list;
  }, [displayedWorkshops, searchBy, searchQuery]);

  /* ============================================================
     👨‍👩 Group by user/family
  ============================================================ */
  const workshopsByEntity = useMemo(() => {
    if (!user) return {};
    const related = filteredWorkshops.filter(
      (w) =>
        w.isUserRegistered ||
        (Array.isArray(w.userFamilyRegistrations) && w.userFamilyRegistrations.length > 0)
    );
    const map = {};
    map[user._id] = {
      name: user.fullName || user.name || "אני",
      relation: "",
      workshops: related.filter((w) => w.isUserRegistered),
    };
    (user.familyMembers || []).forEach((member) => {
      const memberWorkshops = related.filter((w) =>
        (w.userFamilyRegistrations || []).some(
          (r) => String(r) === String(member._id)
        )
      );
      if (memberWorkshops.length)
        map[member._id] = {
          name: member.name,
          relation: member.relation || "",
          workshops: memberWorkshops,
        };
    });
    return map;
  }, [user, filteredWorkshops]);

  /* ============================================================
     ⚙️ Handlers
  ============================================================ */
  const handleSearch = (e) => setSearchQuery(e.target.value);

  const handleRegister = async (id, familyId = null) => {
    const result = await registerEntityToWorkshop(id, familyId);
    if (result.success) {
      setFeedback("✅ נרשמת בהצלחה לסדנה!");
      setRegisteredWorkshopIds((prev) => [...prev, id]);
      await fetchWorkshops();
    } else setFeedback("❌ שגיאה בהרשמה לסדנה");
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleUnregister = async (id, familyId = null) => {
    const result = await unregisterEntityFromWorkshop(id, familyId);
    if (result.success) {
      setFeedback("✅ ההרשמה בוטלה בהצלחה");
      setRegisteredWorkshopIds((prev) => prev.filter((x) => x !== id));
      await fetchWorkshops();
    } else setFeedback("❌ שגיאה בביטול ההרשמה");
    setTimeout(() => setFeedback(null), 2500);
  };

  const handleManageParticipants = (id) => {
    const found = displayedWorkshops.find((w) => w._id === id);
    if (found) setSelectedWorkshop(found);
  };

const handleEditWorkshop = (id) =>
  navigate(`/editworkshop/${id}`, { state: { cities } });

  const handleDeleteWorkshop = async (id) => {
    if (!window.confirm("למחוק את הסדנה לצמיתות?")) return;
    try {
      const res = await apiFetch(`/api/workshops/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה במחיקה");

      deleteWorkshopLocal(id);
      await fetchWorkshops();

      setFeedback("✅ הסדנה נמחקה בהצלחה");
    } catch (err) {
      console.error("❌ Error deleting workshop:", err);
      setFeedback(`❌ ${err.message}`);
    } finally {
      setTimeout(() => setFeedback(null), 2500);
    }
  };

  const handleModalClose = async () => {
    setSelectedWorkshop(null);
    await fetchWorkshops();
  };

  /* ============================================================
     🖼️ UI
  ============================================================ */
  const titleText = viewMode === "mine" ? "הסדנאות שלי" : "כלל הסדנאות";
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
        <p className="text-gray-600 text-sm md:text-base">{subtitleText}</p>
      </div>

      {/* 🔍 Smart Search Bar */}
      {viewMode === "all" && (
        <div className="max-w-6xl mx-auto bg-white/90 backdrop-blur-md border border-indigo-100 shadow-lg rounded-2xl p-4 md:p-6 flex flex-col sm:flex-row justify-center items-center gap-4 mb-8">
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
        </div>
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
      ) : error ? (
        <p className="text-center text-red-500 font-medium mt-10">❌ {error}</p>
      ) : viewMode === "mine" ? (
        Object.keys(workshopsByEntity).length > 0 ? (
          Object.entries(workshopsByEntity).map(([entityId, info]) => (
            <div key={entityId} className="mb-10">
              <h3 className="text-2xl font-bold text-indigo-800 text-center mb-4 border-b border-indigo-100 pb-1">
                {info.name} {info.relation ? `(${info.relation})` : ""}
              </h3>
              <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-6xl mx-auto">
                {info.workshops.map((w) => (
                  <WorkshopCard
                    key={w._id}
                    {...w}
                    isLoggedIn={isLoggedIn}
                    isAdmin={isAdmin}
                    isRegistered={w.isUserRegistered}
                    userFamilyRegistrations={w.userFamilyRegistrations || []}
                    onRegister={(fid) => handleRegister(w._id, fid)}
                    onUnregister={(fid) => handleUnregister(w._id, fid)}
                    onManageParticipants={() => handleManageParticipants(w._id)}
                    onEditWorkshop={() => handleEditWorkshop(w._id)}
                    onDeleteWorkshop={() => handleDeleteWorkshop(w._id)} // ✅ תוקן
                    searchQuery={searchQuery}
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
        <div className="grid gap-6 sm:gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 max-w-6xl mx-auto mt-10">
          {filteredWorkshops.map((w) => (
            <WorkshopCard
  key={w._id}
  {...w}
  isLoggedIn={isLoggedIn}
  isAdmin={isAdmin}
  isRegistered={w.isUserRegistered}
  userFamilyRegistrations={w.userFamilyRegistrations || []}
  onRegister={(fid) => handleRegister(w._id, fid)}
  onUnregister={(fid) => handleUnregister(w._id, fid)}
  onRegisterWaitlist={(fid) => registerToWaitlist(w._id, fid)}
  onUnregisterWaitlist={(fid) => unregisterFromWaitlist(w._id, fid)}
  onManageParticipants={() => handleManageParticipants(w._id)}
  onEditWorkshop={() => handleEditWorkshop(w._id)}
  onDeleteWorkshop={() => handleDeleteWorkshop(w._id)}
  searchQuery={searchQuery}
/>

          ))}
        </div>
      )}

      {/* 🪟 Participants Modal */}
      {selectedWorkshop && (
        <WorkshopParticipantsModal
          workshop={selectedWorkshop}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
