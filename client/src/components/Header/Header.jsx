/**
 * Header.jsx — Unified Calendar Link
 * -----------------------------------
 * ✅ "הסדנאות שלי" now links directly to /myworkshops
 * ✅ Includes 📅 icon next to the text
 * ✅ Keeps all other logic and responsive layout intact
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useProfiles } from "../../layouts/ProfileContext";
import { CalendarDays } from "lucide-react"; // 📅 modern lightweight icon
import { AnimatePresence, motion } from "framer-motion";
import {
  useAdminCapability,
  useAdminCapabilityStatus,
} from "../../context/AdminCapabilityContext";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const canAccessAdmin = useAdminCapability();
  const { isChecking } = useAdminCapabilityStatus();
  const { viewMode, setViewMode } = useWorkshops();
  const { profiles } = useProfiles();

  // 🔹 Scroll shadow effect
  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // 🔹 Close mobile menu on navigation & resize
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMenuOpen(false);
    };

    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const navIsActive = useCallback(
    (to) => location.pathname === to,
    [location.pathname]
  );

  const handleLogout = async () => {
    await logout();
    navigate("/workshops");
  };

  const currentUser =
    profiles.find((p) => p._id === user?._id) || user || { name: "משתמש" };

  const linkBase =
    "rtl inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all duration-200 whitespace-nowrap justify-center w-full md:w-auto";
  const linkActive = "bg-white/90 text-blue-800 shadow-sm";
  const linkIdle = "text-white/90 hover:bg-white/20 hover:text-white";

  const linkGroup = useMemo(
    () => (
      <div className="flex flex-col md:flex-row md:items-center gap-2 sm:gap-3 flex-wrap md:justify-center">
        {/* All Workshops */}
        <button
          onClick={() => {
            setViewMode("all");
            if (!location.pathname.startsWith("/workshops"))
              navigate("/workshops");
          }}
          className={`${linkBase} ${
            navIsActive("/workshops") && viewMode === "all"
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
            navIsActive("/myworkshops") ? linkActive : linkIdle
          }`}
        >
          <CalendarDays size={16} />
          <span>הסדנאות שלי</span>
        </NavLink>

        {/* Profile */}
        <NavLink
          to="/profile"
          className={`${linkBase} ${
            navIsActive("/profile") ? linkActive : linkIdle
          }`}
        >
          <span>הפרופיל שלי</span>
        </NavLink>

        {/* Admin Tools */}
        {canAccessAdmin && !isChecking && (
          <>
            <NavLink
              to="/profiles"
              className={`${linkBase} ${
                navIsActive("/profiles") ? linkActive : linkIdle
              }`}
            >
              <span>ניהול משתמשים</span>
            </NavLink>

            <NavLink
              to="/admin/hub"
              className={`${linkBase} ${
                navIsActive("/admin/hub") ? linkActive : linkIdle
              }`}
            >
              <span>Admin Hub</span>
            </NavLink>

            <NavLink
              to="/editworkshop"
              onClick={() => localStorage.removeItem("editingWorkshopId")}
              className={`${linkBase} ${
                navIsActive("/editworkshop") ? linkActive : linkIdle
              }`}
            >
              <span>➕ צור סדנה חדשה</span>
            </NavLink>
          </>
        )}
      </div>
    ),
    [
      canAccessAdmin,
      isChecking,
      linkActive,
      linkBase,
      linkIdle,
      location.pathname,
      navigate,
      navIsActive,
      setViewMode,
      viewMode,
    ]
  );

  const logoutButton = (
    <div className="flex gap-2 justify-end md:justify-start">
      <button
        onClick={handleLogout}
        className="btn btn-outline px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white whitespace-nowrap w-full md:w-auto"
      >
        <span>התנתקות</span>
      </button>
    </div>
  );

  return (
    <header
      className={`transition-all duration-300 ${
        isScrolled
          ? "backdrop-blur bg-gradient-to-r from-blue-500/90 via-blue-600/90 to-blue-500/90 shadow-md"
          : "bg-gradient-to-r from-blue-500 via-blue-600 to-blue-500"
      } text-white`}
      dir="rtl"
    >
      <nav className="mx-auto max-w-6xl px-4 sm:px-6 py-3">
        <div className="flex items-center justify-between gap-3">
          {/* 🏠 Brand */}
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm transition-transform flex-shrink-0">
            תפריט
          </h1>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-white/90 font-medium truncate max-w-[180px]">
              {currentUser.name}
            </span>
            <button
              onClick={() => setMenuOpen((p) => !p)}
              className="md:hidden p-2 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition focus:outline-none focus:ring-2 focus:ring-white/40"
              aria-label="פתח/סגור תפריט"
              aria-expanded={menuOpen}
            >
              <span
                className={`block h-0.5 w-6 bg-white transition-transform duration-200 ${
                  menuOpen ? "translate-y-1.5 rotate-45" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-6 bg-white my-1 transition-opacity duration-200 ${
                  menuOpen ? "opacity-0" : "opacity-80"
                }`}
              />
              <span
                className={`block h-0.5 w-6 bg-white transition-transform duration-200 ${
                  menuOpen ? "-translate-y-1.5 -rotate-45" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* 🔗 Navigation Links */}
        <AnimatePresence initial={false}>
          {menuOpen && (
            <motion.div
              key="mobile-menu"
              initial={{ opacity: 0, height: 0, y: -12 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -10 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="md:hidden grid grid-cols-1 gap-3 mt-3 overflow-hidden"
            >
              {linkGroup}
              {logoutButton}
            </motion.div>
          )}
        </AnimatePresence>

        <motion.div
          layout
          transition={{ duration: 0.2 }}
          className="hidden md:grid md:grid-cols-[1fr_auto] gap-3 mt-3 md:mt-4 items-center"
        >
          {linkGroup}
          {logoutButton}
        </motion.div>
      </nav>
    </header>
  );
}
