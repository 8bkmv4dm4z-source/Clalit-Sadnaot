// src/components/calendar/CalendarGStyle.jsx
import React, { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Globe } from "lucide-react";

/**
 * CalendarGStyle — Google-Calendar-like Week/Month views with Tailwind (no Day button)
 * Props:
 *  - events: [{ id, title, start, end, location?, mapsUrl?, color?, entityName?, meta? }]
 *  - view?: 'week'|'month'                (default: 'week')
 *  - onViewChange?: (view)=>void
 *  - rtl?: boolean                        (default: false)
 *  - weekStartsOn?: 0..6                  (default: 0 = Sunday)
 *  - anchorDate?: Date
 *  - onAnchorChange?: (Date)=>void
 *  - minHour?: number                     (default: 7)
 *  - maxHour?: number                     (default: 22)
 *  - showNowLine?: boolean                (default: false)
 *  - eventRenderer?: (ev)=>JSX.Element    (used by Week)
 *  - weekdaysOnly?: boolean               (default: true — hides Saturday)
 *  - onDrillDown?: (Date)=>void           (Month “+N” handler)
 *  - showHeader?: boolean                 (default: true)
 *  - showViewSwitch?: boolean             (default: true — Week/Month only)
 */

// ------------------------ small date helpers ------------------------
const toDate = (x) => {
  const d = x instanceof Date ? x : new Date(x);
  return isNaN(d) ? null : d;
};
const atMidnight = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay   = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addDays    = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const addMonths  = (d,n) => { const x = new Date(d); x.setMonth(x.getMonth()+n); return x; };
const hoursBetween = (a,b) => (b - a) / 36e5;
const sameDay = (a,b) =>
  a.getFullYear()===b.getFullYear() &&
  a.getMonth()===b.getMonth() &&
  a.getDate()===b.getDate();
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function startOfWeek(date, weekStartsOn=0) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff);
  d.setHours(0,0,0,0);
  return d;
}
function getWeekRange(anchor, weekStartsOn=0) {
  const start = startOfWeek(anchor, weekStartsOn);
  const days = Array.from({length:7},(_,i)=>addDays(start,i));
  return { start, days };
}
function getMonthMatrix(anchor, weekStartsOn=0) {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last  = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0);
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd   = addDays(startOfWeek(last, weekStartsOn), 6);
  const cells = [];
  for (let d=new Date(gridStart); d<=gridEnd; d=addDays(d,1)) cells.push(new Date(d));
  const matrix = [];
  for (let i=0;i<6;i++) matrix.push(cells.slice(i*7, i*7+7));
  return { matrix };
}

// ------ pack same-day events into non-overlapping lanes ------
function packLanes(dayEvents) {
  const lanes = [];
  const sorted = [...dayEvents].sort(
    (a,b)=>a._ds-b._ds || a._de-b._de || a.title.localeCompare(b.title)
  );
  sorted.forEach(ev=>{
    let placed=false;
    for (const lane of lanes) {
      const last = lane[lane.length-1];
      if (last._de <= ev._ds) { lane.push(ev); placed=true; break; }
    }
    if (!placed) lanes.push([ev]);
  });
  const out=[];
  lanes.forEach((lane,i)=>lane.forEach(ev=>out.push({...ev, _lane:i, _lanes:lanes.length})));
  return out;
}

function Header({ label, rtl, onPrev, onNext, onToday, nextLabel, prevLabel, extraRight }) {
  return (
    <div className={`flex items-center justify-between mb-3 ${rtl ? "flex-row-reverse" : ""}`}>
      <div className="flex items-center gap-2">
        <button
          onClick={rtl ? onNext : onPrev}
          className="px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm text-xs"
          aria-label={prevLabel}
          title={prevLabel}
        >
          <ChevronRight size={14}/>
        </button>
        <button
          onClick={onToday}
          className="px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm text-xs"
        >
          היום
        </button>
        <button
          onClick={rtl ? onPrev : onNext}
          className="px-2 py-1 rounded-lg border border-indigo-200 bg-white hover:bg-indigo-50 text-indigo-700 shadow-sm text-xs"
          aria-label={nextLabel}
          title={nextLabel}
        >
          <ChevronLeft size={14}/>
        </button>
      </div>
      <div className="text-lg font-bold text-indigo-800">{label}</div>
      <div className="flex items-center gap-2">{extraRight}</div>
    </div>
  );
}

