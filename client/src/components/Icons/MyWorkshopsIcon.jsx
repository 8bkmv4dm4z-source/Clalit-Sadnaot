   /**
    * MyWorkshopsIcon.jsx
    * Path: src/Components/Icons/MyWorkshopsIcon.jsx
    * Role: Application module.
    *
    * Component: MyWorkshopsIcon
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

function MyWorkshopsIcon({ size = 24, color = "currentColor" }) {
  // --- Render ---
return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {/* משקולת / דמבל */}
      <rect x="1" y="9" width="3" height="6" rx="1" />
      <rect x="5" y="7" width="2" height="10" rx="1" />
      <rect x="17" y="7" width="2" height="10" rx="1" />
      <rect x="20" y="9" width="3" height="6" rx="1" />
      <line x1="7" y1="12" x2="17" y2="12" />
    </svg>
  );
}
export default MyWorkshopsIcon;



import React from "react";
