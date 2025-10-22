/**
 * MyWorkshopsWrapper.jsx
 * -----------------------
 * Bridge between WorkshopContext data and the MyWorkshops calendar page.
 *
 * ✅ Responsibilities:
 * - Fetch workshops data from context (no extra API calls)
 * - Derive workshops grouped by user & family members
 * - Pass normalized props into <MyWorkshops />
 *
 * 🧩 Used in:
 *   AppRoutes.jsx → <Route path="/myworkshops" element={<MyWorkshopsWrapper />} />
 */

import React, { useMemo } from "react";
import { useAuth } from "./AuthLayout";
import { useWorkshops } from "./WorkshopContext";
import MyWorkshops from "../pages/MyWorkshops/MyWorkshops";

export default function MyWorkshopsWrapper() {
  const { user, isLoggedIn } = useAuth();
  const { loading, error, displayedWorkshops } = useWorkshops();

  /**
   * Build mapping: { entityId: { name, relation, workshops[] } }
   * Reuses the same logic as Workshops.jsx (the “mine” mode)
   */
  const workshopsByEntity = useMemo(() => {
    if (!user) return {};

    // Filter only workshops where the user or their family is registered
    const related = (displayedWorkshops || []).filter(
      (w) =>
        w.isUserRegistered ||
        (Array.isArray(w.userFamilyRegistrations) &&
          w.userFamilyRegistrations.length > 0)
    );

    const map = {};

    // Main user
    map[user._id] = {
      name: user.fullName || user.name || "אני",
      relation: "",
      workshops: related.filter((w) => w.isUserRegistered),
    };

    // Family members
    (user.familyMembers || []).forEach((member) => {
      const memberWorkshops = related.filter((w) =>
        (w.userFamilyRegistrations || []).some(
          (r) => String(r) === String(member._id)
        )
      );
      if (memberWorkshops.length)
        map[member._id] = {
          name: member.name,
          relation: member.relation || "",
          workshops: memberWorkshops,
        };
    });

    return map;
  }, [user, displayedWorkshops]);

  /**
   * 🔹 Pass-through props:
   * user, isLoggedIn, loading, error, workshopsByEntity
   * MyWorkshops itself handles visualization & filtering logic.
   */
  return (
    <MyWorkshops
      user={user}
      isLoggedIn={isLoggedIn}
      loading={loading}
      error={error}
      workshopsByEntity={workshopsByEntity}
    />
  );
}
