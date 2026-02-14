import React from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DeriveOptions {
  types?: string[];
  ages?: string[];
  cities?: string[];
  coaches?: string[];
  days?: string[];
  hours?: string[];
}

interface FilterPanelProps {
  deriveOptions?: DeriveOptions;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
}

export default function FilterPanel({ deriveOptions = {}, searchQuery, setSearchQuery }: FilterPanelProps) {
  const { filters, setFilters } = useAuth() as any;
  const { types = [], ages = [], cities = [], coaches = [], days = [], hours = [] } = deriveOptions;

  const handleChange = (key: string, value: string) => setFilters({ ...filters, [key]: value });

  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Input
          className="w-full rounded-xl border-gray-200 focus-visible:ring-indigo-500"
          placeholder="חיפוש..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />

        <FilterSelect label="סוג" value={filters.type || ""} onChange={(v) => handleChange("type", v)} options={types} />
        <FilterSelect label="קבוצת גיל" value={filters.ageGroup || ""} onChange={(v) => handleChange("ageGroup", v)} options={ages} />
        <FilterSelect label="עיר" value={filters.city || ""} onChange={(v) => handleChange("city", v)} options={cities} />
        <FilterSelect label="מאמן" value={filters.coach || ""} onChange={(v) => handleChange("coach", v)} options={coaches} />
        <FilterSelect label="יום" value={filters.day || ""} onChange={(v) => handleChange("day", v)} options={days} />
        <FilterSelect label="שעה" value={filters.hour || ""} onChange={(v) => handleChange("hour", v)} options={hours} />
      </div>
    </section>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <Select value={value || "__all__"} onValueChange={(v) => onChange(v === "__all__" ? "" : v)}>
      <SelectTrigger className="rounded-xl border-gray-200 text-sm">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent dir="rtl">
        <SelectItem value="__all__">{label}</SelectItem>
        {options.map((v) => (
          <SelectItem key={v} value={v}>{v}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
