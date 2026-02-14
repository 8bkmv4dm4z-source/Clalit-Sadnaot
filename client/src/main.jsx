/**
 * main.jsx — React entry point
 *
 * DATA FLOW
 * - The browser loads this bundle first and mounts React into the #root element.
 * - BrowserRouter wraps <App /> so that every nested component can participate in client-side routing and generate
 *   <Link> navigation events without hard refreshes.
 * - Context providers (Event → Auth → Profile → Workshop) are stacked so data requirements flow downward in a
 *   deterministic order:
 *     1) EventProvider loads calendar/workshop events and exposes them for list & calendar UIs.
 *     2) AuthProvider manages tokens + user identity and exposes callbacks (login/logout/register) consumed by pages.
 *     3) ProfileProvider fetches the authenticated user's profile and exposes update handlers for edit screens.
 *     4) WorkshopProvider pulls workshop datasets + filters and provides mutations for create/edit flows.
 * - The <App /> component only renders once these providers are mounted, ensuring any page has immediate access to
 *   the relevant context values.
 *
 * STYLING FLOW
 * - Global CSS (index.css) is imported before React renders so Tailwind resets and theme tokens are available.
 * - SimpleGCal CSS is also imported so calendar-specific styles are present before mounting calendar components.
 *
 * COMPONENT LOGIC
 * - This file keeps no local state; it simply orchestrates provider composition and defers all business logic to the
 *   providers and routed pages.
 */

import "./styles/index.css";
import "./styles/SimpleGCal.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "sonner";
import App from "./App";

// ✅ Context providers
import { AuthProvider } from "./layouts/AuthLayout";
import { WorkshopProvider } from "./layouts/WorkshopContext";
import { ProfileProvider } from "./layouts/ProfileContext";
import { EventProvider } from "./layouts/EventContext";
import { AdminCapabilityProvider } from "./context/AdminCapabilityContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <EventProvider>
        <AuthProvider>
          <AdminCapabilityProvider>
            <ProfileProvider>
              <WorkshopProvider>
                <App />
                <Toaster
                  dir="rtl"
                  position="top-center"
                  richColors
                  closeButton
                />
              </WorkshopProvider>
            </ProfileProvider>
          </AdminCapabilityProvider>
        </AuthProvider>
      </EventProvider>
    </BrowserRouter>
  </React.StrictMode>
);
