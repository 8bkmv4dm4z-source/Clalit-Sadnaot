import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  CalendarClock,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  LogOut,
  Sparkles,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import { Button } from "@/components/ui/button";
import { NavBar } from "@/components/ui/tubelight-navbar";

export default function Header() {
  const WORKSHOP_STYLE_KEY = "workshopsPreferredPageStyle";
  const WORKSHOP_STYLE_ACTIVE_KEY = "workshopsActivePageStyle";
  const WORKSHOP_STYLE_PREF_EVENT = "workshop-style-preference-change";
  const WORKSHOP_STYLE_ACTIVE_EVENT = "workshop-style-active-change";
  const readCurrentStyle = () => {
    try {
      if (typeof window === "undefined") return "showcase";
      const active = localStorage.getItem(WORKSHOP_STYLE_ACTIVE_KEY);
      if (active === "classic" || active === "showcase") return active;
      return localStorage.getItem(WORKSHOP_STYLE_KEY) === "classic"
        ? "classic"
        : "showcase";
    } catch {
      return "showcase";
    }
  };
  const navigate = useNavigate();
  const [compact, setCompact] = useState(false);
  const [expanded, setExpanded] = useState(true);
  const [currentWorkshopStyle, setCurrentWorkshopStyle] = useState(readCurrentStyle);
  const lastY = useRef(0);
  const { logout } = useAuth();
  const { viewMode, setViewMode } = useWorkshops();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();

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
  const toggleWorkshopStyle = () => {
    const next = currentWorkshopStyle === "showcase" ? "classic" : "showcase";
    setCurrentWorkshopStyle(next);
    try {
      localStorage.setItem(WORKSHOP_STYLE_KEY, next);
      window.dispatchEvent(
        new CustomEvent(WORKSHOP_STYLE_PREF_EVENT, { detail: { style: next, at: Date.now() } })
      );
    } catch {
      /* ignore preference persistence failures */
    }
  };

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY || 0;
      if (y < 24) {
        setCompact(false);
        setExpanded(true);
      } else if (y > lastY.current + 12 && y > 120) {
        setCompact(true);
        setExpanded(false);
      } else if (y < lastY.current - 12 && y < 80) {
        setCompact(false);
        setExpanded(true);
      }
      lastY.current = y;
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const syncPreference = () => setCurrentWorkshopStyle(readCurrentStyle());
    window.addEventListener(WORKSHOP_STYLE_PREF_EVENT, syncPreference);
    window.addEventListener(WORKSHOP_STYLE_ACTIVE_EVENT, syncPreference);
    return () => {
      window.removeEventListener(WORKSHOP_STYLE_PREF_EVENT, syncPreference);
      window.removeEventListener(WORKSHOP_STYLE_ACTIVE_EVENT, syncPreference);
    };
  }, []);

  return (
    <header
      className={`overflow-hidden bg-gradient-to-r from-indigo-50/95 via-sky-50/95 to-cyan-50/95 backdrop-blur transition-all duration-300 ${
        compact ? "shadow-sm" : "shadow-[0_4px_20px_rgba(99,102,241,.10)]"
      } border-b border-indigo-200/60`}
    >
      <div
        className={`mx-auto w-full max-w-5xl overflow-hidden px-3 sm:px-4 transition-all duration-300 ${
          expanded ? "max-h-52 py-1.5 opacity-100" : "max-h-0 py-0 opacity-0"
        }`}
      >
        <nav className="flex w-full flex-col gap-2 md:flex-row md:items-start md:justify-between">
          <div className="flex flex-1 justify-center">
            <NavBar items={navItems} className="max-w-full overflow-x-auto" />
          </div>

          <div className="flex w-full flex-col gap-2 md:w-auto md:min-w-[180px]">
            <Button
              variant="outline"
              onClick={toggleWorkshopStyle}
              className="h-8 w-full rounded-lg border-indigo-300 bg-white/80 px-3 text-xs text-indigo-700 transition-all duration-300 hover:bg-indigo-100"
            >
              {currentWorkshopStyle === "showcase" ? <Sparkles size={14} /> : <LayoutGrid size={14} />}
              {currentWorkshopStyle === "showcase" ? "Showcase פעיל" : "קלאסי פעיל"}
            </Button>
            <Button
              variant="outline"
              onClick={handleLogout}
              className="h-8 w-full rounded-lg border-indigo-300 bg-white/80 px-3 text-xs text-indigo-700 transition-all duration-300 hover:bg-indigo-100"
            >
              <LogOut size={14} />
              התנתקות
            </Button>
          </div>
        </nav>
      </div>

      <div className="mx-auto flex w-full max-w-5xl justify-center px-3 pb-1 sm:px-4">
        <button
          type="button"
          aria-label={expanded ? "כווץ כותרת" : "פתח כותרת"}
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex h-6 w-10 items-center justify-center rounded-md border border-indigo-200 bg-white/85 text-indigo-700 transition hover:bg-indigo-100"
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
    </header>
  );
}
