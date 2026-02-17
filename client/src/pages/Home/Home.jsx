import React from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";

export default function Home({ isOpen = true, toggleSidebar }) {
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
        className={`fixed top-0 right-0 z-40 flex h-screen w-64 flex-col border-l border-slate-200 bg-white text-slate-800 shadow-sm transition-transform duration-300 ease-in-out
          ${isOpen ? "translate-x-0" : "translate-x-full"}
          sm:translate-x-0`}
      >
        <div className="border-b border-slate-200 px-6 py-8 text-center">
          <h2 className="text-2xl font-bold tracking-tight text-slate-900">סדנאות</h2>
        </div>

        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-3">
            {["/workshops", "/login", "/register"].map((to, idx) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => toggleSidebar(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-4 py-2 font-medium transition-all duration-200 ${
                      isActive
                        ? "border border-slate-300 bg-slate-100 font-semibold text-slate-900"
                        : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
                    }`
                  }
                >
                  {idx === 0 ? "כל הסדנאות" : idx === 1 ? "התחברות" : "הרשמה"}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <footer className="border-t border-slate-200 px-6 py-4 text-center text-sm text-slate-500">
          © {new Date().getFullYear()} סדנאות
        </footer>
      </aside>
    </>
  );
}
