import React from "react";
import { Input } from "@/components/ui/input";

interface SearchBarProps {
  search: string;
  onSearchChange: (value: string) => void;
}

export default function SearchBar({ search, onSearchChange }: SearchBarProps) {
  return (
    <div className="w-full">
      <Input
        type="text"
        placeholder="חפש סדנה..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        className="w-full rounded-xl border-gray-200 focus-visible:ring-indigo-500"
      />
    </div>
  );
}
