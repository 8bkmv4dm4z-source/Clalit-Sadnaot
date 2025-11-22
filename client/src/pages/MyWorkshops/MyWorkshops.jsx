// src/pages/MyWorkshops/MyWorkshopsOriginStyle.jsx
// Origin-style weekly calendar (RTL) — uses WorkshopContext maps (userWorkshopMap, familyWorkshopMap)
// Patched for OPTION B: if ?entity=<entityKey> is present, show only that entity's workshops.

import React, { useMemo, useState, useEffect, useLayoutEffect } from "react";
import { ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";

// adjust paths if needed
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";

/* ============================== Constants ============================== */

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

const HEB_DAY = {
  Sunday: "יום א",
  Monday: "יום ב",
  Tuesday: "יום ג",
  Wednesday: "יום ד",
  Thursday: "יום ה",
  Friday: "יום ו",
};

// default frame (will widen to data)
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 22;

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

function pickDensity(vw, vh) {
  if (vw <= 420 || vh <= 620) return "ultra";
  if (vw <= 768 || vh <= 720) return "compact";
  if (vw <= 1180 || vh <= 820) return "cozy";
  return "comfy";
}

const DENSITY = {
  ultra: {
    timew: 72,
    dayw: 176,
    rowh: 52,
    headerH: 42,
    fontDay: 11.5,
    fontHour: 10.5,
    fontCardTitle: 12,
    fontCardMeta: 10.5,
    cardPad: 8,
    gap: 7,
    sideSpaceVw: 2.5,
    topSpaceVh: 5.5,
  },
  compact: {
    timew: 84,
    dayw: 196,
    rowh: 58,
    headerH: 46,
    fontDay: 12.5,
    fontHour: 11.5,
    fontCardTitle: 12.5,
    fontCardMeta: 11,
    cardPad: 9,
    gap: 8,
    sideSpaceVw: 2.75,
    topSpaceVh: 5.8,
  },
  cozy: {
    timew: 96,
    dayw: 220,
    rowh: 64,
    headerH: 48,
    fontDay: 13.5,
    fontHour: 12,
    fontCardTitle: 13,
    fontCardMeta: 11.5,
    cardPad: 10,
    gap: 9,
    sideSpaceVw: 3,
    topSpaceVh: 6,
  },
  comfy: {
    timew: 104,
    dayw: 240,
    rowh: 70,
    headerH: 50,
    fontDay: 14,
    fontHour: 12.5,
    fontCardTitle: 13.5,
    fontCardMeta: 12,
    cardPad: 11,
    gap: 10,
    sideSpaceVw: 3,
    topSpaceVh: 6,
  },
};

/* ============================== Helpers ============================== */

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const formatHour = (h) => `${pad2(h)}:00`;

// Flexible time parser: accepts w.hour / w.startTime / w.time / ISO startDate "T.."
function parseHourToFloatFlexible(w) {
  const raw =
    w?.hour ??
    w?.startTime ??
    w?.time ??
    (typeof w?.startDate === "string" && w.startDate.includes("T")
      ? w.startDate.split("T")[1]?.slice(0, 5)
      : null);

  if (raw == null) return null;
  if (typeof raw === "number") return raw;

  const s = String(raw).trim();

  let m = s.match(/^(\d{1,2}):(\d{2})$/); // "HH:MM" or "H:MM"
  if (m) {
    const h = Number(m[1]),
      mi = Number(m[2]);
    if (!Number.isNaN(h) && !Number.isNaN(mi)) return h + mi / 60;
  }

  m = s.match(/^(\d{1,2})\.(\d{2})$/); // "HH.MM"
  if (m) {
    const h = Number(m[1]),
      mi = Number(m[2]);
    if (!Number.isNaN(h) && !Number.isNaN(mi)) return h + mi / 60;
  }

  m = s.match(/^(\d{1,2})$/); // "HH"
  if (m) {
    const h = Number(m[1]);
    if (!Number.isNaN(h)) return h;
  }

  return null;
}

const startOfWeekSunday = (d) => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = date.getDay(); // 0 = Sun
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

const addDays = (base, days) => {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
};

const atStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const atEndOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

const dateOfWeekday = (anchor, dayIndex) => {
  const d = new Date(anchor);
  d.setDate(d.getDate() + dayIndex);
  d.setHours(0, 0, 0, 0);
  return d;
};

const mapsLink = (city, address) => {
  const label = `${address || ""}${address && city ? ", " : ""}${
    city || ""
  }`.trim();
  return label
    ? `https://www.google.com/maps?q=${encodeURIComponent(label)}`
    : null;
};

function clampLines(densityKey) {
  return densityKey === "ultra" || densityKey === "compact" ? 2 : 3;
}

function measureTextPx(text, font) {
  const canvas =
    measureTextPx._c || (measureTextPx._c = document.createElement("canvas"));
  const ctx = canvas.getContext("2d");
  ctx.font = font;
  return Math.ceil(ctx.measureText(text || "").width);
}

// SECURITY FIX: throttle calendar logs to dev mode with sanitized payloads
const CAL_DEV = import.meta.env.MODE !== "production";
const calLog = (message, detail = {}) => {
  if (!CAL_DEV) return;
  const time = new Date().toLocaleTimeString("he-IL");
  console.debug(`%c[${time}] [CAL] ${message}`, "color:#1565c0;", detail);
};

// Normalize a workshop's days → [0..5] indices (Sun..Fri).
function normalizeDays(w) {
  const raw = Array.isArray(w?.days) ? w.days : [];

  const mapHeb = {
    "יום א": 0,
    "יום ב": 1,
    "יום ג": 2,
    "יום ד": 3,
    "יום ה": 4,
    "יום ו": 5,
    שבת: 6,
  };
  const mapEn = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const mapShort = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const out = [];
  for (const d of raw) {
    if (typeof d === "number") {
      if (d >= 0 && d <= 6) out.push(d);
      continue;
    }
    const s = String(d).trim();
    if (s in mapEn) out.push(mapEn[s]);
    else if (s in mapHeb) out.push(mapHeb[s]);
    else if (s in mapShort) out.push(mapShort[s]);
  }

  // If no days provided, derive from startDate (if present)
  if (!out.length && w?.startDate) {
    const sd = new Date(w.startDate);
    if (!isNaN(sd)) out.push(sd.getDay());
  }

  // Only render Sun..Fri
  return out.filter((i) => i >= 0 && i <= 5);
}

/* ============================== Mini Card ============================== */

function MiniCard({
  title,
  hour,
  color,
  city,
  address,
  size,
  lines,
  compact = false,
  relation = "",
}) {
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

  if (compact) {
    return (
      <div
        className="compact-card rounded-xl shadow-sm"
        style={{
          width: "48%",
          background: `linear-gradient(180deg, ${color}1A, ${color}33)`,
          padding: `${size.cardPad}px`,
          border: `1px solid ${color}26`,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        dir="rtl"
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            className="shrink-0 inline-block rounded-full"
            style={{ width: 8, height: 8, backgroundColor: color }}
            aria-hidden="true"
          />
          <span
            className="font-semibold text-gray-800 text-sm truncate"
            title={title}
          >
            {title}
          </span>
          {relation ? (
            <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full truncate">
              {relation}
            </span>
          ) : null}
        </div>
      </div>
    );
  }

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
        <span
          className="shrink-0 inline-block rounded-full mt-[2px]"
          style={{ width: 10, height: 10, backgroundColor: color }}
          aria-hidden="true"
        />
        <div className="flex-1 min-w-0 max-w-full">
          <div
            className="font-semibold text-gray-800 leading-tight"
            style={{ ...clampStyle, fontSize: `${size.fontCardTitle}px` }}
            title={title}
          >
            {title}
          </div>
          <div
            className="text-gray-600 mt-1"
            style={{ fontSize: `${size.fontCardMeta}px`, lineHeight: 1.1 }}
          >
            {hour}
          </div>
        </div>

        {href && (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="shrink-0 ms-1 text-indigo-600 hover:text-indigo-800"
            title="פתח במפות Google"
            aria-label="Open in Google Maps"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-3.5 h-3.5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <path
                d="M12 3.75c4.56 0 8.25 3.69 8.25 8.25S16.56 20.25 12 20.25 3.75 16.56 3.75 12 7.44 3.75 12 3.75z"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M3.75 12h16.5M12 3.75c2.25 2.25 3.375 5.25 3.375 8.25S14.25 18 12 20.25M12 3.75C9.75 6 8.625 9 8.625 12S9.75 18 12 20.25"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

/* ============================== Main Component ============================== */

export default function MyWorkshopsOriginStyle() {
  // 🔗 contexts
  const { user, isLoggedIn } = useAuth();
  const {
    displayedWorkshops,
    userWorkshopMap, // { [workshopId]: true }
    familyWorkshopMap, // { [workshopId]: [familyMemberId, ...] }
    loading,
    error,
  } = useWorkshops();

  // 🔍 Option B filter: read ?entity=<entityKey> from URL
  let selectedEntityKey = null;
  try {
    if (typeof window !== "undefined") {
      const qs = new URLSearchParams(window.location.search || "");
      selectedEntityKey = qs.get("entity");
    }
  } catch {
    selectedEntityKey = null;
  }

  /* ===== Build workshopsByEntity from maps (single source of truth) ===== */

  const workshopsByEntity = useMemo(() => {
    if (!user) return {};

    const list = Array.isArray(displayedWorkshops) ? displayedWorkshops : [];
    const map = {};
    const isUserWorkshop = (w) => Boolean(userWorkshopMap?.[w._id]);
    const isMemberWorkshop = (w, memberId) => {
      const arr = familyWorkshopMap?.[w._id];
      return (
        Array.isArray(arr) && arr.some((id) => String(id) === String(memberId))
      );
    };

    // main user bucket
    map[user._id] = {
      name: user.fullName || user.name || "אני",
      relation: "",
      entityKey: user.entityKey || null,
      workshops: list.filter(isUserWorkshop),
    };

    // family buckets (only those that actually have workshops)
    (user.familyMembers || []).forEach((m) => {
      const ws = list.filter((w) => isMemberWorkshop(w, m._id));
      if (ws.length) {
        map[m._id] = {
          name: m.name,
          relation: m.relation || "",
          entityKey: m.entityKey || null,
          workshops: ws,
        };
      }
    });

    calLog("workshopsByEntity buckets built", {
      bucketCount: Object.keys(map).length,
      userWorkshops: map[user._id]?.workshops?.length || 0,
      familyBuckets: Math.max(0, Object.keys(map).length - 1),
    });

    return map;
  }, [user, displayedWorkshops, userWorkshopMap, familyWorkshopMap]);

  // 🔎 Apply Option B filter: if ?entity=key → keep only that entity's bucket
  const filteredWorkshopsByEntity = useMemo(() => {
    if (!selectedEntityKey) return workshopsByEntity;

    const entries = Object.entries(workshopsByEntity || {}).filter(
      ([, info]) =>
        info?.entityKey &&
        String(info.entityKey) === String(selectedEntityKey)
    );

    if (!entries.length) {
      // No match found → fallback to full multi-entity view
      return workshopsByEntity;
    }

    const filtered = Object.fromEntries(entries);
    calLog("entity filter applied", {
      selectedEntityKey,
      bucketsRemaining: Object.keys(filtered).length,
    });
    return filtered;
  }, [workshopsByEntity, selectedEntityKey]);

  // For small UI hint: what's the name of the selected entity (if any)?
  const selectedEntityName = useMemo(() => {
    if (!selectedEntityKey) return null;
    const allInfos = Object.values(workshopsByEntity || {});
    const match = allInfos.find(
      (info) =>
        info?.entityKey &&
        String(info.entityKey) === String(selectedEntityKey)
    );
    return match?.name || null;
  }, [workshopsByEntity, selectedEntityKey]);

  /* --- density & layout sizing --- */
  const [densityKey, setDensityKey] = useState(() =>
    pickDensity(window.innerWidth, window.innerHeight)
  );
  const size = DENSITY[densityKey];
  const titleLines = clampLines(densityKey);

  useEffect(() => {
    const onResize = () =>
      setDensityKey(pickDensity(window.innerWidth, window.innerHeight));
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    if (document?.fonts?.ready) document.fonts.ready.then(onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, []);

  /* --- week anchor --- */
  const [weekAnchor, setWeekAnchor] = useState(() =>
    startOfWeekSunday(new Date())
  );

  /* --- legend colors per entity (after filter) --- */
  const legendColorMap = useMemo(() => {
    const ids = Object.keys(filteredWorkshopsByEntity);
    const map = {};
    ids.forEach((id, idx) => {
      map[id] = PALETTE[idx % PALETTE.length];
    });
    return map;
  }, [filteredWorkshopsByEntity]);

  /* --- flatten to events (robust time/day + start/end) --- */
  const events = useMemo(() => {
    const out = [];
    for (const [entityId, info] of Object.entries(
      filteredWorkshopsByEntity || {}
    )) {
      const color = legendColorMap[entityId] || "#3b82f6";
      (info.workshops || []).forEach((w) => {
        const hourFloat = parseHourToFloatFlexible(w);
        if (hourFloat == null) return; // skip if no time

        const hourLabel =
          w?.hour ??
          w?.startTime ??
          w?.time ??
          (typeof w?.startDate === "string" && w.startDate.includes("T")
            ? w.startDate.split("T")[1]?.slice(0, 5)
            : "");

        const startInclusive = w?.startDate ? atStartOfDay(w.startDate) : null;
        const endExclusive = w?.endDate ? atStartOfDay(w.endDate) : null;

        const dayIndices = normalizeDays(w);
        for (const dayIndex of dayIndices) {
          out.push({
            color,
            title: w.title || "סדנה",
            city: w.city || "",
            address: w.address || "",
            relation: info.relation || "",
            dayIndex,
            hourLabel,
            hourFloat,
            startInclusive,
            endExclusive,
          });
        }
      });
    }
    calLog("events flattened", { total: out.length });
    return out;
  }, [filteredWorkshopsByEntity, legendColorMap]);

  /* --- hour frame from data (fallback to 7–22) --- */
  const { gridStart, gridEnd } = useMemo(() => {
    if (!events.length) {
      const res = { gridStart: DEFAULT_START_HOUR, gridEnd: DEFAULT_END_HOUR };
      calLog("grid hours (empty)", res);
      return res;
    }
    let minH = Infinity,
      maxH = -Infinity;
    for (const ev of events) {
      minH = Math.min(minH, Math.floor(ev.hourFloat));
      maxH = Math.max(maxH, Math.ceil(ev.hourFloat));
    }
    const res = {
      gridStart: Math.max(0, Math.min(DEFAULT_START_HOUR, minH)),
      gridEnd: Math.min(23, Math.max(DEFAULT_END_HOUR, maxH)),
    };
    calLog("grid hours (derived)", res);
    return res;
  }, [events]);

  /* --- Day×Hour buckets with per-card start/end filtering --- */
  const cellMap = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const hour = Math.floor(ev.hourFloat);
      if (hour < gridStart || hour > gridEnd) continue;

      const actualDate = dateOfWeekday(weekAnchor, ev.dayIndex);

      // start: require actualDate >= startInclusive
      if (ev.startInclusive && actualDate < ev.startInclusive) continue;

      // end (exclusive): skip if actualDate >= endExclusive
      if (ev.endExclusive && actualDate >= ev.endExclusive) continue;

      const key = `${ev.dayIndex}-${hour}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    // sort buckets
    for (const arr of map.values()) {
      arr.sort(
        (a, b) =>
          a.hourFloat - b.hourFloat || a.title.localeCompare(b.title, "he-IL")
      );
    }

    let bucketCount = 0;
    for (const arr of map.values()) {
      if (arr.length) bucketCount += 1;
    }
    calLog("cellMap buckets prepared", { buckets: bucketCount });

    return map;
  }, [events, weekAnchor, gridStart, gridEnd]);

  /* --- dynamic min day width based on content --- */
  const contentMinDayWidth = useMemo(() => {
    if (!events.length) return size.dayw;
    const font = `600 ${size.fontCardTitle}px Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
    const targetCharsPerLine = titleLines === 2 ? 14 : 16;

    let longestPx = 0;
    for (const ev of events) {
      const tokens = String(ev.title || "").split(/\s+/).filter(Boolean);
      let line = "",
        maxLine = 0;
      for (const t of tokens) {
        const next = line ? `${line} ${t}` : t;
        if (next.length <= targetCharsPerLine) {
          line = next;
          maxLine = Math.max(maxLine, measureTextPx(line, font));
        } else {
          maxLine = Math.max(maxLine, measureTextPx(line, font));
          line = t.length > targetCharsPerLine ? t.slice(0, targetCharsPerLine) : t;
          maxLine = Math.max(maxLine, measureTextPx(line, font));
        }
      }
      maxLine = Math.max(maxLine, measureTextPx(line, font));
      longestPx = Math.max(longestPx, maxLine);
    }
    const INTERNAL = 10 /* dot */ + 6 /* gap */ + size.cardPad * 2 + 16; /* safety */
    const val = Math.max(size.dayw, longestPx + INTERNAL);
    calLog("contentMinDayWidth", { pixels: val });
    return val;
  }, [events, size.dayw, size.cardPad, size.fontCardTitle, titleLines]);

  /* --- CSS vars --- */
  useLayoutEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--timew", `${size.timew}px`);
    root.style.setProperty("--dayw", `${contentMinDayWidth}px`);
    root.style.setProperty("--rowh", `${size.rowh}px`);
    root.style.setProperty("--headerH", `${size.headerH}px`);
    root.style.setProperty("--sideSpace", `${size.sideSpaceVw}vw`);
    root.style.setProperty("--topSpace", `${size.topSpaceVh}vh`);
  }, [size, contentMinDayWidth]);

  /* --- week label --- */
  const weekLabel = useMemo(() => {
    const end = addDays(weekAnchor, 5);
    const fmt = (d) =>
      d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
    return `${fmt(weekAnchor)} — ${fmt(end)}`;
  }, [weekAnchor]);

  /* --- auth guard --- */
  if (!isLoggedIn) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center text-gray-600"
      >
        יש להתחבר כדי לצפות בלוח הסדנאות.
      </div>
    );
  }

  /* ============================== Render ============================== */

  return (
    <div
      dir="rtl"
      className="min-h-screen"
      style={{
        background:
          "linear-gradient(180deg, rgba(241,245,255,0.6), rgba(255,255,255,0.75))",
        paddingInline: "var(--sideSpace)",
        paddingTop: "min(2.2vh, 14px)",
      }}
    >
      {/* Top bar */}
      <div
        className="w-full"
        style={{
          paddingBottom: "calc(var(--topSpace) - min(2.2vh, 14px))",
        }}
      >
        <div className="max-w-[1800px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-indigo-700/90 flex items-center gap-1.5">
                <CalendarDays size={22} className="text-indigo-600" />
                לוח סדנאות משפחתי — שבועי
              </h1>
              <p className="text-gray-600 mt-0.5 text-xs md:text-sm">
                תצוגה אדפטיבית — הכרטיס מקבל מקום, והטבלה מתאימה את עצמה
              </p>

              {selectedEntityKey && selectedEntityName && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] md:text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <span>מציג רק את לוח האימונים של</span>
                    <span className="font-semibold">{selectedEntityName}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      try {
                        const url = new URL(window.location.href);
                        url.searchParams.delete("entity");
                        window.location.href = url.toString();
                      } catch {
                        /* ignore */
                      }
                    }}
                    className="text-xs text-indigo-600 hover:text-indigo-800 underline decoration-dotted"
                  >
                    הצג את כל המשפחה
                  </button>
                </div>
              )}
            </div>

            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                <ChevronRight size={14} /> שבוע קודם
              </button>

              <button
                onClick={() => setWeekAnchor(startOfWeekSunday(new Date()))}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                היום
              </button>

              <button
                onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                שבוע הבא <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {/* Legend */}
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {Object.entries(filteredWorkshopsByEntity).map(([id, info]) => (
              <div key={id} className="flex items-center gap-2">
                <span
                  className="inline-block w-3.5 h-3.5 rounded-full"
                  style={{ backgroundColor: legendColorMap[id] }}
                />
                <span
                  className="text-gray-800"
                  style={{ fontSize: `${size.fontDay - 1}px` }}
                >
                  {info.name}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-1 text-[12px] text-gray-500">{weekLabel}</div>
        </div>
      </div>

      {/* Scroll frame */}
      <div
        className="w-full"
        style={{
          height: "calc(100vh - var(--topSpace))",
          paddingBottom: 8,
          overscrollBehavior: "contain",
        }}
      >
        <div
          className="max-w-[1800px] mx-auto h-full overflow-auto"
          style={{ contain: "layout paint size" }}
        >
          {/* Intrinsic width wrapper */}
          <div
            className="relative mx-auto"
            style={{
              minWidth: "calc(var(--timew) + 6 * var(--dayw))",
            }}
          >
            {/* Header row */}
            <div
              className="grid sticky top-0 z-20"
              style={{
                gridTemplateColumns: `var(--timew) repeat(6, var(--dayw))`,
                height: "var(--headerH)",
                background: "rgba(255,255,255,0.7)",
                backdropFilter: "saturate(1.1) blur(2px)",
                borderBottom: "1px solid rgba(99, 102, 241, 0.25)",
                borderTopLeftRadius: 12,
                borderTopRightRadius: 12,
              }}
            >
              <div
                className="h-full flex items-center justify-center sticky left-0 z-30"
                style={{
                  background: "rgba(255,255,255,0.8)",
                  borderInlineEnd: "2px solid rgba(99,102,241,0.25)",
                  borderTopLeftRadius: 12,
                }}
              />
              {DAYS.map((d, i) => {
                const isBetweenThuFri = i === 5;
                const baseBg =
                  i % 2 === 0
                    ? "rgba(239,246,255,0.55)"
                    : "rgba(255,255,255,0.65)";
                return (
                  <div
                    key={d}
                    className="h-full flex items-center justify-center font-semibold text-indigo-800"
                    style={{
                      fontSize: `${size.fontDay}px`,
                      background: baseBg,
                      borderInlineEnd:
                        i === DAYS.length - 1
                          ? "2px solid rgba(99,102,241,0.25)"
                          : "1px solid rgba(99,102,241,0.18)",
                      borderLeft: isBetweenThuFri
                        ? "2px solid rgba(99,102,241,0.35)"
                        : undefined,
                      borderTopRightRadius: i === DAYS.length - 1 ? 12 : 0,
                    }}
                  >
                    {HEB_DAY[d]}
                  </div>
                );
              })}
            </div>

            {/* Hour rows */}
            {Array.from({ length: gridEnd - gridStart + 1 }).map((_, idx) => {
              const hour = gridStart + idx;
              return (
                <div
                  key={hour}
                  className="grid"
                  style={{
                    gridTemplateColumns: `var(--timew) repeat(6, var(--dayw))`,
                    minHeight: "var(--rowh)",
                    borderTop: "1px solid rgba(99,102,241,0.18)",
                  }}
                >
                  {/* sticky hour col */}
                  <div
                    className="flex items-center justify-center sticky left-0 z-10"
                    style={{
                      background: "rgba(255,255,255,0.78)",
                      borderInlineEnd: "2px solid rgba(99,102,241,0.25)",
                    }}
                  >
                    <span
                      className="text-gray-600 font-medium"
                      style={{ fontSize: `${size.fontHour}px` }}
                    >
                      {formatHour(hour)}
                    </span>
                  </div>

                  {/* day cells */}
                  {DAYS.map((_, dayIndex) => {
                    const key = `${dayIndex}-${hour}`;
                    const items = cellMap.get(key) || [];
                    const isCompactSlot = items.length > 1;
                    const isBetweenThuFri = dayIndex === 5;
                    const baseBg =
                      dayIndex % 2 === 0
                        ? "rgba(239,246,255,0.35)"
                        : "rgba(255,255,255,0.5)";

                    return (
                      <div
                        key={key}
                        className="flex items-stretch justify-start"
                        style={{
                          padding: `${Math.max(size.cardPad - 2, 6)}px`,
                          gap: `${size.gap}px`,
                          flexWrap: isCompactSlot ? "wrap" : "nowrap",
                          background: baseBg,
                          borderInlineEnd:
                            dayIndex === DAYS.length - 1
                              ? "2px solid rgba(99,102,241,0.25)"
                              : "1px solid rgba(99,102,241,0.18)",
                          borderLeft: isBetweenThuFri
                            ? "2px solid rgba(99,102,241,0.35)"
                            : undefined,
                        }}
                      >
                        {items.map((ev, i) => (
                          <MiniCard
                            key={`${key}-${i}-${ev.title}`}
                            title={ev.title}
                            hour={ev.hourLabel}
                            color={ev.color}
                            city={ev.city}
                            address={ev.address}
                            size={size}
                            lines={titleLines}
                            compact={isCompactSlot}
                            relation={ev.relation}
                          />
                        ))}
                      </div>
                    );
                  })}
                </div>
              );
            })}

            {/* bottom line */}
            <div
              style={{
                borderTop: "2px solid rgba(99,102,241,0.25)",
                height: 1,
                width: "100%",
                borderBottomLeftRadius: 12,
                borderBottomRightRadius: 12,
              }}
            />
          </div>
        </div>
      </div>

      {/* Status line */}
      <div className="w-full pb-2">
        <div className="max-w-[1800px] mx-auto">
          {loading && (
            <div className="text-center text-gray-500 mt-2 animate-pulse">
              ⏳ טוען סדנאות…
            </div>
          )}
          {error && (
            <div className="text-center text-red-600 mt-2">❌ {error}</div>
          )}
        </div>
      </div>
    </div>
  );
}
