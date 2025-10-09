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
  const [isFamilyMode, setIsFamilyMode] = useState(false);
  const [selectedFamilyId, setSelectedFamilyId] = useState(null);

  /** 🧩 Helper to normalize IDs */
  const toId = (v) =>
    typeof v === "string"
      ? v
      : v?.familyMemberId
      ? String(v.familyMemberId)
      : String(v?._id ?? v ?? "");

  /** 🔹 Fetch all workshops (with familyRegistrations populated) */
  const fetchAllWorkshops = async () => {
    console.log("🔄 [Context] Fetching ALL workshops...");
    try {
      setLoading(true);
      setError(null);

      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const res = await fetch(`/api/workshops`, { headers });
      console.log("📡 [Context] /api/workshops → status:", res.status);
      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Failed to fetch workshops");

      // ✅ Normalize everything to have clean ID lists
      const list = (Array.isArray(data) ? data : []).map((w) => ({
        ...w,
        participants: (w.participants || []).map(toId),
        familyRegistrations: w.familyRegistrations || [],
        userFamilyRegistrations: (w.userFamilyRegistrations || []).map(toId),
        isUserRegistered: !!w.isUserRegistered,
      }));

      // 🔍 Diagnostic table
      console.table(
        list.map((w) => ({
          _id: w._id,
          title: w.title,
          isUserRegistered: w.isUserRegistered,
          familyIds: (w.userFamilyRegistrations || []).join(", "),
        }))
      );

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
      const res = await fetch(`/api/workshops/registered`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const regIds = await res.json();
      if (!res.ok) throw new Error(regIds.message || "Failed to load registrations");

      setRegisteredWorkshopIds((Array.isArray(regIds) ? regIds : []).map(toId));
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

  /** 🔹 Local update helpers */
  const updateWorkshopLocal = (updated) => {
    if (!updated?._id) return;
    setWorkshops((prev) => prev.map((w) => (w._id === updated._id ? updated : w)));
    setDisplayedWorkshops((prev) =>
      prev.map((w) => (w._id === updated._id ? updated : w))
    );
  };

  const deleteWorkshopLocal = (id) => {
    if (!id) return;
    setWorkshops((prev) => prev.filter((w) => w._id !== id));
    setDisplayedWorkshops((prev) => prev.filter((w) => w._id !== id));
  };

  const fetchWorkshops = async () => {
    console.log("🔁 [Context] fetchWorkshops() called");
    return await fetchAllWorkshops();
  };

  /** 👨‍👩‍👧 Family registration logic */
  async function registerEntityToWorkshop(workshopId, familyId = null) {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Missing token");

      const res = await fetch(`/api/workshops/${workshopId}/register-entity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ familyId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to register");

      updateWorkshopLocal(data.workshop);
      await fetchWorkshops();
      await fetchRegisteredWorkshops();

      setRegisteredWorkshopIds((prev) =>
        prev.includes(workshopId) ? prev : [...prev, workshopId]
      );

      return { success: true, data };
    } catch (err) {
      console.error("❌ registerEntityToWorkshop error:", err);
      return { success: false, message: err.message };
    }
  }

  async function unregisterEntityFromWorkshop(workshopId, familyId = null) {
    try {
      const token = localStorage.getItem("token");
      if (!token) throw new Error("Missing token");

      const res = await fetch(`/api/workshops/${workshopId}/unregister-entity`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ familyId }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to unregister");

      updateWorkshopLocal(data.workshop);
      await fetchWorkshops();
      await fetchRegisteredWorkshops();

      setRegisteredWorkshopIds((prev) => prev.filter((id) => id !== workshopId));
      console.log("✅ Unregistered entity:", data);
      return { success: true, data };
    } catch (err) {
      console.error("❌ unregisterEntityFromWorkshop error:", err);
      return { success: false, message: err.message };
    }
  }

  /** 👥 Manage participants modal */
  const manageParticipants = (id) => {
    const found = workshops.find((w) => w._id === id);
    setSelectedWorkshop(found || null);
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
        registerEntityToWorkshop,
        unregisterEntityFromWorkshop,
      }}
    >
      {children}
    </WorkshopContext.Provider>
  );
};

export const useWorkshops = () => useContext(WorkshopContext);
