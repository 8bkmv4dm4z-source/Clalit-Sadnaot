// src/components/calendar/MobileiOSCalendar.jsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Globe, Minus, Plus } from "lucide-react";

/**
 * MobileiOSCalendar — iPhone-like monthly agenda (RTL)
 * ----------------------------------------------------
 * - Always renders the FULL MONTH agenda (not week)
 * - Top mini-month can be toggled (expanded ↔ collapsed)
 * - Edge scrolling paginates: reach top => previous month, bottom => next month
 *
 * Props:
 *  - events: [{ id, title, start, end, color?, mapsUrl?, entityName?, meta? }]
 *  - anchorDate: Date         // focused month/day
 *  - onAnchorChange: (Date)=>void
 *  - rtl?: boolean            // default true
 *  - startOnSunday?: boolean  // default true
 *  - startCollapsed?: boolean // default false (show mini-month initially)
 */

const toDate = (x) => (x instanceof Date ? x : new Date(x));
const at0 = (d) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
const endOfDay = (d) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
const addDays = (d,n) => { const x = new Date(d); x.setDate(x.getDate()+n); return x; };
const addMonths = (d,n) => { const x = new Date(d); x.setMonth(x.getMonth()+n); x.setHours(0,0,0,0); return x; };
const startOfWeek = (date, weekStartsOn=0) => {
  const d = new Date(date), day = d.getDay();
  const diff = (day - weekStartsOn + 7) % 7;
  d.setDate(d.getDate() - diff); d.setHours(0,0,0,0); return d;
};
const monthGridRange = (anchor, weekStartsOn=0) => {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const last  = new Date(anchor.getFullYear(), anchor.getMonth()+1, 0);
  const gridStart = startOfWeek(first, weekStartsOn);
  const gridEnd   = endOfDay(addDays(startOfWeek(last, weekStartsOn), 6));
  return { gridStart, gridEnd };
};

// tiny util
const cls = (...xs) => xs.filter(Boolean).join(" ");

// ---- DEBUG SWITCH & HELPERS ----
const DEBUG_CAL = true;
const dlog = (...args) => { if (DEBUG_CAL) console.log("[iOSCal]", ...args); };
const dgroup = (label, fn) => {
  if (!DEBUG_CAL) return fn?.();
  console.groupCollapsed(`[iOSCal] ${label}`);
  try { fn?.(); } finally { console.groupEnd(); }
};

