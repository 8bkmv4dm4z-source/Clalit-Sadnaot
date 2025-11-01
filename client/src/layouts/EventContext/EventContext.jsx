import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

const EventContext = createContext({
  publish: () => "",
  dismiss: () => {},
});

const DEFAULT_TTL = 6000;

function buildEvent(payload) {
  return {
    id: `evt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    type: payload.type || "info",
    title: payload.title || "",
    message: payload.message || "",
    ttl: payload.ttl === undefined ? DEFAULT_TTL : payload.ttl,
    meta: payload.meta || null,
    createdAt: Date.now(),
  };
}

export function EventProvider({ children }) {
  const [events, setEvents] = useState([]);
  const timersRef = useRef(new Map());

  const dismiss = useCallback((id) => {
    setEvents((prev) => prev.filter((event) => event.id !== id));
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
  }, []);

  const publish = useCallback(
    (payload) => {
      if (!payload || (!payload.title && !payload.message)) {
        return "";
      }

      const event = buildEvent(payload);
      setEvents((prev) => [...prev, event]);

      if (event.ttl) {
        const timer = setTimeout(() => dismiss(event.id), event.ttl);
        timersRef.current.set(event.id, timer);
      }

      return event.id;
    },
    [dismiss]
  );

  useEffect(() => {
    const timers = timersRef.current;
    return () => {
      timers.forEach((timer) => clearTimeout(timer));
      timers.clear();
    };
  }, []);

  const value = useMemo(
    () => ({
      publish,
      dismiss,
    }),
    [publish, dismiss]
  );

  const badgeStyles = {
    success: "bg-emerald-500/90 text-white",
    error: "bg-rose-500/90 text-white",
    warning: "bg-amber-500/90 text-white",
    info: "bg-sky-500/90 text-white",
  };

  return (
    <EventContext.Provider value={value}>
      {children}
      <div
        dir="rtl"
        className="fixed top-4 right-4 z-[9999] flex flex-col gap-3 max-w-sm w-[calc(100%-2rem)] sm:w-96"
        aria-live="polite"
        aria-atomic="true"
      >
        {events.map((event) => (
          <div
            key={event.id}
            role="alert"
            className={`rounded-2xl shadow-lg border border-white/40 backdrop-blur bg-white/80 overflow-hidden transition-all`}
          >
            <div
              className={`flex items-start justify-between px-4 py-3 ${
                badgeStyles[event.type] || badgeStyles.info
              }`}
            >
              <div className="pr-3">
                {event.title && (
                  <p className="text-sm font-semibold leading-tight">{event.title}</p>
                )}
                {event.message && (
                  <p className="text-xs leading-relaxed mt-0.5">{event.message}</p>
                )}
                {Array.isArray(event.meta?.details) && event.meta.details.length > 0 && (
                  <ul className="mt-2 space-y-1 text-[0.7rem] leading-relaxed list-disc pr-4">
                    {event.meta.details.map((detail, idx) => (
                      <li key={`${event.id}-detail-${idx}`}>{detail}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                onClick={() => dismiss(event.id)}
                className="text-white/80 hover:text-white text-lg leading-none"
                aria-label="סגור התראה"
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </EventContext.Provider>
  );
}

export const useEventBus = () => useContext(EventContext);
