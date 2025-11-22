/**
 * AppRoutes.jsx — Updated with MyWorkshops Route
 * ----------------------------------------------
 * - Keeps Workshops (grid view) and MyWorkshops (calendar view) separate.
 * - Both share the same AppShell layout and WorkshopContext.
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
import MyWorkshopsSimpleGcal from '../../pages/MyWorkshops/MyWorkshopsSimpleGcal';
import ForgotPassword from "../../pages/ForgotPassword";
import ResetPassword from "../../pages/ResetPassword";
import { useWorkshops } from "../../layouts/WorkshopContext";   

// 🧭 Layouts
import AppShell from "../../layouts/AppShell";
import PublicLayout from "../../layouts/PublicLayout";

/* ============================================================
   🔹 Main Routing Tree
   ============================================================ */
export default function AppRoutes() {
  const { isLoggedIn, isAdmin, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-gray-50 text-gray-600 text-lg">
        Loading…
      </div>
    );
  }

  // 🔐 Logged-in user routes
  if (isLoggedIn) {
    return (
      <Routes>
        <Route path="/resetpassword" element={<ResetPassword />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route element={<AppShell />}>
          <Route path="/workshops" element={<Workshops />} />
           <Route path="/myworkshops" element={<MyWorkshopsSimpleGcal />} />
<Route path="/myworkshops/*" element={<MyWorkshopsSimpleGcal />} />

          <Route path="/profile" element={<Profile />} />
          {isAdmin && (
            <>
              <Route path="/profiles" element={<AllProfiles />} />
              <Route path="/editprofile/:id" element={<EditProfile />} />
              <Route path="/editworkshop" element={<EditWorkshop />} />
              <Route path="/editworkshop/:id" element={<EditWorkshop />} />
              <Route path="/editworkshop/new" element={<EditWorkshop />} />
            </>
          )}
        </Route>

        {/* defaults while logged-in */}
        <Route path="/" element={<Navigate to="/workshops" replace />} />
        <Route path="*" element={<Navigate to="/workshops" replace />} />
      </Routes>
    );
  }

  // 🔓 Public (logged-out) routes
  return (
    <Routes>
      <Route path="/resetpassword" element={<ResetPassword />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route element={<PublicLayout />}>
        <Route path="/workshops" element={<Workshops />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/verify" element={<Verify />} />
        <Route path="/home" element={<Home />} />
      </Route>

      <Route path="/" element={<Navigate to="/workshops" replace />} />
      <Route path="*" element={<Navigate to="/workshops" replace />} />
    </Routes>
  );
}
