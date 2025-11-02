/**
 * main.jsx
 * Role: Application module.
 *
 * - Entry point of the React app.
 * - Wraps the entire application with BrowserRouter and all context providers.
 */

import "./styles/index.css";
// client/src/main.jsx (or App.jsx)
import './styles/SimpleGCal.css';

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

// ✅ Context providers
import { AuthProvider } from "./layouts/AuthLayout";
import { WorkshopProvider } from "./layouts/WorkshopContext";
import { ProfileProvider } from "./layouts/ProfileContext";
import { EventProvider } from "./layouts/EventContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <EventProvider>
        <AuthProvider>
          <ProfileProvider>
            <WorkshopProvider>
              <App />
            </WorkshopProvider>
          </ProfileProvider>
        </AuthProvider>
      </EventProvider>
    </BrowserRouter>
  </React.StrictMode>
);
