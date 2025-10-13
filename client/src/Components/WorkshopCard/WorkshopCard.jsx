// src/Components/WorkshopCard.jsx
import React, { useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";               // ✅ עלייה תיקייה אחת
import { useWorkshops } from "../../layouts/WorkshopContext";     // ✅ עלייה תיקייה אחת
import { apiFetch } from "../../utils/apiFetch";                  // ✅ עלייה תיקייה אחת

/**
 * WorkshopCard.jsx — Your version, secured imports + excel export
 * ---------------------------------------------------------------
 * - Keep your original logic & UI intact.
 * - Fixed import paths according to src/Components/WorkshopCard.jsx location.
 * - Excel export now uses apiFetch() (credentials & auto-refresh).
 */

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
  onRegister,
  onUnregister,
  searchQuery = "",
}) {
  const { user } = useAuth();
  const { fetchWorkshops } = useWorkshops();

  // ✅ derive count from prop (stateless)
  const derivedCount =
    typeof participantsCount === "number" ? participantsCount : 0;

  // ✅ compute isFull ONCE (don’t redeclare later)
  const isFull = maxParticipants > 0 && derivedCount >= maxParticipants;
  const canRegister = available; // אם תרצה לחסום בהרשמה כשהמקום מלא: available && !isFull
  const registerLabel = isFull ? "הצטרף לרשימת המתנה" : "הירשם";

  const [showFamilyList, setShowFamilyList] = useState(false);
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState(null);
  const [isRegisteredState, setIsRegistered] = useState(isRegistered);

  const [familyRegs, setFamilyRegs] = useState(
    (userFamilyRegistrations || []).map((f) =>
      typeof f === "string" ? f : String(f.familyMemberId ?? f._id ?? "")
    )
  );

  /** 🔁 Sync props -> local UI */
  useEffect(() => setIsRegistered(isRegistered), [isRegistered]);
  useEffect(() => {
    const normalized = (userFamilyRegistrations || []).map((f) =>
      typeof f === "string" ? f : String(f.familyMemberId ?? f._id ?? "")
    );
    setFamilyRegs(normalized);
  }, [userFamilyRegistrations]);

  const highlight = (text = "") => {
    if (!searchQuery?.trim()) return text;
    const q = searchQuery.toLowerCase();
    return String(text)
      .split(new RegExp(`(${searchQuery})`, "gi"))
      .map((part, i) =>
        part.toLowerCase().startsWith(q) ? (
          <mark key={i} className="bg-yellow-200 text-black rounded px-1">
            {part}
          </mark>
        ) : (
          part
        )
      );
  };

  /** 👤 Register/Unregister self (optimistic UX) */
  const handleSelfRegister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await onRegister();
      if (res?.success !== false) {
        setIsRegistered(true);
        setFeedback("✅ נרשמת בהצלחה");
        await fetchWorkshops();
      } else {
        setFeedback("❌ שגיאה בהרשמה");
      }
    } catch {
      setFeedback("❌ שגיאה בהרשמה");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2200);
    }
  };

  const handleSelfUnregister = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const res = await onUnregister();
      if (res?.success !== false) {
        setIsRegistered(false);
        setFeedback("✅ ההרשמה בוטלה");
        await fetchWorkshops();
      } else {
        setFeedback("❌ שגיאה בביטול ההרשמה");
      }
    } catch {
      setFeedback("❌ שגיאה בביטול ההרשמה");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2200);
    }
  };

  /** 👨‍👩‍👧 Family registration toggle */
  const toggleFamilyRegistration = async (memberId, already) => {
    if (loading) return;
    setLoading(true);
    try {
      const result = already ? await onUnregister(memberId) : await onRegister(memberId);
      if (result?.success !== false) {
        setFamilyRegs((prev) =>
          already ? prev.filter((id) => id !== String(memberId)) : [...prev, String(memberId)]
        );
        setFeedback(already ? "✅ ההרשמה של בן המשפחה בוטלה" : "✅ בן המשפחה נרשם בהצלחה");
        await fetchWorkshops();
      } else {
        setFeedback("❌ שגיאה בעדכון הרשמה");
      }
    } catch {
      setFeedback("❌ שגיאה בעדכון הרשמה");
    } finally {
      setLoading(false);
      setTimeout(() => setFeedback(null), 2200);
    }
  };

  /** 👁 Family list toggle */
  const toggleFamilyList = () => setShowFamilyList((s) => !s);

  /** 📤 Export Excel — now via apiFetch (secure, includes credentials) */
  const handleExportExcel = async () => {
    try {
      setLoading(true);
      const res = await apiFetch(`/api/workshops/${_id}/export`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Export failed");
      alert("📤 קובץ אקסל נשלח למייל שלך!");
    } catch (err) {
      console.error("❌ Export error:", err);
      alert("❌ שגיאה בשליחת האקסל: " + err.message);
    } finally {
      setLoading(false);
    }
  };

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

        <div className="space-y-2">
          {[
            { label: "עיר", value: city },
            { label: "יום", value: day },
            { label: "שעה", value: hour },
            studio && { label: "סטודיו", value: studio },
            { label: "מאמן", value: coach },
            {
              label: "משתתפים",
              value: `${derivedCount}/${maxParticipants || "∞"}`,
              color: isFull ? "text-red-500" : "text-blue-700",
            },
            { label: "מחיר", value: `${price} ₪`, color: "text-blue-700 font-semibold" },
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

        <div className="mt-4 flex flex-col gap-2">
          {isLoggedIn && (
            <>
              {isRegisteredState ? (
                <button
                  onClick={handleSelfUnregister}
                  disabled={loading}
                  className="w-full py-2 rounded-lg bg-yellow-400 text-gray-900 font-semibold shadow hover:bg-yellow-500 transition-all disabled:opacity-60"
                >
                  {loading ? "..." : "בטל הרשמה"}
                </button>
              ) : (
                <button
                  onClick={handleSelfRegister}
                  disabled={!canRegister || loading}
                  className={`w-full py-2 rounded-lg font-semibold text-white shadow transition-all ${
                    canRegister ? "bg-blue-600 hover:bg-blue-700" : "bg-gray-300 cursor-not-allowed"
                  } disabled:opacity-60`}
                >
                  {loading ? "..." : canRegister ? registerLabel : "לא זמין"}
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
                    {showFamilyList ? "❌ סגור" : "👨‍👩‍👧 רשום בני משפחה"}
                  </button>

                  <div
                    className={`absolute z-10 w-full bg-white border border-gray-200 rounded-xl shadow-md mt-2 overflow-hidden transition-all duration-300 ${
                      showFamilyList ? "max-h-96 opacity-100" : "max-h-0 opacity-0 pointer-events-none"
                    }`}
                  >
                    {user.familyMembers.map((m) => {
                      const already = familyRegs.includes(String(m._id));
                      return (
                        <div
                          key={m._id}
                          className={`px-4 py-2 flex justify-between items-center border-b border-gray-100 ${
                            already ? "bg-green-50 text-green-700" : "hover:bg-gray-100 text-gray-700"
                          }`}
                        >
                          <span>
                            {m.name} {m.relation ? `(${m.relation})` : ""}
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
                ערוך משתתפי סדנה
              </button>
              <button
                onClick={() => onDeleteWorkshop?.(_id)}
                className="flex-1 py-2 rounded-lg bg-red-600 text-white font-medium hover:bg-red-700 transition-all"
              >
                מחק
              </button>
              <button
                onClick={handleExportExcel}
                disabled={loading}
                className="flex-1 py-2 rounded-lg bg-green-600 text-white font-medium hover:bg-green-700 transition-all disabled:opacity-60"
              >
                {loading ? "שולח..." : "📊 שלח אקסל למייל"}
              </button>
            </div>
          )}
        </div>

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
  );
}
