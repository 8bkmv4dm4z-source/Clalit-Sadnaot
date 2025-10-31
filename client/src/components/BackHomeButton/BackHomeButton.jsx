import React from "react";
import { useNavigate } from "react-router-dom";

export default function BackHomeButton() {
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate("/")}
      className="inline-flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm transition-all hover:bg-gray-50 hover:scale-105">
      ⬅️ חזרה לדף הבית
    </button>
  );
}
