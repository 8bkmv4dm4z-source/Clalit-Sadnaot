/**
 * PublicLayout.jsx
 * ----------------
 * Wraps public (not logged-in) routes with sidebar navigation (Home)
 * Supports mobile toggle (overlay)
 */

import React, { useState } from "react";
import { Outlet } from "react-router-dom";
import Home from "../pages/Home";

export default function PublicLayout() {
  const [isOpen, setIsOpen] = useState(false);
  const toggleSidebar = (force) => setIsOpen(force === false ? false : (p) => !p);

  return (
    <div
      className="flex min-h-screen bg-gradient-to-br from-indigo-50 via-blue-50 to-white"
      dir="rtl"
    >
      {/* 🔹 Sidebar (slides in; overlays on mobile) */}
      <Home isOpen={isOpen} toggleSidebar={toggleSidebar} />

      {/* 🔹 Dark overlay ONLY on mobile when open */}
      {isOpen && (
        <div
          onClick={() => toggleSidebar(false)}
          className="fixed inset-0 bg-black/30 backdrop-blur-sm sm:hidden z-30"
        />
      )}

      {/* 🔹 Page content — never pushed on mobile; reserve space on ≥ sm */}
      <main className="flex-1 transition-all duration-300 pr-0 sm:pr-64">
        <Outlet />
      </main>
    </div>
  );
}
