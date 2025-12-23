// src/layouts/WorkshopContext/WorkshopContext.jsx
/**
 * WorkshopContext.jsx
 * ------------------------------------------------------------------
 * Purpose:
 * Single source of truth for workshop data. Fetches from server,
 * normalizes, derives user/family registration maps, exposes state
 * & mutations to the app.
 *
 * API surface + consumer map (keep in sync with server/routes/workshops.js):
 * - GET /api/workshops → fetchAllWorkshops()
 *   • Consumers: AppShell bootstrapping the calendar feed for MyWorkshops,
 *     Workshops, and any component using useWorkshops().displayedWorkshops.
 * - GET /api/workshops/registered → fetchRegisteredWorkshops()
 *   • Consumers: Workshops + MyWorkshops highlighting current registrations.
 * - POST /api/workshops/:id/register-entity → registerEntityToWorkshop()
 *   • Callers: WorkshopCard, calendar grids that allow self/family sign-ups.
 * - DELETE /api/workshops/:id/unregister-entity → unregisterEntityFromWorkshop()
 *   • Callers: the same UI surfaces used for registration toggles.
 * - POST /api/workshops/:id/waitlist-entity → registerToWaitlist()
 *   • Callers: WorkshopCard waitlist CTA, mobile/desktop calendars.
 * - DELETE /api/workshops/:id/waitlist-entity → unregisterFromWaitlist()
 *   • Callers: waitlist removal in the same contexts as above.
 *
 * This block intentionally documents both routes and who triggers them so we can
 * trace API consumers without spelunking through components.
 *
 * Invariants:
 * - Workshop IDs are strings.
 * - participant/familyMember IDs normalized to strings.
 * - Never hold stale data: every mutation refetches from server.
 */

import React,
{
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
} from "react";
import { useProfiles } from "../ProfileContext";
import { apiFetch } from "../../utils/apiFetch";
import { useAuth } from "../AuthLayout";
import { normalizeEntity } from "../../utils/normalizeEntity";

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
    if (
      typeof window !== "undefined" &&
      localStorage.getItem("DEBUG_WS") === "1"
    ) {
      console.log("[WS-CTX]", ...args);
    }
  } catch {
    /* intentionally ignore logging errors */
  }
};

const WorkshopContext = createContext();

const WORKSHOP_DEV = import.meta.env.MODE !== "production";
// SECURITY: avoid logging full payloads unless in development
const log = (msg) => {
  if (!WORKSHOP_DEV) return;
  const now = new Date().toLocaleTimeString("he-IL");
  console.info(
    `%c[${now}] [WORKSHOP] ${msg}`,
    "color:#43a047;font-weight:bold;"
  );
};

/* ───────────────────────── ID Helpers ───────────────────────── */
const sid = (x) => String(x ?? "");
/* ================================================================== */

