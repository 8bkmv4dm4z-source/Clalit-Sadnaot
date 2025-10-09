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
  userFamilyRegistrations = [],
  onDeleteWorkshop,
  onManageParticipants,
  onEditWorkshop,
  searchQuery = "",
}) {
  const { user } = useAuth();
  const { registerEntityToWorkshop, unregisterEntityFromWorkshop, fetchWorkshops } =
    useWorkshops();

  /** 🧩 Normalize helper */
  const toId = (v) =>
    typeof v === "string"
      ? v
      : v?.familyMemberId
      ? String(v.familyMemberId)
      : String(v?._id ?? v ?? "");

  /** 🧠 Local states */
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [showFamilyList, setShowFamilyList] = useState(false);
  const [count, setCount] = useState(participantsCount);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [familyRegs, setFamilyRegs] = useState((userFamilyRegistrations || []).map(toId));
  const [isRegisteredState, setIsRegistered] = useState(isRegistered);

  /** 🔁 Sync from props */
  useEffect(() => setCount(participantsCount), [participantsCount]);
  useEffect(() => {
    const norm = (userFamilyRegistrations || []).map(toId);
    setFamilyRegs(norm);
    console.log("🔁 [Card] normalized familyRegs from props:", norm);
  }, [userFamilyRegistrations]);
  useEffect(() => {
    setIsRegistered(isRegistered);
    console.log("🔁 [Card] isRegistered changed:", isRegistered);
  }, [isRegistered]);

  /** 🧠 Derived flags */
  const isFull = maxParticipants > 0 && count >= maxParticipants;
  const canRegister = available && !isFull;

  const isFamilyRegistered = (id) => familyRegs.map(String).includes(String(id));

  /** ✨ Highlight helper */
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

  /** ✅ Main user actions */
  const handleRegister = async () => {
    if (!canRegister || loading) return;
    setLoading(true);
    try {
      const res = await registerEntityToWorkshop(_id);
      console.log("🟢 [Card] handleRegister result:", res);
      if (res.success) {
        setIsRegistered(true);
        setFeedback("✅ נרשמת בהצלחה!");
        setCount((prev) => prev + 1);
        await fetchWorkshops();
      } else setFeedback(res.message || "❌ שגיאה בהרשמה");
    } catch (err) {
      console.error("❌ handleRegister error:", err);
      setFeedback("❌ שגיאה בהרשמה לסדנה");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  const handleUnregister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await unregisterEntityFromWorkshop(_id);
      console.log("🔴 [Card] handleUnregister result:", res);
      if (res.success) {
        setIsRegistered(false);
        setFeedback("✅ ההרשמה שלך בוטלה");
        setCount((prev) => Math.max(prev - 1, 0));
        await fetchWorkshops();
      } else setFeedback(res.message || "❌ שגיאה בביטול הרשמה");
    } catch (err) {
      console.error("❌ handleUnregister error:", err);
      setFeedback("❌ שגיאה בביטול הרשמה");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  /** 👨‍👩‍👧 Family registration toggle */
  const toggleFamilyRegistration = async (memberId, already) => {
    if (loading) return;
    setLoading(true);
    try {
      if (already) {
        const res = await unregisterEntityFromWorkshop(_id, memberId);
        console.log("🔴 [Card] family unregister result:", res);
        if (res.success) {
          setFamilyRegs((prev) => prev.filter((id) => id !== memberId));
          setFeedback("✅ ההרשמה של בן המשפחה בוטלה");
        }
      } else {
        const res = await registerEntityToWorkshop(_id, memberId);
        console.log("🟢 [Card] family register result:", res);
        if (res.success) {
          setFamilyRegs((prev) => [...prev, memberId]);
          setFeedback("✅ בן המשפחה נרשם בהצלחה");
        }
      }
      await fetchWorkshops();
    } catch (err) {
      console.error("❌ Family toggle error:", err);
      setFeedback("❌ שגיאה בעדכון הרשמה");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2000);
    }
  };

  /** 👁 Family list toggle */
  const toggleFamilyList = () => setShowFamilyList((s) => !s);

  // 🧭 Diagnostic logs
  useEffect(() => {
    console.log("🔁 [Card] props changed:", { isRegistered, userFamilyRegistrations });
  }, [isRegistered, userFamilyRegistrations]);
  useEffect(() => {
    console.log("🔁 [Card] local state:", { isRegisteredState, familyRegs });
  }, [isRegisteredState, familyRegs]);

  /** 💅 UI */
  return (
    <div className="flex flex-col justify-between rounded-2xl bg-gradient-to-b from-blue-50 to-white border border-blue-100 shadow-md hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden">
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
                <span className={`text-sm font-medium ${color || "text-gray-700"}`}>
                  {highlight(value)}
                </span>
              </div>
            ))}
        </div>

        {/* Actions */}
        <div className="mt-4 flex flex-col gap-2">
          {isLoggedIn && (
            <>
              {isRegisteredState ? (
                <button
                  onClick={handleUnregister}
                  disabled={loading}
                  className="w-full py-2 rounded-lg bg-yellow-400 text-gray-900 font-semibold shadow hover:bg-yellow-500 transition-all disabled:opacity-60"
                >
                  {loading ? "..." : "בטל הרשמה"}
                </button>
              ) : (
                <button
                  onClick={handleRegister}
                  disabled={!canRegister || loading}
                  className={`w-full py-2 rounded-lg font-semibold text-white shadow transition-all ${
                    canRegister
                      ? "bg-blue-600 hover:bg-blue-700"
                      : "bg-gray-300 cursor-not-allowed"
                  } disabled:opacity-60`}
                >
                  {loading ? "..." : canRegister ? "הירשם" : "מלאה"}
                </button>
              )}

              {user?.familyMembers?.length > 0 && (
                <div className="relative w-full">
                  <button
                    onClick={toggleFamilyList}
                    disabled={loading}
                    className={`w-full mt-2 py-2 rounded-lg font-medium transition disabled:opacity-60 ${
                      showFamilyList
                        ? "bg-red-100 hover:bg-red-200 text-red-700"
                        : "bg-indigo-100 hover:bg-indigo-200 text-indigo-700"
                    }`}
                  >
                    {showFamilyList ? "❌ סגור רשימת משפחה" : "👨‍👩‍👧 נהל בני משפחה"}
                  </button>

                  <div
                    className={`absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-md mt-2 overflow-hidden transition-all duration-300 ${
                      showFamilyList
                        ? "max-h-96 opacity-100"
                        : "max-h-0 opacity-0 pointer-events-none"
                    }`}
                  >
                    {user.familyMembers.map((m) => {
                      const already = isFamilyRegistered(m._id);
                      return (
                        <div
                          key={m._id}
                          className={`px-4 py-2 flex justify-between items-center border-b border-gray-100 ${
                            already
                              ? "bg-green-50 text-green-700"
                              : "hover:bg-gray-100 text-gray-700"
                          }`}
                        >
                          <span>
                            {m.name} ({m.relation})
                          </span>
                          {already ? (
                            <button
                              onClick={() => toggleFamilyRegistration(m._id, true)}
                              disabled={loading}
                              className="text-xs bg-red-100 text-red-600 px-2 py-1 rounded-lg hover:bg-red-200 disabled:opacity-60"
                            >
                              בטל הרשמה
                            </button>
                          ) : (
                            <button
                              onClick={() => toggleFamilyRegistration(m._id, false)}
                              disabled={loading}
                              className="text-xs bg-blue-100 text-blue-600 px-2 py-1 rounded-lg hover:bg-blue-200 disabled:opacity-60"
                            >
                              הירשם
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}

          {/* Admin buttons */}
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
