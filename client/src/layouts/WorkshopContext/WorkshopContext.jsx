// src/layouts/WorkshopContext/WorkshopContext.jsx
/**
 * WorkshopContext.jsx
 * ------------------------------------------------------------------
 * Purpose:
 * Single source of truth for workshop data. Fetches from server,
 * normalizes, derives user/family registration maps, exposes state
 * & mutations to the app.
 *
 * Invariants:
 * - Workshop IDs are strings.
 * - participant/familyMember IDs normalized to strings.
 * - Never hold stale data: every mutation refetches from server.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
  useMemo,
} from "react";
import { useProfiles } from "../ProfileContext";
import { apiFetch } from "../../utils/apiFetch";
import { useAuth } from "../AuthLayout";

/* ───────────────────────── Debug Helpers ───────────────────────── */
// Enable via query string: ?debug=ws
try {
  if (typeof window !== "undefined") {
    const q = new URLSearchParams(window.location.search);
    if (q.get("debug") === "ws") localStorage.setItem("DEBUG_WS", "1");
  }
} catch {
  /* intentionally ignore query parsing errors */
}

const dbgCtx = (...args) => {
  try {
    if (typeof window !== "undefined" && localStorage.getItem("DEBUG_WS") === "1") {
      console.log("[WS-CTX]", ...args);
    }
  } catch {
    /* intentionally ignore logging errors */
  }
};

const WorkshopContext = createContext();

const WORKSHOP_DEV = import.meta.env.MODE !== "production";
// SECURITY FIX: avoid logging full payloads unless in development
const log = (msg) => {
  if (!WORKSHOP_DEV) return;
  const now = new Date().toLocaleTimeString("he-IL");
  console.info(`%c[${now}] [WORKSHOP] ${msg}` , "color:#43a047;font-weight:bold;");
};

/* ───────────────────────── ID Helpers ───────────────────────── */
const sid = (x) => String(x ?? "");
/* ================================================================== */

