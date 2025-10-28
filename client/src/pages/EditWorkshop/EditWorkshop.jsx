/**
 * EditWorkshop.jsx — Multi-Sessions Admin Form (Create + Edit)
 * -----------------------------------------------------------------------------
 * This page provides a rich form for administrators to create or edit
 * workshop records.  It supports multiple sessions, recurring days,
 * inactive dates (holidays), soft address validation, live end-date
 * previews, capacity settings, waitlist options and more.  The form
 * works in both create (new workshop) and edit modes.
 *
 * Key Features:
 * - Compatible with the new workshop schema (days[], sessionsCount,
 *   inactiveDates[] and other fields) and gracefully handles legacy
 *   data (day, weeksDuration).
 * - Soft validation of address via the validateAddress helper from
 *   WorkshopContext; debounced to reduce server load.
 * - Fetches the list of available cities via fetchAvailableCities
 *   from WorkshopContext, falling back to free text entry.
 * - Automatically calculates and displays the expected end date based
 *   on the start date, chosen days and session count.
 * - Uses createWorkshop and updateWorkshop helpers from
 *   WorkshopContext for all mutations, ensuring that after a save the
 *   latest workshop data is refetched and the UI remains consistent.
 *
 * Data Flow:
 * - On mount, the component obtains helper functions and the current
 *   list of workshops from WorkshopContext.  It never calls apiFetch
 *   directly for workshop mutations, instead delegating to context
 *   methods which handle server interaction and state refresh.
 * - City lists and address validation are also sourced from context.
 * - After a successful save, navigation back to the workshops
 *   listing occurs to show the updated data.
 */

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useWorkshops } from "../../layouts/WorkshopContext";
// apiFetch is intentionally not imported here.  All server
// communication should be performed via functions provided by
// WorkshopContext (createWorkshop, updateWorkshop, fetchAvailableCities,
// validateAddress).  This ensures the client never bypasses the
// central context and always refreshes local state after mutations.

// === Day labels & mapping ===
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_HE_LETTER = { Sunday: "א", Monday: "ב", Tuesday: "ג", Wednesday: "ד", Thursday: "ה", Friday: "ו", Saturday: "ש" };
const HE_TO_EN = {
  "ראשון": "Sunday",
  "שני": "Monday",
  "שלישי": "Tuesday",
  "רביעי": "Wednesday",
  "חמישי": "Thursday",
  "שישי": "Friday",
  "שבת": "Saturday",
  "א": "Sunday",
  "ב": "Monday",
  "ג": "Tuesday",
  "ד": "Wednesday",
  "ה": "Thursday",
  "ו": "Friday",
  "ש": "Saturday",
};
const EN_TO_HE = { Sunday: "ראשון", Monday: "שני", Tuesday: "שלישי", Wednesday: "רביעי", Thursday: "חמישי", Friday: "שישי", Saturday: "שבת" };

function sanitize(value) {
  if (typeof value !== "string") return value;
  return value.replace(/[<>]/g, "").replace(/[\r\n\t]+/g, " ");
}

function computeEndDatePreview(startDate, days = [], sessionsCount = 0, inactiveDates = []) {
  if (!startDate || !sessionsCount || !Array.isArray(days) || days.length === 0) return null;
  try {
    const engDays = days.map((d) => (EN_TO_HE[d] ? d : HE_TO_EN[d] || d));
    const start = new Date(startDate);
    if (isNaN(start)) return null;

    let sessions = 0;
    const current = new Date(start);
    const inactiveSet = new Set((inactiveDates || []).map((d) => new Date(d).toDateString()));

    while (sessions < sessionsCount) {
      const dayName = DAYS_EN[current.getDay()];
      const dateStr = current.toDateString();
      if (engDays.includes(dayName) && !inactiveSet.has(dateStr)) {
        sessions++;
      }
      current.setDate(current.getDate() + 1);
      if (sessionsCount > 1000) break;
    }
    return current;
  } catch {
    return null;
  }
}

