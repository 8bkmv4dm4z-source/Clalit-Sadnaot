// PATCHED ProfileContext.jsx — Option A1 (Server-flattened, no frontend re-flatten)
// ------------------------------------------------------------------------------------
// Key changes:
//  - REMOVED: flattenUserEntities, flattenEntitiesList
//  - Frontend now treats server response as FINAL entity list
//  - No regrouping, no nesting, no merging
//  - AllProfiles now receives perfect flat rows
// ------------------------------------------------------------------------------------

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { apiFetch } from "../../utils/apiFetch";
import { useAuth } from "../AuthLayout";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import { normalizeError } from "../../utils/normalizeError";

const ProfileCtx = createContext(null);
export const useProfiles = () => useContext(ProfileCtx);

const DEFAULT_CACHE_KEY = "__NOSEARCH__";

const normalizeLocalQuery = (value) => {
  let s = String(value ?? "");
  s = s.trim().toLowerCase();
  if (/[^\d-]/.test(s)) s = s.replace(/[\u00A0\s-]+/g, "");
  return s.replace(/[^\w@.\u0590-\u05FF\s]/g, "");
};

const rowMatchesQuery = (row, normalizedQuery) => {
  if (!normalizedQuery) return true;
  const FIELDS = [
    "name",
    "email",
    "phone",
    "city",
    "idNumber",
    "parentName",
    "parentEmail",
    "parentPhone",
    "parentCity",
    "parentIdNumber",
    "relation",
  ];
  return FIELDS.some((field) => {
    if (!row[field]) return false;
    const value = normalizeLocalQuery(row[field]);
    return value.includes(normalizedQuery);
  });
};

