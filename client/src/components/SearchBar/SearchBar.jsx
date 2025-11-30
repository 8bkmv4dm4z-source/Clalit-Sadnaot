import React from "react";

/**
 * SearchBar component provides a controlled text input so parents can filter workshop lists.
 *
 * DATA FLOW
 * - Props: `search` (string) is the current filter value owned by the parent (e.g., Workshops page).
 * - User typing → onChange → onSearchChange callback → parent updates state → new `search` prop flows down to this
 *   input value, keeping UI and state synchronized.
 *
 * COMPONENT LOGIC
 * - No internal state; relies entirely on controlled value from parent to avoid divergence between UI and filters.
 * - Placeholder text clarifies the intent (searching workshops).
 */
export default function SearchBar({ search, onSearchChange }) {
  return (
    <div className="w-full">
      <input
        type="text"
        placeholder="חפש סדנה..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)} // bubble the new value upward so parent can refilter data
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}
