/**
 * AllProfiles.jsx — Unified Admin View (Users + Family)
 * -----------------------------------------------------
 * - Displays all users and their family members as unified rows
 * - Each family member marked with "בן משפחה של X"
 * - Same edit flow for both
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

// simple age helper (kept inline to avoid extra imports)
const calcAge = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
};

export default function AllProfiles() {
  const { isAdmin } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [userWorkshops, setUserWorkshops] = useState([]);
  const navigate = useNavigate();

  /* ==================== Fetch profiles ==================== */
  useEffect(() => {
    const fetchProfiles = async () => {
      try {
        const token = localStorage.getItem("token");
        const res = await fetch("/api/users", {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load users");

        // 🧩 Flatten users + familyMembers into unified list
        const unified = data.flatMap((user) => {
          const userRow = {
            ...user,
            isFamily: false,
            parentName: null,
            parentEmail: null,
            displayEmail: user.email,
            age: calcAge(user.birthDate),
            idNumber: user.idNumber || null,
          };
          const familyRows = (user.familyMembers || []).map((f) => ({
            parentId: user._id,
            ...f,
            isFamily: true,
            parentName: user.name,
            parentEmail: user.email,
            displayEmail: f.email || user.email, // ✅ fallback to parent's email
            age: calcAge(f.birthDate),
            idNumber: f.idNumber || null,
          }));
          return [userRow, ...familyRows];
        });

        setProfiles(unified);
      } catch (err) {
        console.error("❌ Error fetching profiles:", err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchProfiles();
  }, []);

  /* ==================== Guards ==================== */
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

  /* ==================== Search Filter ==================== */
  const filtered = profiles.filter((p) =>
    Object.values({
      name: p.name,
      email: p.displayEmail || p.email || p.parentEmail,
      city: p.city,
      phone: p.phone,
      relation: p.relation,
      idNumber: p.idNumber,
    })
      .join(" ")
      .toLowerCase()
      .startsWith(search.toLowerCase())
  );

  const handleEdit = (id) => navigate(`/editprofile/${id}`);

  /* ==================== Show Workshops ==================== */
  
const handleShowWorkshops = async (profile) => {
  try {
    const token = localStorage.getItem("token");
    const isFamily = !!profile.isFamily;
    const parentId = isFamily ? (profile.parentId || profile.parentUserId) : profile._id;

    const url = isFamily
      ? `/api/users/${parentId}/workshops?familyId=${profile._id}`
      : `/api/users/${profile._id}/workshops`;

    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Failed to fetch workshops");

    // ✅ סינון מדויק לפי המשתמש הנבחר
    const filteredData = Array.isArray(data)
      ? data.filter((w) => {
          if (isFamily) {
            return String(w.familyMemberId || "") === String(profile._id);
          } else {
            return !w.familyMemberId;
          }
        })
      : [];

    setUserWorkshops(filteredData);

    const title = profile.isFamily
      ? `${profile.name} (${profile.relation || "בן משפחה"})`
      : profile.name;
    setModalTitle(title);
    setShowModal(true);
  } catch (err) {
    console.error("❌ Error fetching user workshops:", err);
    alert(err.message);
  }
};


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
            כלל המשתמשים ובני המשפחה
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
                <th className="p-3 text-right font-semibold">טלפון</th>
                <th className="p-3 text-right font-semibold">עיר</th>
                <th className="p-3 text-right font-semibold">ת.ז</th>
                <th className="p-3 text-right font-semibold">גיל</th>
                <th className="p-3 text-right font-semibold">תפקיד</th>
                <th className="p-3 text-right font-semibold">קשר משפחתי</th>
                <th className="p-3 text-center font-semibold">גבייה</th>
                <th className="p-3 text-center font-semibold">פעולות</th>
              </tr>
            </thead>

            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan="10"
                    className="text-center text-gray-500 py-6 font-medium"
                  >
                    לא נמצאו תוצאות מתאימות
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr
                    key={p._id}
                    className={`text-sm ${
                      p.isFamily
                        ? "bg-green-50 hover:bg-green-100"
                        : i % 2 === 0
                        ? "bg-white"
                        : "bg-gray-50"
                    } transition`}
                  >
                    <td className="p-3 font-medium text-gray-800 flex items-center gap-2">
                      {p.name}
                      {p.isFamily && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          בן משפחה של {p.parentName}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-gray-700">
                      {p.displayEmail || p.email || p.parentEmail || "-"}
                    </td>
                    <td className="p-3 text-gray-700">{p.phone || "-"}</td>
                    <td className="p-3 text-gray-700">{p.city || "-"}</td>
                    <td className="p-3 text-gray-700">{p.idNumber || "-"}</td>
                    <td className="p-3 text-gray-700">{p.age ?? "-"}</td>
                    <td className="p-3 capitalize text-gray-700">
                      {p.isFamily ? "family" : p.role}
                    </td>
                    <td className="p-3 text-gray-700">
                      {p.isFamily ? p.relation || "-" : "-"}
                    </td>
                    <td className="p-3 text-center">
                      {p.canCharge ? "✅" : "❌"}
                    </td>
                    <td className="p-3 text-center">
                      <div className="flex flex-col sm:flex-row gap-2 justify-center">
                        <button
                          onClick={() => handleEdit(p._id)}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded-lg text-sm transition-all active:scale-95"
                        >
                          ערוך
                        </button>
                        <button
                          onClick={() => handleShowWorkshops(p)}
                          className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded-lg text-sm transition-all active:scale-95"
                        >
                          סדנאות
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for displaying workshops */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-y-auto p-6 animate-subtle-fade">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              סדנאות עבור {modalTitle}
            </h3>
            {userWorkshops.length === 0 ? (
              <p className="text-gray-500">אין סדנאות רשומות.</p>
            ) : (
              <ul className="space-y-3">
                {userWorkshops.map((ws, idx) => (
                  <li key={idx} className="border border-gray-200 rounded-lg p-3">
                    <div className="font-semibold text-gray-900">{ws.title}</div>
                    <div className="text-sm text-gray-600">
                      {ws.coach} — {ws.day} {ws.hour}
                    </div>
                    <div className="text-xs text-gray-500">{ws.relation}</div>
                  </li>
                ))}
              </ul>
            )}
            <button
              onClick={() => setShowModal(false)}
              className="mt-6 bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg w-full transition active:scale-95"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
