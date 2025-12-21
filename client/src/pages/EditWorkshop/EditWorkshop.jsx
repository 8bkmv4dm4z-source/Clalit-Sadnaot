/**
 * EditWorkshop.jsx — Multi-Sessions Admin Form (Create + Edit)
 * -----------------------------------------------------------------------------
 * UPDATED: Includes Hybrid Image Selector (Presets + Custom Uploads).
 */
/* global File, FormData */

import React, { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, useLocation } from "react-router-dom";
import { useWorkshops } from "../../layouts/WorkshopContext";

// 1. Import the new Image Selector
import ImageSelector from "../../components/ImageSelector";

// === Day labels & mapping ===
const DAYS_EN = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DAY_HE_LETTER = { Sunday: "א", Monday: "ב", Tuesday: "ג", Wednesday: "ד", Thursday: "ה", Friday: "ו", Saturday: "ש" };
const HE_TO_EN = {
  "ראשון": "Sunday", "שני": "Monday", "שלישי": "Tuesday", "רביעי": "Wednesday", "חמישי": "Thursday", "שישי": "Friday", "שבת": "Saturday",
  "א": "Sunday", "ב": "Monday", "ג": "Tuesday", "ד": "Wednesday", "ה": "Thursday", "ו": "Friday", "ש": "Saturday",
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
    
    // 2. Default Image ID (Preset)
    image: "functional_training", 
    
    maxParticipants: 20,
    waitingListMax: 10,
    autoEnrollOnVacancy: false,
  });

  const [saving, setSaving] = useState(false);
  const [addingHoliday, setAddingHoliday] = useState("");
  const [cities, setCities] = useState(Array.isArray(location?.state?.cities) ? location.state.cities : []);
  const [freeCity, setFreeCity] = useState(false);
  const [addrValid, setAddrValid] = useState({ status: "idle", message: "" });

  const isNew = !id;
  const existing = id ? workshops.find((w) => w?._id === id) : null;

  // === Load Cities ===
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      if (cities.length) return;
      try {
        const list = await fetchAvailableCities();
        if (!cancelled && Array.isArray(list) && list.length) {
          setCities(list);
        }
      } catch (e) { /* silent */ }
    };
    load();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // === Reset for NEW ===
  useEffect(() => {
    if (isNew) {
      setForm({
        title: "", type: "", ageGroup: "", city: "", address: "", studio: "", coach: "",
        days: [], hour: "", sessionsCount: "", startDate: "", inactiveDates: [],
        available: true, description: "", price: "",
        
        image: "functional_training", // Default
        
        maxParticipants: 20, waitingListMax: 10, autoEnrollOnVacancy: false,
      });
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
      ? existing.inactiveDates.map((d) => {
          const dt = new Date(d);
          return isNaN(dt) ? null : dt.toISOString().slice(0, 10);
        }).filter(Boolean)
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
      
      // Fallback to default if empty
      image: existing.image || "functional_training", 
      
      maxParticipants: typeof existing.maxParticipants === "number" ? existing.maxParticipants : 20,
      waitingListMax: typeof existing.waitingListMax === "number" ? existing.waitingListMax : 10,
      autoEnrollOnVacancy: !!existing.autoEnrollOnVacancy,
    });
    setFreeCity(!!existing.city && !cities.includes(existing.city));
  }, [existing, cities]);

  // === Updates ===
  // Note: We don't sanitize image here because it might be a File object
  const setField = (key, value) => setForm((prev) => ({ ...prev, [key]: key === 'image' ? value : sanitize(value) }));
  
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

  // === Live endDate preview ===
  const endPreview = useMemo(() => {
    const end = computeEndDatePreview(form.startDate, form.days, Number(form.sessionsCount), form.inactiveDates);
    return end ? end.toLocaleDateString("he-IL") : "—";
  }, [form.startDate, form.days, form.sessionsCount, form.inactiveDates]);

  // === Soft address validation ===
  useEffect(() => {
    if (!form.city || !form.address) {
      setAddrValid({ status: "idle", message: "" });
      return;
    }
    let t = setTimeout(async () => {
      try {
        setAddrValid({ status: "checking", message: "" });
        const result = await validateWorkshopAddress(form.city, form.address);
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

  // === Save Handler (Hybrid: JSON or FormData) ===
  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // 1. Prepare clean data object
      const cleanData = {
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
        maxParticipants: Number(form.maxParticipants) || 0,
        waitingListMax: Number(form.waitingListMax) || 0,
        autoEnrollOnVacancy: !!form.autoEnrollOnVacancy,
        
        // This might be a File object OR a String ID
        image: form.image 
      };

      // 2. Check if we need Multipart (FileUpload) or JSON
      const isFileUpload = cleanData.image instanceof File;
      
      let result;
      
      if (isFileUpload) {
        // --- MULTIPART MODE ---
        const formData = new FormData();
        Object.keys(cleanData).forEach(key => {
          if (key === 'days' || key === 'inactiveDates') {
             // Arrays usually need to be stringified for FormData to backend
             formData.append(key, JSON.stringify(cleanData[key]));
          } else {
             formData.append(key, cleanData[key]);
          }
        });

        if (isNew) {
           result = await createWorkshop(formData); // Context must handle content-type detection usually
        } else {
           result = await updateWorkshop(form._id, formData);
        }

      } else {
        // --- JSON MODE (Presets) ---
        if (isNew) {
          result = await createWorkshop(cleanData);
        } else {
          result = await updateWorkshop(form._id, cleanData);
        }
      }

      if (!result || result.success === false) {
        throw new Error(result?.message || "שמירה נכשלה");
      }
      navigate("/workshops");

    } catch (err) {
      console.error("❌ save error:", err);
      alert(err.message || "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  // === Render ===
  const addrHint = addrValid.status === "checking" ? "בודק כתובת…" 
    : addrValid.status === "ok" ? "✓ הכתובת נראית תקינה לעיר"
    : addrValid.status === "warn" ? "⚠︎ הכתובת לא אומתה לעיר — אפשר לשמור בכל זאת"
    : addrValid.status === "err" ? "⚠︎ שירות ולידציה לא זמין — אפשר לשמור בכל זאת" : "";

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-gray-50 py-10 px-4">
      <div className="w-full max-w-5xl mx-auto bg-white rounded-3xl shadow-2xl p-6 md:p-10 border border-indigo-100">
        <h2 className="text-3xl font-extrabold text-indigo-800 text-center mb-8">
          {isNew ? "🪄 יצירת סדנה חדשה" : "🎛️ עריכת סדנה"}
        </h2>

        {/* === 3. New Hybrid Image Selector === */}
        <div className="mb-8 border-b border-gray-100 pb-8">
           <ImageSelector 
             selectedValue={form.image} 
             onChange={(val) => setField("image", val)} 
           />
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
                    <option key={c} value={c}>{c}</option>
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
                <span className={`mt-1 text-xs ${
                  addrValid.status === "ok" ? "text-green-700"
                  : addrValid.status === "warn" ? "text-amber-600"
                  : addrValid.status === "err" ? "text-red-600" : "text-gray-500"
                }`}>
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
            קבלה אוטומטית מרשימת המתנה
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
