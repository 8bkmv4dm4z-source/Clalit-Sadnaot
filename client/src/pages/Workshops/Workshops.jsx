/**
 * Workshops.jsx — Full Version (apiFetch + Folder-Based Imports)
 * --------------------------------------------------------------
 * ✅ All logic & UI preserved
 * ✅ Replaces fetch() with apiFetch()
 * ✅ Compatible with your folder-based structure
 */

import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import WorkshopCard from "../../Components/WorkshopCard";
import WorkshopParticipantsModal from "../../Components/WorkshopParticipantsModal";
import { apiFetch } from "../../utils/apiFetch";

export default function Workshops() {
  const navigate = useNavigate();

  // 🔹 Local States
  const [searchBy, setSearchBy] = useState("all");
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [feedback, setFeedback] = useState(null);

  // 🔹 Contexts
  const { isLoggedIn, isAdmin, user, searchQuery, setSearchQuery } = useAuth();
  const {
    displayedWorkshops,
    registeredWorkshopIds,
    setRegisteredWorkshopIds,
    fetchWorkshops,
    loading,
    error,
    viewMode,
    registerEntityToWorkshop,
    unregisterEntityFromWorkshop,
  } = useWorkshops();

  // 🔹 Initial Sync
  useEffect(() => {
    fetchWorkshops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
    if (!isLoggedIn) return setRegisteredWorkshopIds([]);
    const fetchRegistered = async () => {
      try {
        const res = await apiFetch("/api/workshops/registered");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load registrations");
        setRegisteredWorkshopIds(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("❌ [Workshops] Error fetching registered workshops:", err);
      }
    };
    fetchRegistered();
  }, [isLoggedIn, setRegisteredWorkshopIds]);

  // 🔍 Search
  const handleSearch = (e) => setSearchQuery(e.target.value);

  // 🔹 Filtering
  const filteredWorkshops = useMemo(() => {
    if (!displayedWorkshops) return [];

    if (viewMode === "mine" && user?._id) {
      return displayedWorkshops.filter(
        (w) =>
          w.isUserRegistered ||
          (Array.isArray(w.userFamilyRegistrations) && w.userFamilyRegistrations.length > 0)
      );
    }

    if (!searchQuery.trim()) return displayedWorkshops;

    const q = searchQuery.trim().toLowerCase();
    return displayedWorkshops.filter((w) => {
      const fields =
        searchBy === "all"
          ? [
              w.title,
              w.type,
              w.ageGroup,
              w.city,
              w.coach,
              w.day,
              w.hour,
              w.description,
              String(w.price),
            ]
          : [w[searchBy]];
      return fields
        .filter(Boolean)
        .map((s) => s.toString().toLowerCase())
        .some((f) => f.startsWith(q));
    });
  }, [displayedWorkshops, searchQuery, searchBy, viewMode, registeredWorkshopIds, user?._id]);

  // 🧩 Group by user & family members
  const workshopsByEntity = useMemo(() => {
    if (!user) return {};

    const relatedWorkshops = filteredWorkshops.filter(
      (w) =>
        w.isUserRegistered ||
        (Array.isArray(w.userFamilyRegistrations) && w.userFamilyRegistrations.length > 0)
    );

    const map = {};
    const userId = user._id;

    // current user
    map[userId] = {
      name: user.fullName || user.name || "אני",
      relation: "",
      workshops: relatedWorkshops.filter((w) => w.isUserRegistered),
    };

    // family members
    const familyList = Array.isArray(user.familyMembers) ? user.familyMembers : [];

    familyList.forEach((member) => {
      const memberWorkshops = relatedWorkshops.filter((w) =>
        (w.userFamilyRegistrations || []).some((r) => String(r) === String(member._id))
      );
      if (memberWorkshops.length > 0) {
        map[member._id] = {
          name: member.name,
          relation: member.relation || "",
          workshops: memberWorkshops,
        };
      }
    });

    return map;
  }, [user, filteredWorkshops]);

  // 🔹 Registration handlers
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

  // 👥 Admin modal + Edit
  const handleManageParticipants = (id) => {
    const found = displayedWorkshops.find((w) => w._id === id);
    if (found) setSelectedWorkshop(found);
  };

  const handleEditWorkshop = (id) => navigate(`/editworkshop/${id}`);
  const handleModalClose = async () => {
    setSelectedWorkshop(null);
    await fetchWorkshops();
  };

  // 🧠 Header sync
  const titleText = viewMode === "mine" ? "הסדנאות שלי" : "כלל הסדנאות";
  const subtitleText =
    viewMode === "mine"
      ? "צפו בהרשמות שלכם ושל בני המשפחה לפי שם"
      : "חפש, הירשם או ערוך סדנאות בקלות";

  // -------------------- JSX --------------------
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-gray-50 p-6 md:p-10" dir="rtl">
      {/* Header */}
      <div className="max-w-6xl mx-auto mb-6 text-center transition-all duration-300">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">{titleText}</h2>
        <p className="text-gray-600 text-sm md:text-base">{subtitleText}</p>
      </div>

      {/* Filters */}
      {viewMode === "all" && (
        <div className="max-w-6xl mx-auto bg-white/90 backdrop-blur border border-gray-200 shadow-md rounded-2xl p-5 flex flex-wrap justify-center items-center gap-3">
          <select
            value={searchBy}
            onChange={(e) => setSearchBy(e.target.value)}
            className="px-3 py-2 rounded-xl border border-gray-300 bg-white text-sm text-gray-800 focus:ring-2 focus:ring-indigo-500"
          >
            <option value="all">חפש בכל</option>
            <option value="title">שם</option>
            <option value="type">סוג</option>
            <option value="city">עיר</option>
            <option value="coach">מאמן</option>
            <option value="day">יום</option>
            <option value="hour">שעה</option>
            <option value="description">תיאור</option>
            <option value="price">מחיר</option>
          </select>

          <div className="relative">
            <input
              type="text"
              placeholder="חפש סדנה..."
              value={searchQuery}
              onChange={handleSearch}
              className="w-64 pl-10 pr-4 py-2 rounded-xl border border-gray-300 bg-gray-50 text-gray-900 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">🔍</span>
          </div>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <div className="max-w-6xl mx-auto text-center mt-4">
          <p
            className={`inline-block px-4 py-2 rounded-xl text-sm ${
              feedback.startsWith("✅")
                ? "bg-green-100 text-green-700"
                : "bg-red-100 text-red-700"
            }`}
          >
            {feedback}
          </p>
        </div>
      )}

      {/* Workshops */}
      {loading ? (
        <p className="text-center text-gray-500 mt-10 animate-pulse">⏳ טוען סדנאות...</p>
      ) : error ? (
        <p className="text-center text-red-500 font-medium mt-10">❌ {error}</p>
      ) : viewMode === "mine" ? (
        Object.keys(workshopsByEntity).length > 0 ? (
          Object.entries(workshopsByEntity).map(([entityId, info]) => (
            <div key={entityId} className="mb-10">
              <h3 className="text-2xl font-bold text-blue-900 text-center mb-3">
                {info.name} {info.relation ? `(${info.relation})` : ""}
              </h3>
              <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto">
                {info.workshops.map((w) => (
                  <WorkshopCard
                    key={w._id}
                    {...w}
                    isLoggedIn={isLoggedIn}
                    isAdmin={isAdmin}
                    isRegistered={w.isUserRegistered}
                    userFamilyRegistrations={w.userFamilyRegistrations || []}
                    onRegister={(familyId) => handleRegister(w._id, familyId)}
                    onUnregister={(familyId) => handleUnregister(w._id, familyId)}
                    onManageParticipants={() => handleManageParticipants(w._id)}
                    onEditWorkshop={() => handleEditWorkshop(w._id)}
                    searchQuery={searchQuery}
                  />
                ))}
              </div>
            </div>
          ))
        ) : (
          <p className="text-center text-gray-600 mt-10">לא נמצאו סדנאות רשומות.</p>
        )
      ) : (
        <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto mt-10">
          {filteredWorkshops.map((w) => (
            <WorkshopCard
              key={w._id}
              {...w}
              isLoggedIn={isLoggedIn}
              isAdmin={isAdmin}
              isRegistered={w.isUserRegistered}
              userFamilyRegistrations={w.userFamilyRegistrations || []}
              onRegister={(familyId) => handleRegister(w._id, familyId)}
              onUnregister={(familyId) => handleUnregister(w._id, familyId)}
              onManageParticipants={() => handleManageParticipants(w._id)}
              onEditWorkshop={() => handleEditWorkshop(w._id)}
              searchQuery={searchQuery}
            />
          ))}
        </div>
      )}

      {/* Participants Modal */}
      {selectedWorkshop && (
        <WorkshopParticipantsModal
          workshop={selectedWorkshop}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
