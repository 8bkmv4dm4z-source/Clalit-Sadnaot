import { motion } from "framer-motion";
import { CalendarDays, Clock3, MapPin, Users } from "lucide-react";
import type { ReactNode } from "react";

type WorkshopShowcaseCardProps = {
  workshop: {
    _id: string;
    title?: string;
    coach?: string;
    city?: string;
    hour?: string;
    days?: string[];
    participantsCount?: number;
    maxParticipants?: number;
    imageUrl: string;
    description?: string;
  };
  onOpen: (id: string) => void;
};

export default function WorkshopShowcaseCard({
  workshop,
  onOpen,
}: WorkshopShowcaseCardProps) {
  const {
    _id,
    title,
    coach,
    city,
    hour,
    days = [],
    participantsCount = 0,
    maxParticipants = 0,
    imageUrl,
    description,
  } = workshop;

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ duration: 0.28, ease: "easeOut" }}
      className="group overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl"
    >
      <div className="relative h-56 overflow-hidden">
        <img
          src={imageUrl}
          alt={title || "Workshop"}
          className="h-full w-full object-cover transition duration-500 group-hover:scale-105"
          loading="lazy"
        />
        <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/50 to-transparent" />
      </div>

      <div className="space-y-4 p-5">
        <div className="space-y-1">
          <h3 className="line-clamp-1 text-lg font-semibold text-slate-900">{title}</h3>
          <p className="line-clamp-2 text-sm text-slate-600">{description || "ללא תיאור נוסף"}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs text-slate-700">
          <InfoItem icon={<MapPin size={14} />} text={city || "ללא עיר"} />
          <InfoItem icon={<Clock3 size={14} />} text={hour || "שעה לא זמינה"} />
          <InfoItem
            icon={<CalendarDays size={14} />}
            text={days.length ? days.join(", ") : "ימים יתעדכנו"}
          />
          <InfoItem
            icon={<Users size={14} />}
            text={`${participantsCount}/${maxParticipants || "∞"}`}
          />
        </div>

        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-slate-800">{coach || "מאמן לא צוין"}</p>
          <button
            onClick={() => onOpen(_id)}
            className="rounded-xl bg-slate-900 px-3 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            עבור לכרטיס המלא
          </button>
        </div>
      </div>
    </motion.article>
  );
}

function InfoItem({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1">
      <span className="text-slate-500">{icon}</span>
      <span className="line-clamp-1">{text}</span>
    </div>
  );
}
