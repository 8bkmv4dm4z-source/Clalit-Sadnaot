import React, { useState, useMemo, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import WorkshopCard from "../../Components/WorkshopCard";
import WorkshopParticipantsModal from "../../Components/WorkshopParticipantsModal";

/**
 * Workshops.jsx — Unified Logic + Debug Logs
 * -----------------------------------------
 * Added detailed console logs for debugging:
 * - Fetching data
 * - Register/unregister flows
 * - Modal behavior
 * - Search & filter logic
 */

export default function Workshops() {
  const navigate = useNavigate();

  /** 🧩 Local UI States */
  const [searchBy, setSearchBy] = useState("all");
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [feedback, setFeedback] = useState(null);

  /** 🧠 Global Contexts */
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

  /** 🔹 Fetch workshops once (and whenever mode changes) */
  useEffect(() => {
    console.log("🔄 [Workshops] Fetching workshops for mode:", viewMode);
    fetchWorkshops();
  }, [viewMode]);

  /** 🔹 Load registered workshops for logged-in users */
  useEffect(() => {
    const fetchRegistered = async () => {
      console.log("👤 [Workshops] Checking registered workshops. Logged in?", isLoggedIn);
      if (!isLoggedIn) {
        console.log("⚠️ [Workshops] Not logged in → clearing registeredWorkshopIds");
        return setRegisteredWorkshopIds([]);
      }
      try {
        const token = localStorage.getItem("token");
        console.log("🔑 [Workshops] Using token:", !!token);
        const res = await fetch("/api/workshops/registered", {
          headers: { Authorization: `Bearer ${token}` },
        });
        console.log("📡 [Workshops] /api/workshops/registered status:", res.status);
        const data = await res.json();
        console.log("📦 [Workshops] Registered workshops response:", data);
        if (!res.ok) throw new Error(data.message || "Failed to load registrations");
        setRegisteredWorkshopIds(Array.isArray(data) ? data : []);
        console.log("✅ [Workshops] Registered workshop IDs set:", data);
      } catch (err) {
        console.error("❌ [Workshops] Error fetching registered workshops:", err);
      }
    };
    fetchRegistered();
  }, [isLoggedIn]);

  /** 🔍 Search input handler */
  const handleSearch = (e) => {
    console.log("🔍 [Workshops] Search changed:", e.target.value);
    setSearchQuery(e.target.value);
  };

  /** 🔹 Filter logic (local only) */
  const filteredWorkshops = useMemo(() => {
    console.log("🧮 [Workshops] Filtering workshops...");
    if (!displayedWorkshops) return [];

    // When viewing "mine", show workshops where the user is
    // registered directly OR has a family member registered.
    if (viewMode === "mine" && user?._id) {
      console.log("🧾 [Workshops] Showing only workshops the user or their family is registered to");
      return displayedWorkshops.filter(
        (w) => w.isUserRegistered || (Array.isArray(w.userFamilyRegistrations) && w.userFamilyRegistrations.length > 0)
      );
    }

    // No search => show all
    if (!searchQuery.trim()) {
      console.log("✨ [Workshops] No search query → showing all workshops");
      return displayedWorkshops;
    }

    const q = searchQuery.trim().toLowerCase();
    console.log("🔎 [Workshops] Filtering by query:", q, "and field:", searchBy);

    const filtered = displayedWorkshops.filter((w) => {
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

    console.log("✅ [Workshops] Filtered workshops count:", filtered.length);
    return filtered;
  }, [displayedWorkshops, searchQuery, searchBy, viewMode, registeredWorkshopIds]);

  /** 🔹 Registration Handlers */
  /** 🔹 Unified Registration Handler */
const handleRegister = async (id, familyId = null) => {
  console.log("📝 [Workshops] Register entity:", { id, familyId });
  const result = await registerEntityToWorkshop(id, familyId);
  if (result.success) {
    setFeedback("✅ נרשמת בהצלחה לסדנה!");
    setRegisteredWorkshopIds((prev) => [...prev, id]);
  } else {
    setFeedback("❌ שגיאה בהרשמה לסדנה");
  }
  setTimeout(() => setFeedback(null), 2500);
};

/** 🔹 Unified Unregister Handler */
const handleUnregister = async (id, familyId = null) => {
  console.log("🚫 [Workshops] Unregister entity:", { id, familyId });
  const result = await unregisterEntityFromWorkshop(id, familyId);
  if (result.success) {
    setFeedback("✅ ההרשמה בוטלה בהצלחה");
    setRegisteredWorkshopIds((prev) => prev.filter((x) => x !== id));
  } else {
    setFeedback("❌ שגיאה בביטול ההרשמה");
  }
  setTimeout(() => setFeedback(null), 2500);
};


  /** 👥 Admin: open participants modal */
  const handleManageParticipants = (id) => {
    console.log("👥 [Workshops] Opening participants modal for:", id);
    const found = displayedWorkshops.find((w) => w._id === id);
    if (found) {
      console.log("✅ [Workshops] Found workshop:", found.title);
      setSelectedWorkshop(found);
    } else {
      console.warn("⚠️ [Workshops] Workshop not found for modal");
    }
  };

  /** 🧭 Admin: navigate to edit */
  const handleEditWorkshop = (id) => {
    console.log("✏️ [Workshops] Navigating to edit:", id);
    navigate(`/editworkshop/${id}`);
  };

  /** 🧹 Close modal safely */
  const handleModalClose = async () => {
    console.log("❎ [Workshops] Closing modal");
    setSelectedWorkshop(null);
    await fetchWorkshops();
    console.log("🔁 [Workshops] Workshops refreshed after modal close");
  };

  // -------------------- JSX --------------------
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-gray-50 p-6 md:p-10"
      dir="rtl"
    >
      <div className="max-w-6xl mx-auto mb-6 text-center">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-2">
          {viewMode === "mine" ? "הסדנאות שלי" : "כלל הסדנאות"}
        </h2>
        <p className="text-gray-600 text-sm md:text-base">
          {viewMode === "mine"
            ? "צפו ובטלו הרשמות לסדנאות שלכם"
            : "חפש, הירשם או ערוך סדנאות בקלות"}
        </p>
      </div>

      {/* 🔍 Filters */}
      {viewMode === "all" && (
        <div className="max-w-6xl mx-auto bg-white/90 backdrop-blur border border-gray-200 shadow-md rounded-2xl p-5 flex flex-wrap justify-center items-center gap-3">
          <select
            value={searchBy}
            onChange={(e) => {
              console.log("📂 [Workshops] Search field changed:", e.target.value);
              setSearchBy(e.target.value);
            }}
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
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-lg">
              🔍
            </span>
          </div>
        </div>
      )}

      {/* Feedback message */}
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

            {/* 🔹 Workshops Grid */}
      <div className="grid gap-8 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 max-w-6xl mx-auto mt-10">
        {loading ? (
          <p className="text-center text-gray-500 mt-10 animate-pulse">
            ⏳ טוען סדנאות...
          </p>
        ) : error ? (
          <p className="text-center text-red-500 font-medium mt-10">
            ❌ {error}
          </p>
        ) : filteredWorkshops.length === 0 ? (
          <p className="text-center text-gray-600 mt-10">
            {viewMode === "mine"
              ? "לא נמצאו סדנאות רשומות."
              : "לא נמצאו סדנאות תואמות."}
          </p>
        ) : (
          filteredWorkshops.map((w, idx) => {
            console.log("🧾 [Workshops → Card Props]", {
              id: w._id,
              title: w.title,
              isUserRegistered: w.isUserRegistered,
              family: w.userFamilyRegistrations,
            });

            return (
              <div
                key={w._id}
                className="animate-[fadeIn_0.6s_ease-in-out_both]"
                style={{ animationDelay: `${idx * 0.05}s` }}
              >
                <WorkshopCard
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
              </div>
            );
          })
        )}
      </div>

      {/* 👥 Participants Modal */}
      {selectedWorkshop && (
        <WorkshopParticipantsModal
          workshop={selectedWorkshop}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
