import React, { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import MiniWorkshopCard from "./MiniWorkshopCard";
import { useMyWorkshops, DAYS, HEB_DAY, START_HOUR, END_HOUR } from "./MyWorkshopsProvider";

/**
 * WorkshopGridContent
 * -------------------
 * - 6 days (Sun–Fri), hours 7–22.
 * - Cards render INSIDE cells using key = `${dayIndex}-${Math.floor(hourFloat)}` (v4.4 behavior).
 * - Continuous borders + sticky headers.
 * - Gentle animations for rows and cards.
 */

const pad2 = (n) => (n < 10 ? `0${n}` : `${n}`);
const parseHourToFloat = (hhmm) => {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(":").map(Number);
  return h + (Number.isNaN(m) ? 0 : m / 60);
};
const formatHour = (h) => `${pad2(h)}:00`;

export default function WorkshopGridContent() {
  const { workshopsByEntity, colorMap } = useMyWorkshops();

  // Build normalized render list
  const events = useMemo(() => {
    const out = [];
    Object.entries(workshopsByEntity || {}).forEach(([entityId, info]) => {
      const color = colorMap[entityId] || "#3b82f6";
      (info?.workshops || []).forEach((w) => {
        const hourFloat = parseHourToFloat(w.hour);
        if (hourFloat == null) return;
        const dayList = Array.isArray(w.days) ? w.days : [];
        dayList.forEach((day) => {
          const dayIndex = DAYS.indexOf(day);
          if (dayIndex === -1) return;
          out.push({
            memberId: entityId,
            memberName: info?.name ?? "",
            color,
            title: w.title || "סדנה",
            city: w.city,
            address: w.address,
            dayIndex,
            hourLabel: w.hour,
            hourFloat,
          });
        });
      });
    });
    return out;
  }, [workshopsByEntity, colorMap]);

  // Cell map keyed by `${dayIndex}-${hourIndex}`
  const cellMap = useMemo(() => {
    const map = new Map();
    for (const ev of events) {
      const hourIndex = Math.floor(ev.hourFloat);
      if (hourIndex < START_HOUR || hourIndex > END_HOUR) continue;
      const key = `${ev.dayIndex}-${hourIndex}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(ev);
    }
    // stable ordering inside a cell
    for (const arr of map.values()) {
      arr.sort((a, b) => a.hourFloat - b.hourFloat || a.title.localeCompare(b.title));
    }
    return map;
  }, [events]);

  return (
    <div className="relative">
      {/* Days header (sticky top) */}
      <div
        className="grid border-b border-indigo-200 rounded-t-2xl sticky top-0 z-20 bg-white/95 backdrop-blur"
        style={{ gridTemplateColumns: `100px repeat(6, 1fr)` }}
      >
        <div className="bg-white h-12 border-r-2 border-indigo-200 sticky left-0 z-30" />
        {DAYS.map((d, i) => (
          <div
            key={d}
            className={`h-12 flex items-center justify-center text-indigo-800 font-semibold border-r border-indigo-200 ${
              i === DAYS.length - 1 ? "border-r-2 border-indigo-200 rounded-tr-2xl" : ""
            } ${i % 2 === 0 ? "bg-blue-50/30" : "bg-white"}`}
          >
            {HEB_DAY[d]}
          </div>
        ))}
      </div>

      {/* Hour rows */}
      <AnimatePresence initial={false}>
        {Array.from({ length: END_HOUR - START_HOUR + 1 }).map((_, idx) => {
          const hour = START_HOUR + idx;
          return (
            <motion.div
              key={hour}
              className="grid border-t border-indigo-200 border-r-2 border-indigo-200"
              style={{ gridTemplateColumns: `100px repeat(6, 1fr)` }}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
            >
              {/* Hour label (sticky left) */}
              <div className="bg-white flex items-center justify-center min-h-[80px] border-r-2 border-indigo-200 sticky left-0 z-10">
                <span className="text-xs text-gray-600 font-medium">{formatHour(hour)}</span>
              </div>

              {/* Day cells */}
              {DAYS.map((_, dayIndex) => {
                const key = `${dayIndex}-${hour}`;
                const items = cellMap.get(key) || [];
                return (
                  <div
                    key={key}
                    className={`p-2 flex flex-col gap-2 justify-start border-r border-indigo-200 ${
                      dayIndex === DAYS.length - 1 ? "border-r-2 border-indigo-200" : ""
                    } ${dayIndex % 2 === 0 ? "bg-blue-50/10" : "bg-white"}`}
                    style={{ minHeight: 80 }}
                  >
                    <AnimatePresence initial={false}>
                      {items.map((ev, i) => (
                        <motion.div
                          key={`${key}-${i}-${ev.title}`}
                          initial={{ opacity: 0, y: 4, scale: 0.98 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -4, scale: 0.98 }}
                          transition={{ duration: 0.12 }}
                        >
                          <MiniWorkshopCard
                            title={ev.title}
                            hour={ev.hourLabel}
                            color={ev.color}
                            city={ev.city}
                            address={ev.address}
                          />
                        </motion.div>
                      ))}
                    </AnimatePresence>
                  </div>
                );
              })}
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Bottom strong border to close the grid visually */}
      <div className="border-t-2 border-indigo-200 h-1 w-full" />
    </div>
  );
}
