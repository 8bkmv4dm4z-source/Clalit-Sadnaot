// src/contexts/WorkshopContext.js
/**
 * WorkshopContext.js
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
 * Invariants:
 * - Workshop IDs are strings.
 * - participant/familyMember IDs normalized to strings.
 * - Never hold stale data: every mutation refetches from server.
 */

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import axios from "axios";
import { useProfiles } from "../layouts/ProfileContext";
import { useAuth } from "../layouts/AuthLayout";
import { normalizeEntity } from "../utils/normalizeEntity";
import { useAdminCapabilityStatus } from "../context/AdminCapabilityContext";
import { normalizeError } from "../utils/normalizeError";

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

const WORKSHOP_ERROR_MESSAGE =
  "Something went wrong while loading workshops. Please try refreshing.";

const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
  (typeof globalThis !== "undefined" && globalThis.process?.env?.VITE_API_URL) ||
  "";

const ACCESS_TOKEN_KEY = "accessToken";
const refreshPath = "/api/auth/refresh";
const api = axios.create({
  baseURL: API_BASE,
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

let refreshPromise = null;
let logoutHandler = null;
let requestInterceptorId = null;
let responseInterceptorId = null;

const setLogoutHandler = (handler) => {
  logoutHandler = async (...args) => {
    const result = await handler(...args);
    ejectInterceptors();
    return result;
  };
};

const ejectInterceptors = () => {
  if (requestInterceptorId !== null) {
    api.interceptors.request.eject(requestInterceptorId);
    requestInterceptorId = null;
  }
  if (responseInterceptorId !== null) {
    api.interceptors.response.eject(responseInterceptorId);
    responseInterceptorId = null;
  }
  refreshPromise = null;
};

const attachInterceptors = () => {
  if (requestInterceptorId !== null || responseInterceptorId !== null) return;

  requestInterceptorId = api.interceptors.request.use((config) => {
    const token = localStorage.getItem(ACCESS_TOKEN_KEY);
    if (token) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  });

  responseInterceptorId = api.interceptors.response.use(
    (response) => response,
    async (error) => {
      const originalRequest = error.config || {};
      const status = error?.response?.status;

      if (status === 401 && !originalRequest._retry) {
        originalRequest._retry = true;

        if (!refreshPromise) {
          refreshPromise = axios
            .post(`${API_BASE}${refreshPath}`, {}, { withCredentials: true })
            .then((res) => res.data)
            .finally(() => {
              refreshPromise = null;
            });
        }

        try {
          const refreshData = await refreshPromise;
          const newToken = refreshData?.accessToken;
          if (newToken) {
            localStorage.setItem(ACCESS_TOKEN_KEY, newToken);
            originalRequest.headers = originalRequest.headers || {};
            originalRequest.headers.Authorization = `Bearer ${newToken}`;
            return api.request(originalRequest);
          }
        } catch (refreshErr) {
          if (typeof logoutHandler === "function") {
            await logoutHandler(true);
          }
          ejectInterceptors();
          return Promise.reject(refreshErr);
        }
      }

      return Promise.reject(error);
    }
  );
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const withTransactionRetry = async (fn) => {
  const delays = [300, 600, 1200];
  let attempt = 0;

  while (true) {
    try {
      return await fn();
    } catch (err) {
      const status = err?.response?.status;
      if (status !== 409) throw err;
      if (attempt >= delays.length) {
        throw new Error("High traffic, please try again.");
      }
      await sleep(delays[attempt]);
      attempt += 1;
    }
  }
};

const normalizeUiError = (err, fallback) =>
  normalizeError(err, { fallbackMessage: fallback });

export const WorkshopProvider = ({ children }) => {
  const { user, isLoggedIn, loading: authLoading, logoutInProgress, logout } =
    useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();
  const { fetchProfiles } = useProfiles();

  const [workshops, setWorkshops] = useState([]);
  const [displayedWorkshops, setDisplayedWorkshops] = useState([]);
  const [registeredWorkshopIds, setRegisteredWorkshopIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [hasError, setHasError] = useState(false);

  const [viewMode, setViewMode] = useState("all"); // "all" | "mine"
  const [selectedWorkshop, setSelectedWorkshop] = useState(null);
  const [pagination, setPagination] = useState({
    limit: 10,
    skip: 0,
    total: 0,
    hasMore: true,
  });
  const [accessScope, setAccessScope] = useState("public");
  const paginationRef = useRef(pagination);
  const accessScopeRef = useRef(accessScope);
  const fetchInFlightRef = useRef(false);

  // Derived maps (context-only, never mutated directly)
  const [userWorkshopMap, setUserWorkshopMap] = useState({}); // { [workshopId]: true }
  const [familyWorkshopMap, setFamilyWorkshopMap] = useState({}); // { [workshopId]: [familyId,...] }
  const [mapsReady, setMapsReady] = useState(false);
  const [serverMapsLoaded, setServerMapsLoaded] = useState(false);

  useEffect(() => {
    paginationRef.current = pagination;
  }, [pagination]);

  useEffect(() => {
    accessScopeRef.current = accessScope;
  }, [accessScope]);

  useEffect(() => {
    setLogoutHandler(logout);
  }, [logout]);

  useEffect(() => {
    if (isLoggedIn) {
      attachInterceptors();
    } else {
      ejectInterceptors();
    }
  }, [isLoggedIn]);

  const setWorkshopError = useCallback((normalized = null) => {
    setError(normalized);
    setHasError(!!normalized?.message);
  }, []);

  const canFetchWorkshops = useCallback(
    ({ allowPublic = true } = {}) => {
      if (authLoading || logoutInProgress) return false;
      if (!isLoggedIn && !allowPublic) return false;
      return true;
    },
    [authLoading, isLoggedIn, logoutInProgress]
  );

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
  const fetchAllWorkshops = useCallback(
    async (options = {}) => {
      if (!canFetchWorkshops({ allowPublic: true })) {
        dbgCtx("fetchAllWorkshops:skip-auth", {
          authLoading,
          logoutInProgress,
          isLoggedIn,
        });
        return [];
      }
      const opts = typeof options === "boolean" ? { force: options } : options;
      const currentPagination = paginationRef.current;
      const currentScope = accessScopeRef.current || "public";
      const {
        force = false,
        limit = currentPagination.limit || 10,
        skip = force ? 0 : currentPagination.skip || 0,
        append = false,
        scope = currentScope,
      } = opts;

      const effectiveScope = scope || "public";

      if (fetchInFlightRef.current && !force) {
        dbgCtx("fetchAllWorkshops:skip-inflight", { force, scope: effectiveScope });
        return [];
      }

      fetchInFlightRef.current = true;

      log(
        `📡 Fetching all workshops (force=${force}, limit=${limit}, skip=${skip}, append=${append}, scope=${effectiveScope})`
      );
      dbgCtx("fetchAllWorkshops:start", { force, limit, skip, append });
      if (append) setLoadingMore(true);
      else setLoading(true);
      setWorkshopError(null);

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
        if (effectiveScope) params.set("scope", effectiveScope);

        const res = await api.get(`/api/workshops?${params.toString()}`);
        const raw = res.data;

        dbgCtx("fetchAllWorkshops:raw-response", {
          ok: true,
          rawType: typeof raw,
          hasData: Array.isArray(raw?.data),
        });

        const possibleArrays = [raw?.data, raw?.workshops, raw?.events, raw];
        const data = possibleArrays.find(Array.isArray) || [];

        const list = Array.isArray(data) ? data : [];

        const normalizedList = list
          .map((w, idx) => {
            const wid = sid(w.workshopKey || w._id || w.hashedId || "");

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

            const participantsRaw = Array.isArray(w.participants) ? w.participants : [];

            const participants = participantsRaw.map((p) =>
              typeof p === "string"
                ? normalizeEntity({ entityKey: p })
                : normalizeEntity(p)
            );

            const waitingList = Array.isArray(w.waitingList)
              ? w.waitingList.map((wl) => {
                  let parentKey = sid(
                    wl.parentUser?.entityKey ?? wl.parentUser ?? wl.parentKey ?? ""
                  );

                  const entityRaw =
                    wl.entityKey?.entityKey ??
                    wl.entityKey ??
                    wl.familyMemberId?.entityKey ??
                    wl.familyMemberId ??
                    wl.familyMemberKey ??
                    "";

                  const entityKey = sid(entityRaw);

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

            const familyRegistrations = Array.isArray(w.familyRegistrations)
              ? w.familyRegistrations.map((fr) => {
                  const parentKey = sid(
                    fr.parentUser?.entityKey ?? fr.parentUser ?? fr.parentKey ?? ""
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

            const userFamilyRegistrations = Array.isArray(w.userFamilyRegistrations)
              ? w.userFamilyRegistrations.map((id) => sid(id))
              : [];

            const isUserRegistered =
              registrationStatus === "registered" ||
              !!w.isUserRegistered ||
              (userKey && participants.some((p) => sid(p.entityKey) === userKey));

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
          .filter(Boolean);
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
        const totalFromMeta = typeof meta.total === "number" ? meta.total : undefined;
        const nextSkipFromMeta =
          typeof meta.nextSkip === "number" ? meta.nextSkip : undefined;
        const hasMoreFromMeta = typeof meta.hasMore === "boolean" ? meta.hasMore : undefined;

        const total =
          totalFromMeta ??
          (append ? (updatedList?.length || 0) : normalizedList.length);
        const nextSkip = nextSkipFromMeta ?? skip + normalizedList.length;
        const hasMore = hasMoreFromMeta !== undefined ? hasMoreFromMeta : nextSkip < total;

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
        const normalized = normalizeUiError(err, WORKSHOP_ERROR_MESSAGE);
        setWorkshopError(normalized);
        if (normalized.kind === "Auth" && typeof logout === "function") {
          await logout(true);
        }
        return [];
      } finally {
        fetchInFlightRef.current = false;
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    },
    [
      authLoading,
      canFetchWorkshops,
      isLoggedIn,
      logoutInProgress,
      setWorkshopError,
      userKey,
    ]
  );
  /* ============================================================
     📡 Fetch registered workshops (IDs only)
     ============================================================ */
  const fetchRegisteredWorkshops = useCallback(async () => {
    if (!canFetchWorkshops({ allowPublic: false })) {
      dbgCtx("fetchRegisteredWorkshops:skip-auth", {
        authLoading,
        logoutInProgress,
        isLoggedIn,
      });
      setLoading(false);
      return;
    }
    log("📡 Fetching registered workshops (ids)...");
    dbgCtx("fetchRegisteredWorkshops:start");
    try {
      setLoading(true);
      const res = await api.get(`/api/workshops/registered`);
      const regIds = res.data;
      dbgCtx("fetchRegisteredWorkshops:raw-response", {
        ok: true,
        type: Array.isArray(regIds) ? "array" : typeof regIds,
      });

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

        setUserWorkshopMap(userMap);
        setFamilyWorkshopMap(famMap);
        setMapsReady(true);
        setServerMapsLoaded(true);
      }
    } catch (err) {
      console.error("❌ [WORKSHOP] fetchRegisteredWorkshops error:", err);
      const normalized = normalizeUiError(err, WORKSHOP_ERROR_MESSAGE);
      setWorkshopError(normalized);
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
    } finally {
      setLoading(false);
    }
  }, [authLoading, canFetchWorkshops, isLoggedIn, logoutInProgress, setWorkshopError]);

  /* ============================================================
     🧭 Build user/family maps locally when server maps missing
     ============================================================ */
  const buildLocalWorkshopMaps = useCallback(() => {
    if (!workshops?.length || !userKey) {
      setUserWorkshopMap({});
      setFamilyWorkshopMap({});
      setMapsReady(true);
      return;
    }

    const uMap = {};
    const fMap = {};

    for (const w of workshops) {
      const wid = sid(w?._id);
      if (!wid) continue;

      if (Array.isArray(w?.participants)) {
        if (w.participants.some((p) => sid(p.entityKey) === userKey)) {
          uMap[wid] = true;
        }
      }

      if (Array.isArray(w?.familyRegistrations)) {
        for (const fr of w.familyRegistrations) {
          const parentKey = sid(fr.parentKey || fr.parentUser);
          const memberKey = sid(fr.familyMemberKey || fr.familyMemberId);
          if (parentKey === userKey && memberKey) {
            if (!fMap[wid]) fMap[wid] = [];
            fMap[wid].push(memberKey);
          }
        }
      }
    }

    setUserWorkshopMap(uMap);
    setFamilyWorkshopMap(fMap);
    setMapsReady(true);
  }, [userKey, workshops]);

  useEffect(() => {
    if (!serverMapsLoaded) {
      buildLocalWorkshopMaps();
    }
  }, [buildLocalWorkshopMaps, serverMapsLoaded, familyMembersSignature, workshopsSignature]);

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

  const refetchAfterMutation = async () => {
    await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
    await fetchRegisteredWorkshops();
    await fetchProfiles();
  };

  // Register an entity (self or family member) to a workshop
  const registerEntityToWorkshop = async (workshopId, entityKey) => {
    dbgCtx("registerEntity:start", { workshopId, entityKey });

    if (!entityKey) {
      console.error("❌ registerEntityToWorkshop called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    const target = (workshops || []).find(
      (w) => sid(w?.workshopKey || w?._id) === sid(workshopId)
    );
    if (target?.available === false) {
      return {
        success: false,
        message: "הסדנה אינה זמינה להרשמה",
      };
    }
    if (target?.adminHidden) {
      return {
        success: false,
        message: "סדנה מוסתרת אינה זמינה להרשמה",
      };
    }

    try {
      const res = await withTransactionRetry(() =>
        api.post(`/api/workshops/${workshopId}/register-entity`, { entityKey })
      );

      dbgCtx("registerEntity:raw-response", {
        ok: true,
        message: res.data?.message,
      });

      await refetchAfterMutation();

      dbgCtx("registerEntity:success", { workshopId, entityKey });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to register");
      console.error("❌ registerEntityToWorkshop error:", err);
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  // Unregister an entity from a workshop
  const unregisterEntityFromWorkshop = async (workshopId, entityKey) => {
    dbgCtx("unregisterEntity:start", { workshopId, entityKey });

    if (!entityKey) {
      console.error("❌ unregisterEntityFromWorkshop called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    try {
      const res = await withTransactionRetry(() =>
        api.delete(`/api/workshops/${workshopId}/unregister-entity`, {
          data: { entityKey },
        })
      );

      dbgCtx("unregisterEntity:raw-response", {
        ok: true,
        message: res.data?.message,
      });

      await refetchAfterMutation();

      dbgCtx("unregisterEntity:success", { workshopId, entityKey });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to unregister");
      console.error("❌ unregisterEntityFromWorkshop error:", err);
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  // Register to waitlist
  const registerToWaitlist = async (workshopId, entityKey) => {
    dbgCtx("waitlistRegister:start", { workshopId, entityKey });

    if (!entityKey) {
      console.error("❌ registerToWaitlist called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    const target = (workshops || []).find(
      (w) => sid(w?.workshopKey || w?._id) === sid(workshopId)
    );
    if (target?.available === false) {
      return {
        success: false,
        message: "הסדנה אינה זמינה להרשמה",
      };
    }
    if (target?.adminHidden) {
      return {
        success: false,
        message: "סדנה מוסתרת אינה זמינה להרשמה",
      };
    }

    try {
      const res = await withTransactionRetry(() =>
        api.post(`/api/workshops/${workshopId}/waitlist-entity`, { entityKey })
      );

      dbgCtx("waitlistRegister:raw-response", {
        ok: true,
        message: res.data?.message,
      });

      await refetchAfterMutation();

      dbgCtx("waitlistRegister:success", { workshopId, entityKey });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to join waitlist");
      console.error("❌ registerToWaitlist error:", err);
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  const unregisterFromWaitlist = async (workshopId, entityKey) => {
    dbgCtx("waitlistUnregister:start", { workshopId, entityKey });

    if (!entityKey) {
      console.error("❌ unregisterFromWaitlist called WITHOUT entityKey");
      return { success: false, message: "Missing entityKey" };
    }

    try {
      const res = await withTransactionRetry(() =>
        api.delete(`/api/workshops/${workshopId}/waitlist-entity`, {
          data: { entityKey },
        })
      );

      dbgCtx("waitlistUnregister:raw-response", {
        ok: true,
        message: res.data?.message,
      });

      await refetchAfterMutation();

      dbgCtx("waitlistUnregister:success", { workshopId, entityKey });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to leave waitlist");
      console.error("❌ unregisterFromWaitlist error:", err);
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  /* ============================================================
   🛠️ Admin: Create & Update Workshops
   ============================================================ */
  const deleteWorkshop = async (id) => {
    dbgCtx("deleteWorkshop:start", { id });
    try {
      const res = await api.delete(`/api/workshops/${id}`);
      dbgCtx("deleteWorkshop:raw-response", { ok: true });
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      dbgCtx("deleteWorkshop:success", { id });
      return { success: true, message: "Workshop deleted successfully" };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to delete workshop");
      console.error("❌ deleteWorkshop error:", err);
      dbgCtx("deleteWorkshop:error", { id, message: normalized.message });
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  const createWorkshop = async (payload) => {
    dbgCtx("createWorkshop:start", { payload });
    try {
      const res = await api.post(`/api/workshops`, payload);
      dbgCtx("createWorkshop:raw-response", {
        ok: true,
        message: res.data?.message,
      });
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to create workshop");
      console.error("❌ createWorkshop error:", err);
      dbgCtx("createWorkshop:error", { message: normalized.message });
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  const updateWorkshop = async (workshopId, payload) => {
    dbgCtx("updateWorkshop:start", { workshopId, payload });
    try {
      const res = await api.put(`/api/workshops/${workshopId}`, payload);
      dbgCtx("updateWorkshop:raw-response", {
        ok: true,
        message: res.data?.message,
      });
      await fetchAllWorkshops({ force: true, limit: pagination.limit, skip: 0 });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to update workshop");
      console.error("❌ updateWorkshop error:", err);
      dbgCtx("updateWorkshop:error", { workshopId, message: normalized.message });
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  const exportWorkshop = async (
    workshopId,
    type = "current",
    audience = "admin"
  ) => {
    dbgCtx("exportWorkshop:start", { workshopId, type, audience });

    if (!workshopId) {
      console.error("❌ exportWorkshop called WITHOUT workshopId");
      return { success: false, message: "Missing workshop identifier" };
    }

    try {
      const params = new URLSearchParams();
      params.set("type", type);
      params.set("audience", audience);
      const res = await api.post(`/api/workshops/${workshopId}/export?${params.toString()}`);

      dbgCtx("exportWorkshop:success", { workshopId, type });
      return { success: true, data: res.data };
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to export workshop");
      console.error("❌ exportWorkshop error:", err);
      dbgCtx("exportWorkshop:error", { message: normalized.message });
      if (normalized.kind === "Auth" && typeof logout === "function") {
        await logout(true);
      }
      return { success: false, message: normalized.message, error: normalized };
    }
  };

  /* ============================================================
     🏙️ Utilities
     ============================================================ */
  const fetchAvailableCities = async () => {
    dbgCtx("fetchAvailableCities:start");
    try {
      const res = await api.get("/api/workshops/meta/cities");
      const data = res.data;
      dbgCtx("fetchAvailableCities:raw-response", {
        ok: true,
        keys: Object.keys(data || {}),
      });
      const cities = data.cities || [];
      dbgCtx("fetchAvailableCities:success", { count: cities.length });
      return cities;
    } catch (err) {
      const normalized = normalizeUiError(err, WORKSHOP_ERROR_MESSAGE);
      console.error("❌ fetchAvailableCities error:", err);
      dbgCtx("fetchAvailableCities:error", { message: normalized.message });
      return [];
    }
  };

  const validateAddress = async (city, address) => {
    dbgCtx("validateAddress:start", { city, address });
    try {
      const res = await api.get(
        `/api/workshops/validate-address?city=${encodeURIComponent(
          city
        )}&address=${encodeURIComponent(address)}`
      );
      const data = res.data;
      dbgCtx("validateAddress:raw-response", { ok: true, data });
      dbgCtx("validateAddress:success");
      return data;
    } catch (err) {
      const normalized = normalizeUiError(err, "Failed to validate address");
      console.error("❌ validateAddress error:", err);
      dbgCtx("validateAddress:error", { message: normalized.message });
      return { success: false, message: normalized.message, error: normalized };
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
      scope: accessScope,
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
        hasError,
        viewMode,
        setViewMode,
        selectedWorkshop,
        setSelectedWorkshop,

        fetchWorkshops: fetchAllWorkshops,
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
        accessScope,
        setAccessScope,

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
