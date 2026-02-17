import React, { useMemo } from "react";
import { Users2 } from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { flattenUserEntities } from "../../utils/entityTypes";
import { deriveWorkshopsByEntity } from "../../utils/workshopDerivation";
import { getWorkshopImage } from "../../constants/workshopImages";
import { StaggerTestimonials } from "@/components/ui/stagger-testimonials";

export default function MyWorkshopsCards() {
  const { isLoggedIn, user } = useAuth();
  const { mapsReady, displayedWorkshops, userWorkshopMap, familyWorkshopMap } =
    useWorkshops();

  if (!isLoggedIn) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-600">
        יש להתחבר כדי לצפות בסדנאות האישיות.
      </div>
    );
  }

  if (!mapsReady) {
    return (
      <div dir="rtl" className="min-h-screen flex items-center justify-center text-slate-500">
        טוען נתונים…
      </div>
    );
  }

  const { userEntity, familyMembers, allEntities } = flattenUserEntities(user || {});
  const workshopsByEntity = deriveWorkshopsByEntity({
    displayedWorkshops,
    userWorkshopMap,
    familyWorkshopMap,
    userEntity,
    user,
    familyMembers,
    allEntities,
  });

  const sections = useMemo(
    () =>
      Object.entries(workshopsByEntity)
        .map(([entityId, info]) => {
          const items = (info.workshops || []).slice(0, 10).map((w, idx) => ({
            tempId: idx + 1,
            testimonial: `${w.title || "סדנה"} • ${w.city || "מיקום יעודכן"} • ${w.hour || "שעה תעודכן"}`,
            by: info.relation ? `${info.name} (${info.relation})` : `${info.name}`,
            imgSrc: getWorkshopImage(w.image),
          }));

          return {
            id: entityId,
            name: info.name,
            relation: info.relation || "",
            count: info.workshops?.length || 0,
            items,
          };
        })
        .filter((s) => s.count > 0),
    [workshopsByEntity]
  );

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 p-4 md:p-8">
      <div className="mx-auto max-w-6xl rounded-3xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <h1 className="flex items-center gap-2 text-3xl font-extrabold tracking-tight text-slate-900">
          <Users2 className="text-slate-700" />
          הסדנאות שלי
        </h1>
        <p className="mt-2 text-sm text-slate-600">
          תצוגת כרטיסי Preview לכל בן משפחה לפי ההרשמות הקיימות.
        </p>
      </div>

      <div className="mx-auto mt-6 flex max-w-6xl flex-col gap-8">
        {sections.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-slate-500 shadow-sm">
            אין עדיין סדנאות להצגה.
          </div>
        ) : (
          sections.map((section) => (
            <section key={section.id} className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-6">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-lg font-semibold text-slate-900">
                  {section.name} {section.relation ? `(${section.relation})` : ""}
                </div>
                <span className="rounded-full border border-slate-300 bg-slate-100 px-3 py-1 text-xs font-medium text-slate-700">
                  {section.count} סדנאות
                </span>
              </div>
              <StaggerTestimonials items={section.items} height={500} />
            </section>
          ))
        )}
      </div>
    </div>
  );
}
