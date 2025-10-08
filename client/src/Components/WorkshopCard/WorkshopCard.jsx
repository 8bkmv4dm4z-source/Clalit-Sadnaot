import React, { useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";

export default function WorkshopCard({
  _id,
  title,
  description,
  coach,
  city,
  studio,
  day,
  hour,
  price,
  image,
  available,
  participantsCount = 0,
  maxParticipants = 0,
  isLoggedIn,
  isAdmin,
  isRegistered,
  onRegister,
  onUnregister,
  onDeleteWorkshop,
  onManageParticipants,
  onEditWorkshop,
  searchQuery = "",
}) {
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [count, setCount] = useState(participantsCount);
  const [showFamilyList, setShowFamilyList] = useState(false);

  const { user } = useAuth();
  const { registerFamilyMember, fetchWorkshops } = useWorkshops();

  /** 🔄 Sync participants count */
  useEffect(() => {
    setCount(participantsCount);
  }, [participantsCount]);

  const isFull = maxParticipants > 0 && count >= maxParticipants;
  const canRegister = available && !isFull;

  /** 🧩 Highlight helper */
  const highlight = (text = "") => {
    if (!searchQuery.trim()) return text;
    const regex = new RegExp(`(${searchQuery})`, "gi");
    return text.split(regex).map((part, i) =>
      part.toLowerCase().startsWith(searchQuery.toLowerCase()) ? (
        <mark key={i} className="bg-yellow-200 text-black rounded px-1">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  /** 🔹 Register / Unregister */
  const handleRegister = async () => {
    if (!canRegister) return;
    await onRegister?.(_id);
    await fetchWorkshops();
  };

  const handleUnregister = async () => {
    await onUnregister?.(_id);
    await fetchWorkshops();
  };

  /** 👨‍👩‍👧 Family Register */
  const handleFamilyRegister = async (familyId) => {
    console.log("👨‍👩‍👧 [Card] Registering family:", familyId);
    try {
      await registerFamilyMember(_id, familyId);
      await fetchWorkshops();
    } catch (err) {
      console.error("❌ [Card] Family register failed:", err);
    } finally {
      setTimeout(() => setShowFamilyList(false), 300);
    }
  };

  /** 🧭 Toggle Family List */
  const toggleFamilyList = () => {
    console.log("📂 [Card] Toggle family dropdown:", !showFamilyList);
    setShowFamilyList(!showFamilyList);
  };

  /** 🧩 Helper — האם בן משפחה כבר רשום */
  const isFamilyRegistered = (familyId) => {
    const reg = user?.registeredFamilyWorkshops?.[familyId] || [];
    return reg.includes(_id);
  };

  // ------------------ JSX ------------------
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-b from-blue-50 to-white border border-blue-100 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
      {/* Image */}
      <div className="relative h-48 w-full overflow-hidden">
        {image ? (
          <img
            src={image}
            alt={title}
            className="w-full h-full object-cover transition-transform duration-500 hover:scale-105"
          />
        ) : (
          <div className="flex items-center justify-center h-full bg-gray-100 text-gray-400 text-sm">
            אין תמונה
          </div>
        )}
        {!available && (
          <div className="absolute inset-0 bg-gray-800/70 flex items-center justify-center text-white text-lg font-semibold">
            לא זמינה
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-5 flex flex-col gap-4">
        <h3 className="text-xl font-bold text-blue-800 text-center border-b border-blue-200 pb-2">
          {highlight(title)}
        </h3>

        {/* Info */}
        <div className="space-y-2">
          {[
            { label: "עיר", value: city },
            { label: "יום", value: day },
            { label: "שעה", value: hour },
            studio && { label: "סטודיו", value: studio },
            { label: "מאמן", value: coach },
            {
              label: "משתתפים",
              value: `${count}/${maxParticipants || "∞"}`,
              color: isFull ? "text-red-500" : "text-blue-700",
            },
            {
              label: "מחיר",
              value: `${price} ₪`,
              color: "text-blue-700 font-semibold",
            },
          ]
            .filter(Boolean)
            .map(({ label, value, color }, i) => (
              <div
                key={i}
                className="flex justify-between items-center bg-blue-50/40 border border-blue-100 rounded-lg px-3 py-2"
              >
                <span className="font-medium text-gray-700">{label}:</span>
                <span
                  className={`text-sm font-medium ${color || "text-gray-700"}`}
                >
                  {highlight(value)}
                </span>
              </div>
            ))}
        </div>

        {/* Description */}
        {description && (
          <div className="flex text-sm text-gray-900 mt-2 border-t border-blue-200 pt-3 leading-relaxed">
            <p className={showFullDesc ? "" : "line-clamp-3"}>
              {highlight(description)}
            </p>
            {description.length > 160 && (
              <button
                onClick={() => setShowFullDesc(!showFullDesc)}
                className="text-blue-600 text-sm hover:underline mt-1"
              >
                {showFullDesc ? "הצג פחות" : "קרא עוד"}
              </button>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-2">
          {isLoggedIn && (
            <>
              {isRegistered ? (
                <button
                  onClick={handleUnregister}
                  className="w-full py-2 rounded-lg bg-yellow-400 text-gray-900 font-semibold shadow hover:bg-yellow-500 transition-all"
                >
                  בטל הרשמה
                </button>
              ) : (
                <button
                  onClick={handleRegister}
                  disabled={!canRegister}
                  className={`w-full py-2 rounded-lg font-semibold text-white shadow transition-all ${
                    canRegister
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-300 cursor-not-allowed"
                  }`}
                >
                  {canRegister ? "הירשם" : "מלאה"}
                </button>
              )}

              {/* Family registration toggle */}
              {user?.familyMembers?.length > 0 && (
                <div className="relative w-full">
                  <button
                    onClick={toggleFamilyList}
                    className={`w-full mt-2 py-2 rounded-lg font-medium transition ${
                      showFamilyList
                        ? "bg-red-100 hover:bg-red-200 text-red-700"
                        : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                    }`}
                  >
                    {showFamilyList
                      ? "❌ סגור רשימת משפחה"
                      : "👨‍👩‍👧 הירשם בן משפחה"}
                  </button>

                  {showFamilyList && (
                    <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-md mt-2 overflow-hidden animate-fadeIn">
                      {user.familyMembers.map((m) => (
                        <div
                          key={m._id}
                          onClick={() =>
                            !isFamilyRegistered(m._id) &&
                            handleFamilyRegister(m._id)
                          }
                          className={`px-4 py-2 text-right cursor-pointer text-sm flex justify-between items-center ${
                            isFamilyRegistered(m._id)
                              ? "bg-green-50 text-green-600 cursor-not-allowed"
                              : "hover:bg-gray-100 text-gray-700"
                          }`}
                        >
                          <span>
                            {m.name} ({m.relation})
                          </span>
                          {isFamilyRegistered(m._id) && (
                            <span className="text-xs">✅ רשום</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Admin controls */}
          {isAdmin && (
            <div className="flex flex-wrap justify-center gap-2 border-t border-gray-100 pt-3 mt-2">
              <button
                onClick={() => onEditWorkshop?.(_id)}
                className="flex-1 py-2 rounded-lg bg-indigo-600 text-white font-medium hover:bg-indigo-700 transition-all"
              >
                ערוך
              </button>
              <button
                onClick={() => onManageParticipants?.(_id)}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-white font-medium hover:bg-amber-600 transition-all"
              >
                משתתפים
              </button>
              <button
                onClick={() => onDeleteWorkshop?.(_id)}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-all"
              >
                מחק
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
