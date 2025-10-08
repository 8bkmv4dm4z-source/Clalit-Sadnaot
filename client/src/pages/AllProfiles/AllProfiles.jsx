/**
 * AllProfiles.jsx — Tailwind Admin View
 * -------------------------------------
 * Fetches all users (admin only)
 * - GET /api/users
 * - Search, table display, and edit navigation
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

export default function AllProfiles() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // ✅ Fetch profiles from backend
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load users");
        setProfiles(data);
      } catch (err) {
        console.error("❌ Error fetching profiles:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  if (!isAdmin)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600 text-lg">
        ⛔ אין לך הרשאה לצפות בעמוד זה.
      </div>
    );

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500 animate-pulse">
        ⏳ טוען פרופילים...
      </div>
    );

  if (error)
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 font-medium">
        ❌ {error}
      </div>
    );

  // 🔍 Filter
  const filtered = profiles.filter((p) =>
    Object.values(p)
      .join(" ")
      .toLowerCase()
      .includes(search.toLowerCase())
  );

  const handleEdit = (id) => navigate(`/editprofile/${id}`);

  /* ==================== UI ==================== */
  return (
    <div
      dir="rtl"
      className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 px-6 flex flex-col items-center"
    >
      <div className="w-full max-w-6xl bg-white rounded-2xl shadow-xl p-8 animate-subtle-fade">
        {/* --- Header --- */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-3">
          <h2 className="text-3xl font-bold text-gray-900 font-[Poppins] text-center md:text-right">
            כלל המשתמשים
          </h2>
          <input
            type="text"
            placeholder="חפש לפי שם, אימייל, עיר או תפקיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full md:w-72 px-4 py-2 rounded-xl border border-gray-300 bg-gray-50 focus:ring-2 focus:ring-indigo-400 focus:outline-none text-sm text-gray-800"
          />
        </div>

        {/* --- Table --- */}
        <div className="overflow-x-auto">
          <table className="min-w-full border border-gray-200 rounded-lg overflow-hidden">
            <thead>
              <tr className="bg-indigo-50 text-indigo-800 text-sm">
                <th className="p-3 text-right font-semibold">שם</th>
                <th className="p-3 text-right font-semibold">אימייל</th>
                <th className="p-3 text-right font-semibold">עיר</th>
                <th className="p-3 text-right font-semibold">טלפון</th>
                <th className="p-3 text-right font-semibold">תפקיד</th>
                <th className="p-3 text-center font-semibold">גבייה</th>
                <th className="p-3 text-center font-semibold">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan="7"
                    className="text-center text-gray-500 py-6 font-medium"
                  >
                    לא נמצאו תוצאות מתאימות
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr
                    key={p._id}
                    className={`text-sm text-gray-700 ${
                      i % 2 === 0 ? "bg-white" : "bg-gray-50"
                    } hover:bg-indigo-50 transition`}
                  >
                    <td className="p-3">{p.name}</td>
                    <td className="p-3">{p.email}</td>
                    <td className="p-3">{p.city || "-"}</td>
                    <td className="p-3">{p.phone || "-"}</td>
                    <td className="p-3 capitalize">{p.role}</td>
                    <td className="p-3 text-center">
                      {p.canCharge ? "✅" : "❌"}
                    </td>
                    <td className="p-3 text-center">
                      <button
                        onClick={() => handleEdit(p._id)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-sm transition-all active:scale-95"
                      >
                        ערוך
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
