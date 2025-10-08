import React, { createContext, useContext, useEffect, useState } from "react";

const WorkshopContext = createContext();

export const WorkshopProvider = ({ children }) => {
  const [workshops, setWorkshops] = useState([]);
  const [registeredWorkshopIds, setRegisteredWorkshopIds] = useState([]);
  const [displayedWorkshops, setDisplayedWorkshops] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("all"); // "all" | "mine"
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);

  /** 🔹 Fetch all workshops */
  const fetchAllWorkshops = async () => {
    console.log("🔄 [Context] Fetching ALL workshops...");
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`/api/workshops`);
      console.log("📡 [Context] /api/workshops → status:", res.status);

      const data = await res.json();
      console.log("📦 [Context] Workshops data received:", data);

      if (!res.ok) throw new Error(data.message || "Failed to fetch workshops");

      const list = Array.isArray(data) ? data : [];
      setWorkshops(list);
      setDisplayedWorkshops(list);
      console.log("✅ [Context] Workshops updated:", list.length);
    } catch (err) {
      setError(err.message);
      console.error("❌ [Context] Fetch error:", err);
    } finally {
      setLoading(false);
    }
  };

  /** 🔹 Fetch only user's registered workshops */
  const fetchRegisteredWorkshops = async () => {
    console.log("🔄 [Context] Fetching registered workshops...");
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      console.log("🔑 [Context] Token found:", !!token);

      const res = await fetch(`/api/workshops/registered`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("📡 [Context] /registered status:", res.status);

      const regIds = await res.json();
      console.log("📦 [Context] Registered workshops data:", regIds);

      if (!res.ok) throw new Error(regIds.message || "Failed to load registrations");

      setRegisteredWorkshopIds(Array.isArray(regIds) ? regIds : []);
      console.log("✅ [Context] Registered workshops IDs:", regIds);
    } catch (err) {
      setError(err.message);
      console.error("❌ [Context] Fetch registered error:", err);
    } finally {
      setLoading(false);
    }
  };

  /** 🔁 Refetch on mode change */
  useEffect(() => {
    console.log("🔁 [Context] View mode changed:", viewMode);
    if (viewMode === "all") fetchAllWorkshops();
    else if (viewMode === "mine") fetchRegisteredWorkshops();
  }, [viewMode]);

  /** 🔹 Local updates */
  const updateWorkshopLocal = (updated) => {
    console.log("🛠 [Context] Local update workshop:", updated?._id);
    if (!updated?._id) return;
    setWorkshops((prev) => prev.map((w) => (w._id === updated._id ? updated : w)));
    setDisplayedWorkshops((prev) =>
      prev.map((w) => (w._id === updated._id ? updated : w))
    );
  };

  const deleteWorkshopLocal = (id) => {
    console.log("🗑 [Context] Delete workshop locally:", id);
    if (!id) return;
    setWorkshops((prev) => prev.filter((w) => w._id !== id));
    setDisplayedWorkshops((prev) => prev.filter((w) => w._id !== id));
  };

  const fetchWorkshops = async () => {
    console.log("🔁 [Context] fetchWorkshops() called");
    return await fetchAllWorkshops();
  };

  /** 👨‍👩‍👧 Family registration logic */
  async function registerFamilyMember(workshopId, familyId) {
    console.log("👨‍👩‍👧 [Context] Register family:", { workshopId, familyId });
    if (!workshopId || !familyId) {
      console.warn("⚠️ [Context] Missing workshopId/familyId");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      console.log("🔑 [Context] Token for family register:", !!token);
      const res = await fetch(`/api/workshops/${workshopId}/family/${familyId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("📡 [Context] POST /family response:", res.status);
      const data = await res.json();
      console.log("📦 [Context] Family register result:", data);

      if (!res.ok) throw new Error(data.message || "Failed to register family member");

      // Local increment for faster UI
      setWorkshops((prev) =>
        prev.map((w) =>
          w._id === workshopId
            ? { ...w, participantsCount: (w.participantsCount || 0) + 1 }
            : w
        )
      );
      await fetchWorkshops();
    } catch (err) {
      console.error("❌ [Context] Family registration error:", err);
    }
  }

  async function unregisterFamilyMember(workshopId, familyId) {
    console.log("👨‍👩‍👧 [Context] Unregister family:", { workshopId, familyId });
    if (!workshopId || !familyId) {
      console.warn("⚠️ [Context] Missing workshopId/familyId");
      return;
    }
    try {
      const token = localStorage.getItem("token");
      console.log("🔑 [Context] Token for family unregister:", !!token);
      const res = await fetch(`/api/workshops/${workshopId}/family/${familyId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      console.log("📡 [Context] DELETE /family response:", res.status);
      const data = await res.json();
      console.log("📦 [Context] Family unregister result:", data);

      if (!res.ok) throw new Error(data.message || "Failed to unregister family member");

      // Local decrement for smoother UX
      setWorkshops((prev) =>
        prev.map((w) =>
          w._id === workshopId
            ? { ...w, participantsCount: Math.max((w.participantsCount || 1) - 1, 0) }
            : w
        )
      );
      await fetchWorkshops();
    } catch (err) {
      console.error("❌ [Context] Family unregister error:", err);
    }
  }

  /** 👥 Manage participants modal */
  const manageParticipants = (id) => {
    console.log("👥 [Context] Manage participants called for ID:", id);
    const found = workshops.find((w) => w._id === id);
    console.log("🔍 [Context] Found workshop:", found);
    if (found) setSelectedWorkshop(found);
    else setSelectedWorkshop(null);
  };

  return (
    <WorkshopContext.Provider
      value={{
        workshops,
        setWorkshops,
        displayedWorkshops,
        registeredWorkshopIds,
        setRegisteredWorkshopIds,
        loading,
        error,
        viewMode,
        setViewMode,
        updateWorkshopLocal,
        deleteWorkshopLocal,
        fetchWorkshops,
        selectedWorkshop,
        setSelectedWorkshop,
        manageParticipants,
        registerFamilyMember,
        unregisterFamilyMember,
      }}
    >
      {children}
    </WorkshopContext.Provider>
  );
};

export const useWorkshops = () => useContext(WorkshopContext);
