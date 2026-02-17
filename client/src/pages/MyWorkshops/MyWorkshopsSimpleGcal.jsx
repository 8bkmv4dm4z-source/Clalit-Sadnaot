// src/pages/MyWorkshops/MyWorkshopsSimpleGcal.jsx
/**
 * MyWorkshopsSimpleGcal — Family workshops calendar (Google-style on desktop, iOS-style on mobile)
 * MODE 1 FILTER (Option B):
 *   /myworkshops                → multi-entity family calendar
 *   /myworkshops?entity=<key>   → ONLY that entity's workshops
 *
 * API + data flow map (frontend → WorkshopContext → backend):
 * - GET /api/workshops (WorkshopContext.fetchAllWorkshops) populates `displayedWorkshops`,
 *   which feeds both calendar renderers below. The fetch is triggered by AppShell on
 *   layout mount, so this screen never calls the API directly.
 * - GET /api/workshops/registered (WorkshopContext.fetchRegisteredWorkshops) seeds the
 *   `userWorkshopMap` and `familyWorkshopMap` used to highlight registrations in the
 *   rendered grids; invoked when the authenticated user loads the Workshops/MyWorkshops
 *   flows.
 * - POST/DELETE /api/workshops/:id/register-entity and /:id/unregister-entity are invoked
 *   by the shared WorkshopContext mutation helpers when children (CalendarGStyle or
 *   MobileiOSCalendar) request a registration toggle. Keeping the endpoints mapped here
 *   makes it easier to trace “which UI triggers which backend”.
 */

import React, { useEffect, useMemo, useState } from "react";
import { CalendarDays, Sparkles } from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { FullScreenWorkshopCalendar } from "../../components/calendar/FullScreenWorkshopCalendar";
import MobileiOSCalendar from "../../components/calendar/MobileiOSCalendar";
import { flattenUserEntities } from "../../utils/entityTypes";
import { useNavigate } from "react-router-dom";
import { deriveWorkshopsByEntity } from "../../utils/workshopDerivation";
import useIsMobile from "../../hooks/useIsMobile";

const sid = (x) => String(x ?? "");
const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const toHhmm = (h) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad2(hh)}:${pad2(mm)}`;
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
  const isMobile = useIsMobile(768);
  const [anchorDate, setAnchorDate] = useState(() => new Date());

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

  const showEntityCalendar = (entityKey) => {
    if (!entityKey) return;
    navigate(`/workshops-calendar?entity=${entityKey}`, { replace: true });
  };

  const showAllEntities = () => navigate("/workshops-calendar", { replace: true });

  /* ---------------- workshopsByEntity ---------------- */
  const workshopsByEntity = useMemo(
    () =>
      deriveWorkshopsByEntity({
        displayedWorkshops,
        userWorkshopMap,
        familyWorkshopMap,
        userEntity,
        user,
        familyMembers,
        allEntities,
      }),
    [
      displayedWorkshops,
      userWorkshopMap,
      familyWorkshopMap,
      userEntity,
      user,
      familyMembers,
      allEntities,
    ]
  );

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
  const legendColorMap = useMemo(() => {
    const PALETTE = [
      "#4f46e5", "#059669", "#dc2626", "#0ea5e9",
      "#d97706", "#9333ea", "#16a34a", "#ea580c",
    ];
    const ids = Object.keys(filteredWorkshopsByEntity);
    const m = {};
    ids.forEach((id, i) => (m[id] = PALETTE[i % PALETTE.length]));
    return m;
  }, [filteredWorkshopsByEntity]);

  const { visibleStart, visibleEnd } = useMemo(() => {
    const first = new Date(anchorDate.getFullYear(), anchorDate.getMonth(), 1);
    const last = new Date(anchorDate.getFullYear(), anchorDate.getMonth() + 1, 0);
    const start = startOfWeek(first, 0);
    const end = endOfDay(addDays(startOfWeek(last, 0), 6));
    return { visibleStart: start, visibleEnd: end };
  }, [anchorDate]);

  const mobileEvents = useMemo(() => {
    const out = [];
    for (const [entityId, info] of Object.entries(filteredWorkshopsByEntity)) {
      const colorHex = legendColorMap[entityId];
      const entityName = info.name;
      const isFamily = Boolean(info?.relation);

      for (const w of info.workshops || []) {
        const hourFloat = parseHourToFloatFlexible(w);
        const dayIndices = normalizeDays(w);
        const hasRecurrence = Array.isArray(dayIndices) && dayIndices.length > 0;

        const startBoundary =
          w?.startDate && !Number.isNaN(new Date(w.startDate))
            ? atStartOfDay(new Date(w.startDate))
            : null;
        const endBoundary =
          w?.endDate && !Number.isNaN(new Date(w.endDate))
            ? endOfDay(new Date(w.endDate))
            : null;

        const mapsQuery = [w.studio, w.address, w.city].filter(Boolean).join(", ");
        const mapsUrl = mapsQuery
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`
          : null;

        const defaultMinutes =
          typeof w.durationMinutes === "number" ? w.durationMinutes : 90;

        if (hasRecurrence && hourFloat != null) {
          const hhmm = toHhmm(hourFloat);
          for (let d = new Date(visibleStart); d <= visibleEnd; d = addDays(d, 1)) {
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
              color: colorHex,
              mapsUrl,
              entityName,
              meta: {
                workshopId: w._id,
                entityId,
                mine: !isFamily,
                fam: isFamily,
                relation: info?.relation || "",
              },
            });
          }
          continue;
        }

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
            color: colorHex,
            mapsUrl,
            entityName,
            meta: {
              workshopId: w._id,
              entityId,
              mine: !isFamily,
              fam: isFamily,
              relation: info?.relation || "",
            },
          });
        }
      }
    }
    return out;
  }, [filteredWorkshopsByEntity, legendColorMap, visibleStart, visibleEnd]);

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
      <div className="w-full pb-5">
        <div className="mx-auto max-w-[1800px]">
          <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm md:p-7">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
              <Sparkles size={14} />
              Family Calendar
            </div>
            <h1 className="flex items-center gap-2 text-2xl font-extrabold tracking-tight text-slate-900 md:text-4xl">
              <CalendarDays size={24} className="text-slate-700" />
              לוח אימונים משפחתי
            </h1>

            {selectedEntityKey && selectedEntityName && (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-slate-100 px-2.5 py-1 text-slate-700">
                  <span>מציג רק את לוח האימונים של</span>
                  <span className="font-semibold">{selectedEntityName}</span>
                </span>
                <button
                  onClick={showAllEntities}
                  className="rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  הצג את כל המשפחה
                </button>
              </div>
            )}
          </div>

          {/* ENTITY CARDS */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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

        </div>
      </div>

      {/* CALENDAR AREA */}
      <div className="w-full" style={{ minHeight: "70vh", paddingBottom: 8 }}>
        <div className="max-w-[1800px] mx-auto">
          {isMobile ? (
            <MobileiOSCalendar
              events={mobileEvents}
              anchorDate={anchorDate}
              onAnchorChange={setAnchorDate}
              rtl
              startCollapsed={false}
            />
          ) : (
            <FullScreenWorkshopCalendar
              workshopsByEntity={filteredWorkshopsByEntity}
              legendColorMap={legendColorMap}
            />
          )}
        </div>
      </div>
    </div>
  );
}
