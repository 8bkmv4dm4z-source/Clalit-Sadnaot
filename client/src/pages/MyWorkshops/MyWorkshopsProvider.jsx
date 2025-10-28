import React, { createContext, useState, useMemo, useContext, useEffect } from "react";

/* ------------------ Shared Constants ------------------ */
export const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
export const HEB_DAY = {
  Sunday: "יום א",
  Monday: "יום ב",
  Tuesday: "יום ג",
  Wednesday: "יום ד",
  Thursday: "יום ה",
  Friday: "יום ו",
};
export const START_HOUR = 7;
export const END_HOUR = 22;
export const PALETTE = [
  "#fca5a5", "#93c5fd", "#86efac", "#c4b5fd",
  "#fcd34d", "#5eead4", "#f9a8d4", "#a5b4fc",
];

/* ------------------ Context ------------------ */
const MyWorkshopsContext = createContext();
export const useMyWorkshops = () => useContext(MyWorkshopsContext);

// Start-of-week helper
const startOfWeekSunday = (d) => {
  const date = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = date.getDay(); // 0=Sun
  date.setDate(date.getDate() - diff);
  date.setHours(0, 0, 0, 0);
  return date;
};

/**
 * Normalize any plausible API shape into:
 * {
 *   [entityId]: {
 *     name: string,
 *     workshops: [{ title, hour: "HH:MM", days: [DAYS...], city, address }]
 *   }
 * }
 */
function normalizeApiData(apiData) {
  if (!apiData) return {};
  // Accept arrays or pre-grouped objects
  if (Array.isArray(apiData)) {
    const grouped = {};
    for (const w of apiData) {
      const id = w.userId || w.memberId || w.familyId || w.entityId || "unknown";
      const name = w.userName || w.memberName || w.familyName || w.name || "משתתף";
      if (!grouped[id]) grouped[id] = { name, workshops: [] };
      grouped[id].workshops.push({
        title: w.title || w.workshopTitle || "סדנה",
        hour:  w.hour  || w.time || "09:00",
        days:  Array.isArray(w.days) ? w.days : [w.day || w.weekday || "Sunday"],
        city:  w.city,
        address: w.address || w.location,
      });
    }
    return grouped;
  } else {
    // Already grouped
    return apiData;
  }
}

export default function MyWorkshopsProvider({ children, apiData, fetcher }) {
  const [weekAnchor, setWeekAnchor] = useState(() => startOfWeekSunday(new Date()));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [workshopsByEntity, setWorkshopsByEntity] = useState(() => normalizeApiData(apiData));

  // Optional live fetch hook (if parent supplies a fetcher)
  useEffect(() => {
    if (!fetcher) return;
    (async () => {
      try {
        setLoading(true);
        const raw = await fetcher();
        setWorkshopsByEntity(normalizeApiData(raw));
        setError("");
      } catch (e) {
        setError("Failed to load workshops");
      } finally {
        setLoading(false);
      }
    })();
  }, [fetcher]);

  // Stable color per entity
  const colorMap = useMemo(() => {
    const ids = Object.keys(workshopsByEntity || {});
    const map = {};
    ids.forEach((id, idx) => (map[id] = PALETTE[idx % PALETTE.length]));
    return map;
  }, [workshopsByEntity]);

  const value = {
    weekAnchor,
    setWeekAnchor,
    workshopsByEntity,
    setWorkshopsByEntity,
    colorMap,
    loading,
    setLoading,
    error,
    setError,
  };

  return <MyWorkshopsContext.Provider value={value}>{children}</MyWorkshopsContext.Provider>;
}
