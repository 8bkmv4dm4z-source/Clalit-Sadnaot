import React from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function SearchBar({ search, onSearchChange }: SearchBarProps) {
  return (
    <div className="relative w-full group">
      <Search
        size={18}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 group-focus-within:text-indigo-600 transition-colors pointer-events-none"
      />
      <Input
        type="text"
        placeholder="חפש סדנה..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full pr-10 rounded-xl border-indigo-200/60 bg-white/80 backdrop-blur shadow-sm placeholder:text-indigo-300 focus-visible:ring-indigo-500 focus-visible:border-indigo-300 focus-visible:shadow-md transition-all"
        dir="rtl"
      />
    </div>
  );
}
