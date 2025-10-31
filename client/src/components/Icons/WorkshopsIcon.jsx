   /**
    * WorkshopsIcon.jsx
    * Path: src/Components/Icons/WorkshopsIcon.jsx
    * Role: Application module.
    *
    * Component: WorkshopsIcon
    * Summary:
    * - Provides the main responsibilities of this module.
    * - Comments are written in English only.
    * - Logic is unchanged; documentation and structure notes were added.
    * Sections:
    * - Imports
    * - State & Context
    * - Derived data (memoized computations)
    * - Event handlers (navigation, form, filters)
    * - Render (JSX structure)
    * Data flow:
    * - Props -> local hooks -> derived values -> UI.
    * - Context (if used) is read-only here unless setter functions are invoked.
    * Props:

* @param {any} size - See inline comments for how this prop is used.
* @param {any} color - See inline comments for how this prop is used.
    */

import React from "react";

// --- State, context & derived data below ---

function WorkshopsIcon({ size = 24, color = "currentColor" }) {
 // --- Render ---
return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M4 6h16v2H4V6zm0 5h16v2H4v-2zm0 5h10v2H4v-2z" />
    </svg>
  );
}

export default WorkshopsIcon;
