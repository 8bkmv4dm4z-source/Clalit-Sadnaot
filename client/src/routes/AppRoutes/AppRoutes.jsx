/**
 * Central routing map for the client UI.
 *
 * DATA FLOW
 * ---------
 * • Source: Authentication status is pulled from the AuthLayout context (useAuth). That context
 *   in turn reads tokens/user info from local storage and API validation (see
 *   layouts/AuthLayout/AuthLayout.jsx for lifecycle details).
 * • Path when logged in: isLoggedIn/loading flags determine which <Route> tree renders. The router
 *   mounts AppShell which provides WorkshopContext/ProfileContext etc.; those contexts fetch data
 *   (workshops, profiles) and pass it downward as props to page components like <Workshops /> and
 *   <Profile />.
 * • Path when logged out: PublicLayout renders without protected contexts; pages call APIs that do
 *   not require auth (e.g., login/register) and manage their own local state.
 * • Transformations: No data mutation here; the router only decides which components mount. Any
 *   navigation calls bubble up via <Navigate> which updates the URL and thus reruns this component.
 *
 * API FLOW
 * --------
 * • This file does not make API calls. It indirectly controls them by choosing which page
 *   components render. For example, selecting <Workshops /> triggers fetches to /api/workshops
 *   inside that page; selecting <Profile /> triggers /api/users/getMe.
 * • Auth requirements: Protected routes sit behind the isLoggedIn branch; admin-only routes depend
 *   on the admin capability probe. Public routes skip auth middleware.
 *
 * COMPONENT LOGIC
 * ---------------
 * • Purpose: Map URL paths to page components while honoring authentication/authorization state.
 * • State: Derived booleans isLoggedIn/loading from context; no local state.
 * • Effects: None; conditional rendering is synchronous based on context values.
 * • Visual states: Loading placeholder → authenticated routes → public routes. Fallback routes
 *   redirect to /workshops to keep users within expected pages.
 */

import React from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../../layouts/AuthLayout";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";

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
import MyWorkshopsCards from "../../pages/MyWorkshops/MyWorkshopsCards";
import ForgotPassword from "../../pages/ForgotPassword";
import ResetPassword from "../../pages/ResetPassword";
import AdminHub from "../../pages/AdminHub/AdminHub";

// 🧭 Layouts
import AppShell from "../../layouts/AppShell";
import PublicLayout from "../../layouts/PublicLayout";

/* ============================================================
   🔹 Main Routing Tree
   ============================================================ */
export default function AppRoutes() {
  const { isLoggedIn, loading } = useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();

  if (loading || (isLoggedIn && isChecking)) {
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
          <Route path="/workshops-calendar" element={<MyWorkshopsSimpleGcal />} />
          <Route path="/workshops-calendar/*" element={<MyWorkshopsSimpleGcal />} />
          <Route path="/myworkshops" element={<MyWorkshopsCards />} />

          <Route path="/profile" element={<Profile />} />
          {canAccessAdmin && (
            <>
              <Route path="/profiles" element={<AllProfiles />} />
              <Route path="/editprofile/:id" element={<EditProfile />} />
              <Route path="/editworkshop" element={<EditWorkshop />} />
              <Route path="/editworkshop/:id" element={<EditWorkshop />} />
              <Route path="/editworkshop/new" element={<EditWorkshop />} />
              <Route path="/admin/hub" element={<AdminHub />} />
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
