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
import { withEntityFlags } from "../../utils/entityTypes"; // kept only for icons/roles

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
  const { isLoggedIn, isAdmin, loading: authLoading } = useAuth();
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
      if (!res.ok) throw new Error(data?.message || "Failed to load users");

      const list = Array.isArray(data) ? data : [];

      // A1: Apply ONLY basic flags, do NOT flatten
      const final = list.map((e) => withEntityFlags(e));

      setRows(final);
    } catch (e) {
      console.error("❌ [profiles] fetchProfiles", e);
      setRows([]);
      setError(e.message);
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
        if (!isAdmin) return;
        searchCache.current.clear();
        fetchProfiles({ limit: 1000, compact: 1 });
      }, 80);
    };
    window.addEventListener("profiles:invalidate", onInvalidate);
    return () => window.removeEventListener("profiles:invalidate", onInvalidate);
  }, [fetchProfiles, isAdmin]);

  // -----------------------------
  // AUTH change → load or reset
  // -----------------------------
  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn || !isAdmin) {
      resetProfiles();
      setLoading(false);
      return;
    }

    fetchProfiles({ limit: 1000, compact: 1 });
  }, [authLoading, isLoggedIn, isAdmin, fetchProfiles, resetProfiles]);

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
        if (!res.ok) throw new Error(data?.message || "Failed to search users");

        const list = Array.isArray(data) ? data : [];
        const final = list.map((e) => withEntityFlags(e));

        searchCache.current.set(normalized, final);
        return final;
      } catch (err) {
        console.warn("[profiles] remote search failed, fallback local", err);
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
    if (!res.ok) throw new Error(data?.message || "Failed to fetch workshops");
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
      return { success: false, message: data?.message || "Update failed" };
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
        const res = await apiFetch(`/api/users/${encodeURIComponent(entityKey)}`, {
          method: "DELETE",
        });
        const data = await res.json();
        if (!res.ok || data?.success === false) {
          throw new Error(data?.message || "Delete failed");
        }
        await fetchProfiles({ limit: 1000, compact: 1 });
        searchCache.current.clear();
        return { success: true, message: data?.message || "Deleted" };
      } catch (err) {
        console.error("❌ [profiles] deleteEntity", err);
        return { success: false, message: err.message };
      }
    },
    [fetchProfiles]
  );

  const getEntityDetails = useCallback(async (rowOrId) => {
    const entityKey =
      typeof rowOrId === "string"
        ? rowOrId
        : rowOrId && (rowOrId.entityKey || rowOrId._id)
        ? String(rowOrId.entityKey || rowOrId._id)
        : null;

    if (!entityKey) throw new Error("Missing entity key");

    const res = await apiFetch(`/api/users/entity/${encodeURIComponent(entityKey)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Failed to load entity");
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
