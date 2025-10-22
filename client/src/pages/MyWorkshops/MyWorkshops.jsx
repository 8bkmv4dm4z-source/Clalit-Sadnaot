/**
 * MyWorkshops.jsx — Family Weekly Calendar (Refined Layout v2.4)
 * --------------------------------------------------------------
 * ✅ Dynamic height rows (auto-expands to text lines)
 * ✅ Wrapped multi-line titles without overflow
 * ✅ Aligned borders and consistent spacing
 * ✅ Clear vertical separator between hour column and days
 * ✅ Smooth hover + pastel visual balance
 */

import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

/* ----------------------------- Config ----------------------------- */
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const HEB_DAY = {
  Sunday: "יום א",
  Monday: "יום ב",
  Tuesday: "יום ג",
  Wednesday: "יום ד",
  Thursday: "יום ה",
  Friday: "יום ו",
};
const START_HOUR = 7;
const END_HOUR = 22;

const PALETTE = [
  "#fca5a5",
  "#93c5fd",
  "#86efac",
  "#c4b5fd",
  "#fcd34d",
  "#5eead4",
  "#f9a8d4",
  "#a5b4fc",
];

/* ----------------------------- Helpers ----------------------------- */
function pad2(n) {
  return n < 10 ? `0${n}` : `${n}`;
}
function parseHourToFloat(hhmm) {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (Number.isNaN(m) ? 0 : m / 60);
}
function formatHour(h) {
  return `${pad2(h)}:00`;
}
function getGoogleMapsLink(city, address) {
  const label = `${address || ""}${address && city ? ", " : ""}${city || ""}`.trim();
  return label ? `https://www.google.com/maps?q=${encodeURIComponent(label)}` : null;
}
function startOfWeekSunday(d) {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = date.getDay(); // 0=Sunday
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
}
function addDays(base, days) {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/* ----------------------- Mini Workshop Card ------------------------ */
function MiniWorkshopCard({ title, hour, color, city, address }) {
  const mapUrl = getGoogleMapsLink(city, address);
  return (
    <div
      className="rounded-xl border border-white/50 p-2 flex items-start justify-between shadow-sm transition-transform hover:scale-[1.03] hover:shadow-md"
      style={{
        background: `linear-gradient(to right, ${color}20, ${color}40)`,
      }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-gray-800 whitespace-normal break-words leading-snug">
          {title}
        </div>
        <div className="text-[11px] text-gray-600 mt-1">{hour}</div>
      </div>
      {mapUrl && (
        <a
          href={mapUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 shrink-0 ml-2 transition-colors"
          title="פתח במפות Google"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 3.75c4.56 0 8.25 3.69 8.25 8.25S16.56 20.25 12 20.25 3.75 16.56 3.75 12 7.44 3.75 12 3.75z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3.75 12h16.5M12 3.75c2.25 2.25 3.375 5.25 3.375 8.25S14.25 18 12 20.25M12 3.75C9.75 6 8.625 9 8.625 12S9.75 18 12 20.25"
            />
          </svg>
        </a>
      )}
    </div>
  );
}

/* ------------------------------ Main ------------------------------- */
export default function MyWorkshops({
  user,
  isLoggedIn,
  workshopsByEntity = {},
  loading = false,
  error = "",
}) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekSunday(new Date()));

  const colorMap = useMemo(() => {
    const ids = Object.keys(workshopsByEntity);
    const map = {};
    ids.forEach((id, idx) => {
      map[id] = PALETTE[idx % PALETTE.length];
    });
    return map;
  }, [workshopsByEntity]);

  const events = useMemo(() => {
    const out = [];
    Object.entries(workshopsByEntity).forEach(([entityId, info]) => {
      const color = colorMap[entityId] || "#3b82f6";
      (info.workshops || []).forEach((w) => {
        const hourFloat = parseHourToFloat(w.hour);
        if (!hourFloat) return;
        (Array.isArray(w.days) ? w.days : []).forEach((day) => {
          const dayIndex = DAYS.indexOf(day);
          if (dayIndex !== -1) {
            out.push({
              memberId: entityId,
              memberName: info.name,
              color,
              title: w.title || "סדנה",
              city: w.city,
              address: w.address,
              dayIndex,
              hourLabel: w.hour,
              hourFloat,
            });
          }
        });
      });
    });
    return out;
  }, [workshopsByEntity, colorMap]);

  const cellMap = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const hour = Math.floor(ev.hourFloat);
      if (hour < START_HOUR || hour > END_HOUR) continue;
      const key = `${ev.dayIndex}-${hour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => a.hourFloat - b.hourFloat || a.title.localeCompare(b.title));
    }
    return map;
  }, [events]);

  const weekLabel = useMemo(() => {
    const end = addDays(weekAnchor, 5);
    const fmt = (d) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
    return `${fmt(weekAnchor)} — ${fmt(end)}`;
  }, [weekAnchor]);

  if (!isLoggedIn)
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-gray-600">
        יש להתחבר כדי לצפות בלוח הסדנאות.
      </div>
    );

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-white p-4 md:p-8">
      {/* Header */}
      <div className="max-w-7xl mx-auto mb-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold bg-gradient-to-r from-indigo-700 via-blue-700 to-sky-500 bg-clip-text text-transparent flex items-center gap-2">
              <CalendarDays size={28} className="text-indigo-600" />
              לוח סדנאות משפחתי — שבועי
            </h1>
            <p className="text-gray-600 mt-1 text-sm">תצוגה לפי שעות וימים, צבעים לפי בני משפחה</p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <button
              onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition"
            >
              <ChevronRight size={16} /> שבוע קודם
            </button>
            <button
              onClick={() => setWeekAnchor(startOfWeekSunday(new Date()))}
              className="px-3 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition"
            >
              היום
            </button>
            <button
              onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
              className="flex items-center gap-1 px-3 py-2 rounded-xl border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition"
            >
              שבוע הבא <ChevronLeft size={16} />
            </button>
          </div>
        </div>

        <div className="text-sm text-gray-500 mt-1">{weekLabel}</div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {Object.entries(workshopsByEntity).map(([id, info]) => (
            <div key={id} className="flex items-center gap-2">
              <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: colorMap[id] }} />
              <span className="text-sm text-gray-800">{info.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="max-w-7xl mx-auto overflow-x-auto rounded-2xl border border-indigo-100 bg-white shadow-sm">
        <div className="min-w-[900px]">
          {/* Header row */}
          <div className="grid border-b border-indigo-100 rounded-t-2xl" style={{ gridTemplateColumns: `100px repeat(6, 1fr)` }}>
            <div className="bg-white h-12 border-r-2 border-indigo-200" />
            {DAYS.map((d, i) => (
  <div
    key={d}
    className={`h-12 flex items-center justify-center text-indigo-800 font-semibold border-r border-indigo-100 ${
      i === DAYS.length - 1 ? "border-r-2 border-indigo-200 rounded-tr-2xl" : ""
    } ${i % 2 === 0 ? "bg-blue-50/30" : "bg-white"}`}
  >
    {HEB_DAY[d]}
  </div>
))}

          </div>

          {/* Hour rows */}
          {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
            const hour = START_HOUR + idx;
            return (
              <div
                key={hour}
                className="grid border-t border-indigo-100"
                style={{ gridTemplateColumns: `100px repeat(6, 1fr)` }}
              >
                {/* Hour column */}
                <div className="bg-white flex items-center justify-center min-h-[80px] border-r-2 border-indigo-200">
                  <span className="text-xs text-gray-500 font-medium">{formatHour(hour)}</span>
                </div>

                {/* Day cells */}
                {DAYS.map((_, dayIndex) => {
  const key = `${dayIndex}-${hour}`;
  const items = cellMap.get(key) || [];
  return (
    <div
      key={key}
      className={`p-2 flex flex-col gap-2 justify-start border-r border-indigo-100 ${
        dayIndex === DAYS.length - 1 ? "border-r-2 border-indigo-200" : ""
      } ${dayIndex % 2 === 0 ? "bg-blue-50/10" : "bg-white"}`}
    >
      {items.map((ev, i) => (
        <MiniWorkshopCard
          key={`${key}-${i}-${ev.title}`}
          title={ev.title}
          hour={ev.hourLabel}
          color={ev.color}
          city={ev.city}
          address={ev.address}
        />
      ))}
    </div>
  );
})}

              </div>
            );
          })}
        </div>
      </div>

      {/* Status */}
      <div className="max-w-7xl mx-auto">
        {loading && <div className="text-center text-gray-500 mt-6 animate-pulse">⏳ טוען סדנאות…</div>}
        {error && <div className="text-center text-red-600 mt-6">❌ {error}</div>}
        {!loading && !error && events.length === 0 && (
          <div className="text-center text-gray-600 mt-6">אין סדנאות לשבוע זה.</div>
        )}
      </div>
    </div>
  );
}
