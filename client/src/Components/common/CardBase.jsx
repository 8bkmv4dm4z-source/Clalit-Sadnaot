import React from "react";

/**
 * CardBase — reusable card wrapper
 *
 * Provides consistent padding, border, and shadow for card-like
 * components.  Additional classes can be passed via the `className`
 * prop to customize the appearance (e.g. margin).  All children
 * passed to this component will be rendered inside the card.
 */
export default function CardBase({ children, className = "" }) {
  return (
    <div
      className={`bg-white border border-gray-200 rounded-2xl shadow-md p-4 ${className}`.trim()}
    >
      {children}
    </div>
  );
}