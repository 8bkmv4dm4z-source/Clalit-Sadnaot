/**
 * EditWorkshop.jsx — Tailwind Unified Create/Edit (Security-Aware)
 * ---------------------------------------------------------------
 * - Includes validation for required fields (title, coach, startDate, timePeriod)
 * - Sanitizes input before sending to backend
 * - Respects backend sanitization in server.js
 * - Keeps full Tailwind styling and context-safe updates
 * - ✅ Now uses centralized apiFetch() (auto JWT header + refresh + cookies)
 */

import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { apiFetch } from "../../utils/apiFetch"; // ✅ secure fetch wrapper

/* 🔒 Lightweight client-side sanitization (UX-only) */
function sanitizeInput(value) {
  if (typeof value !== "string") return value;
  return value
    .trim()
    .replace(/[<>${}]/g, "") // prevent script & template injections
    .replace(/\s{2,}/g, " "); // collapse double spaces
}

export default function EditWorkshop() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { workshops, addWorkshopLocal, updateWorkshopLocal } = useWorkshops();

  const isNew = !id;
  const existingWorkshop = id ? workshops.find((w) => w?._id === id) : null;

  const [form, setForm] = useState(
    existingWorkshop || {
      title: "",
      type: "",
      ageGroup: "",
      city: "",
      coach: "",
      day: "",
      hour: "",
      price: "",
      available: true,
      description: "",
      timePeriod: "",
      startDate: "",
    }
  );

  const [preview, setPreview] = useState(existingWorkshop?.image || "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (existingWorkshop) {
      setForm(existingWorkshop);
      setPreview(existingWorkshop?.image || "");
    }
  }, [id, existingWorkshop]);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: sanitizeInput(value) }));
  };

  const handleImageFile = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => setPreview(reader.result);
    reader.readAsDataURL(file);
  };

  const validateForm = () => {
    const requiredFields = ["title", "coach", "startDate", "timePeriod"];
    for (const f of requiredFields) {
      if (!form[f] || String(form[f]).trim() === "") {
        alert(`יש למלא את השדה "${f}" לפני השמירה.`);
        return false;
      }
    }
    if (isNaN(Number(form.price)) || Number(form.price) < 0) {
      alert("המחיר חייב להיות מספר חיובי.");
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    try {
      if (!validateForm()) return;

      setSaving(true);

      // Prepare payload (keep existing logic)
      const payload = Object.keys(form).reduce((acc, key) => {
        acc[key] = sanitizeInput(form[key]);
        return acc;
      }, {});
      payload.image = preview;

      // Remove server-managed fields
      delete payload.participants;
      delete payload.participantsCount;

      const endpoint = isNew ? "/api/workshops" : `/api/workshops/${form._id}`;
      const method = isNew ? "POST" : "PUT";

      // ✅ Use apiFetch (adds Authorization + credentials, auto-refresh on 401)
      const res = await apiFetch(endpoint, {
        method,
        body: JSON.stringify(payload),
        // No need to pass headers or token explicitly; apiFetch handles it.
      });

      const data = await res.json();
      if (!res.ok)
        throw new Error(data?.message || "שמירה נכשלה, נסה שוב מאוחר יותר.");

      if (isNew) addWorkshopLocal(data.workshop || data);
      else updateWorkshopLocal(data.workshop || data);

      navigate("/workshops");
    } catch (err) {
      console.error("❌ Workshop save error:", err);
      alert(err.message || "שגיאה בשמירה, נסה שוב מאוחר יותר.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-50 to-orange-50 flex justify-center items-center p-6">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-xl p-8 border border-gray-200">
        <h2 className="text-3xl font-extrabold text-gray-900 mb-6 text-center font-[Poppins]">
          {isNew ? "צור סדנה חדשה" : "עריכת סדנה"}
        </h2>

        {/* === Image Preview === */}
        <div className="text-center mb-6">
          {preview ? (
            <img
              src={preview}
              alt="תצוגה מקדימה"
              className="w-full max-h-64 object-cover rounded-xl shadow-sm border border-gray-100"
            />
          ) : (
            <div className="w-full h-48 bg-gray-100 rounded-xl flex items-center justify-center text-gray-400 text-sm">
              אין תמונה
            </div>
          )}
          <label className="mt-4 inline-block cursor-pointer bg-indigo-600 hover:bg-indigo-700 text-white font-medium py-2 px-4 rounded-xl shadow-sm transition">
            החלף תמונה
            <input
              type="file"
              accept="image/*"
              onChange={(e) => handleImageFile(e.target.files?.[0])}
              className="hidden"
            />
          </label>
        </div>

        {/* === Form Fields === */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            ["title", "שם הסדנה"],
            ["type", "סוג"],
            ["ageGroup", "קבוצת גיל"],
            ["city", "עיר"],
            ["day", "יום"],
            ["hour", "שעה"],
            ["coach", "מאמן"],
            ["timePeriod", "תקופה"],
            ["startDate", "תאריך התחלה"],
          ].map(([key, label]) => (
            <label
              key={key}
              className="flex flex-col text-sm font-medium text-gray-700"
            >
              {label}:
              <input
                type={key === "startDate" ? "date" : "text"}
                className="mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
                value={form[key] || ""}
                onChange={(e) => handleChange(key, e.target.value)}
              />
            </label>
          ))}

          <label className="flex flex-col text-sm font-medium text-gray-700">
            מחיר:
            <input
              type="number"
              min="0"
              className="mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none"
              value={form.price}
              onChange={(e) => handleChange("price", e.target.value)}
            />
          </label>
        </div>

        {/* === Description + Availability === */}
        <div className="mt-5">
          <label className="flex flex-col text-sm font-medium text-gray-700">
            תיאור:
            <textarea
              className="mt-1 border rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 outline-none min-h-[100px]"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
          </label>

          <label className="flex items-center gap-2 mt-3 text-sm font-medium text-gray-700">
            <input
              type="checkbox"
              checked={!!form.available}
              onChange={(e) => handleChange("available", e.target.checked)}
              className="w-4 h-4 accent-indigo-600"
            />
            זמינה
          </label>
        </div>

        {/* === Actions === */}
        <div className="mt-8 flex justify-center gap-4">
          <button
            onClick={handleSave}
            disabled={saving}
            className={`px-6 py-2 rounded-xl font-semibold text-white transition ${
              saving
                ? "bg-gray-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700"
            }`}
          >
            {saving ? "שומר..." : "💾 שמור"}
          </button>

          <button
            onClick={() => navigate("/workshops")}
            disabled={saving}
            className="px-6 py-2 rounded-xl font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 transition"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
