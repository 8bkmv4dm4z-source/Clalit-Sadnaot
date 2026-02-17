import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CalendarDays,
  LayoutGrid,
  LogOut,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useProfiles } from "../../layouts/ProfileContext";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/ui/tubelight-navbar";

export default function Header() {
  const navigate = useNavigate();
  const [compact, setCompact] = useState(false);
  const lastY = useRef(0);
  const { logout, user } = useAuth();
  const { viewMode, setViewMode } = useWorkshops();
  const { profiles } = useProfiles();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();

  const currentUser =
    profiles.find((p) => p._id === user?._id) || user || { name: "משתמש" };

  const navItems = useMemo(() => {
    const base = [
      {
        name: "כל הסדנאות",
        url: "/workshops",
        icon: LayoutGrid,
        onClick: () => setViewMode("all"),
        active: (pathname) => pathname === "/workshops" && viewMode === "all",
      },
      { name: "יומן הסדנאות", url: "/workshops-calendar", icon: CalendarClock },
      { name: "הסדנאות שלי", url: "/myworkshops", icon: CalendarDays },
      { name: "הפרופיל שלי", url: "/profile", icon: User },
    ];

    if (canAccessAdmin && !isChecking) {
      base.push(
        {
          name: "סדנה חדשה",
          url: "/editworkshop",
          icon: Settings,
          onClick: () => localStorage.removeItem("editingWorkshopId"),
        },
        { name: "Admin Hub", url: "/admin/hub", icon: Shield },
        { name: "ניהול משתמשים", url: "/profiles", icon: Users }
      );
    }
    return base;
  }, [canAccessAdmin, isChecking, setViewMode, viewMode]);

  const handleLogout = async () => {
    await logout();
    navigate("/workshops");
  };

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (y < 16) {
        setCompact(false);
      } else if (y > lastY.current + 8) {
        setCompact(true);
      } else if (y < lastY.current - 8) {
        setCompact(false);
      }
      lastY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`border-b border-slate-200 bg-white/85 backdrop-blur transition-all duration-300 ${
        compact ? "shadow-sm" : ""
      }`}
    >
      <nav
        className={`mx-auto flex max-w-6xl flex-col px-4 sm:px-6 md:flex-row md:items-center md:justify-between transition-all duration-300 ${
          compact ? "gap-2 py-1.5" : "gap-2.5 py-2.5"
        }`}
      >
        <div className="min-w-0">
          <h1 className={`font-bold tracking-tight text-slate-900 transition-all duration-300 ${compact ? "text-base" : "text-lg"}`}>תפריט</h1>
          <p
            className={`truncate text-xs text-slate-500 transition-all duration-300 ${
              compact ? "max-h-0 opacity-0" : "max-h-5 opacity-100"
            }`}
          >
            {currentUser.name}
          </p>
        </div>

        <div className="flex w-full justify-center md:w-auto md:justify-start">
          <NavBar items={navItems} className="max-w-full overflow-x-auto" />
        </div>

        <Button
          variant="outline"
          onClick={handleLogout}
          className={`w-full border-slate-300 text-slate-700 hover:bg-slate-100 md:w-auto transition-all duration-300 ${
            compact ? "h-8 px-3 text-xs" : "h-9 px-4 text-sm"
          }`}
        >
          <LogOut size={16} />
          התנתקות
        </Button>
      </nav>
    </header>
  );
}
