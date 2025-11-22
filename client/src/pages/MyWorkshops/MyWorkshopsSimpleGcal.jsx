// src/pages/MyWorkshops/MyWorkshopsSimpleGcal.jsx
/**
 * MyWorkshopsSimpleGcal — Family workshops calendar (Google-style on desktop, iOS-style on mobile)
 * ------------------------------------------------------------------------------------------------
 * Architecture:
 *  - Gate component (default export) renders cheap “loading / auth required” UI WITHOUT using data hooks,
 *    then mounts the real Screen only when data is ready. This prevents React error #310 (hook order changes).
 *  - Screen component owns all data-dependent hooks and renders the full experience.
 *
 * Data sources (from contexts):
 *  - useAuth(): { user, isLoggedIn }
 *  - useWorkshops(): {
 *      displayedWorkshops,        // Workshop[] already filtered (search, visibility, etc.)
 *      userWorkshopMap,           // { [workshopId]: true } — the current user is registered
 *      familyWorkshopMap,         // { [workshopId]: [familyMemberId, ...] } — family registrations
 *      loading, error, mapsReady  // status flags purely for UI
 *    }
 *
 * Child components used:
 *  - <CalendarGStyle /> (desktop)
 *  - <MobileiOSCalendar /> (mobile)
 *
 * Notes:
 *  - We normalize IDs with `sid()` and build a `workshopsByEntity` map:
 *      { [entityId]: { name, relation, entityKey, workshops: Workshop[] } }
 *    so both the legend and the event list can color-code per entity.
 *  - We dedupe events by (workshopId, day, entityId, startMs) to avoid duplicates.
 *  - MODE 1 FILTER (Option B):
 *      /myworkshops                → multi-entity family calendar
 *      /myworkshops?entity=<key>   → ONLY that entity's workshops (hard filter)
 */

/* -------------------------------- Utilities -------------------------------- */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Globe } from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import CalendarGStyle from "../../components/calendar/CalendarGStyle";
import MobileiOSCalendar from "../../components/calendar/MobileiOSCalendar";
import { flattenUserEntities } from "../../utils/entityTypes";

