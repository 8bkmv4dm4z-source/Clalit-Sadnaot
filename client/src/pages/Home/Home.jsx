import React from "react";
import { NavLink } from "react-router-dom";

export default function Home() {
  return (
    <aside
      dir="rtl"
      className="fixed top-0 right-0 h-screen w-64 bg-gradient-to-b from-blue-600 to-blue-400 text-white flex flex-col shadow-lg"
    >
      <div className="px-6 py-8 border-b border-blue-500 text-center">
        <h2 className="text-2xl font-bold tracking-wide">כללית סדנאות</h2>
      </div>
      <nav className="flex-1 px-4 py-6">
        <ul className="space-y-3">
          {['/workshops','/login','/register'].map((to, idx) => (
            <li key={to}>
              <NavLink
                to={to}
                className={({ isActive }) =>
                  `block rounded-lg px-4 py-2 text-white font-medium transition-all duration-200 ${
                    isActive
                      ? "bg-white text-blue-700 font-semibold shadow-sm ring-2 ring-white/60"
                      : "hover:bg-blue-300 hover:text-blue-900"
                  }`
                }
              >
                {idx===0 ? "כל הסדנאות" : idx===1 ? "התחברות" : "הרשמה"}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <footer className="px-6 py-4 border-t border-blue-500 text-sm text-blue-100 text-center">
        © {new Date().getFullYear()} כללית סדנאות
      </footer>
    </aside>
  );
}
