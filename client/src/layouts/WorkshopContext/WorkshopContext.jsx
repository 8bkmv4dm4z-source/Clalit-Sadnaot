/**
 * WorkshopContext.jsx — Full Logging Version
 * -------------------------------------------
 * 🧩 Tracks fetching, registration, and view changes.
 * 🪶 Includes timestamps and context-specific logging for debugging render flow.
 */

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useProfiles } from "../ProfileContext";

const WorkshopContext = createContext();

const log = (msg, data) => {
  const now = new Date().toLocaleTimeString("he-IL");
  console.log(`%c[${now}] [WORKSHOP] ${msg}`, "color:#43a047;font-weight:bold;", data ?? "");
};

export const WorkshopProvider = ({ children }) => {
  const [workshops, setWorkshops] = useState([]);
  const [displayedWorkshops, setDisplayedWorkshops] = useState([]);
  const [registeredWorkshopIds, setRegisteredWorkshopIds] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("all"); // "all" | "mine"
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const fetchCooldown = useRef(false);

  // 🧩 Cross-context link
  const { fetchProfiles } = useProfiles();

  // --- Helper ---
  const toId = (v) =>
    typeof v === "string"
      ? v
      : v?.familyMemberId
      ? String(v.familyMemberId)
      : String(v?._id ?? v ?? "");

  /** 🔹 Fetch all workshops */
  const fetchAllWorkshops = async () => {
    if (fetchCooldown.current) {
      log("⏳ Skipped fetchAllWorkshops due to cooldown");
      return;
    }
    fetchCooldown.current = true;
    setTimeout(() => (fetchCooldown.current = false), 1500);

    try {
      setLoading(true);
      setError(null);
      const token = localStorage.getItem("token");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      log("📡 Fetching all workshops...");
      const res = await fetch(`/api/workshops`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to fetch workshops");

      const list = (Array.isArray(data) ? data : []).map((w) => {
  const normalized = {
    ...w,
    participants: (w.participants || []).map(toId),
    familyRegistrations: w.familyRegistrations || [],
    userFamilyRegistrations: (w.userFamilyRegistrations || []).map(toId),
    isUserRegistered: !!w.isUserRegistered,
  };

  if (Array.isArray(w.familyRegistrations)) {
    normalized.userFamilyRegistrations = [
      ...new Set([
        ...normalized.userFamilyRegistrations,
        ...w.familyRegistrations.map((f) => toId(f.familyMemberId ?? f._id)),
      ]),
    ];
  }

  // ✅ derive participantsCount if missing
  const pLen = normalized.participants?.length ?? 0;
  const fLen = normalized.familyRegistrations?.length ?? 0;
  normalized.participantsCount =
    typeof w.participantsCount === "number" ? w.participantsCount : pLen + fLen;

  return normalized;
});


      log(`✅ Workshops loaded (${list.length})`, list);
      setWorkshops(list);
      setDisplayedWorkshops(list);
      return list;
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchAllWorkshops error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** 🔹 Fetch only user-registered workshops */
  const fetchRegisteredWorkshops = async () => {
    log("📡 Fetching registered workshops...");
    try {
      setLoading(true);
      const token = localStorage.getItem("token");
      if (!token) {
        log("⚠️ No token found, clearing registeredWorkshopIds");
        return setRegisteredWorkshopIds([]);
      }

      const res = await fetch(`/api/workshops/registered`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const regIds = await res.json();
      if (!res.ok) throw new Error(regIds.message || "Failed to load registrations");

      const parsed = (Array.isArray(regIds) ? regIds : []).map(toId);
      log(`✅ Registered workshops loaded (${parsed.length})`, parsed);
      setRegisteredWorkshopIds(parsed);
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchRegisteredWorkshops error:", err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /** 🔁 Switch between modes */
  useEffect(() => {
    log(`🔀 ViewMode changed → ${viewMode}`);
    if (viewMode === "mine") fetchRegisteredWorkshops();
    else fetchAllWorkshops();
  }, [viewMode]);

  /** 🔹 Local update helpers */
  const coalesce = (a, b) => (a === undefined ? b : a);

const normalizeCounts = (w) => {
  const participants = Array.isArray(w.participants) ? w.participants : [];
  const famRegs = Array.isArray(w.familyRegistrations)
    ? w.familyRegistrations
    : [];
  // if the server does not send a count, derive it
  const derived =
    (typeof w.participantsCount === "number"
      ? w.participantsCount
      : participants.length + famRegs.length) || 0;
  return { ...w, participantsCount: derived };
};

const updateWorkshopLocal = (updated) => {
  if (!updated?._id) return;
  // normalize/derive counts if needed
  const upd = normalizeCounts(updated);

  log(`🧩 Merging local workshop: ${upd._id}`, upd);
  setWorkshops((prev) =>
    prev.map((w) =>
      w._id === upd._id
        ? {
            ...w,
            ...upd,
            // preserve arrays when server omitted them
            participants: upd.participants ?? w.participants,
            familyRegistrations:
              upd.familyRegistrations ?? w.familyRegistrations,
            // preserve count when server omitted it
            participantsCount: coalesce(upd.participantsCount, w.participantsCount),
          }
        : w
    )
  );
  setDisplayedWorkshops((prev) =>
    prev.map((w) =>
      w._id === upd._id
        ? {
            ...w,
            ...upd,
            participants: upd.participants ?? w.participants,
            familyRegistrations:
              upd.familyRegistrations ?? w.familyRegistrations,
            participantsCount: coalesce(upd.participantsCount, w.participantsCount),
          }
        : w
    )
  );
};

  const deleteWorkshopLocal = (id) => {
    log(`🗑 Deleting local workshop: ${id}`);
    setWorkshops((prev) => prev.filter((w) => w._id !== id));
    setDisplayedWorkshops((prev) => prev.filter((w) => w._id !== id));
  };

  const fetchWorkshops = async () => {
    log("🔁 fetchWorkshops() triggered");
    return await fetchAllWorkshops();
  };

  /** 👨‍👩‍👧 Register entity (user/family) */
  const registerEntityToWorkshop = async (workshopId, familyId = null) => {
    log(`📥 RegisterEntity called → workshopId: ${workshopId}, familyId: ${familyId}`);
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

      log("✅ Registration success", data);
      if (data.workshop) updateWorkshopLocal(data.workshop);
      await fetchAllWorkshops();
      await fetchRegisteredWorkshops();
      await fetchProfiles();

      setRegisteredWorkshopIds((prev) =>
        prev.includes(workshopId) ? prev : [...prev, workshopId]
      );

      return { success: true, data };
    } catch (err) {
      console.error("❌ registerEntityToWorkshop error:", err);
      return { success: false, message: err.message };
    }
  };

  /** 🚫 Unregister entity */
  const unregisterEntityFromWorkshop = async (workshopId, familyId = null) => {
    log(`📤 UnregisterEntity called → workshopId: ${workshopId}, familyId: ${familyId}`);
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

      log("✅ Unregistration success", data);
      if (data.workshop) updateWorkshopLocal(data.workshop);
      await fetchAllWorkshops();
      await fetchRegisteredWorkshops();
      await fetchProfiles();

      setRegisteredWorkshopIds((prev) => prev.filter((id) => id !== workshopId));
      return { success: true, data };
    } catch (err) {
      console.error("❌ unregisterEntityFromWorkshop error:", err);
      return { success: false, message: err.message };
    }
  };

  /** 🧩 Debug watchers */
  useEffect(() => {
    log("📊 workshops length changed", workshops.length);
  }, [workshops]);

  useEffect(() => {
    log("📊 registeredWorkshopIds updated", registeredWorkshopIds);
  }, [registeredWorkshopIds]);

  useEffect(() => {
    if (selectedWorkshop) log("🎯 selectedWorkshop changed", selectedWorkshop.title);
  }, [selectedWorkshop]);

  return (
    <WorkshopContext.Provider
      value={{
        workshops,
        displayedWorkshops,
        setDisplayedWorkshops,
        registeredWorkshopIds,
        setRegisteredWorkshopIds,
        loading,
        error,
        viewMode,
        setViewMode,
        selectedWorkshop,
        setSelectedWorkshop,
        updateWorkshopLocal,
        deleteWorkshopLocal,
        fetchWorkshops,
        registerEntityToWorkshop,
        unregisterEntityFromWorkshop,
      }}
    >
      {children}
    </WorkshopContext.Provider>
  );
};

export const useWorkshops = () => useContext(WorkshopContext);