function DefaultChip({ ev }) {
  const color = ev.color || "#4f46e5";
  const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
  const start = `${`${s.getHours()}`.padStart(2,"0")}:${`${s.getMinutes()}`.padStart(2,"0")}`;

  return (
    <div
      className="rounded-xl shadow-sm p-2 flex items-center justify-between select-none text-white"
      style={{ background: color, border: `1px solid ${color}` }}
      title={`${ev.title} • ${start}`}
    >
      <div className="min-w-0">
        <div className="font-semibold text-[13px] leading-snug truncate">{ev.title}</div>
        <div className="text-[11.5px] opacity-90 tabular-nums">{start}</div>
      </div>

      {ev.mapsUrl && (
        <a
          href={ev.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="ml-2 shrink-0 inline-flex items-center justify-center w-6 h-6 rounded-md bg-white/15 hover:bg-white/25"
          title="פתח במפות"
        >
          <Globe size={14}/>
        </a>
      )}
    </div>
  );
}

// ------------------------------- Week --------------------------------
function HourColumn({ rtl, minHour = 7, maxHour = 22 }) {
  return (
    <div className={`sticky ${rtl ? "right-0" : "left-0"} z-10 bg-white ${rtl ? "border-r" : "border-l"} border-indigo-200/40`}>
      {Array.from({ length: (maxHour - minHour + 1) }, (_, i) => {
        const h = minHour + i;
        return (
          <div key={h} className="h-16 px-2 text-xs text-neutral-500 flex items-start pt-1 tabular-nums">
            {`${`${h}`.padStart(2,"0")}:00`}
          </div>
        );
      })}
    </div>
  );
}

function WeekView({
  date, events, rtl=false, weekStartsOn=0,
  minHour=7, maxHour=22, showNowLine=false,
  eventRenderer, weekdaysOnly=true,
  showHeader=true, labelOverride
}) {
  const { start, days } = useMemo(()=>getWeekRange(date, weekStartsOn),[date, weekStartsOn]);

  const visDays = useMemo(
    () => weekdaysOnly ? days.filter(d => d.getDay() !== 6) : days,
    [days, weekdaysOnly]
  );

  // Build per-day, clamp to that day, then pack lanes
  const byDay = useMemo(()=>{
    const map = new Map(visDays.map(d=>[d.toDateString(), []]));
    events.forEach(e=>{
      const s = toDate(e.start), eend = toDate(e.end);
      if (!s || !eend) return;
      visDays.forEach(d=>{
        const ds = atMidnight(d), de = endOfDay(d);
        if (eend >= ds && s <= de) {
          const _ds = new Date(Math.max(s, ds));
          const _de = new Date(Math.min(eend, de));
          map.get(d.toDateString()).push({ ...e, _ds, _de });
        }
      });
    });
    const out = {};
    for (const [k, arr] of map.entries()) out[k] = packLanes(arr);
    return out;
  },[events, visDays]);

  const dir = rtl ? "rtl" : "ltr";
  const now = new Date();
  const showNow = showNowLine && now >= start && now <= addDays(start,6);

  const label = labelOverride ??
    `${visDays[0].toLocaleDateString("he-IL",{day:"2-digit",month:"2-digit"})} — ${visDays[visDays.length-1].toLocaleDateString("he-IL",{day:"2-digit",month:"2-digit"})}`;

  return (
    <div dir={dir} className="border rounded-2xl overflow-hidden shadow-sm bg-white/70 backdrop-blur-sm">
      {showHeader && (
        <Header
          label={label}
          rtl={rtl}
          onPrev={()=>{}}
          onNext={()=>{}}
          onToday={()=>{}}
        />
      )}

      {/* header row */}
      <div
        className={`grid ${rtl ? "grid-cols-[1fr,repeat(var(--cols),1fr)]" : "grid-cols-[80px,repeat(var(--cols),1fr)]"} border-b bg-indigo-50/40`}
        style={{ ["--cols"]: visDays.length }}
      >
        {!rtl ? <div className="px-2 py-2 text-sm text-neutral-500"></div> : null}
        {visDays.map((d,i)=>{
          const isToday = sameDay(d, now);
          return (
            <div key={i} className={`px-2 py-2 text-sm ${isToday?"text-indigo-700 font-semibold":"text-neutral-700"}`}>
              {d.toLocaleDateString("he-IL",{weekday:"short", day:"2-digit"})}
            </div>
          );
        })}
        {rtl ? <div className="px-2 py-2 text-sm text-neutral-500"></div> : null}
      </div>

      {/* body */}
      <div
        className={`grid ${rtl ? "grid-cols-[1fr,repeat(var(--cols),1fr)]" : "grid-cols-[80px,repeat(var(--cols),1fr)]"} relative`}
        style={{ ["--cols"]: visDays.length }}
      >
        {!rtl ? <HourColumn minHour={minHour} maxHour={maxHour}/> : null}

        {visDays.map((d,i)=>{
          const key = d.toDateString();
          const dayEvents = byDay[key] || [];
          return (
            <div key={i} className={`relative border-indigo-200/40 ${rtl ? "border-r" : "border-l"}`}>
              {/* hour rows */}
              {Array.from({ length: (maxHour - minHour + 1) }, (_, idx) => (
                <div key={minHour + idx} className="h-16 border-t border-indigo-100/60"/>
              ))}

              {/* NOW line */}
              {showNow && sameDay(d, now) && (
                <div
                  className="absolute left-0 right-0 h-[2px] bg-rose-500/80"
                  style={{
                    top: Math.max(0, (now.getHours() + now.getMinutes()/60 - minHour)) * 64,
                    boxShadow: "0 0 0 1px rgba(244,63,94,.25)"
                  }}
                />
              )}

              {/* events */}
              <div className="absolute inset-0">
                {dayEvents.map(ev=>{
                  const hourHeight = 64; // px per hour
                  const top = (ev._ds.getHours() + ev._ds.getMinutes()/60 - minHour) * hourHeight;
                  const height = Math.max(18, hoursBetween(ev._ds, ev._de) * hourHeight - 4);
                  const laneWidth = 100 / (ev._lanes || 1);
                  const leftPct   = clamp((ev._lane || 0) * laneWidth, 0, 100);

                  return (
                    <div
                      key={`${ev.id}-${ev._ds.toISOString()}`}
                      className="absolute p-1.5"
                      style={{ top, height, left: `${leftPct}%`, width: `calc(${laneWidth}% - 4px)` }}
                      title={ev.title}
                    >
                      {typeof eventRenderer === "function"
  ? eventRenderer({ ...ev, start: ev._ds, end: ev._de })
  : <DefaultChip ev={{ ...ev, start: ev._ds, end: ev._de }} />
}

                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}

        {rtl ? <HourColumn rtl minHour={minHour} maxHour={maxHour}/> : null}
      </div>
    </div>
  );
}

// ------------------------------- Month --------------------------------
function MonthView({
  date, events, rtl=false, weekStartsOn=0, onDrillDown,
  showHeader=true,
  dedupe = true,              // <— NEW: prevent double rendering on the same day
  capPerDay = 3               // same default behavior as before
}) {
  const { matrix } = useMemo(()=>getMonthMatrix(date, weekStartsOn),[date, weekStartsOn]);
  const now = new Date();
  const dir = rtl ? "rtl" : "ltr";

  // events by day (with optional dedupe)
  const byDay = useMemo(()=>{
    const flat = matrix.flat();
    const m = new Map(flat.map(d=>[d.toDateString(), []]));
    const seen = new Map(); // key: dayKey -> Set(keys)

    events.forEach(e=>{
      const s=toDate(e.start), t=toDate(e.end);
      if (!s || !t) return;
      flat.forEach(d=>{
        const ds=atMidnight(d), de=endOfDay(d);
        if (t>=ds && s<=de) {
          const arr = m.get(d.toDateString());
          if (dedupe) {
            const dayKey = d.toDateString();
            const bucket = seen.get(dayKey) ?? new Set();
            const key = `${e.id ?? ""}|${+atMidnight(d)}|${toDate(e.start)?.getTime() ?? 0}`;
            if (!bucket.has(key)) {
              arr.push(e);
              bucket.add(key);
              seen.set(dayKey, bucket);
            }
          } else {
            arr.push(e);
          }
        }
      });
    });

    for (const arr of m.values()) arr.sort((a,b)=>a.start-b.start || a.title.localeCompare(b.title));
    return m;
  },[events, matrix, dedupe]);

  const label = `${date.toLocaleDateString("he-IL",{month:"long"})} ${date.getFullYear()}`;
  const dayLabelsHE = ["א","ב","ג","ד","ה","ו","ש"];
  const dayLabelsEN = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

  return (
    <div dir={dir} className="border rounded-2xl overflow-visible shadow-sm bg-white/70 backdrop-blur-sm">
      {showHeader && (
        <Header
          label={label}
          rtl={rtl}
          onPrev={()=>{}}
          onNext={()=>{}}
          onToday={()=>{}}
          nextLabel="חודש הבא"
          prevLabel="חודש קודם"
        />
      )}

      <div className="grid grid-cols-7 bg-indigo-50/40 border-b">
        {(rtl ? dayLabelsHE : dayLabelsEN).map((d,i)=>(
          <div key={i} className="px-2 py-2 text-sm text-neutral-700">{d}</div>
        ))}
      </div>

      {/* keep 6 rows on all screens */}
      <div className="grid grid-cols-7 grid-rows-6 auto-rows-fr">
        {matrix.flat().map((d, idx)=>{
          const list = byDay.get(d.toDateString()) || [];
          const show = list.slice(0, capPerDay);
          const hidden = Math.max(0, list.length - show.length);
          const faded = d.getMonth() !== date.getMonth();

          return (
            <div key={idx} className={`min-h-24 sm:min-h-28 border border-indigo-100/60 p-2 ${faded?"bg-neutral-50/50":"bg-white"}`}>
              <div className="flex items-center justify-between">
                <div className={`text-xs ${sameDay(d,now)?"text-indigo-700 font-semibold":"text-neutral-600"}`}>
                  {sameDay(d,now)
                    ? <span className="px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-800 font-semibold">{d.getDate()}</span>
                    : d.getDate()
                  }
                </div>
                <div className="text-[11px] text-neutral-400">{d.toLocaleDateString("he-IL",{ month:"2-digit" })}</div>
              </div>

              <div className="mt-1 space-y-1">
                {show.map(ev=>{
                  const s = ev.start instanceof Date ? ev.start : new Date(ev.start);
                  const start = `${`${s.getHours()}`.padStart(2,"0")}:${`${s.getMinutes()}`.padStart(2,"0")}`;
                  return (
                    <div
                      key={`${ev.id}-${d.toDateString()}`}
                      className="px-2 py-1 rounded-md text-[11.5px] truncate text-white"
                      style={{ background: ev.color || "#4f46e5", border: `1px solid ${ev.color || "#4f46e5"}` }}
                      title={`${ev.title} • ${start}`}
                    >
                      {ev.title} · {start}
                    </div>
                  );
                })}
                {hidden>0 && (
                  <button
                    onClick={()=>onDrillDown?.(d)}
                    className="text-[11px] text-indigo-700 hover:underline"
                  >
                    +{hidden} נוספים…
                  </button>
                )}
                {!list.length && <div className="text-[11px] text-neutral-400">—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------- Main export -------------------------------
export default function CalendarGStyle({
  events = [],
  view,
  onViewChange,
  rtl = false,
  weekStartsOn = 0,
  anchorDate,
  onAnchorChange,
  minHour = 7,
  maxHour = 22,
  showNowLine = false,
  eventRenderer,
  weekdaysOnly = true,
  onDrillDown,
  showHeader = true,
  showViewSwitch = true,
}) {
  // Normalize once
  const norm = useMemo(() => {
    return (events || [])
      .map((e) => ({ ...e, start: toDate(e.start), end: toDate(e.end) }))
      .filter((e) => e.start && e.end && e.end > e.start)
      .sort((a, b) => a.start - b.start || a.title.localeCompare(b.title));
  }, [events]);

  // Controlled/Uncontrolled view
  const [innerView, setInnerView] = useState("week");
  const v = view ?? innerView;
  const setView = (nv) => (onViewChange ? onViewChange(nv) : setInnerView(nv));

  // Controlled/derived date
  const [innerDate, setInnerDate] = useState(new Date());
  const current = anchorDate ?? innerDate;
  const setDate = (d) => (onAnchorChange ? onAnchorChange(d) : setInnerDate(d));

  // View-aware navigation
  const onPrev = () => setDate(v === "month" ? addMonths(current, -1) : addDays(current, -7));
  const onNext = () => setDate(v === "month" ? addMonths(current, 1)  : addDays(current, 7));
  const onToday = () => setDate(new Date());

  // Visible range
  const { rangeStart, rangeEnd } = useMemo(() => {
    if (v === "month") {
      const first = new Date(current.getFullYear(), current.getMonth(), 1);
      const last  = new Date(current.getFullYear(), current.getMonth()+1, 0);
      const gridStart = startOfWeek(first, weekStartsOn);
      const gridEnd   = endOfDay(addDays(startOfWeek(last, weekStartsOn), 6));
      return { rangeStart: gridStart, rangeEnd: gridEnd };
    }
    const { start } = getWeekRange(current, weekStartsOn);
    return { rangeStart: start, rangeEnd: endOfDay(addDays(start, 6)) };
  }, [v, current, weekStartsOn]);

  const visibleEvents = useMemo(() => {
    const rs = +rangeStart, re = +rangeEnd;
    // small defensive dedupe on input array for exact duplicates
    const seen = new Set();
    const out = [];
    for (const e of norm) {
      if (+e.end >= rs && +e.start <= re) {
        const key = `${e.id ?? ""}|${e.start?.getTime() ?? 0}|${e.end?.getTime() ?? 0}`;
        if (!seen.has(key)) { seen.add(key); out.push(e); }
      }
    }
    return out;
  }, [norm, rangeStart, rangeEnd]);

  // View switcher
  const Switch = showViewSwitch ? (
    <div className="inline-flex rounded-lg overflow-hidden border border-indigo-200 bg-white shadow-sm">
      <button
        className={`px-2.5 py-1 text-xs ${v === "week" ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50"}`}
        onClick={() => setView("week")}
      >
        שבוע
      </button>
      <button
        className={`px-2.5 py-1 text-xs border-l border-indigo-200 ${v === "month" ? "bg-indigo-600 text-white" : "text-indigo-700 hover:bg-indigo-50"}`}
        onClick={() => setView("month")}
      >
        חודש
      </button>
    </div>
  ) : null;

  const navTexts = v === "month"
    ? { nextLabel: "חודש הבא", prevLabel: "חודש קודם" }
    : { nextLabel: "שבוע הבא", prevLabel: "שבוע קודם" };

  const common = { rtl, weekStartsOn, minHour, maxHour, showNowLine, eventRenderer };

  if (v === "month") {
    const monthLabel = `${current.toLocaleDateString("he-IL",{month:"long"})} ${current.getFullYear()}`;
    return (
      <div className="relative" style={{ overflow: "visible" }}>
        {showHeader && (
          <div className={`flex ${rtl ? "justify-start" : "justify-end"} mt-1 mb-1 mr-1 ml-1`}>
            {Switch}
          </div>
        )}
        <Header
          label={monthLabel}
          rtl={rtl}
          onPrev={onPrev}
          onNext={onNext}
          onToday={onToday}
          nextLabel={navTexts.nextLabel}
          prevLabel={navTexts.prevLabel}
          extraRight={null}
        />
        <MonthView
          date={current}
          events={visibleEvents}
          rtl={rtl}
          weekStartsOn={weekStartsOn}
          onDrillDown={(d) => (onDrillDown ? onDrillDown(d) : setDate(d))}
          showHeader={false}
          dedupe={true}        // important
          capPerDay={3}
        />
      </div>
    );
  }

  return (
    <div className="relative" style={{ overflow: "visible" }}>
      {showHeader && (
        <div className={`flex ${rtl ? "justify-start" : "justify-end"} mb-1`}>{Switch}</div>
      )}

      {/* <Header
        label={weekLabel}
        rtl={rtl}
        onPrev={onPrev}
        onNext={onNext}
        onToday={onToday}
        nextLabel={navTexts.nextLabel}
        prevLabel={navTexts.prevLabel}
        extraRight={null}
      /> */}

      <WeekView
        date={current}
        events={visibleEvents}
        weekdaysOnly={weekdaysOnly}
        {...common}
        showHeader={false}
      />
    </div>
  );
}
