/**
 * Header.jsx — Full Logic (Folder-Based Imports)
 * ----------------------------------------------
 * ✅ Uses AuthLayout, WorkshopContext, and ProfileContext
 * ✅ Keeps all UI: view toggles, admin options, create-workshop button
 * ✅ Works with index.jsx exports (folder-based imports)
 */

import React, { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useProfiles } from "../../layouts/ProfileContext";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);

  const { isAdmin, setIsAdmin, setIsLoggedIn, user } = useAuth();
  const { viewMode, setViewMode } = useWorkshops();
  const { profiles } = useProfiles();

  // 🔹 Scroll shadow effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const isActive = (to) => location.pathname.startsWith(to);

  const handleLogout = () => {
    localStorage.removeItem("token");
    setIsLoggedIn(false);
    setIsAdmin(false);
    navigate("/login");
  };

  // 🧠 show current user (syncs with profile updates)
  const currentUser =
    profiles.find((p) => p._id === user?._id) || user || { name: "משתמש" };

  const linkBase =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200";
  const linkActive = "bg-white/90 text-blue-800 shadow-sm";
  const linkIdle = "text-white/90 hover:bg-white/20 hover:text-white";

  return (
    <header
      className={`sticky top-0 z-40 transition-all duration-300 ${
        isScrolled
          ? "backdrop-blur bg-gradient-to-r from-blue-500/90 via-blue-600/90 to-blue-500/90 shadow-md"
          : "bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500"
      } text-white`}
    >
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        {/* 🏠 Brand */}
        <button
          onClick={() => navigate("/")}
          className="text-xl font-bold tracking-tight text-white drop-shadow-sm hover:scale-[1.03] transition-transform"
        >
          כללית סדנאות
        </button>

        {/* 🔗 Navigation Links */}
        <div className="flex items-center gap-3">
          {/* All Workshops */}
          <button
            onClick={() => {
              setViewMode("all");
              if (!location.pathname.startsWith("/workshops"))
                navigate("/workshops");
            }}
            className={`${linkBase} ${
              isActive("/workshops") && viewMode === "all" ? linkActive : linkIdle
            }`}
          >
            <span>כל הסדנאות</span>
          </button>

          {/* My Workshops */}
          <button
            onClick={() => {
              setViewMode("mine");
              if (!location.pathname.startsWith("/workshops"))
                navigate("/workshops");
            }}
            className={`${linkBase} ${
              isActive("/workshops") && viewMode === "mine" ? linkActive : linkIdle
            }`}
          >
            <span>הסדנאות שלי</span>
          </button>

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

              <button
                onClick={() => {
                  localStorage.removeItem("editingWorkshopId");
                  navigate("/editworkshop");
                }}
                className="btn btn-primary text-sm px-4 py-2 shadow-sm hover:scale-[1.03] bg-white/90 text-blue-700 font-medium rounded-xl"
              >
                ➕ צור סדנה חדשה
              </button>
            </>
          )}

          {/* Logout */}
          <button
            onClick={handleLogout}
            className="btn btn-outline px-4 py-2 ml-1 rounded-xl bg-white/20 hover:bg-white/30 text-white"
          >
            <span>התנתקות</span>
          </button>
        </div>
      </nav>
    </header>
  );
}