export const WorkshopProvider = ({ children }) => {
  const [workshops, setWorkshops] = useState([]);
  const [displayedWorkshops, setDisplayedWorkshops] = useState([]);
  const [registeredWorkshopIds, setRegisteredWorkshopIds] = useState([]);

  // Derived maps (context-only, never mutated directly)
  const [userWorkshopMap, setUserWorkshopMap] = useState({});     // { [workshopId]: true }
  const [familyWorkshopMap, setFamilyWorkshopMap] = useState({}); // { [workshopId]: [familyId,...] }
  const [mapsReady, setMapsReady] = useState(false);               // UI gate for stable maps

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [viewMode, setViewMode] = useState("all");
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);

  const fetchCooldown = useRef(false);

  const { fetchProfiles } = useProfiles();
  const { user } = useAuth();

  // One-time banner if debug is enabled
  useEffect(() => {
    try {
      if (typeof window !== "undefined" && localStorage.getItem("DEBUG_WS") === "1") {
        console.log("%c[WS-CTX] DEBUG ENABLED", "color:#2962ff;font-weight:bold");
      }
    } catch {
      /* intentionally ignore debug banner failures */
    }
  }, []);

  // FIXED: derive stable signatures to satisfy linted dependency arrays
  const userKey = useMemo(() => sid(user?.entityKey), [user?.entityKey]);
  const familyMembersList = useMemo(
    () => (Array.isArray(user?.familyMembers) ? user.familyMembers : []),
    [user?.familyMembers]
  );
  const familyMembersSignature = useMemo(
    () => JSON.stringify(familyMembersList.map((m) => sid(m.entityKey || m._id)).sort()),
    [familyMembersList]
  );
  const workshopsSignature = useMemo(() => {
    if (!Array.isArray(workshops)) return "[]";
    return JSON.stringify(
      workshops.map((w) => ({
        id: sid(w?._id || w?.id),
        isUserRegistered: !!w?.isUserRegistered,
        participantsLen: Array.isArray(w?.participants) ? w.participants.length : 0,
        userFamilyLen: Array.isArray(w?.userFamilyRegistrations)
          ? w.userFamilyRegistrations.length
          : 0,
        familyRegsPairs: Array.isArray(w?.familyRegistrations)
          ? w.familyRegistrations
              .filter((fr) => fr && fr.parentUser && fr.familyMemberId)
              .map((fr) => `${sid(fr.parentUser)}:${sid(fr.familyMemberId)}`)
              .sort()
              .join("|")
          : "",
      }))
    );
  }, [workshops]);

  /* ============================================================
     📦 Fetch all workshops (server source-of-truth)
     ============================================================ */
  async function fetchAllWorkshops(force = false) {
    if (fetchCooldown.current && !force) {
      log("⏳ Skipped fetchAllWorkshops due to cooldown");
      return;
    }
    fetchCooldown.current = true;
    setTimeout(() => (fetchCooldown.current = false), 1200);

    try {
      setLoading(true);
      setError(null);
      log("📡 Fetching all workshops...");
      dbgCtx("fetchAllWorkshops:start", { force });

      const res = await apiFetch(`/api/workshops`);
      const data = await res.json();
      dbgCtx("fetchAllWorkshops:raw-response", { ok: res.ok, keys: Object.keys(data || {}) });

      if (!res.ok) throw new Error(data.message || "Failed to fetch workshops");

      const workshopsArray = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data)
        ? data
        : [];

      dbgCtx("fetchAllWorkshops:array-size", { workshopsArrayLen: workshopsArray.length });

      // Normalize ONLY. Do not build maps here (maps are derived below).
      const list = workshopsArray.map((w, idx) => {
        const wid = String(w?.workshopKey || w?.id || "");
        const participantKeys = (w.participants || []).map((p) => sid(p));
        const familyRegs = Array.isArray(w.familyRegistrations) ? w.familyRegistrations : [];
        const familyRegKeys = familyRegs.map((f) => sid(f.familyMemberKey || f.familyMemberId));
        const waitingList = Array.isArray(w.waitingList) ? w.waitingList : [];

        const normalized = {
          ...w,
          workshopKey: wid,
          _id: wid,
          address: w.address || "",
          city: w.city || "",
          studio: w.studio || "",
          coach: w.coach || "",
          participants: participantKeys,
          familyRegistrations: familyRegs,
          userFamilyRegistrations: (w.userFamilyRegistrations || []).map((v) => sid(v)),
          waitingList,
          maxParticipants: Number(w.maxParticipants ?? 0),
          waitingListMax: Number(w.waitingListMax ?? 0),
          isUserRegistered: !!w.isUserRegistered,
        };

        const pLen = normalized.participants?.length ?? 0;
        const fLen = normalized.familyRegistrations?.length ?? 0;
        normalized.participantsCount =
          typeof w.participantsCount === "number" ? w.participantsCount : pLen + fLen;

        if (Array.isArray(w.familyRegistrations)) {
          normalized.userFamilyRegistrations = [
            ...new Set([
              ...normalized.userFamilyRegistrations,
              ...familyRegKeys,
            ]),
          ];
        }

        // 🔍 Compact per-workshop log
        dbgCtx("normalize", {
          i: idx,
          wid: String(normalized?.workshopKey || ""),
          title: normalized?.title,
          isUserRegistered: normalized.isUserRegistered,
          participantsLen: pLen,
          userFamilyRegsLen: normalized.userFamilyRegistrations.length,
          waitingListLen: normalized.waitingList.length,
        });

        return normalized;
      });

      log(`✅ Workshops loaded (${list.length})`);
      dbgCtx("setState:workshops", { listLen: list.length });

      setWorkshops(list);
      setDisplayedWorkshops(list); // default view ("all") shows everything
      return list;
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchAllWorkshops error:", err);
      setError(err.message);
      dbgCtx("fetchAllWorkshops:error", { message: err.message });
    } finally {
      setLoading(false);
      dbgCtx("fetchAllWorkshops:done");
    }
  }

  async function fetchRegisteredWorkshops() {
    log("📡 Fetching registered workshops (ids)...");
    dbgCtx("fetchRegisteredWorkshops:start");
    try {
      setLoading(true);
      const res = await apiFetch(`/api/workshops/registered`);
      const regIds = await res.json();
      dbgCtx("fetchRegisteredWorkshops:raw-response", {
        ok: res.ok,
        type: Array.isArray(regIds) ? "array" : typeof regIds
      });

      if (!res.ok) throw new Error(regIds.message || "Failed to load registrations");
      const parsed = (Array.isArray(regIds) ? regIds : []).map((v) =>
        typeof v === "string" ? v : String(v?.workshopKey ?? v ?? "")
      );
      log(`✅ Registered workshops loaded (${parsed.length})`);
      dbgCtx("fetchRegisteredWorkshops:parsed", { count: parsed.length, sample: parsed.slice(0, 5) });
      setRegisteredWorkshopIds(parsed);
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchRegisteredWorkshops error:", err);
      setError(err.message);
      dbgCtx("fetchRegisteredWorkshops:error", { message: err.message });
    } finally {
      setLoading(false);
      dbgCtx("fetchRegisteredWorkshops:done");
    }
  }

  function fetchWorkshops(force = false) {
    log(`🔁 fetchWorkshops() called | force=${force}`);
    dbgCtx("fetchWorkshops:call", { force });
    return fetchAllWorkshops(force);
  }

  // Fetch list by view mode
  useEffect(() => {
    log(`🔀 ViewMode → ${viewMode}`);
    dbgCtx("viewMode:effect", { viewMode });
    if (viewMode === "mine") {
      fetchRegisteredWorkshops(); // optional meta
      fetchAllWorkshops();        // still need full list to compute maps
    } else {
      fetchAllWorkshops();
    }
     
  }, [viewMode]);

  /* ============================================================
     🔔 Global auth events wiring
     ============================================================ */
  useEffect(() => {
    const onLoggedOut = () => {
      dbgCtx("event:auth-logged-out");
      setUserWorkshopMap({});
      setFamilyWorkshopMap({});
      setMapsReady(false);
      setViewMode("all");
      // refetch public list and render it right away
      fetchAllWorkshops(true)?.then((list) => setDisplayedWorkshops(list || []));
    };

    const onLoggedIn = () => {
      dbgCtx("event:auth-logged-in");
      // load both public list (for maps) and private registrations
      fetchAllWorkshops(true);
      fetchRegisteredWorkshops();
    };

    const onAuthReady = (e) => {
      const loggedIn = !!e?.detail?.loggedIn;
      dbgCtx("event:auth-ready", { loggedIn });
      if (loggedIn) {
        fetchAllWorkshops(true);
        fetchRegisteredWorkshops();
      } else {
        onLoggedOut();
      }
    };

    const onUserUpdated = () => {
      dbgCtx("event:auth-user-updated");
      // user/family changed → safe to refetch so maps rebuild
      fetchAllWorkshops(true);
      // no need to force Registered IDs here unless viewMode === "mine"
      if (viewMode === "mine") fetchRegisteredWorkshops();
    };

    window.addEventListener("auth-logged-out", onLoggedOut);
    window.addEventListener("auth-logged-in", onLoggedIn);
    window.addEventListener("auth-ready", onAuthReady);           // legacy + payload
    window.addEventListener("auth-user-updated", onUserUpdated);

    return () => {
      window.removeEventListener("auth-logged-out", onLoggedOut);
      window.removeEventListener("auth-logged-in", onLoggedIn);
      window.removeEventListener("auth-ready", onAuthReady);
      window.removeEventListener("auth-user-updated", onUserUpdated);
    };
     
  }, [viewMode]);

  /* ============================================================
     🧭 Map lifecycle helpers
     ============================================================ */

  // Reset maps only when user context effectively clears (logout / switch user)
  useEffect(() => {
    const hasUser = !!userKey;
    if (!hasUser) {
      setUserWorkshopMap({});
      setFamilyWorkshopMap({});
      setDisplayedWorkshops([]);
      setMapsReady(false);
    }
  }, [userKey, familyMembersSignature]);

  // === Derived maps: built from current normalized list + current user ===
  useEffect(() => {
    // Clear before recompute to avoid one-frame stale view
    setMapsReady(false);
    setUserWorkshopMap({});
    setFamilyWorkshopMap({});

    const hasUser = !!userKey;
    const list = Array.isArray(workshops) ? workshops : [];
    if (!hasUser || list.length === 0) {
      // Not enough info — keep not-ready so UI can wait
      return;
    }

    const currentUserId = userKey;
    const familyIds = familyMembersList.map((m) => sid(m.entityKey || m._id));

    const uMap = Object.create(null);
    const fMap = Object.create(null);

    for (const w of list) {
      const wid = sid(w?.workshopKey || w?._id || w?.id);

      // user map: prefer isUserRegistered; otherwise check participants
      if (w?.isUserRegistered) {
        uMap[wid] = true;
      } else if (Array.isArray(w?.participants)) {
        if (w.participants.some((p) => sid(p) === currentUserId)) {
          uMap[wid] = true;
        }
      }

      // family map: union of userFamilyRegistrations and familyRegistrations
      // where parentUser === current user; then filter to current user's familyIds
      const famSet = new Set();

      if (Array.isArray(w?.userFamilyRegistrations)) {
        for (const fid of w.userFamilyRegistrations) {
          const s = sid(fid);
          if (s) famSet.add(s);
        }
      }

      if (Array.isArray(w?.familyRegistrations)) {
        for (const fr of w.familyRegistrations) {
          const parent = fr?.parentUser != null ? sid(fr.parentUser) : null;
          const memberId = fr?.familyMemberId != null ? sid(fr.familyMemberId) : null;
          if (parent && memberId && parent === currentUserId) {
            famSet.add(memberId);
          }
        }
      }

      const clean = [...famSet].filter((id) => familyIds.includes(id));
      if (clean.length > 0) {
        fMap[wid] = clean;
      }
    }

    // Debug
    dbgCtx("derivedMaps:built", {
      userCount: Object.keys(uMap).length,
      familyCount: Object.keys(fMap).length,
      userKeysSample: Object.keys(uMap).slice(0, 5),
      familyPairsSample: Object.entries(fMap).slice(0, 3),
    });

    setUserWorkshopMap(uMap);
    setFamilyWorkshopMap(fMap);
    setMapsReady(true);

    // Dependencies: user/family identity + relevant workshop content summary
  }, [userKey, familyMembersSignature, workshopsSignature, workshops, familyMembersList]);

  // Filter displayedWorkshops when viewMode === "mine" (only after mapsReady)
  useEffect(() => {
    if (!mapsReady) return;

    if (viewMode === "mine") {
      const filtered = (workshops || []).filter(
        (w) => userWorkshopMap[w._id] || (familyWorkshopMap[w._id]?.length > 0)
      );
      setDisplayedWorkshops(filtered);
    } else {
      setDisplayedWorkshops(workshops || []);
    }
  }, [mapsReady, viewMode, workshops, userWorkshopMap, familyWorkshopMap]);

  /* ============================================================
     🔧 Mutations (server-source-of-truth + refetch)
     ============================================================ */
  const deleteWorkshop = async (id) => {
    dbgCtx("deleteWorkshop:start", { id });
    try {
      const res = await apiFetch(`/api/workshops/${id}`, { method: "DELETE" });
      const data = await res.json();
      dbgCtx("deleteWorkshop:raw-response", { ok: res.ok });
      if (!res.ok) throw new Error(data.message || "Failed to delete workshop");
      await fetchAllWorkshops(true); // refresh from server
      dbgCtx("deleteWorkshop:success", { id });
      return { success: true, message: "Workshop deleted successfully" };
    } catch (err) {
      console.error("❌ deleteWorkshop error:", err);
      dbgCtx("deleteWorkshop:error", { id, message: err.message });
      return { success: false, message: err.message };
    }
  };

  const registerEntityToWorkshop = async (workshopKey, entityKey = null) => {
    dbgCtx("registerEntity:start", { workshopKey, entityKey });
    try {
      const res = await apiFetch(`/api/workshops/${workshopKey}/register-entity`, {
        method: "POST",
        body: JSON.stringify(entityKey ? { entityKey } : {}),
      });
      const data = await res.json();
      dbgCtx("registerEntity:raw-response", { ok: res.ok, message: data?.message });

      if (!res.ok) throw new Error(data.message || "Failed to register");

      await fetchAllWorkshops(true);
      await fetchRegisteredWorkshops();
      await fetchProfiles();
      dbgCtx("registerEntity:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (err) {
      console.error("❌ registerEntityToWorkshop error:", err);
      dbgCtx("registerEntity:error", { workshopKey, entityKey, message: err.message });
      return { success: false, message: err.message };
    }
  };

  const unregisterEntityFromWorkshop = async (workshopKey, entityKey = null) => {
    dbgCtx("unregisterEntity:start", { workshopKey, entityKey });
    try {
      const res = await apiFetch(`/api/workshops/${workshopKey}/unregister-entity`, {
        method: "DELETE",
        body: JSON.stringify(entityKey ? { entityKey } : {}),
      });
      const data = await res.json();
      dbgCtx("unregisterEntity:raw-response", { ok: res.ok, message: data?.message });

      if (!res.ok) throw new Error(data.message || "Failed to unregister");

      await fetchAllWorkshops(true);
      await fetchRegisteredWorkshops();
      await fetchProfiles();
      dbgCtx("unregisterEntity:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (err) {
      console.error("❌ unregisterEntityFromWorkshop error:", err);
      dbgCtx("unregisterEntity:error", { workshopKey, entityKey, message: err.message });
      return { success: false, message: err.message };
    }
  };

  const registerToWaitlist = async (workshopKey, entityKey) => {
    dbgCtx("waitlistRegister:start", { workshopKey, entityKey });
    const body = entityKey ? { entityKey } : {};

    try {
      const res = await apiFetch(`/api/workshops/${workshopKey}/waitlist-entity`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      dbgCtx("waitlistRegister:raw-response", { ok: res.ok, message: data?.message });

      if (!res.ok) throw new Error(data.message || "Failed to join waitlist");

      await fetchAllWorkshops(true);
      await fetchRegisteredWorkshops();
      await fetchProfiles();
      dbgCtx("waitlistRegister:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (e) {
      dbgCtx("waitlistRegister:error", e);
      return { success: false, message: e?.message || "Waitlist registration failed" };
    }
  };

  const unregisterFromWaitlist = async (workshopKey, entityKey) => {
    dbgCtx("waitlistUnregister:start", { workshopKey, entityKey });
    const body = entityKey ? { entityKey } : {};

    try {
      const res = await apiFetch(`/api/workshops/${workshopKey}/waitlist-entity`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      dbgCtx("waitlistUnregister:raw-response", { ok: res.ok, message: data?.message });

      if (!res.ok) throw new Error(data.message || "Failed to leave waitlist");

      await fetchAllWorkshops(true);
      await fetchRegisteredWorkshops();
      await fetchProfiles();
      dbgCtx("waitlistUnregister:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (e) {
      dbgCtx("waitlistUnregister:error", e);
      return { success: false, message: e?.message || "Waitlist removal failed" };
    }
  };

  /* ============================================================
   🛠️ Admin: Create & Update Workshops
   ============================================================ */
  const createWorkshop = async (payload) => {
    dbgCtx("createWorkshop:start", { payload });
    try {
      const res = await apiFetch(`/api/workshops`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      dbgCtx("createWorkshop:raw-response", { ok: res.ok, message: data?.message });
      if (!res.ok) throw new Error(data.message || "Failed to create workshop");
      await fetchAllWorkshops(true);   // refresh
      return { success: true, data };
    } catch (err) {
      console.error("❌ createWorkshop error:", err);
      dbgCtx("createWorkshop:error", { message: err.message });
      return { success: false, message: err.message };
    }
  };

  const updateWorkshop = async (workshopId, payload) => {
    dbgCtx("updateWorkshop:start", { workshopId, payload });
    try {
      const res = await apiFetch(`/api/workshops/${workshopId}`, {
        method: "PUT",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      dbgCtx("updateWorkshop:raw-response", { ok: res.ok, message: data?.message });
      if (!res.ok) throw new Error(data.message || "Failed to update workshop");
      await fetchAllWorkshops(true);
      return { success: true, data };
    } catch (err) {
      console.error("❌ updateWorkshop error:", err);
      dbgCtx("updateWorkshop:error", { workshopId, message: err.message });
      return { success: false, message: err.message };
    }
  };

  /* ============================================================
     🏙️ Utilities
     ============================================================ */
  const fetchAvailableCities = async () => {
    dbgCtx("fetchAvailableCities:start");
    try {
      const res = await apiFetch("/api/workshops/meta/cities");
      const data = await res.json();
      dbgCtx("fetchAvailableCities:raw-response", { ok: res.ok, keys: Object.keys(data || {}) });
      if (!res.ok) throw new Error(data.message || "Failed to fetch cities");
      const cities = data.cities || [];
      dbgCtx("fetchAvailableCities:success", { count: cities.length });
      return cities;
    } catch (err) {
      console.error("❌ fetchAvailableCities error:", err);
      dbgCtx("fetchAvailableCities:error", { message: err.message });
      return [];
    }
  };

  const validateAddress = async (city, address) => {
    dbgCtx("validateAddress:start", { city, address });
    try {
      const res = await apiFetch(
        `/api/workshops/validate-address?city=${encodeURIComponent(city)}&address=${encodeURIComponent(address)}`
      );
      const data = await res.json();
      dbgCtx("validateAddress:raw-response", { ok: res.ok, data });
      if (!res.ok) throw new Error(data.message || "Failed to validate address");
      dbgCtx("validateAddress:success");
      return data;
    } catch (err) {
      console.error("❌ validateAddress error:", err);
      dbgCtx("validateAddress:error", { message: err.message });
      return { success: false, message: err.message };
    }
  };

  /* ============================================================
     🧠 Provider
     ============================================================ */
  return (
    <WorkshopContext.Provider
      value={{
        workshops,
        displayedWorkshops,
        setDisplayedWorkshops,
        registeredWorkshopIds,
        setRegisteredWorkshopIds,

        userWorkshopMap,
        familyWorkshopMap,
        mapsReady,

        loading,
        error,
        viewMode,
        setViewMode,
        selectedWorkshop,
        setSelectedWorkshop,

        fetchWorkshops,
        fetchRegisteredWorkshops,

        deleteWorkshop,
        registerEntityToWorkshop,
        unregisterEntityFromWorkshop,
        registerToWaitlist,
        unregisterFromWaitlist,

        fetchAvailableCities,
        validateAddress,

        // Admin mutations
        createWorkshop,
        updateWorkshop,
      }}
    >
      {children}
    </WorkshopContext.Provider>
  );
};

export const useWorkshops = () => useContext(WorkshopContext);