export default function MobileiOSCalendar({
  events = [],
  anchorDate,
  onAnchorChange,
  rtl = true,
  startOnSunday = true,
  startCollapsed = false,
}) {
  const [collapsed, setCollapsed] = useState(startCollapsed);
  const weekStartsOn = startOnSunday ? 0 : 1;

// option 1: split fallback into its own useMemo
const fallbackDate = useMemo(() => new Date(), []);
const current = useMemo(() => anchorDate ?? fallbackDate, [anchorDate, fallbackDate]);
  const setAnchor = (d) => onAnchorChange?.(d);

  // Month key + render counter (helps diagnose StrictMode double-renders)
  const monthKey = `${current.getFullYear()}-${String(current.getMonth()+1).padStart(2,"0")}`;
  const renderCount = useRef(0);
  renderCount.current++;

  const { gridStart, gridEnd } = useMemo(
    () => monthGridRange(current, weekStartsOn),
    [current, weekStartsOn]
  );

  // build month days
  const monthDays = useMemo(() => {
    const out = [];
    for (let d = new Date(gridStart); d <= gridEnd; d = addDays(d, 1)) out.push(new Date(d));
    return out;
  }, [gridStart, gridEnd]);

  useEffect(() => {
    if (!monthDays.length) return;
    dlog("monthDays:", monthDays[0].toDateString(), "→", monthDays[monthDays.length-1].toDateString(), "(len:", monthDays.length, ")");
  }, [monthDays]);

  const dayKey = (d) => at0(d).toDateString();

  // per-day agenda (dedupe by id+start)
  const groups = useMemo(() => {
    const rs = +gridStart, re = +gridEnd;
    const map = new Map(monthDays.map(d => [dayKey(d), []]));
    const seen = new Map(); // dayKey -> Set(keys)
    (events || []).forEach(ev => {
      const s = toDate(ev.start), e = toDate(ev.end);
      if (!(s instanceof Date) || isNaN(s) || !(e instanceof Date) || isNaN(e)) return;
      if (+e < rs || +s > re) return;

      // place by the start day (agenda-style)
      const k = dayKey(s);
      const bucket = seen.get(k) ?? new Set();
      const key = `${ev.id ?? ""}|${s.getTime()}`;
      if (!bucket.has(key)) {
        (map.get(k) ?? []).push(ev);
        bucket.add(key);
        seen.set(k, bucket);
      }
    });
    for (const arr of map.values()) {
      arr.sort((a,b)=>+toDate(a.start)-+toDate(b.start) || String(a.title).localeCompare(String(b.title)));
    }
    return map;
  }, [events, monthDays, gridStart, gridEnd]);

  // dot counts for the mini grid (no dots for past days)
  const dayCounts = useMemo(() => {
    const todayKey = dayKey(new Date());
    const m = new Map(monthDays.map(d => [dayKey(d), 0]));
    (events || []).forEach(ev => {
      const k = dayKey(toDate(ev.start));
      if (k < todayKey) return; // suppress past dots
      if (m.has(k)) m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [events, monthDays]);

  // debug: range & event stats
  useEffect(() => {
    dgroup(`range ${monthKey}`, () => {
      dlog("render#", renderCount.current);
      dlog("current:", current.toISOString());
      dlog("gridStart:", gridStart.toISOString(), "gridEnd:", gridEnd.toISOString());
      const inRange = (events || []).filter(ev => {
        const s = toDate(ev.start), e = toDate(ev.end);
        return e >= gridStart && s <= gridEnd;
      });
      dlog("events total:", (events||[]).length, "| inRange:", inRange.length);
    });
  }, [events, monthKey, gridStart, gridEnd, current]);

  // nav
  const onPrev = () => setAnchor(addMonths(current, -1));
  const onNext = () => setAnchor(addMonths(current, 1));
  const onToday = () => setAnchor(at0(new Date()));

  // mini-grid -> agenda scroll
  const listRef = useRef(null);
  const sectionRefs = useRef(Object.create(null));
  useEffect(() => {
    sectionRefs.current = Object.create(null);
    dlog("reset sectionRefs for", monthKey);
  }, [monthKey]);

  const scrollToDay = (d) => {
    dlog("mini-grid click →", d.toDateString());
    const k = dayKey(d);
    const el = sectionRefs.current[k];
    if (el && listRef.current) {
      listRef.current.scrollTo({ top: el.offsetTop - 12, behavior: "smooth" });
    }
    setAnchor(d);
  };

  const isSameDay = (a,b) => at0(a).getTime() === at0(b).getTime();
  const hebWeek = ["א","ב","ג","ד","ה","ו","ש"];
  const engWeek = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const weekLabels = rtl ? hebWeek : engWeek;
  const monthLabel = `${current.toLocaleDateString("he-IL",{month:"long"})} ${current.getFullYear()}`;

  // -------- Edge paging with strict guard against double flips --------
  const isProgrammaticPaging = useRef(false);
  const lastPagedMonthKey = useRef(monthKey);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    let rafId = 0;
    const THRESH = 12;

    const nearTop = () => el.scrollTop <= THRESH;
    const nearBottom = () => el.scrollTop + el.clientHeight >= el.scrollHeight - THRESH;

    const jumpAndLock = (dir /* -1 prev, +1 next */) => {
      if (isProgrammaticPaging.current) return;
      isProgrammaticPaging.current = true;

      const next = addMonths(current, dir);
      const nextKey = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,"0")}`;
      if (nextKey === lastPagedMonthKey.current) {
        dlog("skip paging: already at", nextKey);
        isProgrammaticPaging.current = false;
        return;
      }

      dlog("paging", dir < 0 ? "← prev" : "→ next", "from", monthKey, "to", nextKey);
      setAnchor(next);
      lastPagedMonthKey.current = nextKey;

      // Wait for commit → then scroll → then release the lock
      rafId = requestAnimationFrame(() => {
        rafId = requestAnimationFrame(() => {
          const node = listRef.current;
          if (node) {
            if (dir > 0) node.scrollTo({ top: 0, behavior: "auto" });
            else node.scrollTo({ top: Math.max(0, node.scrollHeight - node.clientHeight), behavior: "auto" });
          }
          rafId = requestAnimationFrame(() => { isProgrammaticPaging.current = false; });
        });
      });
    };

    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        if (isProgrammaticPaging.current) return; // ignore our own synthetic scrolls
        if (nearTop()) jumpAndLock(-1);
        else if (nearBottom()) jumpAndLock(+1);
      });
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [current, monthKey]);

  const dir = rtl ? "rtl" : "ltr";

  return (
    <div
      dir={dir}
      className="rounded-3xl border border-indigo-200/50 shadow-[0_10px_30px_rgba(31,41,55,.08)] overflow-hidden
                 bg-gradient-to-b from-indigo-50/60 via-white to-white backdrop-blur-sm"
    >
      {/* top bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gradient-to-r from-indigo-50/70 to-white border-b border-indigo-100/70">
        <div className="text-sm font-semibold text-indigo-900 flex items-center gap-1.5">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-white/70 border border-indigo-200">
            <CalendarDays size={14} className="text-indigo-600" />
          </span>
          <span className="tracking-tight">{monthLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setCollapsed(v => !v)}
            className="px-2 py-1 rounded-xl border border-indigo-200 bg-white/80 text-indigo-700 text-xs shadow-sm hover:bg-white"
            title={collapsed ? "הרחב לוח חודש" : "הקטן לוח חודש"}
            aria-label="Toggle month mini grid"
          >
            {collapsed ? <Plus size={14}/> : <Minus size={14}/>}
          </button>
          <button
            onClick={onPrev}
            className="px-2 py-1 rounded-xl border border-indigo-200 bg-white/80 text-indigo-700 text-xs shadow-sm hover:bg-white"
            aria-label="חודש קודם"
          >
            חודש קודם <ChevronRight size={14} className="inline-block" />
          </button>
          <button
            onClick={onToday}
            className="px-2 py-1 rounded-xl border border-indigo-200 bg-white/80 text-indigo-700 text-xs shadow-sm hover:bg-white"
            aria-label="קפיצה להיום"
          >
            היום
          </button>
          <button
            onClick={onNext}
            className="px-2 py-1 rounded-xl border border-indigo-200 bg-white/80 text-indigo-700 text-xs shadow-sm hover:bg-white"
            aria-label="חודש הבא"
          >
            <ChevronLeft size={14} className="inline-block" /> חודש הבא
          </button>
        </div>
      </div>

      {/* mini month grid (toggleable) */}
      {!collapsed && (
        <div className="px-3 pt-3 pb-2 border-b border-indigo-100/70 bg-white/70">
          <div className="grid grid-cols-7 text-[11px] text-neutral-500 mb-1">
            {weekLabels.map((d,i)=>(<div key={i} className="text-center">{d}</div>))}
          </div>
          <div className="grid grid-cols-7 gap-y-1">
            {monthDays.map((d,idx)=>{
              const inMonth = d.getMonth() === current.getMonth();
              const count = dayCounts.get(dayKey(d)) || 0;
              const active = isSameDay(d, current);
              const isToday = isSameDay(d, new Date());
              return (
                <button
                  key={idx}
                  onClick={()=>scrollToDay(d)}
                  className={cls(
                    "mx-1 h-10 rounded-2xl flex flex-col items-center justify-center transition-all",
                    "ring-1 ring-inset hover:ring-indigo-200/80",
                    active
                      ? "bg-gradient-to-b from-indigo-100 to-indigo-50 text-indigo-900 ring-indigo-300 shadow-sm"
                      : inMonth
                        ? "bg-white/70 text-neutral-800 ring-indigo-100 hover:bg-indigo-50/60"
                        : "bg-white/40 text-neutral-400 ring-indigo-50"
                  )}
                  title={`${d.toLocaleDateString("he-IL")}`}
                >
                  <span className={cls(
                    "leading-none",
                    isToday && !active ? "relative after:content-[''] after:absolute after:-inset-1 after:rounded-xl after:ring-1 after:ring-indigo-200" : ""
                  )}>
                    {d.getDate()}
                  </span>
                  <span
                    className="mt-0.5 h-1.5 w-1.5 rounded-full"
                    style={{ background: count ? "#4f46e5" : "transparent", boxShadow: count ? "0 0 8px rgba(79,70,229,.35)" : "none" }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* monthly agenda */}
      <div
        ref={listRef}
        className="max-h-[74vh] overflow-auto"
        style={{
          background:
            "radial-gradient(1200px 300px at 50% -50%, rgba(99,102,241,0.08), transparent), radial-gradient(800px 200px at 50% 120%, rgba(99,102,241,0.06), transparent)"
        }}
      >
        {monthDays.map((d, i) => {
          const k = dayKey(d);
          const list = groups.get(k) || [];
          const isToday = isSameDay(d, new Date());
          const isWeekend = [5,6].includes(d.getDay()); // Fri/Sat
          return (
            <section
              key={k}
              ref={(el)=>{ if (el) sectionRefs.current[k] = el; }}
              className={cls(
                "px-3 py-2 scroll-mt-2",
                i % 2 === 0 ? "bg-white/60" : "bg-white/70"
              )}
            >
              {/* sticky day banner */}
              <div
                className={cls(
                  "sticky top-0 z-10 -mx-3 px-3 py-2 backdrop-blur",
                  "border-b",
                  isToday ? "bg-white/80 border-indigo-200/70" : "bg-white/70 border-indigo-100/60",
                  "flex items-center justify-between"
                )}
              >
                <div className={cls(
                  "text-sm tracking-tight",
                  isToday ? "text-indigo-800 font-semibold" : "text-neutral-700"
                )}>
                  {d.toLocaleDateString("he-IL", { weekday: "short", day: "2-digit", month: "2-digit" })}
                </div>
                <div className={cls(
                  "text-[11px] rounded-full px-2 py-0.5",
                  isWeekend ? "bg-neutral-100 text-neutral-500" : "bg-indigo-50 text-indigo-700"
                )}>
                  {isWeekend ? "סופ״ש" : "יום רגיל"}
                </div>
              </div>

              {/* list */}
              {!list.length ? (
                <div className="text-[12px] text-neutral-400 mt-2">—</div>
              ) : (
                <div className="mt-2 flex flex-col gap-2">
                  {list.map((ev, idx) => {
                    const s = toDate(ev.start);
                    const start = `${String(s.getHours()).padStart(2,"0")}:${String(s.getMinutes()).padStart(2,"0")}`;
                    const badge =
                      ev.meta?.mine ? "שלי" :
                      (ev.meta?.fam ? "משפחה" : null);

                    // soft gradient chip with glass overlay
                    const base = ev.color || "#4f46e5";
const gradient = `linear-gradient(135deg, ${base} 0%, ${base}CC 100%)`;

                    return (
                      <div
                        key={`${ev.id}-${idx}`}
                        className="w-full rounded-2xl p-2.5 text-white flex items-center justify-between shadow-[0_8px_20px_rgba(31,41,55,.12)] border border-white/20"
                        style={{ background: gradient }}
                        title={`${ev.title} • ${start}`}
                      >
                        <div className="min-w-0">
                          <div className="font-semibold text-[13.5px] leading-snug truncate drop-shadow-sm">{ev.title}</div>
                          <div className="text-[11.5px] opacity-95 tabular-nums">🕘 {start}</div>
                          <div className="text-[11px] opacity-95 truncate">
                            {ev.entityName || ""}
                            {badge ? <span className="ml-1.5 inline-block rounded-full bg-white/25 px-1.5 py-0.5 text-[10.5px]">{badge}</span> : null}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {ev.mapsUrl && (
                            <a
                              href={ev.mapsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center w-8 h-8 rounded-xl bg-white/20 hover:bg-white/28 border border-white/30 backdrop-blur-sm active:scale-95 transition"
                              title="פתח במפות"
                            >
                              <Globe size={16}/>
                            </a>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
