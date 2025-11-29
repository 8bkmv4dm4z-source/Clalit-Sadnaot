/**
 * MiniWorkshopCard.jsx
 * ---------------------
 * Compact workshop card that fits inside a grid cell.
 * - Gradient based on family color
 * - Hover scale/shadow, safe on mobile
 * - Clickable Google Maps icon (darkens on hover)
 */
import React from "react";

const mapsUrl = (city, address) => {
  const label = `${address || ""}${address && city ? ", " : ""}${city || ""}`.trim();
  return label ? `https://www.google.com/maps?q=${encodeURIComponent(label)}` : null;
};

export default function MiniWorkshopCard({ title, hour, color, city, address }) {
  const link = mapsUrl(city, address);

  return (
    <div
      className="rounded-xl border border-white/50 p-2 flex items-start justify-between shadow-sm hover:shadow-md transition-transform hover:scale-[1.02]"
style={{ background: `linear-gradient(to left, ${color}A0, ${color}D0)` }}
    >
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-gray-800 whitespace-normal break-words leading-snug">
          {title}
        </div>
        <div className="text-[11px] text-gray-600 mt-1">{hour}</div>
      </div>

      {link && (
        <a
          href={link}
          target="_blank"
          rel="noopener noreferrer"
          className="text-indigo-600 hover:text-indigo-800 shrink-0 ml-2 transition-colors"
          title="פתח במפות Google"
          aria-label="Open in Google Maps"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4"
            viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 3.75c4.56 0 8.25 3.69 8.25 8.25S16.56 20.25 12 20.25 3.75 16.56 3.75 12 7.44 3.75 12 3.75z" />
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M3.75 12h16.5M12 3.75c2.25 2.25 3.375 5.25 3.375 8.25S14.25 18 12 20.25M12 3.75C9.75 6 8.625 9 8.625 12S9.75 18 12 20.25" />
          </svg>
        </a>
      )}
    </div>
  );
}
