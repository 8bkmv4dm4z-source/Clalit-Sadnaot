   /**
    * UsersIcon.jsx
    * Path: src/Components/Icons/UsersIcon.jsx
    * Role: Application module.
    *
    * Component: UsersIcon
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

export default function UsersIcon({ size = 22, color = "#1c4e80" }) {
  // --- Render ---
return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      strokeWidth="1.7"
      stroke={color}
      width={size}
      height={size}
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M17 20v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2m14-6a4 4 0 100-8 4 4 0 000 8zm6 6v-2a4 4 0 00-3-3.87M9 10a4 4 0 100-8 4 4 0 000 8z"
      />
    </svg>
  );
}
