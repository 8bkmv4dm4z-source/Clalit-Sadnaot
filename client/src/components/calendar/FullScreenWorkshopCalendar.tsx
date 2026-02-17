"use client";

import * as React from "react";
import {
  add,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  parse,
  startOfToday,
  startOfWeek,
} from "date-fns";
import { he } from "date-fns/locale";
import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import useIsMobile from "@/hooks/useIsMobile";

type WorkshopEntityInfo = {
  name?: string;
  relation?: string;
  workshops?: Array<Record<string, unknown>>;
};

type FullScreenWorkshopCalendarProps = {
  workshopsByEntity: Record<string, WorkshopEntityInfo>;
  legendColorMap: Record<string, string>;
};

type CalendarEvent = {
  id: string;
  name: string;
  time: string;
  datetime: string;
  entityName: string;
  relation?: string;
  mine?: boolean;
  family?: boolean;
  color: string;
};

type CalendarData = {
  day: Date;
  events: CalendarEvent[];
};

const WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"];

const str = (x: unknown) => String(x ?? "");
const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
const toHhmm = (h: number) => {
  const hh = Math.floor(h);
  const mm = Math.round((h - hh) * 60);
  return `${pad2(hh)}:${pad2(mm)}`;
};

const atStartOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
};

const endOfDay = (d: Date) => {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
};

function parseHourToFloatFlexible(w: Record<string, unknown>) {
  const startDate = typeof w.startDate === "string" ? w.startDate : null;
  const raw =
    w.hour ??
    w.startTime ??
    w.time ??
    (startDate && startDate.includes("T") ? startDate.split("T")[1]?.slice(0, 5) : null);

  if (raw == null) return null;
  if (typeof raw === "number") return raw;

  const s = String(raw).trim();
  let m = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d{1,2})\.(\d{2})$/);
  if (m) return Number(m[1]) + Number(m[2]) / 60;
  m = s.match(/^(\d{1,2})$/);
  if (m) return Number(m[1]);
  return null;
}

function normalizeDays(w: Record<string, unknown>) {
  const raw = Array.isArray(w.days) ? w.days : [];
  const heDays: Record<string, number> = {
    "יום א": 0,
    "יום ב": 1,
    "יום ג": 2,
    "יום ד": 3,
    "יום ה": 4,
    "יום ו": 5,
    שבת: 6,
  };
  const enDays: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const shortDays: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  const out: number[] = [];
  for (const d of raw) {
    if (typeof d === "number" && d >= 0 && d <= 6) {
      out.push(d);
      continue;
    }
    const s = String(d).trim();
    if (s in enDays) out.push(enDays[s]);
    else if (s in heDays) out.push(heDays[s]);
    else if (s in shortDays) out.push(shortDays[s]);
  }

  if (!out.length && typeof w.startDate === "string") {
    const sd = new Date(w.startDate);
    if (!Number.isNaN(sd.getTime())) out.push(sd.getDay());
  }

  return out;
}

