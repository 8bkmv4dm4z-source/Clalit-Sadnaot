/**
 * WorkshopContext.jsx — Updated for Secure Token Flow
 * ----------------------------------------------------
 * 🧩 Uses apiFetch() for all backend calls.
 * 🪶 Automatically refreshes tokens and includes refresh cookie.
 */

import React, { createContext, useContext, useEffect, useState, useRef } from "react";
import { useProfiles } from "../ProfileContext";
import { apiFetch } from "../../utils/apiFetch";

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

  const { fetchProfiles } = useProfiles();

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

      log("📡 Fetching all workshops...");
      const res = await apiFetch(`/api/workshops`);
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

  /** 🔹 Fetch registered workshops only */
  const fetchRegisteredWorkshops = async () => {
    log("📡 Fetching registered workshops...");
    try {
      setLoading(true);
      const res = await apiFetch(`/api/workshops/registered`);
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

  /** 🔁 Switch between view modes */
  useEffect(() => {
    log(`🔀 ViewMode changed → ${viewMode}`);
    if (viewMode === "mine") fetchRegisteredWorkshops();
    else fetchAllWorkshops();
  }, [viewMode]);

  /** 🔹 Local update helpers */
  const coalesce = (a, b) => (a === undefined ? b : a);

  const normalizeCounts = (w) => {
    const participants = Array.isArray(w.participants) ? w.participants : [];
    const famRegs = Array.isArray(w.familyRegistrations) ? w.familyRegistrations : [];
    const derived =
      (typeof w.participantsCount === "number"
        ? w.participantsCount
        : participants.length + famRegs.length) || 0;
    return { ...w, participantsCount: derived };
  };

  const updateWorkshopLocal = (updated) => {
    if (!updated?._id) return;
    const upd = normalizeCounts(updated);

    log(`🧩 Merging local workshop: ${upd._id}`, upd);
    setWorkshops((prev) =>
      prev.map((w) =>
        w._id === upd._id
          ? {
              ...w,
              ...upd,
              participants: upd.participants ?? w.participants,
              familyRegistrations: upd.familyRegistrations ?? w.familyRegistrations,
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
              familyRegistrations: upd.familyRegistrations ?? w.familyRegistrations,
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
    log(`📥 RegisterEntity → workshopId: ${workshopId}, familyId: ${familyId}`);
    try {
      const res = await apiFetch(`/api/workshops/${workshopId}/register-entity`, {
        method: "POST",
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
    log(`📤 UnregisterEntity → workshopId: ${workshopId}, familyId: ${familyId}`);
    try {
      const res = await apiFetch(`/api/workshops/${workshopId}/unregister-entity`, {
        method: "DELETE",
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
