/**
 * MyWorkshopsOriginSkeleton.jsx — Origin‑style, highly reactive weekly calendar (RTL)
 * -----------------------------------------------------------------------------
 * Fresh skeleton that keeps your data shape but borrows more from that design:
 *  • Clean, flat chrome with soft borders and alternating cells
 *  • Strong responsive handling via a density hook (viewport + ResizeObserver)
 *  • Content‑aware column widths — per‑day (Thu can be wider than Mon)
 *  • Cards clamp (2–3 lines) with no mid‑word cuts; grid follows card space
 *  • Sticky header + sticky hour column; smooth horizontal/vertical scrolling
 *  • RTL Hebrew labels, Thu↔Fri divider; optional Google Maps shortcut
 *  • No 3rd‑party virtualization; fast enough for weekly grids
 */

import React, {
  useMemo,
  useRef,
  useState,
  useEffect,
  useLayoutEffect,
  useCallback,
} from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

/* ----------------------------- Constants ----------------------------- */
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
  "#fca5a5", "#93c5fd", "#86efac", "#c4b5fd",
  "#fcd34d", "#5eead4", "#f9a8d4", "#a5b4fc",
];

/* ------------------------------ Helpers ------------------------------ */
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const parseHourToFloat = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (Number.isNaN(m) ? 0 : m / 60);
};
const formatHour = (h) => `${pad2(h)}:00`;
const startOfWeekSunday = (d) => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = date.getDay();
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};
const addDays = (base, days) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};
const mapsLink = (city, address) => {
  const label = `${address || ""}${address && city ? ", " : ""}${city || ""}`.trim();
  return label ? `https://www.google.com/maps?q=${encodeURIComponent(label)}` : null;
};

/* ----------------------- Density & Responsiveness ---------------------- */
function pickDensity(vw, vh) {
  if (vw <= 420 || vh <= 620) return "ultra";    // phones portrait / tight
  if (vw <= 768 || vh <= 720) return "compact";  // small tablets / phones landscape
  if (vw <= 1180 || vh <= 820) return "cozy";    // laptops
  return "comfy";                                 // desktops
}
const clampLinesForDensity = (d) => (d === "ultra" || d === "compact" ? 2 : 3);

const DENSITY = {
  ultra: { timew: 72,  rowh: 52, headerH: 42, fontDay: 11.5, fontHour: 10.5, fontTitle: 12,  fontMeta: 10.5, cardPad: 8, gap: 7, sideVw: 2.5, topVh: 5.5 },
  compact:{ timew: 84,  rowh: 58, headerH: 46, fontDay: 12.5, fontHour: 11.5, fontTitle: 12.5,fontMeta: 11,   cardPad: 9, gap: 8, sideVw: 2.75, topVh: 5.8 },
  cozy:  { timew: 96,  rowh: 64, headerH: 48, fontDay: 13.5, fontHour: 12,   fontTitle: 13,  fontMeta: 11.5, cardPad:10, gap: 9, sideVw: 3,    topVh: 6 },
  comfy: { timew:104,  rowh: 70, headerH: 50, fontDay: 14,   fontHour:12.5,  fontTitle: 13.5,fontMeta: 12,   cardPad:11, gap:10, sideVw: 3,    topVh: 6 },
};

