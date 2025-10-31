/**
 * LogoutIcon.jsx
 * Path: src/Components/Icons/LogoutIcon.jsx
 * Role: Application module.
 *
 * Component: LogoutIcon
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
 * (No explicit props or destructured props detected.)
 */

function LogoutIcon() {
  // --- Render ---
return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M16 13v-2H7V8l-5 4 5 4v-3h9zM20 3H8c-1.1 0-2 .9-2 2v4h2V5h12v14H8v-4H6v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z" />
    </svg>
  );
}
export default LogoutIcon;
