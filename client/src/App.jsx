/**
 * High-level application shell.
 *
 * DATA FLOW (frontend entrypoint)
 * ───────────────────────────────
 * • Source: The React tree is hydrated from index.jsx; no props are injected here because the
 *   top-level <App /> is rendered directly by ReactDOM.
 * • Path: <App /> simply renders <AppRoutes />, which configures routing and decides which
 *   page components mount based on the current location.
 * • Transformations: No local state or derived data are created; <AppRoutes /> is responsible
 *   for reading authentication state, contexts, and fetching data.
 * • Downstream: All UI and network requests originate from components nested within
 *   <AppRoutes />. Any callbacks or context providers defined deeper in the tree propagate
 *   updates upward via React context or router navigation, not through props here.
 *
 * API FLOW
 * ────────
 * • This file does not issue API calls. API calls begin in routed pages (e.g., Login, Workshops)
 *   after <AppRoutes /> selects them based on the URL.
 *
 * COMPONENT LOGIC
 * ───────────────
 * • Purpose: Serve as a minimal host so routing logic remains isolated in routes/AppRoutes.
 * • State: None. Any auth or data state is owned by context providers in AppRoutes.
 * • Effects: None. All lifecycle logic is delegated to children.
 * • Props: None received; therefore there is no downward prop propagation or upward callbacks
 *   to document within this component.
 * • Visual states: Single stable state rendering the router; no conditional branches.
 */
import React from "react";
import AppRoutes from "./routes/AppRoutes";

function App() {
  /**
   * Render the routing system.
   *
   * Rationale: Centralizing the router keeps index.jsx simple and lets AppRoutes provide any
   * context providers or layouts needed before defining <Routes>. Keeping logic minimal here
   * avoids unnecessary re-renders or state duplication at the app root.
   */
  return <AppRoutes />;
}

export default App;
