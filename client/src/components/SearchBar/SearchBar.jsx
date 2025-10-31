import React from "react";

export default function SearchBar({ search, onSearchChange }) {
  return (
    <div className="w-full">
      <input
        type="text"
        placeholder="חפש סדנה..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
    </div>
  );
}