const sid = (x) => String(x ?? "");

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const toHhmm = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad2(hh)}:${pad2(mm)}`;
};

// Parses typical hour inputs from workshop object into a float hour (e.g., "18:30" -> 18.5)
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
  let m = s.match(/^(\d{1,2}):(\d{2})$/); // "HH:MM"
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d{1,2})\.(\d{2})$/); // "HH.MM"
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d{1,2})$/); // "HH"
  if (m) return Number(m[1]);
  return null;
}

// Date helpers
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
const addMonths = (base, months) => {
  const d = new Date(base);
  d.setMonth(d.getMonth() + months);
  return d;
};
const atStartOfDay = (d) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};
const endOfDay = (d) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};
function startOfWeek(date, weekStartsOn = 0) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
}
function monthGridRange(anchor, weekStartsOn = 0) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0);
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd = endOfDay(addDays(startOfWeek(last, weekStartsOn), 6));
  return { gridStart, gridEnd };
}

// Normalizes workshop recurring “days” to day indices 0..6 (Sun..Sat). Falls back to startDate’s weekday.
function normalizeDays(w) {
  const raw = Array.isArray(w?.days) ? w.days : [];
  const he = {
    "יום א": 0,
    "יום ב": 1,
    "יום ג": 2,
    "יום ד": 3,
    "יום ה": 4,
    "יום ו": 5,
    שבת: 6,
  };
  const en = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const sh = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  const out = [];
  for (const d of raw) {
    if (typeof d === "number" && d >= 0 && d <= 6) {
      out.push(d);
      continue;
    }
    const s = String(d).trim();
    if (s in en) out.push(en[s]);
    else if (s in he) out.push(he[s]);
    else if (s in sh) out.push(sh[s]);
  }
  if (!out.length && w?.startDate) {
    const sd = new Date(w.startDate);
    if (!isNaN(sd)) out.push(sd.getDay());
  }
  return out;
}

/* ============================== GATE (safe, no hook-order risk) ============================== */
/**
 * The Gate renders one of a few simple branches (auth required / loading / ready).
 * It DOES NOT touch data-dependent hooks in ways that would change their order.
 * When “ready”, it mounts <MyWorkshopsScreen/>, which owns all hook logic.
 */
export default function MyWorkshopsSimpleGcal() {
  const { isLoggedIn } = useAuth();
  const { mapsReady, loading, error } = useWorkshops();

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

  if (!mapsReady) {
    return (
      <div
        dir="rtl"
        className="min-h-screen flex items-center justify-center text-gray-500"
      >
        טוען נתונים…
      </div>
    );
  }

  // When ready → mount the real screen (stable hook order inside).
  return <MyWorkshopsScreen />;
}

/* ============================== SCREEN (real UI & logic) ============================== */
function MyWorkshopsScreen() {
  const { user } = useAuth();
  const {
    displayedWorkshops,
    userWorkshopMap, // { [workshopId]: true }
    familyWorkshopMap, // { [workshopId]: [familyMemberId, ...] }
  } = useWorkshops();

  // 🔍 MODE 1 FILTER: read ?entity=<entityKey> from URL (no hooks, safe)
  let selectedEntityKey = null;
  try {
    if (typeof window !== "undefined") {
      const qs = new URLSearchParams(window.location.search || "");
      selectedEntityKey = qs.get("entity");
    }
  } catch {
    selectedEntityKey = null;
  }

  const { userEntity, familyMembers, allEntities } = useMemo(
    () => flattenUserEntities(user || {}),
    [user]
  );

  // View & anchor (passed to both calendars)
  const [view, setView] = useState("week"); // desktop: "week" | "month"
  const [anchorDate, setAnchorDate] = useState(() =>
    startOfWeekSunday(new Date())
  );
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 767px)").matches
  );

  // Keep a month-only experience on mobile
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handle = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);
  useEffect(() => {
    if (isMobile && view !== "month") setView("month");
  }, [isMobile, view]);

  // Navigation handlers
  const goPrev = () =>
    setAnchorDate(
      isMobile || view === "month"
        ? addMonths(anchorDate, -1)
        : addDays(anchorDate, -7)
    );
  const goNext = () =>
    setAnchorDate(
      isMobile || view === "month"
        ? addMonths(anchorDate, 1)
        : addDays(anchorDate, 7)
    );
  const goToday = () => setAnchorDate(startOfWeekSunday(new Date()));

  // Friendly label (header)
  const rangeLabel = useMemo(() => {
    const monthMode = isMobile || view === "month";
    if (monthMode)
      return `${anchorDate.toLocaleDateString("he-IL", {
        month: "long",
      })} ${anchorDate.getFullYear()}`;
    const end = addDays(anchorDate, 6);
    const fmt = (d) =>
      d.toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" });
    return `${fmt(anchorDate)} — ${fmt(end)}`;
  }, [view, isMobile, anchorDate]);

  /* ---------------- workshopsByEntity (user + family) ---------------- */
  const workshopsByEntity = useMemo(() => {
    if (!userEntity?.entityKey && !userEntity?._id) return {};
    const list = Array.isArray(displayedWorkshops) ? displayedWorkshops : [];
    const map = Object.create(null);

    const uid = sid(userEntity.entityKey || userEntity._id || user?._id);
    map[uid] = {
      name: userEntity.fullName || userEntity.name || "אני",
      relation: "",
      entityKey: userEntity.entityKey || null,
      workshops: list.filter((w) => Boolean(userWorkshopMap?.[sid(w._id)])),
    };

    const members = familyMembers.length
      ? familyMembers
      : allEntities.filter((e) => e.isFamily);
    members.forEach((m) => {
      const mid = sid(m.entityKey || m._id);
      const ws = list.filter((w) => {
        const arr = (familyWorkshopMap?.[sid(w._id)] || []).map(sid);
        if (arr.includes(uid)) return false;
        return arr.includes(mid);
      });
      if (ws.length) {
        map[mid] = {
          name: m.name,
          relation: m.relation || "",
          entityKey: m.entityKey || null,
          workshops: ws,
        };
      }
    });

    return map;
  }, [
    user,
    userEntity,
    familyMembers,
    allEntities,
    displayedWorkshops,
    userWorkshopMap,
    familyWorkshopMap,
  ]);

  // 🔥 MODE 1 FILTER APPLICATION:
  // If ?entity=<entityKey> is set, keep ONLY that entity's bucket.
  const filteredWorkshopsByEntity = useMemo(() => {
    if (!selectedEntityKey) return workshopsByEntity;

    const entries = Object.entries(workshopsByEntity || {}).filter(
      ([, info]) =>
        info?.entityKey &&
        String(info.entityKey) === String(selectedEntityKey)
    );
    if (!entries.length) return workshopsByEntity; // fallback: show full family

    return Object.fromEntries(entries);
  }, [workshopsByEntity, selectedEntityKey]);

  // For UI hint: get selected entity name (if any)
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

  /* ---------------- entity color legend ---------------- */
  const ENTITY_PALETTE = [
    "#4f46e5",
    "#059669",
    "#dc2626",
    "#0ea5e9",
    "#d97706",
    "#9333ea",
    "#16a34a",
    "#ea580c",
  ];
  const legendColorMap = useMemo(() => {
    const ids = Object.keys(filteredWorkshopsByEntity);
    const map = Object.create(null);
    ids.forEach((id, idx) => (map[id] = ENTITY_PALETTE[idx % ENTITY_PALETTE.length]));
    return map;
  }, [filteredWorkshopsByEntity]);

  /* ---------------- visible window (week vs month grid) ---------------- */
  const { visibleStart, visibleEnd } = useMemo(() => {
    const monthMode = isMobile || view === "month";
    if (monthMode) {
      const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
      const gridStart = startOfWeek(first, 0);
      const gridEnd = endOfDay(addDays(startOfWeek(last, 0), 6));
      return { visibleStart: gridStart, visibleEnd: gridEnd };
    }
    const start = startOfWeek(anchorDate, 0);
    return { visibleStart: start, visibleEnd: endOfDay(addDays(start, 6)) };
  }, [anchorDate, view, isMobile]);

  /* ---------------- build events for calendars ----------------
   * Each event:
   *  - id: string
   *  - title: string
   *  - start, end: Date
   *  - color: hex string per entity
   *  - mapsUrl: optional, opens Google Maps
   *  - entityName: label (user/family member name)
   *  - meta: { mine, fam, workshopId, entityId }
   */
  const events = useMemo(() => {
    const out = [];

    for (const [entityId, info] of Object.entries(
      filteredWorkshopsByEntity
    )) {
      const colorHex = legendColorMap[entityId] || "#4f46e5";
      const entityName = info.name || "—";

      (info.workshops || []).forEach((w) => {
        const hourFloat = parseHourToFloatFlexible(w);
        const dayIndices = normalizeDays(w);
        const hasRecurrence =
          Array.isArray(dayIndices) && dayIndices.length > 0;

        const locationLine = [w.studio, w.address, w.city]
          .filter(Boolean)
          .join(" · ");
        const mapsQuery = [w.studio, w.address, w.city]
          .filter(Boolean)
          .join(", ");
        const mapsUrl = mapsQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              mapsQuery
            )}`
          : null;

        const title = w.title || "Workshop";
        const mine = !!userWorkshopMap[w._id];
        const fam = (familyWorkshopMap[w._id] || []).length > 0;
        const defaultMinutes =
          typeof w.durationMinutes === "number" ? w.durationMinutes : 90;

        if (hasRecurrence && hourFloat != null) {
          // Generate occurrences across the visible date window
          const hhmm = toHhmm(hourFloat);
          for (
            let d = new Date(visibleStart);
            d <= visibleEnd;
            d = addDays(d, 1)
          ) {
            const dow = d.getDay();
            if (!dayIndices.includes(dow)) continue;

            // Respect workshop active window
            const startInclusive = w?.startDate ? atStartOfDay(w.startDate) : null;
            const endExclusive = w?.endDate ? atStartOfDay(w.endDate) : null;
            const dayStart = atStartOfDay(d);
            if (startInclusive && dayStart < startInclusive) continue;
            if (endExclusive && dayStart >= endExclusive) continue;

            const [hh, mm] = hhmm.split(":").map((n) => parseInt(n, 10));
            const start = new Date(d);
            start.setHours(hh || 0, mm || 0, 0, 0);
            const end = new Date(start);
            end.setMinutes(end.getMinutes() + defaultMinutes);

            out.push({
              id: `${sid(w._id)}:${dayStart
                .toISOString()
                .slice(0, 10)}:${entityId}`,
              title,
              start,
              end,
              location: locationLine,
              color: colorHex,
              mapsUrl,
              entityName,
              meta: { mine, fam, workshopId: w._id, entityId },
            });
          }
        } else {
          // Single occurrence (or missing recurrence info)
          let start = w.startDate ? new Date(w.startDate) : null;
          let end = w.endDate ? new Date(w.endDate) : null;

          // If date is provided separately, combine with parsed hour
          if ((!start || isNaN(start)) && w.date && hourFloat != null) {
            start = new Date(`${w.date}T${toHhmm(hourFloat)}:00`);
          } else if (
            start &&
            hourFloat != null &&
            typeof w.startDate === "string" &&
            !w.startDate.includes("T")
          ) {
            start = new Date(`${w.startDate}T${toHhmm(hourFloat)}:00`);
          }
          if (!end && start) {
            end = new Date(start);
            end.setMinutes(end.getMinutes() + defaultMinutes);
          }

          if (
            start instanceof Date &&
            !isNaN(start) &&
            end instanceof Date &&
            !isNaN(end) &&
            end > start &&
            end >= visibleStart &&
            start <= visibleEnd
          ) {
            out.push({
              id: `${sid(w._id)}:${entityId}`,
              title,
              start,
              end,
              location: locationLine,
              color: colorHex,
              mapsUrl,
              entityName,
              meta: { mine, fam, workshopId: w._id, entityId },
            });
          }
        }
      });
    }

    // De-duplicate per day + entity + workshop + startMs
    const seen = new Set();
    const deduped = [];
    for (const ev of out) {
      const d = new Date(ev.start);
      const day = d.toISOString().slice(0, 10);
      const key = `${ev.meta?.workshopId}|${day}|${ev.meta?.entityId}|${d.getTime()}`;
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(ev);
      }
    }
    return deduped;
  }, [
    filteredWorkshopsByEntity,
    legendColorMap,
    userWorkshopMap,
    familyWorkshopMap,
    visibleStart,
    visibleEnd,
  ]);

  const monthMode = isMobile || view === "month";
  const bg =
    "linear-gradient(180deg, rgba(241,245,255,0.6), rgba(255,255,255,0.75))";

  /* -------------------------------- Render -------------------------------- */
  return (
    <div
      dir="rtl"
      className="min-h-screen"
      style={{
        background: bg,
        paddingInline: "3vw",
        paddingTop: "min(2.2vh, 14px)",
      }}
    >
      {/* Header: view switch (desktop), title, navigation */}
      <div className="w-full" style={{ paddingBottom: "1.2vh" }}>
        <div className="max-w-[1800px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* View switch: we show buttons, but on mobile we force month view (see useEffect) */}
            <div
              className={`flex items-center gap-2 text-sm ${
                isMobile ? "invisible" : ""
              }`}
            >
              <button
                onClick={() => setView("week")}
                className={`px-2 py-1 rounded-lg border ${
                  !monthMode
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-indigo-700 border-indigo-200"
                } text-xs`}
              >
                תצוגת שבוע
              </button>
              <button
                onClick={() => setView("month")}
                className={`px-2 py-1 rounded-lg border ${
                  monthMode
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-indigo-700 border-indigo-200"
                } text-xs`}
              >
                תצוגת חודש
              </button>
            </div>

            <div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-indigo-700/90 flex items-center gap-1.5">
                <CalendarDays size={22} className="text-indigo-600" />
                לוח אימונים משפחתי
              </h1>
              <p className="text-gray-600 mt-0.5 text-xs md:text-sm">
                תצוגת שבוע/חודש למחשב ותצוגה חודשית מותאמת לנייד.
              </p>

              {selectedEntityKey && selectedEntityName && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] md:text-xs">
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                    <span>מציג רק את לוח האימונים של</span>
                    <span className="font-semibold">
                      {selectedEntityName}
                    </span>
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

            {/* Navigation (previous / today / next) */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                <ChevronRight size={14} />{" "}
                {monthMode ? "חודש קודם" : "שבוע קודם"}
              </button>
              <button
                onClick={goToday}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                היום
              </button>
              <button
                onClick={goNext}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                {monthMode ? "חודש הבא" : "שבוע הבא"}{" "}
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {/* Mini entity cards (legend + quick glance of workshops per entity) */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Object.entries(filteredWorkshopsByEntity).map(
              ([entityId, info]) => {
                const color = legendColorMap[entityId];
                const count = info.workshops?.length || 0;
                if (!count) return null;
                return (
                  <div
                    key={entityId}
                    className="rounded-2xl border border-indigo-100/70 bg-white/80 shadow-sm p-3"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className="inline-block w-3.5 h-3.5 rounded-full shrink-0"
                          style={{ backgroundColor: color }}
                        />
                        <div className="truncate font-semibold text-indigo-900">
                          {info.name}
                        </div>
                      </div>
                      <div className="text-xs text-neutral-500">
                        {count} סדנאות
                      </div>
                    </div>

                    <div className="mt-2 space-y-1 max-h-28 overflow-auto pr-1">
                      {(info.workshops || [])
                        .slice(0, 6)
                        .map((w) => (
                          <div
                            key={sid(w._id)}
                            className="text-[12px] flex items-center gap-2"
                          >
                            <span
                              className="inline-block w-1.5 h-1.5 rounded-full"
                              style={{ background: color }}
                            />
                            <span className="truncate">
                              {w.title || "סדנה"}
                            </span>
                          </div>
                        ))}
                      {count > 6 && (
                        <div className="text-[11px] text-indigo-700">
                          +{count - 6} נוספות…
                        </div>
                      )}
                    </div>
                  </div>
                );
              }
            )}
          </div>

          <div className="mt-1 text-[12px] text-gray-500">{rangeLabel}</div>
        </div>
      </div>

      {/* Calendars */}
      <div
        className="w-full"
        style={{ minHeight: "70vh", paddingBottom: 8 }}
      >
        <div className="max-w-[1800px] mx-auto">
          {/* MOBILE — iOS-style monthly agenda */}
          <div className="block md:hidden">
            <MobileiOSCalendar
              events={events}
              anchorDate={anchorDate}
              onAnchorChange={setAnchorDate}
              rtl
              startCollapsed={false}
            />
          </div>

          {/* DESKTOP — Google-style week/month grid */}
          <div className="hidden md:block">
            <CalendarGStyle
              events={events}
              view={view}
              onViewChange={setView}
              rtl
              weekStartsOn={0}
              anchorDate={anchorDate}
              onAnchorChange={setAnchorDate}
              onDrillDown={(d) => setAnchorDate(d)}
              showNowLine={false}
              minHour={7}
              maxHour={22}
              weekdaysOnly
              eventRenderer={(ev) => {
                const color = ev.color || "#4f46e5";
                const s = new Date(ev.start);
                const start = `${String(s.getHours()).padStart(
                  2,
                  "0"
                )}:${String(s.getMinutes()).padStart(2, "0")}`;
                return (
                  <div
                    className="rounded-xl shadow-sm p-2 flex items-center justify-between select-none text-white"
                    style={{
                      background: color,
                      border: `1px solid ${color}`,
                    }}
                    title={`${ev.title} • ${start}`}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-[13px] leading-snug truncate">
                        {ev.title}
                      </div>
                      <div className="text-[11.5px] opacity-90 tabular-nums">
                        {start}
                      </div>
                    </div>
                    {ev.mapsUrl && (
                      <a
                        href={ev.mapsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-2 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/15 hover:bg-white/25"
                        title="פתח במפות"
                      >
                        <Globe size={14} />
                      </a>
                    )}
                  </div>
                );
              }}
              showHeader={false}
              showViewSwitch={false}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