export function FullScreenWorkshopCalendar({
  workshopsByEntity,
  legendColorMap,
}: FullScreenWorkshopCalendarProps) {
  const today = startOfToday();
  const [selectedDay, setSelectedDay] = React.useState(today);
  const [currentMonth, setCurrentMonth] = React.useState(format(today, "MMM-yyyy"));
  const firstDayCurrentMonth = parse(currentMonth, "MMM-yyyy", new Date());
  const isMobile = useIsMobile(768);

  const days = React.useMemo(
    () =>
      eachDayOfInterval({
        start: startOfWeek(firstDayCurrentMonth, { weekStartsOn: 0 }),
        end: endOfWeek(endOfMonth(firstDayCurrentMonth), { weekStartsOn: 0 }),
      }),
    [firstDayCurrentMonth]
  );

  const data = React.useMemo<CalendarData[]>(() => {
    const gridStart = startOfWeek(firstDayCurrentMonth, { weekStartsOn: 0 });
    const gridEnd = endOfWeek(endOfMonth(firstDayCurrentMonth), { weekStartsOn: 0 });
    const byDay = new Map<string, CalendarEvent[]>();

    for (const [entityId, info] of Object.entries(workshopsByEntity || {})) {
      const color = legendColorMap?.[entityId] || "#475569";
      const entityName = info?.name || "משתתף";
      const relation = info?.relation || "";
      const mine = !relation;
      const workshops = Array.isArray(info?.workshops) ? info.workshops : [];

      for (const workshopRaw of workshops) {
        const w = workshopRaw as Record<string, unknown>;
        const hourFloat = parseHourToFloatFlexible(w);
        const dayIndices = normalizeDays(w);
        const hasRecurrence = dayIndices.length > 0;
        const durationMinutes =
          typeof w.durationMinutes === "number" ? w.durationMinutes : 90;

        const startBoundary =
          typeof w.startDate === "string" && !Number.isNaN(new Date(w.startDate).getTime())
            ? atStartOfDay(new Date(w.startDate))
            : null;
        const endBoundary =
          typeof w.endDate === "string" && !Number.isNaN(new Date(w.endDate).getTime())
            ? endOfDay(new Date(w.endDate))
            : null;

        if (hasRecurrence && hourFloat != null) {
          for (let d = new Date(gridStart); d <= gridEnd; d = add(d, { days: 1 })) {
            if (!dayIndices.includes(d.getDay())) continue;
            const dayStart = atStartOfDay(d);
            if (startBoundary && dayStart < startBoundary) continue;
            if (endBoundary && dayStart > endBoundary) continue;

            const [hh, mm] = toHhmm(hourFloat).split(":").map(Number);
            const start = new Date(d);
            start.setHours(hh, mm || 0, 0, 0);
            const end = new Date(start);
            end.setMinutes(end.getMinutes() + durationMinutes);

            const key = format(dayStart, "yyyy-MM-dd");
            const event: CalendarEvent = {
              id: `${str(w._id)}:${entityId}:${start.getTime()}`,
              name: str(w.title || "סדנה"),
              time: format(start, "HH:mm"),
              datetime: start.toISOString(),
              entityName,
              relation: relation || undefined,
              mine,
              family: !mine,
              color,
            };

            byDay.set(key, [...(byDay.get(key) || []), event]);
            void end;
          }
          continue;
        }

        let start =
          typeof w.startDate === "string" && !Number.isNaN(new Date(w.startDate).getTime())
            ? new Date(w.startDate)
            : null;

        if (!start && typeof w.date === "string" && hourFloat != null) {
          start = new Date(`${w.date}T${toHhmm(hourFloat)}:00`);
        }

        if (!start || Number.isNaN(start.getTime())) continue;
        if (start < gridStart || start > endOfDay(gridEnd)) continue;

        const key = format(start, "yyyy-MM-dd");
        const event: CalendarEvent = {
          id: `${str(w._id)}:${entityId}:${start.getTime()}`,
          name: str(w.title || "סדנה"),
          time: format(start, "HH:mm"),
          datetime: start.toISOString(),
          entityName,
          relation: relation || undefined,
          mine,
          family: !mine,
          color,
        };

        byDay.set(key, [...(byDay.get(key) || []), event]);
      }
    }

    return days.map((day) => {
      const key = format(day, "yyyy-MM-dd");
      const events = (byDay.get(key) || []).sort((a, b) => a.time.localeCompare(b.time));
      return { day, events };
    });
  }, [days, firstDayCurrentMonth, legendColorMap, workshopsByEntity]);

  const selectedDayEvents = React.useMemo(
    () => data.find((d) => isSameDay(d.day, selectedDay))?.events || [],
    [data, selectedDay]
  );

  function previousMonth() {
    setCurrentMonth(format(add(firstDayCurrentMonth, { months: -1 }), "MMM-yyyy"));
  }

  function nextMonth() {
    setCurrentMonth(format(add(firstDayCurrentMonth, { months: 1 }), "MMM-yyyy"));
  }

  function goToToday() {
    setCurrentMonth(format(today, "MMM-yyyy"));
    setSelectedDay(today);
  }

  return (
    <div dir="rtl" className="flex flex-1 flex-col rounded-3xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col space-y-4 border-b border-slate-200 bg-slate-50/70 p-4 md:flex-row md:items-center md:justify-between md:space-y-0">
        <div className="flex items-center gap-4">
          <div className="hidden w-20 flex-col items-center justify-center rounded-lg border border-slate-300 bg-white p-0.5 md:flex">
            <h1 className="p-1 text-xs text-slate-500">{format(today, "MMM", { locale: he })}</h1>
            <div className="flex w-full items-center justify-center rounded-lg border border-slate-200 bg-white p-0.5 text-lg font-bold text-slate-800">
              <span>{format(today, "d")}</span>
            </div>
          </div>
          <div className="flex flex-col">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">
              {format(firstDayCurrentMonth, "LLLL yyyy", { locale: he })}
            </h2>
            <p className="text-sm text-slate-500">
              {format(startOfWeek(firstDayCurrentMonth, { weekStartsOn: 0 }), "d MMM", {
                locale: he,
              })}{" "}
              -{" "}
              {format(endOfMonth(firstDayCurrentMonth), "d MMM yyyy", { locale: he })}
            </p>
          </div>
        </div>

        <div className="flex flex-col items-center gap-3 md:flex-row">
          <div className="inline-flex w-full rounded-lg border border-slate-300 bg-white shadow-sm shadow-black/5 md:w-auto">
            <Button onClick={previousMonth} variant="outline" size="icon" aria-label="חודש קודם">
              <ChevronRightIcon size={16} />
            </Button>
            <Button onClick={goToToday} variant="outline" className="rounded-none border-x-0">
              היום
            </Button>
            <Button onClick={nextMonth} variant="outline" size="icon" aria-label="חודש הבא">
              <ChevronLeftIcon size={16} />
            </Button>
          </div>
          <Separator orientation="vertical" className="hidden h-6 md:block" />
        </div>
      </div>

      <div className="grid grid-cols-7 border-y text-center text-xs font-semibold leading-6 text-slate-600">
        {WEEKDAY_LETTERS.map((label, idx) => (
          <div key={label} className={cn("py-2.5", idx !== 6 && "border-l")}>
            {label}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, dayIdx) => {
          const dayEvents = data.find((d) => isSameDay(d.day, day))?.events || [];
          const isSelected = isSameDay(day, selectedDay);
          const outsideMonth = !isSameMonth(day, firstDayCurrentMonth);

          return (
            <button
              key={dayIdx}
              type="button"
              onClick={() => setSelectedDay(day)}
              className={cn(
                "flex min-h-24 flex-col gap-1 border-l border-b p-2 text-right transition hover:bg-slate-50 md:min-h-28",
                outsideMonth && "bg-slate-50/70 text-slate-400",
                isSelected && "bg-slate-100"
              )}
            >
              <time
                dateTime={format(day, "yyyy-MM-dd")}
                className={cn(
                  "mr-auto flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
                  isToday(day) && !isSelected && "bg-slate-900 text-white",
                  isSelected && "bg-slate-700 text-white"
                )}
              >
                {format(day, "d")}
              </time>

              {dayEvents.slice(0, isMobile ? 2 : 3).map((event) => (
                <div
                  key={event.id}
                  className="truncate rounded-md px-1.5 py-1 text-[10px] font-medium text-white"
                  style={{ backgroundColor: event.color }}
                  title={`${event.name} • ${event.time}`}
                >
                  {event.time} · {event.name} {event.family ? "• משפחה" : "• שלי"}
                </div>
              ))}

              {dayEvents.length > (isMobile ? 2 : 3) && (
                <div className="text-[10px] text-slate-500">+{dayEvents.length - (isMobile ? 2 : 3)} נוספות</div>
              )}
            </button>
          );
        })}
      </div>

      <div className="border-t bg-slate-50/70 p-3">
        <div className="mb-2 text-xs font-semibold text-slate-700">
          אירועים בתאריך {format(selectedDay, "d MMMM yyyy", { locale: he })}
        </div>
        {selectedDayEvents.length ? (
          <div className="space-y-2">
            {selectedDayEvents.map((event) => (
              <div
                key={event.id}
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-800">{event.name}</div>
                  <div className="flex items-center gap-2 text-xs text-slate-500">
                    <span>{event.entityName}</span>
                    <span className={`rounded-full px-1.5 py-0.5 ${event.family ? "bg-indigo-100 text-indigo-700" : "bg-emerald-100 text-emerald-700"}`}>
                      {event.family ? "משפחה" : "שלי"}
                    </span>
                  </div>
                </div>
                <div className="rounded-md px-2 py-1 text-xs font-semibold text-white" style={{ backgroundColor: event.color }}>
                  {event.time}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-500">אין אירועים ביום זה.</p>
        )}
      </div>
    </div>
  );
}
