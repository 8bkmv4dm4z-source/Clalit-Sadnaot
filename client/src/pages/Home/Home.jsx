import React, { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutGrid, Menu, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPublicNavItems } from "../../components/nav/navigationConfig";
import useIsMobile from "../../hooks/useIsMobile";

const PUBLIC_SIDEBAR_ID = "public-sidebar-navigation";

export default function Home({ isOpen = true, toggleSidebar = () => {} }) {
  const isMobile = useIsMobile(640);
  const isSidebarHidden = isMobile && !isOpen;
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
  const [currentWorkshopStyle, setCurrentWorkshopStyle] = useState(
    readCurrentStyle
  );
  const items = getPublicNavItems().map((item) => ({
    to: item.path,
    label: item.label,
    icon: item.icon,
  }));
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
    const syncPreference = () => setCurrentWorkshopStyle(readCurrentStyle());
    window.addEventListener(WORKSHOP_STYLE_PREF_EVENT, syncPreference);
    window.addEventListener(WORKSHOP_STYLE_ACTIVE_EVENT, syncPreference);
    return () => {
      window.removeEventListener(WORKSHOP_STYLE_PREF_EVENT, syncPreference);
      window.removeEventListener(WORKSHOP_STYLE_ACTIVE_EVENT, syncPreference);
    };
  }, []);

  return (
    <>
      {/* 🔘 Toggle Button (mobile only) */}
      <button
        onClick={toggleSidebar}
        aria-expanded={isOpen}
        aria-controls={PUBLIC_SIDEBAR_ID}
        aria-label={isOpen ? "סגור תפריט צדדי" : "פתח תפריט צדדי"}
        className="fixed right-4 top-4 z-50 rounded-lg border border-slate-300 bg-white p-2 text-slate-700 shadow-sm sm:hidden"
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        id={PUBLIC_SIDEBAR_ID}
        dir="rtl"
        aria-hidden={isSidebarHidden}
        className={`fixed top-0 right-0 z-40 flex h-screen w-[88vw] max-w-[320px] flex-col border-l border-indigo-200/60 bg-gradient-to-b from-indigo-50/95 via-sky-50/95 to-white text-slate-800 shadow-[0_8px_28px_rgba(99,102,241,.10)] backdrop-blur transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
          sm:w-72 sm:max-w-none sm:translate-x-0`}
      >
        <div className="border-b border-indigo-200/70 px-6 py-7">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-3 py-1 text-xs font-semibold text-indigo-700">
            <Sparkles size={14} />
            Navigation
          </div>
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">סדנאות</h2>
          <p className="mt-1 text-xs text-slate-500">ניווט מהיר בדפי המערכת</p>
        </div>

        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-2">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => toggleSidebar(false)}
                  tabIndex={isSidebarHidden ? -1 : 0}
                  className={({ isActive }) =>
                    cn(
                      "relative flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-all duration-200",
                      isActive
                        ? "border-indigo-300 bg-white/90 text-indigo-900 shadow-sm"
                        : "border-transparent text-slate-700 hover:border-indigo-200 hover:bg-white/80 hover:text-indigo-900"
                    )
                  }
                >
                  <Icon size={16} />
                  {item.label}
                </NavLink>
              </li>
              );
            })}
          </ul>
          <div className="mt-4 border-t border-indigo-200/70 pt-4">
            <button
              type="button"
              onClick={toggleWorkshopStyle}
              className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-indigo-200 bg-white/80 px-4 py-2 text-sm font-semibold text-indigo-900 transition hover:bg-white"
            >
              {currentWorkshopStyle === "showcase" ? <Sparkles size={16} /> : <LayoutGrid size={16} />}
              {currentWorkshopStyle === "showcase" ? "Showcase פעיל" : "קלאסי פעיל"}
            </button>
          </div>
        </nav>

        <footer className="border-t border-indigo-200/70 px-6 py-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} סדנאות
        </footer>
      </aside>
    </>
  );
}
