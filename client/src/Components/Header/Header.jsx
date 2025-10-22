/**
 * Header.jsx — Unified Calendar Link
 * -----------------------------------
 * ✅ "הסדנאות שלי" now links directly to /myworkshops
 * ✅ Includes 📅 icon next to the text
 * ✅ Keeps all other logic and responsive layout intact
 */

import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useProfiles } from "../../layouts/ProfileContext";
import { CalendarDays } from "lucide-react"; // 📅 modern lightweight icon

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const { isAdmin, logout, user } = useAuth();
  const { viewMode, setViewMode } = useWorkshops();
  const { profiles } = useProfiles();

  // 🔹 Scroll shadow effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (to) => location.pathname === to;

  const handleLogout = async () => {
    await logout();
    navigate("/workshops");
  };

  const currentUser =
    profiles.find((p) => p._id === user?._id) || user || { name: "משתמש" };

  const linkBase =
    "rtl inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap";
  const linkActive = "bg-white/90 text-blue-800 shadow-sm";
  const linkIdle = "text-white/90 hover:bg-white/20 hover:text-white";

  return (
    <header
      className={`transition-all duration-300 ${
        isScrolled
          ? "backdrop-blur bg-gradient-to-r from-blue-500/90 via-blue-600/90 to-blue-500/90 shadow-md"
          : "bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500"
      } text-white`}
      dir="rtl"
    >
      <nav className="mx-auto flex flex-wrap justify-center items-center gap-3 px-4 sm:px-6 py-3 overflow-x-auto no-scrollbar">
        {/* 🏠 Brand */}
        <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm transition-transform flex-shrink-0">
          כללית סדנאות
        </h1>

        {/* 🔗 Navigation Links */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap justify-center">
          {/* All Workshops */}
          <button
            onClick={() => {
              setViewMode("all");
              if (!location.pathname.startsWith("/workshops"))
                navigate("/workshops");
            }}
            className={`${linkBase} ${
              isActive("/workshops") && viewMode === "all"
                ? linkActive
                : linkIdle
            }`}
          >
            <span>כל הסדנאות</span>
          </button>

          {/* My Workshops (Calendar view) */}
          <NavLink
            to="/myworkshops"
            className={`${linkBase} ${
              isActive("/myworkshops") ? linkActive : linkIdle
            }`}
          >
            <CalendarDays size={16} />
            <span>הסדנאות שלי</span>
          </NavLink>

          {/* Profile */}
          <NavLink
            to="/profile"
            className={`${linkBase} ${
              isActive("/profile") ? linkActive : linkIdle
            }`}
          >
            <span>הפרופיל שלי</span>
          </NavLink>

          {/* Admin Tools */}
          {isAdmin && (
            <>
              <NavLink
                to="/profiles"
                className={`${linkBase} ${
                  isActive("/profiles") ? linkActive : linkIdle
                }`}
              >
                <span>ניהול משתמשים</span>
              </NavLink>

              <NavLink
                to="/editworkshop"
                onClick={() => localStorage.removeItem("editingWorkshopId")}
                className={`${linkBase} ${
                  isActive("/editworkshop") ? linkActive : linkIdle
                }`}
              >
                <span>➕ צור סדנה חדשה</span>
              </NavLink>
            </>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="btn btn-outline px-4 py-2 ml-1 rounded-xl bg-white/20 hover:bg-white/30 text-white flex-shrink-0 whitespace-nowrap"
          >
            <span>התנתקות</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
