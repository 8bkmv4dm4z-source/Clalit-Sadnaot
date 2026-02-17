import React from "react";
import { NavLink } from "react-router-dom";
import { LayoutGrid, LogIn, Menu, Sparkles, UserPlus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export default function Home({ isOpen = true, toggleSidebar }) {
  const items = [
    { to: "/workshops", label: "כל הסדנאות", icon: LayoutGrid },
    { to: "/login", label: "התחברות", icon: LogIn },
    { to: "/register", label: "הרשמה", icon: UserPlus },
  ];

  return (
    <>
      {/* 🔘 Toggle Button (mobile only) */}
      <button
        onClick={toggleSidebar}
        className="fixed right-4 top-4 z-50 rounded-lg border border-slate-300 bg-white p-2 text-slate-700 shadow-sm sm:hidden"
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        dir="rtl"
        className={`fixed top-0 right-0 z-40 flex h-screen w-72 flex-col border-l border-indigo-200/60 bg-gradient-to-b from-indigo-50/95 via-sky-50/95 to-white text-slate-800 shadow-[0_8px_28px_rgba(99,102,241,.10)] backdrop-blur transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
          sm:translate-x-0`}
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
        </nav>

        <footer className="border-t border-indigo-200/70 px-6 py-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} סדנאות
        </footer>
      </aside>
    </>
  );
}