function useDensity() {
  const [density, setDensity] = useState(() => pickDensity(window.innerWidth, window.innerHeight));
  useEffect(() => {
    const onResize = () => setDensity(pickDensity(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document?.fonts?.ready) document.fonts.ready.then(onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);
  return density;
}

/* ----------------------- Content‑aware day widths ---------------------- */
function measureTextPx(text, font) {
  const c = measureTextPx._c || (measureTextPx._c = document.createElement("canvas"));
  const ctx = c.getContext("2d");
  ctx.font = font; // e.g., "600 12px Inter, system-ui, sans-serif"
  return Math.ceil(ctx.measureText(text || "").width);
}

function usePerDayWidths(events, size, lines) {
  // Compute a width per day based on longest line for that day
  return useMemo(() => {
    const font = `600 ${size.fontTitle}px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const targetChars = lines === 2 ? 14 : 16; // visual comfort per line
    const basePadding = size.cardPad * 2 + 10 /*dot*/ + 6 /*gap*/ + 16 /*safety*/;

    const widths = new Array(6).fill(size.dayw || 200); // default px per day
    for (let day = 0; day < 6; day++) {
      let longest = 0;
      for (const ev of events) {
        if (ev.dayIndex !== day) continue;
        // greedy line build without mid‑word cuts
        const tokens = String(ev.title || "").split(/\s+/).filter(Boolean);
        let line = "", maxLine = 0;
        for (const t of tokens) {
          const next = line ? `${line} ${t}` : t;
          if (next.length <= targetChars) {
            line = next; maxLine = Math.max(maxLine, measureTextPx(line, font));
          } else {
            maxLine = Math.max(maxLine, measureTextPx(line, font));
            line = t.length > targetChars ? t.slice(0, targetChars) : t;
            maxLine = Math.max(maxLine, measureTextPx(line, font));
          }
        }
        maxLine = Math.max(maxLine, measureTextPx(line, font));
        longest = Math.max(longest, maxLine);
      }
      const need = Math.max((size.dayw || 200), longest + basePadding);
      widths[day] = need;
    }
    return widths; // px per day (Mon..Fri)
  }, [events, size.cardPad, size.fontTitle, size.dayw, lines]);
}

/* ------------------------------ Mini Card ------------------------------ */
function MiniCard({ title, hour, color, city, address, size, lines }) {
  const href = mapsLink(city, address);
  const clampStyle = {
    wordBreak: "keep-all",
    overflowWrap: "normal",
    hyphens: "manual",
    display: "-webkit-box",
    WebkitLineClamp: lines,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "right",
  };
  return (
    <div
      className="w-full max-w-full rounded-xl shadow-sm hover:shadow-md transition-transform hover:scale-[1.01]"
      style={{
        background: `linear-gradient(180deg, ${color}1A, ${color}33)`,
        padding: `${size.cardPad}px`,
        border: `1px solid ${color}26`,
      }}
      dir="rtl"
    >
      <div className="flex items-start gap-2 w-full">
        <span className="shrink-0 inline-block rounded-full mt-[2px]" style={{ width: 10, height: 10, backgroundColor: color }} aria-hidden="true" />
        <div className="flex-1 min-w-0 max-w-full">
          <div className="font-semibold text-gray-800 leading-tight" style={{ ...clampStyle, fontSize: `${size.fontTitle}px` }} title={title}>
            {title}
          </div>
          <div className="text-gray-600 mt-1" style={{ fontSize: `${size.fontMeta}px`, lineHeight: 1.1, textAlign: "right" }} title={hour}>
            {hour}
          </div>
        </div>
        {href && (
          <a href={href} target="_blank" rel="noopener noreferrer" className="shrink-0 ms-1 text-indigo-600 hover:text-indigo-800" title="פתח במפות Google" aria-label="Open in Google Maps">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 3.75c4.56 0 8.25 3.69 8.25 8.25S16.56 20.25 12 20.25 3.75 16.56 3.75 12 7.44 3.75 12 3.75z" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M3.75 12h16.5M12 3.75c2.25 2.25 3.375 5.25 3.375 8.25S14.25 18 12 20.25M12 3.75C9.75 6 8.625 9 8.625 12S9.75 18 12 20.25" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

/* --------------------------------- Main -------------------------------- */
export default function MyWorkshopsOriginSkeleton({
  user,
  isLoggedIn,
  workshopsByEntity = {},
  loading = false,
  error = "",
}) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekSunday(new Date()));
  const density = useDensity();
  const size = DENSITY[density];
  const lines = clampLinesForDensity(density);

  /* ------------------------- Map your data ------------------------- */
  const colorMap = useMemo(() => {
    const ids = Object.keys(workshopsByEntity);
    const map = {};
    ids.forEach((id, idx) => (map[id] = PALETTE[idx % PALETTE.length]));
    return map;
  }, [workshopsByEntity]);

  const events = useMemo(() => {
    const out = [];
    Object.entries(workshopsByEntity).forEach(([entityId, info]) => {
      const color = colorMap[entityId] || "#3b82f6";
      (info.workshops || []).forEach((w) => {
        const hourFloat = parseHourToFloat(w.hour);
        if (hourFloat == null) return;
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
    for (const arr of map.values()) arr.sort((a, b) => a.hourFloat - b.hourFloat || a.title.localeCompare(b.title));
    return map;
  }, [events]);

  /* ----------------- Per‑day widths so grid follows cards ---------------- */
  const perDayWidths = usePerDayWidths(events, { ...size, dayw: 200 }, lines); // base dayw 200px min

  const gridColumnsString = useMemo(() => {
    const cols = perDayWidths.map((w) => `${Math.round(w)}px`).join(" ");
    return `var(--timew) ${cols}`; // time column + 6 day columns
  }, [perDayWidths]);

  /* --------------------------- Week Label --------------------------- */
  const weekLabel = useMemo(() => {
    const end = addDays(weekAnchor, 5);
    const fmt = (d) => d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
    return `${fmt(weekAnchor)} — ${fmt(end)}`;
  }, [weekAnchor]);

  /* ------------------------------- Guard ------------------------------- */
  if (!isLoggedIn) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-gray-600">
        יש להתחבר כדי לצפות בלוח הסדנאות.
      </div>
    );
  }

  /* -------------------------------- Render ------------------------------- */
  return (
    <div dir="rtl" className="min-h-screen" style={{
      background: "linear-gradient(180deg, rgba(241,245,255,0.6), rgba(255,255,255,0.75))",
      paddingInline: `${size.sideVw}vw`,
      paddingTop: "min(2.2vh, 14px)",
    }}>
      {/* Top bar */}
      <div className="w-full" style={{ paddingBottom: `calc(${size.topVh}vh - min(2.2vh, 14px))` }}>
        <div className="max-w-[1800px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-indigo-700/90 flex items-center gap-1.5">
                <CalendarDays size={22} className="text-indigo-600" />
                לוח סדנאות משפחתי — שבועי
              </h1>
              <p className="text-gray-600 mt-0.5 text-xs md:text-sm">Reactive weekly grid — הכרטיס מקבל מקום, הטבלה מתאימה</p>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <button onClick={() => setWeekAnchor(addDays(weekAnchor, -7))} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs">
                <ChevronRight size={14} /> שבוע קודם
              </button>
              <button onClick={() => setWeekAnchor(startOfWeekSunday(new Date()))} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs">
                היום
              </button>
              <button onClick={() => setWeekAnchor(addDays(weekAnchor, 7))} className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs">
                שבוע הבא <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {Object.entries(workshopsByEntity).map(([id, info]) => (
              <div key={id} className="flex items-center gap-2">
                <span className="inline-block w-3.5 h-3.5 rounded-full" style={{ backgroundColor: PALETTE[Object.keys(workshopsByEntity).indexOf(id) % PALETTE.length] }} />
                <span className="text-gray-800" style={{ fontSize: `${size.fontDay - 1}px` }}>{info.name}</span>
              </div>
            ))}
          </div>

          <div className="mt-1 text-[12px] text-gray-500">{weekLabel}</div>
        </div>
      </div>

      {/* Scroll frame */}
      <div className="w-full" style={{ height: `calc(100vh - ${size.topVh}vh)`, paddingBottom: 8, overscrollBehavior: "contain" }}>
        <div className="max-w-[1800px] mx-auto h-full overflow-auto" style={{ contain: "layout paint size" }}>
          {/* Intrinsic width wrapper */}
          <div className="relative mx-auto" style={{ minWidth: `calc(${size.timew}px + ${perDayWidths.reduce((a,b)=>a+b,0)}px)` }}>
            {/* Header row */}
            <div className="grid sticky top-0 z-20" style={{
              gridTemplateColumns: ` ${size.timew}px ${perDayWidths.map((w)=>`${Math.round(w)}px`).join(" ")}`,
              height: `${size.headerH}px`,
              background: "rgba(255,255,255,0.7)",
              backdropFilter: "saturate(1.1) blur(2px)",
              borderBottom: "1px solid rgba(99, 102, 241, 0.25)",
              borderTopLeftRadius: 12,
              borderTopRightRadius: 12,
            }}>
              <div className="h-full flex items-center justify-center sticky left-0 z-30" style={{ background: "rgba(255,255,255,0.8)", borderInlineEnd: "2px solid rgba(99,102,241,0.25)", borderTopLeftRadius: 12 }} />
              {DAYS.map((d, i) => {
                const isBetweenThuFri = i === 5;
                const baseBg = i % 2 === 0 ? "rgba(239,246,255,0.55)" : "rgba(255,255,255,0.65)";
                return (
                  <div key={d} className="h-full flex items-center justify-center font-semibold text-indigo-800" style={{
                    fontSize: `${size.fontDay}px`,
                    background: baseBg,
                    borderInlineEnd: i === DAYS.length - 1 ? "2px solid rgba(99,102,241,0.25)" : "1px solid rgba(99,102,241,0.18)",
                    borderLeft: isBetweenThuFri ? "2px solid rgba(99,102,241,0.35)" : undefined,
                    borderTopRightRadius: i === DAYS.length - 1 ? 12 : 0,
                  }}>{HEB_DAY[d]}</div>
                );
              })}
            </div>

            {/* Hour rows */}
            {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
              const hour = START_HOUR + idx;
              return (
                <div key={hour} className="grid" style={{
                  gridTemplateColumns: ` ${size.timew}px ${perDayWidths.map((w)=>`${Math.round(w)}px`).join(" ")}`,
                  minHeight: `${size.rowh}px`,
                  borderTop: "1px solid rgba(99,102,241,0.18)",
                }}>
                  {/* sticky hour col */}
                  <div className="flex items-center justify-center sticky left-0 z-10" style={{ background: "rgba(255,255,255,0.78)", borderInlineEnd: "2px solid rgba(99,102,241,0.25)" }}>
                    <span className="text-gray-600 font-medium" style={{ fontSize: `${size.fontHour}px` }}>{formatHour(hour)}</span>
                  </div>

                  {/* day cells */}
                  {DAYS.map((_, dayIndex) => {
                    const key = `${dayIndex}-${hour}`;
                    const baseBg = dayIndex % 2 === 0 ? "rgba(239,246,255,0.35)" : "rgba(255,255,255,0.5)";
                    const isBetweenThuFri = dayIndex === 5;
                    const items = (cellMap.get(key) || []);
                    return (
                      <div key={key} className="flex flex-col items-stretch justify-start" style={{
                        padding: `${Math.max(size.cardPad - 2, 6)}px`,
                        gap: `${size.gap}px`,
                        background: baseBg,
                        borderInlineEnd: dayIndex === DAYS.length - 1 ? "2px solid rgba(99,102,241,0.25)" : "1px solid rgba(99,102,241,0.18)",
                        borderLeft: isBetweenThuFri ? "2px solid rgba(99,102,241,0.35)" : undefined,
                      }}>
                        {items.map((ev, i) => (
                          <MiniCard key={`${key}-${i}-${ev.title}`} title={ev.title} hour={ev.hourLabel} color={ev.color} city={ev.city} address={ev.address} size={size} lines={lines} />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* bottom line */}
            <div style={{ borderTop: "2px solid rgba(99,102,241,0.25)", height: 1, width: "100%", borderBottomLeftRadius: 12, borderBottomRightRadius: 12 }} />
          </div>
        </div>
      </div>

      {/* Status line */}
      <div className="w-full pb-2">
        <div className="max-w-[1800px] mx-auto">
          {loading && <div className="text-center text-gray-500 mt-2 animate-pulse">⏳ טוען סדנאות…</div>}
          {error && <div className="text-center text-red-600 mt-2">❌ {error}</div>}
        </div>
      </div>
    </div>
  );
}
