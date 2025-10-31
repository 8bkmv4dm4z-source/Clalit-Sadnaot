/**
 * HomeIcon.jsx
 * Path: src/Components/Icons/HomeIcon.jsx
 * Role: Application module.
 *
 * Component: HomeIcon
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

function HomeIcon() {
  // --- Render ---
return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 3l10 9h-3v9h-5v-6h-4v6H5v-9H2l10-9z" />
    </svg>
  );
}
export default HomeIcon;
