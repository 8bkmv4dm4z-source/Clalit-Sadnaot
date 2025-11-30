import { useEffect, useState } from "react";

/**
 * Responsive helper hook that flags whether the viewport is narrower than a given breakpoint.
 *
 * DATA FLOW
 * • Source: Components (e.g., calendars, layout shells) call `useIsMobile()` to adapt UI density.
 * • Flow: The hook reads `window.innerWidth` → stores boolean in local state → returns `isMobile` so the
 *   caller can branch its layout (e.g., show stacked lists vs. grids). No props are mutated because the hook
 *   exposes only derived state.
 * • Upstream: The resize event listener pushes updates into `setIsMobile`, triggering re-renders in any component
 *   using the hook. This keeps UI responsive without requiring global context.
 *
 * IMPLEMENTATION NOTES
 * • The initial state checks `typeof window` to remain SSR-safe. When executed in a non-browser context the hook
 *   defaults to `false` until mounted on the client.
 * • Cleanup removes the resize listener to avoid leaks when components unmount.
 *
 * @param {number} breakpointPx - Pixel width threshold; defaults to 768 (tablet cutoff).
 * @returns {boolean} Whether the viewport is currently considered mobile.
 */
export default function useIsMobile(breakpointPx = 768) {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < breakpointPx : false
  );

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < breakpointPx);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpointPx]);

  return isMobile;
}
