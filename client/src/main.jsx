/**
 * main.jsx
 * Path: src/main.jsx
 * Role: Application module.
 *
 * Description:
 * - Entry point of the React app.
 * - Wraps the entire application with BrowserRouter and all context providers.
 * - Each component folder has its own index.jsx exporting default.
 */
import "./styles/index.css";

import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";

// Import the Tailwind entrypoint.  This file pulls in Tailwind's base
// layers and component styles as well as custom component classes
// defined specifically for this design variant.  Without this import
// the Tailwind styles would not be applied.

// ✅ Context providers (each folder has index.jsx)
import { AuthProvider } from "./layouts/AuthLayout";
import { WorkshopProvider } from "./layouts/WorkshopContext";
import { ProfileProvider } from "./layouts/ProfileContext";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
  <BrowserRouter>
    <AuthProvider>
      <ProfileProvider> {/* ✅ Keep only this one */}
        <WorkshopProvider>
          <App />
        </WorkshopProvider>
      </ProfileProvider>
    </AuthProvider>
  </BrowserRouter>ד
</React.StrictMode>

);
