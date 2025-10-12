/**
 * AppRoutes.jsx
 * Path: src/routes/AppRoutes/AppRoutes.jsx
 * Role: Handles all public and protected routes (with admin layer)
 */

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";

// 🧩 Pages
import Home from "../../pages/Home";
import Login from "../../pages/Login";
import Register from "../../pages/Register";
import Verify from "../../pages/Verify";
import Profile from "../../pages/Profile";
import Workshops from "../../pages/Workshops/Workshops";
import EditWorkshop from "../../pages/EditWorkshop";
import AllProfiles from "../../pages/AllProfiles";
import EditProfile from "../../pages/EditProfile";

// 🧭 Components
import Header from "../../Components/Header";

function AppRoutes() {
  const {
    isLoggedIn,
    logout,
    searchQuery,
    setSearchQuery,
    filters,
    setFilters,
    loading,
    isAdmin,
  } = useAuth();

  /** 🔹 Logout handler */
  const onLogout = () => {
    setSearchQuery("");
    setFilters({});
    logout();
  };

  /** 🕒 Show loading screen during auth check */
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-600 text-lg">
        ⏳ טוען את המערכת...
      </div>
    );
  }

  return (
    <div className="app-layout min-h-screen flex flex-col bg-gray-50" dir="rtl">
      {/* ✅ Header appears only when logged in */}
      {isLoggedIn && <Header onLogout={onLogout} />}

      {/* 🏠 Public Home for guests */}
      {!isLoggedIn && <Home />}

      <main className="flex-1 p-0">
        <Routes>
          {/* 🔓 Public routes */}
          <Route path="/workshops" element={<Workshops />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/verify" element={<Verify />} />

          {/* 🔐 Protected routes */}
          {isLoggedIn && (
            <>
              <Route path="/myworkshops" element={<Workshops />} />
              <Route path="/profile" element={<Profile />} />

              {/* 👑 Admin-only routes */}
              {isAdmin && (
                <>
                  <Route path="/profiles" element={<AllProfiles />} />
                  <Route path="/editprofile/:id" element={<EditProfile />} />

                  {/* ✳️ Workshop management */}
                  <Route path="/editworkshop" element={<EditWorkshop />} />
                  <Route path="/editworkshop/:id" element={<EditWorkshop />} />
                  <Route path="/editworkshop/new" element={<EditWorkshop />} />
                </>
              )}
            </>
          )}

          {/* ↩️ Redirects */}
          <Route path="/" element={<Navigate to="/workshops" replace />} />
          <Route path="*" element={<Navigate to="/workshops" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default AppRoutes;
