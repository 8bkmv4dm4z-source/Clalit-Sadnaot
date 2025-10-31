/**
 * ProfileIcon.jsx
 * Path: src/Components/Icons/ProfileIcon.jsx
 * Role: Application module.
 *
 * Component: ProfileIcon
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

function ProfileIcon() {
  // --- Render ---
return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M12 12c2.7 0 5-2.3 5-5s-2.3-5-5-5-5 2.3-5 5 2.3 5 5 5zm0 2c-3.3 0-10 1.7-10 5v3h20v-3c0-3.3-6.7-5-10-5z" />
    </svg>
  );
}
export default ProfileIcon;
