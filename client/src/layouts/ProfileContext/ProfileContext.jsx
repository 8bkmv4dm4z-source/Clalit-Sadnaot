// src/layouts/ProfileContext.jsx
/**
 * ProfileContext.jsx — Single source of truth for Users
 * -----------------------------------------------------
 * ✅ Uses /api/users endpoints you already have
 * ✅ Provides flattened, normalized rows (parent + family)
 * ✅ First 100 for no-search, debounced search cache
 * ✅ Exposes getUserWorkshops + updateEntity passthrough
 */

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

const ProfileCtx = createContext(null);
export const useProfiles = () => useContext(ProfileCtx);

const DEFAULT_CACHE_KEY = "__NOSEARCH__";

const normalizeLocalQuery = (value) => {
  let s = String(value ?? "");
  s = s.trim().toLowerCase();
  if (/[\d-]/.test(s)) s = s.replace(/[\u00A0\s-]+/g, "");
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

  const fetchProfiles = useCallback(async ({ limit = 1000, compact = 1 } = {}) => {
    try {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams();
      params.set("limit", String(limit));
      if (compact) params.set("compact", "1");
      const queryString = params.toString();
      const res = await apiFetch(`/api/users?${queryString}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load users");
      const list = Array.isArray(data) ? data : [];
      setRows(list);
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

  useEffect(() => {
    if (authLoading) return;

    if (!isLoggedIn || !isAdmin) {
      resetProfiles();
      setLoading(false);
      return;
    }

    fetchProfiles({ limit: 1000, compact: 1 });
  }, [authLoading, isLoggedIn, isAdmin, fetchProfiles, resetProfiles]);

  useEffect(() => {
    searchCache.current.clear();
    searchCache.current.set(DEFAULT_CACHE_KEY, rows.slice(0, 100));
  }, [rows]);

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

      const filtered = rows.filter((row) => rowMatchesQuery(row, normalized));
      searchCache.current.set(normalized, filtered);
      return filtered;
    },
    [rows]
  );

  const getUserWorkshops = async ({ userId, familyId }) => {
    const base = `/api/users/${encodeURIComponent(userId)}/workshops`;
    const url = familyId ? `${base}?familyId=${encodeURIComponent(familyId)}` : base;
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
    async ({ entityId, entityType, parentId } = {}) => {
      if (!entityId) return { success: false, message: "Missing entity ID" };
      try {
        const params = new URLSearchParams();
        if (entityType) params.set("entityType", entityType);
        if (parentId) params.set("parentId", parentId);
        const query = params.toString();
        const res = await apiFetch(
          `/api/users/${encodeURIComponent(entityId)}${query ? `?${query}` : ""}`,
          { method: "DELETE" }
        );
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

  const getEntityDetails = useCallback(
    async (rowOrId) => {
      const entityId =
        typeof rowOrId === "string"
          ? rowOrId
          : rowOrId && rowOrId._id
          ? String(rowOrId._id)
          : null;

      if (!entityId) throw new Error("Missing entity ID");

      const res = await apiFetch(`/api/users/entity/${encodeURIComponent(entityId)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load entity");
      return data;
    },
    []
  );

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
