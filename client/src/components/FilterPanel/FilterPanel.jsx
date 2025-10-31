import React from "react";
import { useAuth } from "../../layouts/AuthLayout";

export default function FilterPanel({ deriveOptions = {}, searchQuery, setSearchQuery }) {
  const { filters, setFilters } = useAuth();
  const { types = [], ages = [], cities = [], coaches = [], days = [], hours = [] } = deriveOptions;

  const handleChange = (key, value) => setFilters({ ...filters, [key]: value });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <input
          className="w-full rounded-xl border border-gray-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          placeholder="חיפוש..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={filters.type || ""} onChange={(e) => handleChange("type", e.target.value)}>
          <option value="">סוג</option>
          {types.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={filters.ageGroup || ""} onChange={(e) => handleChange("ageGroup", e.target.value)}>
          <option value="">קבוצת גיל</option>
          {ages.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={filters.city || ""} onChange={(e) => handleChange("city", e.target.value)}>
          <option value="">עיר</option>
          {cities.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={filters.coach || ""} onChange={(e) => handleChange("coach", e.target.value)}>
          <option value="">מאמן</option>
          {coaches.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={filters.day || ""} onChange={(e) => handleChange("day", e.target.value)}>
          <option value="">יום</option>
          {days.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
        <select className="rounded-xl border border-gray-200 px-3 py-2 text-sm" value={filters.hour || ""} onChange={(e) => handleChange("hour", e.target.value)}>
          <option value="">שעה</option>
          {hours.map((v) => <option key={v} value={v}>{v}</option>)}
        </select>
      </div>
    </section>
  );
}
