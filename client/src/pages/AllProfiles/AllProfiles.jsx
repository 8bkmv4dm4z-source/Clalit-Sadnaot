/**
 * AllProfiles.jsx — Unified Admin View (Users + Family)
 * -----------------------------------------------------
 * - Displays all users and their family members as unified rows
 * - Each family member marked with "בן משפחה של X"
 * - Supports both admin manage mode and "select mode" for Workshop modal
 * - Supports `existingIds` to disable already-registered users
 */

import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { apiFetch } from "../../utils/apiFetch";

// 🔹 helper to calculate age
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

export default function AllProfiles({ mode = "manage", onSelectUser, existingIds = [] }) {
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
        const res = await apiFetch("/api/users");
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "Failed to load users");

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
            displayEmail: f.email || user.email,
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
      .includes(search.toLowerCase())
  );

  const handleEdit = (id) => navigate(`/editprofile/${id}`);

  /* ==================== Show Workshops ==================== */
  const handleShowWorkshops = async (profile) => {
    try {
      const isFamily = !!profile.isFamily;
      const parentId = isFamily ? profile.parentId || profile.parentUserId : profile._id;

      const url = isFamily
        ? `/api/users/${parentId}/workshops?familyId=${profile._id}`
        : `/api/users/${profile._id}/workshops`;

      const res = await apiFetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch workshops");

      const filteredData = Array.isArray(data)
        ? data.filter((w) =>
            isFamily ? String(w.familyMemberId) === String(profile._id) : !w.familyMemberId
          )
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
      className={
        mode === "select"
          ? "w-full bg-white border rounded-xl shadow-inner p-4"
          : "min-h-screen flex flex-col items-center bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 px-6"
      }
    >
      <div
        className={
          mode === "select"
            ? "w-full"
            : "w-full max-w-6xl container-box p-8 animate-subtle-fade"
        }
      >
        {/* --- Header --- */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 gap-4">
          <h2 className="text-3xl font-bold text-indigo-700">
            {mode === "select" ? "בחר משתתף להוספה לסדנה" : "כלל המשתמשים ובני המשפחה"}
          </h2>
          <input
            type="text"
            placeholder="חפש לפי שם, אימייל, עיר או תפקיד..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input md:w-72 w-full"
          />
        </div>

        {/* --- Table --- */}
        <div className="overflow-x-auto">
          <table className="table text-sm">
            <thead>
              <tr>
                <th>שם</th>
                <th>אימייל</th>
                <th>טלפון</th>
                <th>עיר</th>
                <th>ת.ז</th>
                <th>גיל</th>
                <th>קשר</th>
                <th className="text-center">
                  {mode === "select" ? "בחר" : "פעולות"}
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan="8" className="text-center text-gray-500 py-6 font-medium">
                    לא נמצאו תוצאות מתאימות
                  </td>
                </tr>
              ) : (
                filtered.map((p, i) => (
                  <tr
                    key={p._id}
                    className={`transition ${
                      p.isFamily
                        ? "bg-green-50 hover:bg-green-100"
                        : i % 2 === 0
                        ? "bg-white"
                        : "bg-gray-50"
                    }`}
                  >
                    <td className="p-3 font-medium text-gray-800">
                      {p.name}
                      {p.isFamily && (
                        <span className="ml-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                          בן משפחה של {p.parentName}
                        </span>
                      )}
                    </td>
                    <td className="p-3">{p.displayEmail || p.email || p.parentEmail || "-"}</td>
                    <td className="p-3">{p.phone || "-"}</td>
                    <td className="p-3">{p.city || "-"}</td>
                    <td className="p-3">{p.idNumber || "-"}</td>
                    <td className="p-3">{p.age ?? "-"}</td>
                    <td className="p-3">{p.relation || (p.isFamily ? "בן משפחה" : "-")}</td>
                    <td className="p-3 text-center">
                      {mode === "select" ? (
                        <button
                          onClick={() => onSelectUser?.(p._id)}
                          disabled={existingIds.includes(p._id)}
                          className={`btn text-xs ${
                            existingIds.includes(p._id)
                              ? "bg-gray-300 text-gray-500 cursor-not-allowed"
                              : "btn-primary px-3 py-1"
                          }`}
                        >
                          {existingIds.includes(p._id) ? "כבר רשום" : "➕ הוסף"}
                        </button>
                      ) : (
                        <div className="flex flex-col sm:flex-row gap-2 justify-center">
                          <button
                            onClick={() => handleEdit(p._id)}
                            className="btn btn-primary text-xs px-3 py-1"
                          >
                            ערוך
                          </button>
                          <button
                            onClick={() => handleShowWorkshops(p)}
                            className="btn bg-green-600 hover:bg-green-700 text-white text-xs px-3 py-1"
                          >
                            סדנאות
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal for displaying workshops (unchanged for manage mode) */}
      {mode === "manage" && showModal && (
        <div className="modal-bg">
          <div className="modal-content max-h-[80vh] overflow-y-auto">
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
              className="btn btn-danger w-full mt-6"
            >
              סגור
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
