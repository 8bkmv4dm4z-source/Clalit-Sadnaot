// src/pages/MyWorkshops/MyWorkshopsSimpleGcal.jsx
/**
 * MyWorkshopsSimpleGcal — Family workshops calendar (Google-style on desktop, iOS-style on mobile)
 * MODE 1 FILTER (Option B):
 *   /myworkshops                → multi-entity family calendar
 *   /myworkshops?entity=<key>   → ONLY that entity's workshops
 */

import React, { useEffect, useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Globe } from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import CalendarGStyle from "../../components/calendar/CalendarGStyle";
import MobileiOSCalendar from "../../components/calendar/MobileiOSCalendar";
import { flattenUserEntities } from "../../utils/entityTypes";
import { useNavigate } from "react-router-dom";

const sid = (x) => String(x ?? "");
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const toHhmm = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad2(hh)}:${pad2(mm)}`;
};

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
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d{1,2})\.(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d{1,2})$/);
  if (m) return Number(m[1]);
  return null;
}

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
const startOfWeek = (date, weekStartsOn = 0) => {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0, 0, 0, 0);
  return d;
};

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

/* ============================== GATE ============================== */
export default function MyWorkshopsSimpleGcal() {
  const { isLoggedIn } = useAuth();
  const { mapsReady } = useWorkshops();

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

  return <MyWorkshopsScreen />;
}

/* ============================== SCREEN ============================== */
function MyWorkshopsScreen() {
  const navigate = useNavigate();

  const { user } = useAuth();
  const { displayedWorkshops, userWorkshopMap, familyWorkshopMap } =
    useWorkshops();

  /** MODE 1 FILTER: read entity from URL */
  let selectedEntityKey = null;
  try {
    const qs = new URLSearchParams(window.location.search || "");
    selectedEntityKey = qs.get("entity");
  } catch {}

  const { userEntity, familyMembers, allEntities } = useMemo(
    () => flattenUserEntities(user || {}),
    [user]
  );

  const [view, setView] = useState("week");
  const [anchorDate, setAnchorDate] = useState(() =>
    startOfWeekSunday(new Date())
  );
  const [isMobile, setIsMobile] = useState(() =>
    window.matchMedia("(max-width: 767px)").matches
  );

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const handle = () => setIsMobile(mq.matches);
    mq.addEventListener("change", handle);
    return () => mq.removeEventListener("change", handle);
  }, []);

  useEffect(() => {
    if (isMobile && view !== "month") setView("month");
  }, [isMobile, view]);

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

  const showEntityCalendar = (entityKey) => {
    if (!entityKey) return;
    navigate(`/myworkshops?entity=${entityKey}`, { replace: true });
  };

  const showAllEntities = () => navigate("/myworkshops", { replace: true });

  /* ---------------- workshopsByEntity ---------------- */
  const workshopsByEntity = useMemo(() => {
    if (!userEntity?.entityKey && !userEntity?._id) return {};

    const list = displayedWorkshops || [];
    const map = {};

    const uid = sid(userEntity.entityKey || userEntity._id || user?._id);
    map[uid] = {
      name: userEntity.fullName || userEntity.name || "אני",
      relation: "",
      entityKey: userEntity.entityKey,
      workshops: list.filter((w) => Boolean(userWorkshopMap[sid(w._id)])),
    };

    const members = familyMembers.length
      ? familyMembers
      : allEntities.filter((e) => e.isFamily);

    members.forEach((m) => {
      const mid = sid(m.entityKey || m._id);
      const arr = (familyWorkshopMap || {})[sid(mid)] || [];
      const ws = list.filter((w) => {
        const fm = familyWorkshopMap?.[sid(w._id)]?.map(sid) || [];
        if (fm.includes(uid)) return false;
        return fm.includes(mid);
      });

      if (ws.length) {
        map[mid] = {
          name: m.name,
          relation: m.relation,
          entityKey: m.entityKey,
          workshops: ws,
        };
      }
    });

    return map;
  }, [
    user,
    userEntity,
    displayedWorkshops,
    familyMembers,
    allEntities,
    userWorkshopMap,
    familyWorkshopMap,
  ]);

  /* ---------------- FILTER by ?entity= ---------------- */
  const filteredWorkshopsByEntity = useMemo(() => {
    if (!selectedEntityKey) return workshopsByEntity;

    const entries = Object.entries(workshopsByEntity).filter(
      ([, info]) =>
        info?.entityKey &&
        String(info.entityKey) === String(selectedEntityKey)
    );

    if (!entries.length) return workshopsByEntity;

    return Object.fromEntries(entries);
  }, [selectedEntityKey, workshopsByEntity]);

  const selectedEntityName = useMemo(() => {
    if (!selectedEntityKey) return null;
    return Object.values(workshopsByEntity).find(
      (i) =>
        i.entityKey && String(i.entityKey) === String(selectedEntityKey)
    )?.name;
  }, [workshopsByEntity, selectedEntityKey]);

  /* ---------------- legend colors ---------------- */
  const PALETTE = [
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
    const m = {};
    ids.forEach((id, i) => (m[id] = PALETTE[i % PALETTE.length]));
    return m;
  }, [filteredWorkshopsByEntity]);

  /* ---------------- visible range ---------------- */
  const { visibleStart, visibleEnd } = useMemo(() => {
    if (isMobile || view === "month") {
      const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
      const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
      const start = startOfWeek(first, 0);
      const end = endOfDay(addDays(startOfWeek(last, 0), 6));
      return { visibleStart: start, visibleEnd: end };
    }

    const start = startOfWeek(anchorDate, 0);
    return { visibleStart: start, visibleEnd: endOfDay(addDays(start, 6)) };
  }, [anchorDate, isMobile, view]);

  /* ---------------- events ---------------- */
  const events = useMemo(() => {
    const out = [];

    for (const [entityId, info] of Object.entries(filteredWorkshopsByEntity)) {
      const colorHex = legendColorMap[entityId];
      const entityName = info.name;

      for (const w of info.workshops) {
        const hourFloat = parseHourToFloatFlexible(w);
        const dayIndices = normalizeDays(w);
        const hasRecurrence =
          Array.isArray(dayIndices) && dayIndices.length > 0;

        const startBoundary =
          w?.startDate && !Number.isNaN(new Date(w.startDate))
            ? atStartOfDay(new Date(w.startDate))
            : null;
        const endBoundary =
          w?.endDate && !Number.isNaN(new Date(w.endDate))
            ? endOfDay(new Date(w.endDate))
            : null;

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

        const defaultMinutes =
          typeof w.durationMinutes === "number" ? w.durationMinutes : 90;

        if (hasRecurrence && hourFloat != null) {
          const hhmm = toHhmm(hourFloat);

          for (
            let d = new Date(visibleStart);
            d <= visibleEnd;
            d = addDays(d, 1)
          ) {
            const dow = d.getDay();
            if (!dayIndices.includes(dow)) continue;

            const dayStart = atStartOfDay(d);
            if (startBoundary && dayStart < startBoundary) continue;
            if (endBoundary && dayStart > endBoundary) continue;

            const [hh, mm] = hhmm.split(":").map(Number);
            const start = new Date(d);
            start.setHours(hh, mm || 0, 0, 0);

            const end = new Date(start);
            end.setMinutes(end.getMinutes() + defaultMinutes);

            out.push({
              id: `${sid(w._id)}:${dayStart.toISOString().slice(0, 10)}:${entityId}`,
              title: w.title,
              start,
              end,
              location: locationLine,
              color: colorHex,
              mapsUrl,
              entityName,
              meta: { workshopId: w._id, entityId },
            });
          }
        } else {
          let start = w.startDate ? new Date(w.startDate) : null;
          let end = w.endDate ? new Date(w.endDate) : null;

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

          if (start && !end) {
            end = new Date(start);
            end.setMinutes(end.getMinutes() + defaultMinutes);
          }

          if (start && end && end >= visibleStart && start <= visibleEnd) {
            out.push({
              id: `${sid(w._id)}:${entityId}`,
              title: w.title,
              start,
              end,
              location: locationLine,
              color: colorHex,
              mapsUrl,
              entityName,
              meta: { workshopId: w._id, entityId },
            });
          }
        }
      }
    }

    const seen = new Set();
    const deduped = [];

    for (const ev of out) {
      const d = new Date(ev.start);
      const day = d.toISOString().slice(0, 10);
      const key = `${ev.meta.workshopId}|${day}|${ev.meta.entityId}|${d.getTime()}`;

      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(ev);
      }
    }

    return deduped;
  }, [filteredWorkshopsByEntity, legendColorMap, visibleStart, visibleEnd]);

  /* ---------------- label ---------------- */
  const rangeLabel = useMemo(() => {
    const month = isMobile || view === "month";
    if (month) {
      return `${anchorDate.toLocaleDateString("he-IL", {
        month: "long",
      })} ${anchorDate.getFullYear()}`;
    }
    const end = addDays(anchorDate, 6);
    return `${anchorDate.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
    })} — ${end.toLocaleDateString("he-IL", {
      day: "2-digit",
      month: "2-digit",
    })}`;
  }, [anchorDate, view, isMobile]);

  const bg =
    "linear-gradient(180deg, rgba(241,245,255,0.6), rgba(255,255,255,0.75))";

  /* ============================== RENDER ============================== */
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
      {/* HEADER */}
      <div className="w-full pb-3">
        <div className="max-w-[1800px] mx-auto">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            {/* View Switch */}
            <div
              className={`flex items-center gap-2 text-sm ${
                isMobile ? "invisible" : ""
              }`}
            >
              <button
                onClick={() => setView("week")}
                className={`px-2 py-1 rounded-lg border ${
                  view === "week"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-indigo-700 border-indigo-200"
                } text-xs`}
              >
                תצוגת שבוע
              </button>

              <button
                onClick={() => setView("month")}
                className={`px-2 py-1 rounded-lg border ${
                  view === "month"
                    ? "bg-indigo-600 text-white"
                    : "bg-white text-indigo-700 border-indigo-200"
                } text-xs`}
              >
                תצוגת חודש
              </button>
            </div>

            {/* TITLE */}
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
                    onClick={showAllEntities}
                    className="
                      px-2 py-1 rounded-lg text-xs font-medium
                      bg-indigo-50 text-indigo-700
                      border border-indigo-200
                      hover:bg-indigo-100
                      transition
                    "
                  >
                    הצג את כל המשפחה
                  </button>
                </div>
              )}
            </div>

            {/* NAV */}
            <div className="flex items-center gap-2 text-sm">
              <button
                onClick={goPrev}
                className="flex items-center gap-1 px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm transition text-xs"
              >
                <ChevronRight size={14} />
                {isMobile || view === "month" ? "חודש קודם" : "שבוע קודם"}
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
                {isMobile || view === "month" ? "חודש הבא" : "שבוע הבא"}
                <ChevronLeft size={14} />
              </button>
            </div>
          </div>

          {/* ENTITY CARDS */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {Object.entries(filteredWorkshopsByEntity).map(
              ([entityId, info]) => {
                const color = legendColorMap[entityId];
                const count = info.workshops?.length || 0;
                if (!count) return null;

                return (
                  <div
                    key={entityId}
                    className="
                      rounded-2xl border border-indigo-100/70 bg-white/80 shadow-sm p-3
                      transition-all duration-200
                      hover:shadow-md hover:scale-[1.015]
                      hover:border-indigo-300
                    "
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
                      {info.workshops.slice(0, 6).map((w) => (
                        <div
                          key={sid(w._id)}
                          className="text-[12px] flex items-center gap-2"
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: color }}
                          />
                          <span className="truncate">{w.title}</span>
                        </div>
                      ))}

                      {count > 6 && (
                        <div className="text-[11px] text-indigo-700">
                          +{count - 6} נוספות…
                        </div>
                      )}
                    </div>

                    {/* BUTTON ONLY — no card click */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        showEntityCalendar(info.entityKey);
                      }}
                      className="
                        mt-3 w-full px-2 py-1 rounded-lg text-[12px]
                        bg-indigo-600 text-white 
                        hover:bg-indigo-700 active:scale-[0.98]
                        transition font-medium
                      "
                    >
                      הראה לוח אימונים
                    </button>
                  </div>
                );
              }
            )}
          </div>

          <div className="mt-1 text-[12px] text-gray-500">{rangeLabel}</div>
        </div>
      </div>

      {/* CALENDAR AREA */}
      <div className="w-full" style={{ minHeight: "70vh", paddingBottom: 8 }}>
        <div className="max-w-[1800px] mx-auto">
          {/* MOBILE */}
          <div className="block md:hidden">
            <MobileiOSCalendar
              events={events}
              anchorDate={anchorDate}
              onAnchorChange={setAnchorDate}
              rtl
              startCollapsed={false}
            />
          </div>

          {/* DESKTOP */}
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
                const color = ev.color;
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
                       backgroundImage: "none",
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