export function ProfileProvider({ children }) {
  const { isLoggedIn, loading: authLoading } = useAuth();
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const searchCache = useRef(new Map());

  // -----------------------------------------
  // FETCH PROFILES (no flattening — server is truth)
  // -----------------------------------------
  const fetchProfiles = useCallback(async ({ limit = 1000, compact = 1 } = {}) => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (compact) params.set("compact", "1");

      const res = await apiFetch(`/api/users?${params.toString()}`);
      const data = await res.json();
      if (!res.ok) {
        throw (
          res.normalizedError ||
          normalizeError(null, { status: res.status, payload: data, fallbackMessage: "Failed to load users" })
        );
      }

      const list = Array.isArray(data) ? data : [];

      setRows(list);
    } catch (e) {
      const normalized = normalizeError(e, { fallbackMessage: "Failed to load users" });
      console.error("❌ [profiles] fetchProfiles", e);
      setRows([]);
      setError(normalized.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const resetProfiles = useCallback(() => {
    setRows([]);
    setError(null);
    searchCache.current.clear();
  }, []);

  // -----------------------------
  // INVALIDATE cache on broadcasts
  // -----------------------------
  useEffect(() => {
    const onInvalidate = () => {
      clearTimeout(window.__profilesInvalidateTO);
      window.__profilesInvalidateTO = setTimeout(() => {
        if (!canAccessAdmin || isChecking) return;
        searchCache.current.clear();
        fetchProfiles({ limit: 1000, compact: 1 });
      }, 80);
    };
    window.addEventListener("profiles:invalidate", onInvalidate);
    return () => window.removeEventListener("profiles:invalidate", onInvalidate);
  }, [canAccessAdmin, fetchProfiles, isChecking]);

  // -----------------------------
  // AUTH change → load or reset
  // -----------------------------
  useEffect(() => {
    if (authLoading || isChecking) return;

    if (!isLoggedIn || !canAccessAdmin) {
      resetProfiles();
      setLoading(false);
      return;
    }

    fetchProfiles({ limit: 1000, compact: 1 });
  }, [authLoading, canAccessAdmin, fetchProfiles, isChecking, isLoggedIn, resetProfiles]);

  // -----------------------------
  // Cache default set
  // -----------------------------
  useEffect(() => {
    searchCache.current.clear();
    searchCache.current.set(DEFAULT_CACHE_KEY, rows.slice(0, 100));
  }, [rows]);

  // -----------------------------
  // SEARCH (server → fallback local)
  // -----------------------------
  const searchProfiles = useCallback(
    async (rawQuery = "") => {
      const normalized = normalizeLocalQuery(rawQuery);

      if (!normalized) {
        const defaults =
          searchCache.current.get(DEFAULT_CACHE_KEY) || rows.slice(0, 100);
        if (!searchCache.current.has(DEFAULT_CACHE_KEY)) {
          searchCache.current.set(DEFAULT_CACHE_KEY, defaults);
        }
        return defaults;
      }

      if (searchCache.current.has(normalized)) {
        return searchCache.current.get(normalized);
      }

      try {
        const params = new URLSearchParams();
        params.set("q", rawQuery);
        params.set("limit", "200");

        const res = await apiFetch(`/api/users/search?${params.toString()}`);
        const data = await res.json();
        if (!res.ok) {
          throw (
            res.normalizedError ||
            normalizeError(null, {
              status: res.status,
              payload: data,
              fallbackMessage: "Failed to search users",
            })
          );
        }

        const list = Array.isArray(data) ? data : [];

        searchCache.current.set(normalized, list);
        return list;
      } catch (err) {
        const normalized = normalizeError(err, { fallbackMessage: "Failed to search users" });
        console.warn("[profiles] remote search failed, fallback local", normalized.message);
      }

      const filtered = rows.filter((row) => rowMatchesQuery(row, normalized));
      searchCache.current.set(normalized, filtered);
      return filtered;
    },
    [rows]
  );

  // PUBLIC API
  const getUserWorkshops = async ({ entityKey, familyEntityKey }) => {
    const base = `/api/users/${encodeURIComponent(entityKey)}/workshops`;
    const url = familyEntityKey
      ? `${base}?familyEntityKey=${encodeURIComponent(familyEntityKey)}`
      : base;
    const res = await apiFetch(url);
    const data = await res.json();
    if (!res.ok) {
      throw (
        res.normalizedError ||
        normalizeError(null, {
          status: res.status,
          payload: data,
          fallbackMessage: "Failed to fetch workshops",
        })
      );
    }
    return Array.isArray(data) ? data : [];
  };

  const updateEntity = async (payload) => {
    const res = await apiFetch(`/api/users/update-entity`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      const normalized =
        res.normalizedError ||
        normalizeError(null, {
          status: res.status,
          payload: data,
          fallbackMessage: "Update failed",
        });
      return { success: false, message: normalized.message, error: normalized };
    }
    try {
      await fetchProfiles({ limit: 1000, compact: 1 });
      searchCache.current.clear();
    } catch (err) {
      console.warn("profiles refresh failed after update", err);
    }
    return { success: true };
  };

  const deleteEntity = useCallback(
    async ({ entityKey } = {}) => {
      if (!entityKey) return { success: false, message: "Missing entity key" };
      try {
        // Use the profile router so the backend also cleans up workshop registrations
        const res = await apiFetch(
          `/api/profile/by-entity/${encodeURIComponent(entityKey)}`,
          {
            method: "DELETE",
          }
        );
        const data = await res.json();
        if (!res.ok || data?.success === false) {
          throw (
            res.normalizedError ||
            normalizeError(null, {
              status: res.status,
              payload: data,
              fallbackMessage: "Delete failed",
            })
          );
        }
        await fetchProfiles({ limit: 1000, compact: 1 });
        searchCache.current.clear();
        return { success: true, message: data?.message || "Deleted" };
      } catch (err) {
        const normalized = normalizeError(err, { fallbackMessage: "Delete failed" });
        console.error("❌ [profiles] deleteEntity", err);
        return { success: false, message: normalized.message, error: normalized };
      }
    },
    [fetchProfiles]
  );

  const getEntityDetails = useCallback(async (rowOrId) => {
    const entityKey =
      typeof rowOrId === "string"
        ? rowOrId
        : rowOrId?.entityKey
        ? String(rowOrId.entityKey)
        : null;

    if (!entityKey) throw new Error("Missing entity key");

    const res = await apiFetch(`/api/users/entity/${encodeURIComponent(entityKey)}`);
    const data = await res.json();
    if (!res.ok) {
      throw (
        res.normalizedError ||
        normalizeError(null, {
          status: res.status,
          payload: data,
          fallbackMessage: "Failed to load entity",
        })
      );
    }
    return data;
  }, []);

  const value = {
    profiles: rows,
    loading,
    error,
    fetchProfiles,
    searchProfiles,
    getUserWorkshops,
    updateEntity,
    deleteEntity,
    getEntityDetails,
  };

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}