export default function EditWorkshop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  // Pull workshops and admin mutation helpers from context.  The
  // client never mutates workshop state locally; instead it calls the
  // provided create/update functions which talk to the server and
  // trigger a refetch.
  const {
    workshops,
    createWorkshop,
    updateWorkshop,
    fetchAvailableCities,
    validateAddress: validateWorkshopAddress,
  } = useWorkshops();

  const [form, setForm] = useState({
    title: "",
    type: "",
    ageGroup: "",
    city: "",
    address: "",
    studio: "",
    coach: "",
    days: [],
    hour: "",
    sessionsCount: "",
    startDate: "",
    inactiveDates: [],
    available: true,
    description: "",
    price: "",
    image: "",
    maxParticipants: 20,
    waitingListMax: 10,
    autoEnrollOnVacancy: false,
  });

  const [preview, setPreview] = useState("");
  const [saving, setSaving] = useState(false);
  const [addingHoliday, setAddingHoliday] = useState("");
  const [cities, setCities] = useState(Array.isArray(location?.state?.cities) ? location.state.cities : []);
  const [freeCity, setFreeCity] = useState(false);
  const [addrValid, setAddrValid] = useState({ status: "idle", message: "" }); // idle|checking|ok|warn|err

  const isNew = !id;
  const existing = id ? workshops.find((w) => w?._id === id) : null;

  // --- fetch cities if not provided via navigation state
  // Always use the fetchAvailableCities helper from WorkshopContext to
  // retrieve the list of known cities.  This ensures that the data
  // comes from a single source and that any server-side validation
  // rules are applied uniformly.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cities.length) return;
      try {
        const list = await fetchAvailableCities();
        if (!cancelled && Array.isArray(list) && list.length) {
          setCities(list);
        }
      } catch (e) {
        // silent fallback
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, []); // eslint-disable-line

  // === Reset for NEW ===
  useEffect(() => {
    if (isNew) {
      setForm({
        title: "",
        type: "",
        ageGroup: "",
        city: "",
        address: "",
        studio: "",
        coach: "",
        days: [],
        hour: "",
        sessionsCount: "",
        startDate: "",
        inactiveDates: [],
        available: true,
        description: "",
        price: "",
        image: "",
        maxParticipants: 20,
        waitingListMax: 10,
        autoEnrollOnVacancy: false,
      });
      setPreview("");
      setAddrValid({ status: "idle", message: "" });
      setFreeCity(false);
    }
  }, [isNew]);

  // === Load existing (edit mode) ===
  useEffect(() => {
    if (!existing) return;
    const legacyDays = (() => {
      if (Array.isArray(existing.days) && existing.days.length) return existing.days;
      if (existing.day) {
        const d = existing.day;
        if (HE_TO_EN[d]) return [HE_TO_EN[d]];
        if (EN_TO_HE[d]) return [d];
      }
      return [];
    })();

    const legacySessions = existing.sessionsCount || existing.weeksDuration || "";
    const inactive = Array.isArray(existing.inactiveDates)
      ? existing.inactiveDates
          .map((d) => {
            const dt = new Date(d);
            return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
          })
          .filter(Boolean)
      : [];

    setForm({
      _id: existing._id,
      title: existing.title || "",
      type: existing.type || "",
      ageGroup: existing.ageGroup || "",
      city: existing.city || "",
      address: existing.address || "",
      studio: existing.studio || "",
      coach: existing.coach || "",
      days: legacyDays,
      hour: existing.hour || "",
      sessionsCount: legacySessions || "",
      startDate: existing.startDate ? new Date(existing.startDate).toISOString().slice(0, 10) : "",
      inactiveDates: inactive,
      available: !!existing.available,
      description: existing.description || "",
      price: (existing.price ?? "") === "" ? "" : Number(existing.price),
      image: existing.image || "",
      maxParticipants: typeof existing.maxParticipants === "number" ? existing.maxParticipants : 20,
      waitingListMax: typeof existing.waitingListMax === "number" ? existing.waitingListMax : 10,
      autoEnrollOnVacancy: !!existing.autoEnrollOnVacancy,
    });
    setPreview(existing.image || "");
    setFreeCity(!!existing.city && !cities.includes(existing.city)); // auto-toggle free mode if city not in list
  }, [existing, cities]);

  // === Controlled updates ===
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: sanitize(value) }));
  const toggleDay = (enDay) =>
    setForm((prev) => ({
      ...prev,
      days: prev.days.includes(enDay) ? prev.days.filter((d) => d !== enDay) : [...prev.days, enDay],
    }));

  const addInactiveDate = () => {
    if (!addingHoliday) return;
    if (form.inactiveDates.includes(addingHoliday)) {
      setAddingHoliday("");
      return;
    }
    setForm((prev) => ({ ...prev, inactiveDates: [...prev.inactiveDates, addingHoliday] }));
    setAddingHoliday("");
  };

  const removeInactiveDate = (dateStr) =>
    setForm((prev) => ({
      ...prev,
      inactiveDates: prev.inactiveDates.filter((d) => d !== dateStr),
    }));

  const handleImageFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  // === Live endDate preview ===
  const endPreview = useMemo(() => {
    const end = computeEndDatePreview(form.startDate, form.days, Number(form.sessionsCount), form.inactiveDates);
    return end ? end.toLocaleDateString("he-IL") : "—";
  }, [form.startDate, form.days, form.sessionsCount, form.inactiveDates]);

  // === Soft address validation (debounced) ===
  useEffect(() => {
    // If either city or address is empty, clear validation state and exit.
    if (!form.city || !form.address) {
      setAddrValid({ status: "idle", message: "" });
      return;
    }
    // Debounce the validation to avoid spamming the server on every keystroke.
    let t = setTimeout(async () => {
      try {
        setAddrValid({ status: "checking", message: "" });
        const result = await validateWorkshopAddress(form.city, form.address);
        // result may include { success, valid, message }; fall back sensibly
        if (result && result.success !== false) {
          const isValid = result.valid === undefined ? !!result.success : !!result.valid;
          setAddrValid({
            status: isValid ? "ok" : "warn",
            message: isValid ? "הכתובת תואמת לעיר" : "לא נמצאה התאמה חד משמעית לעיר הזאת",
          });
        } else {
          setAddrValid({ status: "err", message: result?.message || "שגיאה בבדיקת הכתובת" });
        }
      } catch (e) {
        setAddrValid({ status: "err", message: "שירות בדיקת כתובת לא זמין" });
      }
    }, 500);
    return () => clearTimeout(t);
  }, [form.city, form.address]);

  // === Validation ===
  const validate = () => {
    const required = ["title", "coach", "startDate", "sessionsCount"];
    for (const f of required) {
      if (!form[f] || String(form[f]).trim() === "") {
        alert(`יש למלא את השדה "${f}" לפני השמירה.`);
        return false;
      }
    }
    if (!form.city || form.city.trim() === "") {
      alert("יש להזין עיר.");
      return false;
    }
    if (!form.address || form.address.trim() === "") {
      alert("יש להזין כתובת מלאה לסדנה.");
      return false;
    }
    if (!Array.isArray(form.days) || form.days.length === 0) {
      alert("יש לבחור לפחות יום אחד בשבוע.");
      return false;
    }
    if (Number.isNaN(Number(form.sessionsCount)) || Number(form.sessionsCount) < 1) {
      alert("מספר המפגשים חייב להיות מספר חיובי.");
      return false;
    }
    return true;
  };

  // === Save ===
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      const payload = {
        title: sanitize(form.title),
        type: sanitize(form.type),
        ageGroup: sanitize(form.ageGroup),
        city: sanitize(form.city),
        address: sanitize(form.address),
        studio: sanitize(form.studio),
        coach: sanitize(form.coach),
        days: (form.days || []).map((d) => HE_TO_EN[d] || d),
        hour: sanitize(form.hour),
        sessionsCount: Number(form.sessionsCount),
        startDate: form.startDate || null,
        inactiveDates: form.inactiveDates || [],
        available: !!form.available,
        description: sanitize(form.description),
        price: form.price === "" ? 0 : Number(form.price),
        image: preview || "",
        maxParticipants: Number(form.maxParticipants) || 0,
        waitingListMax: Number(form.waitingListMax) || 0,
        autoEnrollOnVacancy: !!form.autoEnrollOnVacancy,
      };

      // Use context-provided helpers to save workshops.  These
      // functions handle server requests and refetch the latest
      // workshop list on success.  They return objects with
      // success/data/message fields for error handling.
      let result;
      if (isNew) {
        result = await createWorkshop(payload);
      } else {
        result = await updateWorkshop(form._id, payload);
      }
      if (!result || result.success === false) {
        const msg = result?.message || "שמירה נכשלה, בדוק את הנתונים שהוזנו.";
        throw new Error(msg);
      }
      // On success, navigate back to workshops listing
      navigate("/workshops");
    } catch (err) {
      console.error("❌ save error:", err);
      alert(err.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };


  // === Render ===
  const addrHint =
    addrValid.status === "checking"
      ? "בודק כתובת…"
      : addrValid.status === "ok"
      ? "✓ הכתובת נראית תקינה לעיר"
      : addrValid.status === "warn"
      ? "⚠︎ הכתובת לא אומתה לעיר — אפשר לשמור בכל זאת"
      : addrValid.status === "err"
      ? "⚠︎ שירות ולידציה לא זמין — אפשר לשמור בכל זאת"
      : "";

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-gray-50 py-10 px-4">
      <div className="w-full max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-indigo-100">
        <h2 className="text-3xl font-extrabold text-indigo-800 text-center mb-8">
          {isNew ? "🪄 יצירת סדנה חדשה" : "🎛️ עריכת סדנה"}
        </h2>

        {/* === Image === */}
        <div className="flex flex-col items-center mb-8">
          {preview ? (
            <img src={preview} alt="תמונה" className="w-full max-h-72 object-cover rounded-2xl shadow-md border border-indigo-100" />
          ) : (
            <div className="w-full h-56 bg-gray-100 rounded-2xl flex items-center justify-center text-gray-400">
              אין תמונה
            </div>
          )}
          <label className="mt-4 inline-block cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-5 rounded-xl shadow transition">
            החלף תמונה
            <input type="file" accept="image/*" onChange={(e) => handleImageFile(e.target.files?.[0])} className="hidden" />
          </label>
        </div>

        {/* === Base fields === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-8">
          {[
            ["title", "שם הסדנה"],
            ["type", "סוג"],
            ["ageGroup", "קבוצת גיל"],
          ].map(([key, label]) => (
            <label key={key} className="flex flex-col text-sm font-medium text-gray-700">
              {label}:
              <input
                type="text"
                value={form[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none transition"
              />
            </label>
          ))}

          {/* City + Address */}
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={freeCity}
                onChange={(e) => setFreeCity(e.target.checked)}
                className="w-4 h-4 accent-indigo-600"
              />
              הזן עיר חופשית (במקום לבחור מהרשימה)
            </label>

            {!freeCity ? (
              <label className="flex flex-col text-sm font-medium text-gray-700">
                עיר:
                <select
                  value={form.city || ""}
                  onChange={(e) => setField("city", e.target.value)}
                  className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 bg-white focus:ring-2 focus:ring-indigo-400 outline-none transition"
                >
                  <option value="">בחר עיר...</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="flex flex-col text-sm font-medium text-gray-700">
                עיר (טקסט חופשי):
                <input
                  type="text"
                  value={form.city}
                  onChange={(e) => setField("city", e.target.value)}
                  className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none transition"
                  placeholder="לדוגמה: תל אביב"
                />
              </label>
            )}

            <label className="flex flex-col text-sm font-medium text-gray-700">
              כתובת:
              <input
                type="text"
                value={form.address}
                onChange={(e) => setField("address", e.target.value)}
                className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none transition"
                placeholder="רחוב ומספר, שכונה (אופציונלי)"
              />
              {!!addrHint && (
                <span
                  className={`mt-1 text-xs ${
                    addrValid.status === "ok"
                      ? "text-green-700"
                      : addrValid.status === "warn"
                      ? "text-amber-600"
                      : addrValid.status === "err"
                      ? "text-red-600"
                      : "text-gray-500"
                  }`}
                >
                  {addrHint}
                </span>
              )}
            </label>
          </div>

          {[
            ["studio", "סטודיו"],
            ["coach", "מנחה"],
            ["hour", "שעה (לדוג׳ 18:00)"],
            ["price", "מחיר (₪)"],
          ].map(([key, label]) => (
            <label key={key} className="flex flex-col text-sm font-medium text-gray-700">
              {label}:
              <input
                type={key === "price" ? "number" : "text"}
                min={key === "price" ? "0" : undefined}
                value={form[key] ?? ""}
                onChange={(e) => setField(key, e.target.value)}
                className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none transition"
              />
            </label>
          ))}
        </div>

        {/* Schedule section */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <label className="flex flex-col text-sm font-medium text-gray-700">
            תאריך התחלה:
            <input
              type="date"
              value={form.startDate || ""}
              onChange={(e) => setField("startDate", e.target.value)}
              className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </label>

          <label className="flex flex-col text-sm font-medium text-gray-700">
            מספר מפגשים:
            <input
              type="number"
              min="1"
              value={form.sessionsCount}
              onChange={(e) => setField("sessionsCount", e.target.value)}
              className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </label>

          <div className="flex flex-col justify-end">
            <div className="text-sm text-gray-700">
              <span className="font-semibold">תאריך סיום צפוי: </span>
              <span className="text-indigo-600 font-bold">{endPreview}</span>
            </div>
          </div>
        </div>

        {/* Days selector */}
        <div className="mb-8">
          <div className="text-sm font-semibold text-indigo-900 mb-2">ימי פעילות:</div>
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-7 gap-2">
            {DAYS_EN.map((en) => (
              <label
                key={en}
                className={`flex items-center justify-between gap-2 px-3 py-2 rounded-xl border ${
                  form.days.includes(en)
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-indigo-50 border-indigo-200 text-indigo-900"
                } cursor-pointer select-none`}
              >
                <span className="text-sm font-bold">
                  {EN_TO_HE[en]} ({DAY_HE_LETTER[en]})
                </span>
                <input
                  type="checkbox"
                  checked={form.days.includes(en)}
                  onChange={() => toggleDay(en)}
                  className="accent-indigo-700 w-4 h-4"
                />
              </label>
            ))}
          </div>
        </div>

        {/* Inactive dates */}
        <div className="mb-8">
          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="flex flex-col text-sm font-medium text-gray-700">
                הוסף יום חופש:
                <input
                  type="date"
                  value={addingHoliday}
                  onChange={(e) => setAddingHoliday(e.target.value)}
                  className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
                />
              </label>
            </div>
            <button
              onClick={addInactiveDate}
              className="h-[42px] bg-amber-500 hover:bg-amber-600 text-white px-4 rounded-xl"
            >
              הוסף
            </button>
          </div>

          {form.inactiveDates.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {form.inactiveDates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-800 px-3 py-1 rounded-full text-sm"
                >
                  {new Date(d).toLocaleDateString("he-IL")}
                  <button
                    onClick={() => removeInactiveDate(d)}
                    className="text-red-500 hover:text-red-600"
                    title="הסר"
                  >
                    ✕
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        {/* Capacity & waitlist */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          <label className="flex flex-col text-sm font-medium text-gray-700">
            קיבולת מקסימלית:
            <input
              type="number"
              min="0"
              value={form.maxParticipants}
              onChange={(e) => setField("maxParticipants", e.target.value)}
              className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </label>

          <label className="flex flex-col text-sm font-medium text-gray-700">
            אורך רשימת המתנה:
            <input
              type="number"
              min="0"
              value={form.waitingListMax}
              onChange={(e) => setField("waitingListMax", e.target.value)}
              className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none"
            />
          </label>

          <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={!!form.autoEnrollOnVacancy}
              onChange={(e) => setField("autoEnrollOnVacancy", e.target.checked)}
              className="w-5 h-5 accent-indigo-600"
            />
            קבלה אוטומטית מרשימת המתנה כשמתפנה מקום
          </label>
        </div>

        {/* Availability + description */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          <label className="flex items-center gap-3 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={!!form.available}
              onChange={(e) => setField("available", e.target.checked)}
              className="w-5 h-5 accent-indigo-600"
            />
            זמינה להרשמה
          </label>
          <div />
        </div>

        <label className="flex flex-col text-sm font-medium text-gray-700 mb-8">
          תיאור הסדנה:
          <textarea
            className="mt-1 border border-indigo-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-400 outline-none min-h-[140px]"
            value={form.description}
            onChange={(e) => setField("description", e.target.value)}
          />
        </label>

        {/* Actions */}
        <div className="flex justify-center gap-5">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-8 py-2 rounded-xl font-semibold text-white transition-all duration-200 ${
              saving ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 shadow-md"
            }`}
          >
            {saving ? "שומר..." : "💾 שמור"}
          </button>

          <button
            onClick={() => navigate("/workshops")}
            disabled={saving}
            className="px-8 py-2 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition shadow-sm"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
