/**
 * AppShell.jsx
 * -------------
 * Wraps all authenticated pages with the sticky header and aligned content.
 * Header is scrollable when content overflows.
 */
import React from "react";
import { Outlet } from "react-router-dom";
// Import the sticky header component for authenticated areas. After reorganising the
// project structure, components now live under `components/` rather than `Components/`.
// The Header is responsible for rendering the navigation bar across logged-in pages.
import Header from "../components/Header";

export default function AppShell() {
  return (
    /*
     * AppShell wraps all authenticated pages. It includes a sticky header at the
     * top and provides a scrollable area for the main content. The overall
     * direction has been changed to LTR since the UI is now fully in English.
     */
    <div className="flex min-h-screen flex-col bg-gray-50" dir="ltr">
      {/* Scrollable header wrapper */}
      <div className="sticky top-0 z-40 overflow-x-auto">
        <Header />
      </div>

      {/* Main content */}
      <main className="flex-1 overflow-auto px-4 py-4 sm:px-6 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}
