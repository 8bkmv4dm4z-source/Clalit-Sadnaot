/**
 * index.jsx
 * Path: src/layouts/AuthLayout/index.jsx
 * Role: Application module.
 *
 * Component: (default export)
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

// index.jsx
// קובץ עזר לייבוא ה־AuthProvider וחברי ההקשר מ־AuthLayout בצורה נוחה.
// במקום לייבא מתוך 'AuthLayout.jsx', ניתן פשוט לייבא מ־'layouts/AuthLayout'.
// eslint-disable-next-line react-refresh/only-export-components
export { AuthContext, AuthProvider, useAuth } from "./AuthLayout";
