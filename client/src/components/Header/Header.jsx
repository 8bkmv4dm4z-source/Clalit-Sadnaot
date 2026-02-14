/**
 * Header.jsx — Unified Calendar Link
 * -----------------------------------
 * Mobile menu uses shadcn Sheet (right side for RTL).
 * Desktop layout uses motion.div for smooth layout transitions.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useProfiles } from "../../layouts/ProfileContext";
import { CalendarDays, Menu } from "lucide-react";
import { motion } from "framer-motion";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";

export default function Header() {
  const location = useLocation();
  const navigate = useNavigate();
  const [isScrolled, setIsScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const { logout, user } = useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();
  const { viewMode, setViewMode } = useWorkshops();
  const { profiles } = useProfiles();

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 4);
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Close mobile menu on navigation
  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
  const sheetLinkBase =
    "inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-all duration-200 whitespace-nowrap w-full";
  const sheetLinkActive = "bg-indigo-100 text-indigo-800";
  const sheetLinkIdle = "text-gray-700 hover:bg-gray-100";

  const linkGroup = useMemo(
    () => (
      <div className="flex flex-col md:flex-row md:items-center gap-2 sm:gap-3 flex-wrap md:justify-center">
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

        <NavLink
          to="/myworkshops"
          className={`${linkBase} ${
            navIsActive("/myworkshops") ? linkActive : linkIdle
          }`}
        >
          <CalendarDays size={16} />
          <span>הסדנאות שלי</span>
        </NavLink>

        <NavLink
          to="/profile"
          className={`${linkBase} ${
            navIsActive("/profile") ? linkActive : linkIdle
          }`}
        >
          <span>הפרופיל שלי</span>
        </NavLink>

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
          <h1 className="text-xl font-bold tracking-tight text-white drop-shadow-sm transition-transform flex-shrink-0">
            תפריט
          </h1>

          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-sm text-white/90 font-medium truncate max-w-[180px]">
              {currentUser.name}
            </span>

            {/* Mobile Menu - Sheet */}
            <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
              <SheetTrigger asChild>
                <button
                  className="md:hidden p-2 rounded-lg bg-white/15 border border-white/20 hover:bg-white/25 transition focus:outline-none focus:ring-2 focus:ring-white/40"
                  aria-label="פתח/סגור תפריט"
                >
                  <Menu size={24} className="text-white" />
                </button>
              </SheetTrigger>
              <SheetContent side="right" className="w-72 bg-white" dir="rtl">
                <SheetHeader>
                  <SheetTitle className="text-lg font-bold text-indigo-800">
                    {currentUser.name}
                  </SheetTitle>
                </SheetHeader>
                <div className="flex flex-col gap-2 mt-4">
                  <button
                    onClick={() => {
                      setViewMode("all");
                      if (!location.pathname.startsWith("/workshops"))
                        navigate("/workshops");
                      setMenuOpen(false);
                    }}
                    className={`${sheetLinkBase} ${
                      navIsActive("/workshops") && viewMode === "all"
                        ? sheetLinkActive
                        : sheetLinkIdle
                    }`}
                  >
                    כל הסדנאות
                  </button>

                  <NavLink
                    to="/myworkshops"
                    className={`${sheetLinkBase} ${
                      navIsActive("/myworkshops") ? sheetLinkActive : sheetLinkIdle
                    }`}
                    onClick={() => setMenuOpen(false)}
                  >
                    <CalendarDays size={16} />
                    הסדנאות שלי
                  </NavLink>

                  <NavLink
                    to="/profile"
                    className={`${sheetLinkBase} ${
                      navIsActive("/profile") ? sheetLinkActive : sheetLinkIdle
                    }`}
                    onClick={() => setMenuOpen(false)}
                  >
                    הפרופיל שלי
                  </NavLink>

                  {canAccessAdmin && !isChecking && (
                    <>
                      <Separator className="my-2" />
                      <NavLink
                        to="/profiles"
                        className={`${sheetLinkBase} ${
                          navIsActive("/profiles") ? sheetLinkActive : sheetLinkIdle
                        }`}
                        onClick={() => setMenuOpen(false)}
                      >
                        ניהול משתמשים
                      </NavLink>

                      <NavLink
                        to="/admin/hub"
                        className={`${sheetLinkBase} ${
                          navIsActive("/admin/hub") ? sheetLinkActive : sheetLinkIdle
                        }`}
                        onClick={() => setMenuOpen(false)}
                      >
                        Admin Hub
                      </NavLink>

                      <NavLink
                        to="/editworkshop"
                        onClick={() => {
                          localStorage.removeItem("editingWorkshopId");
                          setMenuOpen(false);
                        }}
                        className={`${sheetLinkBase} ${
                          navIsActive("/editworkshop") ? sheetLinkActive : sheetLinkIdle
                        }`}
                      >
                        ➕ צור סדנה חדשה
                      </NavLink>
                    </>
                  )}

                  <Separator className="my-2" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      handleLogout();
                      setMenuOpen(false);
                    }}
                    className="w-full"
                  >
                    התנתקות
                  </Button>
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </div>

        {/* Desktop Navigation */}
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
