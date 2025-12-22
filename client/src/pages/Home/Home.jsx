import React from "react";
import { NavLink } from "react-router-dom";
import { Menu, X } from "lucide-react";

export default function Home({ isOpen = true, toggleSidebar }) {
  return (
    <>
      {/* 🔘 Toggle Button (mobile only) */}
      <button
        onClick={toggleSidebar}
        className="fixed top-4 right-4 z-50 bg-blue-600 text-white p-2 rounded-lg shadow-md sm:hidden"
      >
        {isOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      <aside
        dir="rtl"
        className={`fixed top-0 right-0 h-screen w-64 bg-gradient-to-b from-blue-500 via-blue-450 via-blue-400 via-blue-450 to-blue-500 text-white flex flex-col shadow-lg transform transition-transform duration-300 ease-in-out z-40
          ${isOpen ? "translate-x-0" : "translate-x-full"}
          sm:translate-x-0`}
      >
        <div className="px-6 py-8 border-b border-blue-500 text-center text-white">
<h2 className="text-2xl font-bold tracking-wide bg-gradient-to-b from-blue-900 via-blue-850 via-blue-800 via-blue-700 to-blue-650 bg-clip-text text-transparent">
   סדנאות
</h2>
        </div>

        <nav className="flex-1 px-4 py-6">
          <ul className="space-y-3">
            {["/workshops", "/login", "/register"].map((to, idx) => (
              <li key={to}>
                <NavLink
                  to={to}
                  onClick={() => toggleSidebar(false)}
                  className={({ isActive }) =>
                    `block rounded-lg px-4 py-2 text-white font-medium transition-all duration-200 ${
                      isActive
                        ? "bg-blue-800 text-blue-700 font-semibold shadow-2xl ring-2"
                        : "hover:bg-blue-300 hover:text-blue-900"
                    }`
                  }
                >
                  {idx === 0 ? "כל הסדנאות" : idx === 1 ? "התחברות" : "הרשמה"}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <footer className="px-6 py-4 border-t border-blue-500 text-sm text-blue-100 text-center">
          © {new Date().getFullYear()} סדנאות
        </footer>
      </aside>
    </>
  );
}