export const WorkshopProvider = ({ children }) => {
  const { user } = useAuth();
  const { fetchProfiles } = useProfiles();

  const [workshops, setWorkshops] = useState([]);
  const [displayedWorkshops, setDisplayedWorkshops] = useState([]);
  const [registeredWorkshopIds, setRegisteredWorkshopIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);

  const [viewMode, setViewMode] = useState("all"); // "all" | "mine"
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [pagination, setPagination] = useState({
    limit: 10,
    skip: 0,
    total: 0,
    hasMore: true,
  });

  // Derived maps (context-only, never mutated directly)
  const [userWorkshopMap, setUserWorkshopMap] = useState({});   // { [workshopId]: true }
  const [familyWorkshopMap, setFamilyWorkshopMap] = useState({}); // { [workshopId]: [familyId,...] }
  const [mapsReady, setMapsReady] = useState(false);
  const [serverMapsLoaded, setServerMapsLoaded] = useState(false);

  /* ───────────────────────── Derived user/family info ───────────────────────── */

  const userKey = useMemo(() => {
    return user?.entityKey ? sid(user.entityKey) : "";
  }, [user]);

  const familyMembersList = useMemo(
    () => (Array.isArray(user?.familyMembers) ? user.familyMembers : []),
    [user]
  );

  // Signatures so that we only recompute maps when relevant identity changes
  const familyMembersSignature = useMemo(
    () => familyMembersList.map((m) => sid(m.entityKey)).join(","),
    [familyMembersList]
  );

  const workshopsSignature = useMemo(
    () => (workshops || []).map((w) => w._id).join(","),
    [workshops]
  );

  /* ============================================================
     📡 Fetch all workshops (server → normalized list)
     ============================================================ */
  async function fetchAllWorkshops(options = {}) {
    const opts = typeof options === "boolean" ? { force: options } : options;
    const {
      force = false,
      limit = pagination.limit || 10,
      skip = force ? 0 : pagination.skip || 0,
      append = false,
    } = opts;

    log(
      `📡 Fetching all workshops (force=${force}, limit=${limit}, skip=${skip}, append=${append})`
    );
    dbgCtx("fetchAllWorkshops:start", { force, limit, skip, append });
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);

    if (force && !append) {
      setPagination((prev) => ({
        ...prev,
        limit: limit || prev.limit || 10,
        skip: 0,
        total: 0,
        hasMore: true,
      }));
    }

    try {
      const params = new URLSearchParams();
      params.set("limit", limit);
      params.set("skip", skip);

      const res = await apiFetch(`/api/workshops?${params.toString()}`);
      const raw = await res.json();

      dbgCtx("fetchAllWorkshops:raw-response", {
        ok: res.ok,
        rawType: typeof raw,
        hasData: Array.isArray(raw?.data),
      });

      // Accept all backend formats safely
      // Accept multiple backend shapes:
      // - { data: [...] }
      // - { workshops: [...] }
      // - { events: [...] }      ← legacy calendar feed
      // - raw array
      const possibleArrays = [raw?.data, raw?.workshops, raw?.events, raw];
      const data = possibleArrays.find(Array.isArray) || [];

      if (!res.ok) {
        throw new Error(raw?.message || "Failed to load workshops");
      }

      const list = Array.isArray(data) ? data : [];

      const normalizedList = list
        .map((w, idx) => {
          const wid = sid(
            w.workshopKey ||
              w._id ||
              w.hashedId ||
              ""
          );

          if (!wid || /^[0-9]+$/.test(wid)) {
            console.warn("⚠ Invalid workshop identifier received:", {
              idx,
              rawId: { workshopKey: w.workshopKey, _id: w._id, hashedId: w.hashedId },
              title: w.title,
            });
            return null;
          }

          const registrationStatus =
            w.registrationStatus || (w.isUserRegistered ? "registered" : "not_registered");
          const isUserInWaitlist = !!w.isUserInWaitlist || registrationStatus === "waitlisted";

          /* ---------------- participants: true entities ---------------- */
          const participantsRaw = Array.isArray(w.participants)
            ? w.participants
            : [];

          const participants = participantsRaw.map((p) =>
            typeof p === "string"
              ? normalizeEntity({ entityKey: p })
              : normalizeEntity(p)
          );

          /* ---------------- waitingList: relation rows ---------------- */
          const waitingList = Array.isArray(w.waitingList)
            ? w.waitingList.map((wl) => {
                // parent
                let parentKey = sid(
                  wl.parentUser?.entityKey ??
                    wl.parentUser ??
                    wl.parentKey ??
                    ""
                );

                // entity (self or family member)
                const entityRaw =
                  wl.entityKey?.entityKey ??
                  wl.entityKey ??
                  wl.familyMemberId?.entityKey ??
                  wl.familyMemberId ??
                  wl.familyMemberKey ??
                  "";

                const entityKey = sid(entityRaw);

                // if backend didn't explicitly set parentUser for self rows,
                // align parentKey with entityKey so UI logic (selfOnWaitlist)
                // can do parentKey === userKey && entityKey === userKey
                if (!parentKey && entityKey) {
                  parentKey = entityKey;
                }

                const isSelf = parentKey && entityKey && parentKey === entityKey;

                const memberKey = isSelf ? "" : entityKey;

                return {
                  ...wl,
                  parentUser: parentKey || null,
                  parentKey: parentKey || null,
                  entityKey: entityKey || "",
                  familyMemberId: memberKey || null,
                  familyMemberKey: memberKey || null,
                };
              })
            : [];

          /* ---------------- familyRegistrations: relation rows ---------------- */
          const familyRegistrations = Array.isArray(w.familyRegistrations)
            ? w.familyRegistrations.map((fr) => {
                const parentKey = sid(
                  fr.parentUser?.entityKey ??
                    fr.parentUser ??
                    fr.parentKey ??
                    ""
                );
                const memberKey = sid(
                  fr.familyMemberId?.entityKey ??
                    fr.familyMemberId ??
                    fr.familyMemberKey ??
                    ""
                );

                return {
                  ...fr,
                  parentUser: parentKey || null,
                  parentKey: parentKey || null,
                  familyMemberId: memberKey || null,
                  familyMemberKey: memberKey || null,
                  relation: fr.relation || "",
                };
              })
            : [];

          /* ---------------- userFamilyRegistrations: id list ---------------- */
          const userFamilyRegistrations = Array.isArray(w.userFamilyRegistrations)
            ? w.userFamilyRegistrations.map((id) => sid(id))
            : [];

          /* ---------------- isUserRegistered ---------------- */
          const isUserRegistered =
            registrationStatus === "registered" ||
            !!w.isUserRegistered ||
            (userKey &&
              participants.some((p) => sid(p.entityKey) === userKey));

          return {
            ...w,
            _id: wid,
            workshopKey: wid,
            participants,
            waitingList,
            userFamilyRegistrations,
            familyRegistrations,
            isUserRegistered,
            isUserInWaitlist,
            registrationStatus,
          };
        })
        .filter(Boolean); // clean list
      const mergeLists = (existing = [], incoming = []) => {
        const seen = new Set();
        const merged = [];

        for (const w of existing) {
          const wid = sid(w?._id);
          if (wid && !seen.has(wid)) {
            seen.add(wid);
            merged.push(w);
          }
        }

        for (const w of incoming) {
          const wid = sid(w?._id);
          if (wid && !seen.has(wid)) {
            seen.add(wid);
            merged.push(w);
          }
        }

        return merged;
      };

      let updatedList = normalizedList;

      setWorkshops((prev) => {
        if (append) {
          updatedList = mergeLists(prev, normalizedList);
          return updatedList;
        }
        updatedList = normalizedList;
        return normalizedList;
      });

      const meta = raw?.meta || raw?.pagination || {};
      const totalFromMeta =
        typeof meta.total === "number" ? meta.total : undefined;
      const nextSkipFromMeta =
        typeof meta.nextSkip === "number" ? meta.nextSkip : undefined;
      const hasMoreFromMeta =
        typeof meta.hasMore === "boolean" ? meta.hasMore : undefined;

      const total =
        totalFromMeta ??
        (append ? (updatedList?.length || 0) : normalizedList.length);
      const nextSkip = nextSkipFromMeta ?? skip + normalizedList.length;
      const hasMore =
        hasMoreFromMeta !== undefined ? hasMoreFromMeta : nextSkip < total;

      setPagination({
        limit,
        skip: nextSkip,
        total,
        hasMore,
      });

      log(`✅ Workshops loaded (${updatedList.length})`);
      return updatedList;
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchAllWorkshops error:", err);
      setError(err.message);
      return [];
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }

  /* 👈 NEW: initial fetch on mount (public view works even before auth events) */
  useEffect(() => {
    fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
  }, []);

  /* ============================================================
     📡 Fetch registered workshops (IDs only)
     ============================================================ */
  async function fetchRegisteredWorkshops() {
    log("📡 Fetching registered workshops (ids)...");
    dbgCtx("fetchRegisteredWorkshops:start");
    try {
      setLoading(true);
      const res = await apiFetch(`/api/workshops/registered`);
      const regIds = await res.json();
      dbgCtx("fetchRegisteredWorkshops:raw-response", {
        ok: res.ok,
        type: Array.isArray(regIds) ? "array" : typeof regIds,
      });

      if (!res.ok) {
        throw new Error(regIds.message || "Failed to load registrations");
      }

      // New payload shape: { userWorkshopMap: [uuid...], familyWorkshopMap: { [workshop]: [familyEntityKey...] } }
      if (!Array.isArray(regIds) && regIds && typeof regIds === "object") {
        const userMapArr = Array.isArray(regIds.userWorkshopMap)
          ? regIds.userWorkshopMap
          : [];
        const famMapObj =
          regIds.familyWorkshopMap && typeof regIds.familyWorkshopMap === "object"
            ? regIds.familyWorkshopMap
            : {};

        const userMap = {};
        const parsedUser = [];
        userMapArr.forEach((id) => {
          const key = sid(id?.workshopKey ?? id);
          if (!key) return;
          userMap[key] = true;
          parsedUser.push(key);
        });

        const famMap = {};
        Object.entries(famMapObj).forEach(([wid, list]) => {
          const widStr = sid(wid);
          const members = Array.isArray(list)
            ? Array.from(new Set(list.map((m) => sid(m)).filter(Boolean)))
            : [];
          if (widStr && members.length) {
            famMap[widStr] = members;
          }
        });

        log(
          `✅ Registered workshops loaded (user=${parsedUser.length}, familyPairs=${Object.keys(
            famMap
          ).length})`
        );
        dbgCtx("fetchRegisteredWorkshops:parsed:maps", {
          userCount: parsedUser.length,
          familyKeys: Object.keys(famMap).slice(0, 3),
        });

        setRegisteredWorkshopIds(parsedUser);
        setUserWorkshopMap(userMap);
        setFamilyWorkshopMap(famMap);
        setServerMapsLoaded(true);
        setMapsReady(true);
        return { userWorkshopMap: userMap, familyWorkshopMap: famMap };
      }

      // Legacy array fallback (just self registrations)
      const parsed = (Array.isArray(regIds) ? regIds : []).map((v) =>
        typeof v === "string" ? v : String(v?.workshopKey ?? v ?? "")
      );
      log(`✅ Registered workshops loaded (${parsed.length})`);
      dbgCtx("fetchRegisteredWorkshops:parsed", {
        count: parsed.length,
        sample: parsed.slice(0, 5),
      });
      setRegisteredWorkshopIds(parsed);
      setServerMapsLoaded(false);
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchRegisteredWorkshops error:", err);
      setError(err.message);
      dbgCtx("fetchRegisteredWorkshops:error", { message: err.message });
      setServerMapsLoaded(false);
    } finally {
      setLoading(false);
      dbgCtx("fetchRegisteredWorkshops:done");
    }
  }

  function fetchWorkshops(options = {}) {
    const opts = typeof options === "boolean" ? { force: options } : options;
    log(`🔁 fetchWorkshops() called | force=${opts.force === true}`);
    dbgCtx("fetchWorkshops:call", { opts });
    return fetchAllWorkshops(opts);
  }

  /* ============================================================
     🔔 Global auth events wiring
     ============================================================ */
  useEffect(() => {
    const onLoggedOut = () => {
      dbgCtx("event:auth-logged-out");
      setUserWorkshopMap({});
      setFamilyWorkshopMap({});
      setMapsReady(false);
      setServerMapsLoaded(false);
      setViewMode("all");
      setRegisteredWorkshopIds([]);
      setSelectedWorkshop(null);
      // refetch public list and render it right away
      fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 })?.then(
        (list) => setDisplayedWorkshops(list || [])
      );
    };

    const onLoggedIn = () => {
      dbgCtx("event:auth-logged-in");
      // load both public list (for maps) and private registrations
      fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      fetchRegisteredWorkshops();
    };

    const onAuthReady = (e) => {
      const loggedIn = !!e?.detail?.loggedIn;
      dbgCtx("event:auth-ready", { loggedIn });
      if (loggedIn) {
        fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
        fetchRegisteredWorkshops();
      } else {
        onLoggedOut();
      }
    };

    const onUserUpdated = () => {
      dbgCtx("event:auth-user-updated");
      // user/family changed → safe to refetch so maps rebuild
      fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      if (viewMode === "mine") fetchRegisteredWorkshops();
    };

    window.addEventListener("auth-logged-out", onLoggedOut);
    window.addEventListener("auth-logged-in", onLoggedIn);
    window.addEventListener("auth-ready", onAuthReady);
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

  // Reset maps when user effectively clears (logout / switch user)
  useEffect(() => {
    const hasUser = !!userKey;
    if (!hasUser) {
      setUserWorkshopMap({});
      setFamilyWorkshopMap({});
      setDisplayedWorkshops([]);
      setMapsReady(false);
      setServerMapsLoaded(false);
    }
  }, [userKey, familyMembersSignature]);

  // Derived maps: built from current normalized list + current user
  useEffect(() => {
    if (serverMapsLoaded) {
      setMapsReady(true);
      return;
    }

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
    const familyIds = familyMembersList.map((m) =>
      sid(m.entityKey || m._id || m.id)
    );

    const uMap = Object.create(null);
    const fMap = Object.create(null);

    for (const w of list) {
      const wid = sid(w?.workshopKey || w?._id || w?.id);
      const regStatus = w?.registrationStatus;

      /* ---- user map ---- */
      if (w?.isUserRegistered || regStatus === "registered") {
        uMap[wid] = true;
      } else if (Array.isArray(w?.participants)) {
        if (w.participants.some((p) => sid(p.entityKey) === currentUserId)) {
          uMap[wid] = true;
        }
      }

      /* ---- family map (union of userFamilyRegistrations + familyRegistrations) ---- */
      const famSet = new Set();

      if (Array.isArray(w?.userFamilyRegistrations)) {
        for (const fid of w.userFamilyRegistrations) {
          const s = sid(fid);
          if (s) famSet.add(s);
        }
      }

      if (Array.isArray(w?.familyRegistrations)) {
        for (const fr of w.familyRegistrations) {
          const parent = sid(fr.parentUser);
          const memberId = sid(fr.familyMemberId);
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
  }, [
    userKey,
    familyMembersSignature,
    workshopsSignature,
    workshops,
    familyMembersList,
    serverMapsLoaded,
  ]);

  // Filter displayedWorkshops when viewMode === "mine"
  useEffect(() => {
    if (viewMode === "mine") {
      setDisplayedWorkshops(
        (workshops || []).filter(
          (w) =>
            userWorkshopMap[w._id] ||
            (familyWorkshopMap[w._id]?.length ?? 0) > 0
        )
      );
    } else {
      setDisplayedWorkshops(workshops || []);
    }
  }, [viewMode, workshops, userWorkshopMap, familyWorkshopMap]);

  /* ============================================================
     🔧 Mutations (server-source-of-truth + refetch)
     ============================================================ */

  // Register an entity (self or family member) to a workshop
  const registerEntityToWorkshop = async (workshopKey, entityKey) => {
    dbgCtx("registerEntity:start", { workshopKey, entityKey });

    if (!entityKey) {
      console.error("❌ registerEntityToWorkshop called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    try {
      const res = await apiFetch(
        `/api/workshops/${workshopKey}/register-entity`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityKey }),
        }
      );

      const data = await res.json();
      dbgCtx("registerEntity:raw-response", {
        ok: res.ok,
        message: data?.message,
      });

      if (!res.ok) throw new Error(data.message || "Failed to register");

      // Always refresh after modifying workshop state
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      await fetchRegisteredWorkshops();
      await fetchProfiles();

      dbgCtx("registerEntity:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (err) {
      console.error("❌ registerEntityToWorkshop error:", err);
      return { success: false, message: err.message };
    }
  };

  // Unregister an entity from a workshop
  const unregisterEntityFromWorkshop = async (workshopKey, entityKey) => {
    dbgCtx("unregisterEntity:start", { workshopKey, entityKey });

    if (!entityKey) {
      console.error("❌ unregisterEntityFromWorkshop called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    try {
      const res = await apiFetch(
        `/api/workshops/${workshopKey}/unregister-entity`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityKey }),
        }
      );

      const data = await res.json();
      dbgCtx("unregisterEntity:raw-response", {
        ok: res.ok,
        message: data?.message,
      });

      if (!res.ok) throw new Error(data.message || "Failed to unregister");

      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      await fetchRegisteredWorkshops();
      await fetchProfiles();

      dbgCtx("unregisterEntity:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (err) {
      console.error("❌ unregisterEntityFromWorkshop error:", err);
      return { success: false, message: err.message };
    }
  };

  // Register to waitlist
  const registerToWaitlist = async (workshopKey, entityKey) => {
    dbgCtx("waitlistRegister:start", { workshopKey, entityKey });

    if (!entityKey) {
      console.error("❌ registerToWaitlist called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    try {
      const res = await apiFetch(
        `/api/workshops/${workshopKey}/waitlist-entity`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityKey }),
        }
      );

      const data = await res.json();
      dbgCtx("waitlistRegister:raw-response", {
        ok: res.ok,
        message: data?.message,
      });

      if (!res.ok) throw new Error(data.message || "Failed to join waitlist");

      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      await fetchRegisteredWorkshops();
      await fetchProfiles();

      dbgCtx("waitlistRegister:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (e) {
      console.error("❌ registerToWaitlist error:", e);
      dbgCtx("waitlistRegister:error", {
        workshopKey,
        entityKey,
        message: e?.message,
      });
      return {
        success: false,
        message: e?.message || "Waitlist registration failed",
      };
    }
  };

  const unregisterFromWaitlist = async (workshopKey, entityKey) => {
    dbgCtx("waitlistUnregister:start", { workshopKey, entityKey });

    if (!entityKey) {
      console.error("❌ unregisterFromWaitlist called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    try {
      const res = await apiFetch(
        `/api/workshops/${workshopKey}/waitlist-entity`,
        {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ entityKey }),
        }
      );

      const data = await res.json();
      dbgCtx("waitlistUnregister:raw-response", {
        ok: res.ok,
        message: data?.message,
      });

      if (!res.ok) throw new Error(data.message || "Failed to leave waitlist");

      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      await fetchRegisteredWorkshops();
      await fetchProfiles();

      dbgCtx("waitlistUnregister:success", { workshopKey, entityKey });
      return { success: true, data };
    } catch (e) {
      console.error("❌ unregisterFromWaitlist error:", e);
      dbgCtx("waitlistUnregister:error", {
        workshopKey,
        entityKey,
        message: e?.message,
      });
      return {
        success: false,
        message: e?.message || "Waitlist removal failed",
      };
    }
  };

  /* ============================================================
   🛠️ Admin: Create & Update Workshops
   ============================================================ */
  const deleteWorkshop = async (id) => {
    dbgCtx("deleteWorkshop:start", { id });
    try {
      const res = await apiFetch(`/api/workshops/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      dbgCtx("deleteWorkshop:raw-response", { ok: res.ok });
      if (!res.ok)
        throw new Error(data.message || "Failed to delete workshop");
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 }); // refresh from server
      dbgCtx("deleteWorkshop:success", { id });
      return { success: true, message: "Workshop deleted successfully" };
    } catch (err) {
      console.error("❌ deleteWorkshop error:", err);
      dbgCtx("deleteWorkshop:error", { id, message: err.message });
      return { success: false, message: err.message };
    }
  };

  const createWorkshop = async (payload) => {
    dbgCtx("createWorkshop:start", { payload });
    try {
      const res = await apiFetch(`/api/workshops`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      dbgCtx("createWorkshop:raw-response", {
        ok: res.ok,
        message: data?.message,
      });
      if (!res.ok)
        throw new Error(data.message || "Failed to create workshop");
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 }); // refresh
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
      dbgCtx("updateWorkshop:raw-response", {
        ok: res.ok,
        message: data?.message,
      });
      if (!res.ok)
        throw new Error(data.message || "Failed to update workshop");
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      return { success: true, data };
    } catch (err) {
      console.error("❌ updateWorkshop error:", err);
      dbgCtx("updateWorkshop:error", { workshopId, message: err.message });
      return { success: false, message: err.message };
    }
  };

  const exportWorkshop = async (workshopId, type = "current") => {
    dbgCtx("exportWorkshop:start", { workshopId, type });

    if (!workshopId) {
      console.error("❌ exportWorkshop called WITHOUT workshopId");
      return { success: false, message: "Missing workshop identifier" };
    }

    try {
      const res = await apiFetch(
        `/api/workshops/${workshopId}/export?type=${type}`,
        {
          method: "POST",
        }
      );

      const data = await res.json();

      if (!res.ok) throw new Error(data.message || "Failed to export workshop");

      dbgCtx("exportWorkshop:success", { workshopId, type });
      return { success: true, data };
    } catch (err) {
      console.error("❌ exportWorkshop error:", err);
      dbgCtx("exportWorkshop:error", { message: err.message });
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
      dbgCtx("fetchAvailableCities:raw-response", {
        ok: res.ok,
        keys: Object.keys(data || {}),
      });
      if (!res.ok)
        throw new Error(data.message || "Failed to fetch cities");
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
        `/api/workshops/validate-address?city=${encodeURIComponent(
          city
        )}&address=${encodeURIComponent(address)}`
      );
      const data = await res.json();
      dbgCtx("validateAddress:raw-response", { ok: res.ok, data });
      if (!res.ok)
        throw new Error(data.message || "Failed to validate address");
      dbgCtx("validateAddress:success");
      return data;
    } catch (err) {
      console.error("❌ validateAddress error:", err);
      dbgCtx("validateAddress:error", { message: err.message });
      return { success: false, message: err.message };
    }
  };

  const loadMoreWorkshops = async () => {
    dbgCtx("loadMoreWorkshops:call", {
      loading,
      loadingMore,
      hasMore: pagination.hasMore,
      nextSkip: pagination.skip,
    });
    if (loadingMore || loading || !pagination.hasMore) return [];
    return fetchAllWorkshops({
      limit: pagination.limit || 10,
      skip: pagination.skip || workshops.length || 0,
      append: true,
    });
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
        loadingMore,
        error,
        viewMode,
        setViewMode,
        selectedWorkshop,
        setSelectedWorkshop,

        fetchWorkshops,
        loadMoreWorkshops,
        fetchRegisteredWorkshops,

        deleteWorkshop,
        registerEntityToWorkshop,
        unregisterEntityFromWorkshop,
        registerToWaitlist,
        unregisterFromWaitlist,

        fetchAvailableCities,
        validateAddress,

        exportWorkshop,
        pagination,

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
