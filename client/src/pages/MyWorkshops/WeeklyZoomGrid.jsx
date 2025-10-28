import React, {
  useRef,
  useState,
  useLayoutEffect,
  useCallback,
  useEffect,
} from "react";
import { useGesture } from "@use-gesture/react";
import { motion } from "framer-motion";

export default function WeeklyZoomGrid({ children }) {
  const gridRef = useRef(null);   // scroll layer + gesture target
  const scaleRef = useRef(null);  // transform layer
  const contentRef = useRef(null);// measured content (not transformed)

  const [zoom, setZoom] = useState(1);
  const [minZoom, setMinZoom] = useState(1);
  const [isPinching, setIsPinching] = useState(false);

  const zoomRef = useRef(1);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  const EPS = 0.0005;
  const MAX_ZOOM =
    typeof window !== "undefined" && window.innerWidth < 768 ? 1.6 : 1.9;

  /** Clamp scroll so we never see white gaps */
  const clampScrollToBounds = useCallback(() => {
    const el = gridRef.current;
    const content = contentRef.current;
    if (!el || !content) return;

    const z = zoomRef.current;
    const visW = el.clientWidth / z;
    const visH = el.clientHeight / z;

    const maxLeft = Math.max(0, content.scrollWidth - visW);
    const maxTop  = Math.max(0, content.scrollHeight - visH);

    el.scrollLeft = Math.min(Math.max(0, el.scrollLeft), maxLeft);
    el.scrollTop  = Math.min(Math.max(0, el.scrollTop),  maxTop);
  }, []);

  /**
   * Fit-to-width baseline (allow vertical scrolling like Google Calendar).
   * This avoids the “can’t scroll at min zoom” problem on phones.
   */
  const computeMinZoom = useCallback(() => {
    const el = gridRef.current;
    const content = contentRef.current;
    const scaler = scaleRef.current;
    if (!el || !content || !scaler) return;

    const prev = scaler.style.transform;
    scaler.style.transform = "none";
    const cw = content.scrollWidth  || 1;
    const vw = el.clientWidth       || 1;
    // FIT WIDTH ONLY
    const fitted = Math.min(vw / cw, 1) || 1;
    scaler.style.transform = prev;

    setMinZoom(prevMin => (Math.abs(prevMin - fitted) > EPS ? fitted : prevMin));
    setZoom(z => (z + EPS < fitted ? fitted : z));

    requestAnimationFrame(clampScrollToBounds);
  }, [clampScrollToBounds]);

  useLayoutEffect(() => {
    computeMinZoom();
    const onResize = () => computeMinZoom();
    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onResize);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onResize);
    };
  }, [computeMinZoom]);

  // Recompute when content resizes (safer than watching children renders)
  useLayoutEffect(() => {
    if (!contentRef.current) return;
    const ro = new ResizeObserver(() => computeMinZoom());
    ro.observe(contentRef.current);
    return () => ro.disconnect();
  }, [computeMinZoom]);

  /** Keep the same point under finger/mouse while zooming */
  const zoomAtViewportPoint = useCallback(
    (nextZoom, viewportX, viewportY) => {
      const el = gridRef.current;
      if (!el) return;
      const z = zoomRef.current;
      const target = Math.max(minZoom, Math.min(MAX_ZOOM, nextZoom));
      if (Math.abs(target - z) < EPS) return;

      const preX = el.scrollLeft + viewportX / z;
      const preY = el.scrollTop  + viewportY / z;

      setZoom(target);
      requestAnimationFrame(() => {
        el.scrollLeft = preX - viewportX / target;
        el.scrollTop  = preY - viewportY / target;
        clampScrollToBounds();
      });
    },
    [minZoom, clampScrollToBounds]
  );

  /** Pinch on the grid (non-passive), scroll remains native because touchAction allows pan */
  useGesture(
    {
      onPinchStart: ({ event }) => {
        if (event?.cancelable) event.preventDefault();
        setIsPinching(true);
        if (gridRef.current) gridRef.current.style.scrollBehavior = "auto";
      },
      onPinch: ({ offset: [d], origin: [ox, oy], event }) => {
        if (event?.cancelable) event.preventDefault();
        const rect = gridRef.current?.getBoundingClientRect();
        if (!rect) return;
        const vx = ox - rect.left;
        const vy = oy - rect.top;
        const next = minZoom * (1 + d / 200);
        zoomAtViewportPoint(next, vx, vy);
      },
      onPinchEnd: () => {
        setIsPinching(false);
        if (gridRef.current) gridRef.current.style.scrollBehavior = "smooth";
        requestAnimationFrame(clampScrollToBounds);
      },
    },
    {
      target: gridRef,
      eventOptions: { passive: false },
      pinch: { scaleBounds: { min: minZoom, max: MAX_ZOOM }, preventDefault: true, rubberband: 0.1 },
    }
  );

  /** Ctrl/Meta + wheel (trackpads) */
  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const onWheel = (e) => {
      if (!e.ctrlKey && !e.metaKey) return;
      if (e.cancelable) e.preventDefault();
      const rect = el.getBoundingClientRect();
      const vx = e.clientX - rect.left;
      const vy = e.clientY - rect.top;
      const next = zoomRef.current - e.deltaY * 0.001;
      zoomAtViewportPoint(next, vx, vy);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAtViewportPoint]);

  const resetZoom = () => {
    setZoom(z => (Math.abs(z - minZoom) > EPS ? minZoom : z));
    requestAnimationFrame(clampScrollToBounds);
  };

  return (
    <div
      ref={gridRef}
      className="max-w-7xl mx-auto overflow-auto rounded-2xl border border-indigo-100 bg-white shadow-sm flex justify-center items-start"
      style={{
        // allow native scrolling (pan) while we handle pinch via preventDefault
        touchAction: "pan-x pan-y",
        overscrollBehavior: "contain",
        scrollBehavior: "smooth",
        minHeight: "70vh",
        cursor: isPinching ? "grabbing" : "grab",
      }}
    >
      {/* transform wrapper keeps contentRef measure stable */}
      <motion.div
        ref={scaleRef}
        onDoubleClick={resetZoom}
        className="inline-block origin-top"
        style={{
          transform: `translateZ(0) scale(${zoom})`,
          transformOrigin: "center top",
          // ensure a sensible unscaled width so width-fit works well on phones
          minWidth: "calc(100px + 6 * 160px)", // 100px time-col + 6 day cols @160px
        }}
        transition={{ duration: 0.2, ease: "easeInOut" }}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div ref={contentRef}>{children}</div>
      </motion.div>

      <button
        onClick={resetZoom}
        className="fixed left-4 bottom-4 z-50 px-3 py-2 rounded-xl border border-indigo-200 bg-white/90 backdrop-blur hover:bg-indigo-50 text-indigo-700 shadow-sm transition"
        title="Reset zoom"
      >
        Reset Zoom
      </button>
    </div>
  );
}
