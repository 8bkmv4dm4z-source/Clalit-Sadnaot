// src/pages/MyWorkshops/ZoomContext.jsx
/**
 * ZoomContext.jsx
 * ----------------
 * Centralized zoom control for the weekly grid.
 * - Provides zoom, minZoom, and zoomAtViewportPoint()
 * - Handles pinch + wheel gestures
 */

import React, { createContext, useContext, useRef, useState, useLayoutEffect, useCallback } from "react";
import { useGesture } from "@use-gesture/react";

const ZoomContext = createContext();
export const useZoom = () => useContext(ZoomContext);

export default function ZoomProvider({ children }) {
  const gridRef = useRef(null);
  const contentRef = useRef(null);
  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);

  /* ---------------- Compute min zoom ---------------- */
  const computeMinZoom = useCallback(() => {
    const el = gridRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const prev = content.style.transform;
    content.style.transform = "none";
    const fitted = Math.min(el.clientWidth / content.scrollWidth, 1);
    content.style.transform = prev;
    setMinZoom(fitted);
    setZoom((z) => Math.max(z, fitted));
  }, []);

  useLayoutEffect(() => {
    computeMinZoom();
    window.addEventListener("resize", computeMinZoom);
    return () => window.removeEventListener("resize", computeMinZoom);
  }, [computeMinZoom]);

  /* ---------------- Focused zoom ---------------- */
  const zoomAtViewportPoint = useCallback(
    (nextZoom, viewportX, viewportY) => {
      const el = gridRef.current;
      const content = contentRef.current;
      if (!el || !content) return;
      const target = Math.max(minZoom, Math.min(1.8, nextZoom));
      const preX = el.scrollLeft + viewportX / zoom;
      const preY = el.scrollTop + viewportY / zoom;
      setZoom(target);
      requestAnimationFrame(() => {
        el.scrollLeft = preX - viewportX / target;
        el.scrollTop = preY - viewportY / target;
      });
    },
    [zoom, minZoom]
  );

  /* ---------------- Gestures ---------------- */
  useGesture(
    {
      onPinch: ({ offset: [d], origin: [ox, oy], event }) => {
        if (event.cancelable) event.preventDefault();
        const rect = gridRef.current.getBoundingClientRect();
        const vx = ox - rect.left;
        const vy = oy - rect.top;
        zoomAtViewportPoint(minZoom * (1 + d / 200), vx, vy);
      },
      onWheel: ({ event }) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const rect = gridRef.current.getBoundingClientRect();
        const next = zoom - event.deltaY * 0.001;
        zoomAtViewportPoint(next, event.clientX - rect.left, event.clientY - rect.top);
      },
    },
    {
      target: gridRef,
      eventOptions: { passive: false },
      pinch: { scaleBounds: { min: minZoom, max: 1.8 }, preventDefault: true },
    }
  );

  const resetZoom = () => setZoom(minZoom);

  return (
    <ZoomContext.Provider value={{ zoom, minZoom, setZoom, resetZoom, gridRef, contentRef }}>
      {children}
    </ZoomContext.Provider>
  );
}
