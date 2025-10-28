// src/layouts/ProfileContext.jsx
/**
 * ProfileContext.jsx — Single source of truth for Users
 * -----------------------------------------------------
 * ✅ Uses /api/users endpoints you already have
 * ✅ Provides flattened, normalized rows (parent + family)
 * ✅ First 100 for no-search, debounced search cache
 * ✅ Exposes getUserWorkshops + updateEntity passthrough
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "../../utils/apiFetch";

const ProfileCtx = createContext(null);
export const useProfiles = () => useContext(ProfileCtx);

/* ---------- helpers ---------- */
const calcAge = (dateStr) => {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (isNaN(d)) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return a;
};

const normalizeParent = (u) => ({
  ...u,
  _id: String(u._id),
  isFamily: false,
  parentId: null,
  parentName: null,
  parentEmail: u.email || "",
  parentCanCharge: Boolean(u.canCharge),
  age: calcAge(u.birthDate),
  displayEmail: u.email || "",
  canCharge: Boolean(u.canCharge),
});

const normalizeMember = (f, parent) => ({
  ...f,
  _id: String(f._id),
  isFamily: true,
  parentId: String(parent._id),
  parentName: parent.name || "",
  parentEmail: parent.email || "",
  parentCanCharge: Boolean(parent.canCharge),
  age: calcAge(f.birthDate),
  displayEmail: f.email || parent.email || "",
  canCharge: Boolean(parent.canCharge),
});

/** Turn server “users with familyMembers” list into flat rows */
const flattenUsersForUI = (users = []) => {
  const rows = [];
  for (const u of users) {
    const p = normalizeParent(u);
    rows.push(p);
    for (const f of u.familyMembers || []) rows.push(normalizeMember(f, p));
  }
  return rows;
};

export function ProfileProvider({ children }) {
  const [profilesRaw, setProfilesRaw] = useState([]);     // server shape (users[])
  const [rows, setRows] = useState([]);                   // flattened rows[]
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // query -> rows cache (lowercased key); also "__NOSEARCH__"
  const searchCache = useRef(new Map());

  /* -------- initial fetch (and when asked) -------- */
  const fetchProfiles = async ({ limit = 1000, compact = 1 } = {}) => {
    try {
      setLoading(true);
      setError(null);
      const url = `/api/users?limit=${encodeURIComponent(limit)}${compact ? "&compact=1" : ""}`;
      const res = await apiFetch(url);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.message || "Failed to load users");
      setProfilesRaw(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error("❌ [profiles] fetchProfiles", e);
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
  const onInvalidate = () => {
    // tiny debounce to batch bursts
    clearTimeout(window.__profilesInvalidateTO);
    window.__profilesInvalidateTO = setTimeout(() => {
      fetchProfiles({ limit: 1000, compact: 1 });
      searchCache.current.clear();
    }, 80);
  };
  window.addEventListener("profiles:invalidate", onInvalidate);
  return () => window.removeEventListener("profiles:invalidate", onInvalidate);
}, []);

  useEffect(() => {
    // First load: small list is fine; the page will show first 100 rows
    fetchProfiles({ limit: 1000, compact: 1 });
  }, []);

  /* -------- recompute flattened rows on raw change -------- */
  useEffect(() => {
    const flat = flattenUsersForUI(profilesRaw);
    setRows(flat);
    // warm default cache
    searchCache.current.set("__NOSEARCH__", flat.slice(0, 100));
  }, [profilesRaw]);

  /* -------- search (server first, fallback local) -------- */
  const localFilter = (q) => {
    const key = q.toLowerCase();
    const FIELDS = ["name", "displayEmail", "email", "city", "idNumber", "phone", "relation"];
    return rows.filter((r) => FIELDS.some((f) => (r[f] ? String(r[f]).toLowerCase().includes(key) : false)));
  };

 let activeController = null;

const searchProfiles = async (q, externalSignal) => {
  const query = (q || "").trim().toLowerCase();
  if (!query) return searchCache.current.get("__NOSEARCH__") || rows.slice(0, 100);

  const cached = searchCache.current.get(query);
  if (cached) return cached;

  // Abort any previous active request
  if (activeController) activeController.abort();
  activeController = new AbortController();
  const signal = externalSignal || activeController.signal;

  // tiny artificial delay (lets server indexing complete)
  await new Promise((r) => setTimeout(r, 150));

  const parentIndex = new Map((profilesRaw || []).map((u) => [String(u._id), u]));

  const fromFlatEntities = (arr) => {
    const out = [];
    for (const e of arr) {
      if (e?.type === "user") {
        out.push(
          normalizeParent({
            _id: e._id,
            name: e.name ?? "",
            email: e.email ?? "",
            phone: e.phone ?? "",
            idNumber: e.idNumber ?? "",
            city: e.city ?? "",
            birthDate: e.birthDate ?? "",
            canCharge: Boolean(e.canCharge),
          })
        );
      } else if (e?.type === "family") {
        const parent = {
          _id: e.parentId,
          name: e.parentName ?? "",
          email: e.parentEmail ?? "",
          canCharge: Boolean(e.parentCanCharge ?? e.canCharge),
          birthDate: null,
          phone: null,
          idNumber: null,
          city: null,
        };
        out.push(normalizeMember(
          {
            _id: e._id,
            name: e.name ?? "",
            email: e.email ?? "",
            phone: e.phone ?? "",
            idNumber: e.idNumber ?? "",
            city: e.city ?? "",
            relation: e.relation ?? "",
            birthDate: e.birthDate ?? "",
          },
          parent
        ));
      }
    }
    return out;
  };

  const enrichParent = (serverUser) => {
    const id = String(serverUser._id || "");
    const known = parentIndex.get(id) || {};
    return {
      _id: id,
      name: serverUser.name ?? known.name ?? "",
      email: serverUser.email ?? known.email ?? "",
      phone: serverUser.phone ?? known.phone ?? "",
      idNumber: serverUser.idNumber ?? known.idNumber ?? "",
      city: serverUser.city ?? known.city ?? "",
      birthDate: serverUser.birthDate ?? known.birthDate ?? "",
      canCharge:
        typeof serverUser.canCharge === "boolean"
          ? serverUser.canCharge
          : Boolean(known.canCharge),
      familyMembers: Array.isArray(serverUser.familyMembers)
        ? serverUser.familyMembers
        : [],
    };
  };

  const localFilterRows = (qq) => {
    const key = qq.toLowerCase();
    const FIELDS = ["name", "displayEmail", "email", "city", "idNumber", "phone", "relation"];
    return rows.filter((r) =>
      FIELDS.some((f) => (r[f] ? String(r[f]).toLowerCase().includes(key) : false))
    );
  };

  try {
    const res = await apiFetch(`/api/users/search?q=${encodeURIComponent(query)}`, { signal });
    const data = await res.json();

    if (res.ok && Array.isArray(data)) {
  let flatRows;

  const isHybridShape = data.some(
    (d) =>
      d.familyOnly ||
      d._matchSource ||
      (d.familyMembers && typeof d.familyOnly === "boolean")
  );

  if (isHybridShape) {
    const hybridRows = [];
    for (const entity of data) {
      if (entity.familyOnly && entity.familyMembers?.length) {
        for (const f of entity.familyMembers) {
          hybridRows.push(normalizeMember(f, entity));
        }
      } else if (entity._matchSource === "family-exact" || entity._matchSource === "family-partial") {
        const parent = {
          _id: entity.parentId || null,
          name: entity.parentName || "",
          email: entity.parentEmail || "",
          canCharge: entity.canCharge || false,
        };
        hybridRows.push(normalizeMember(entity, parent));
      } else {
        const parent = normalizeParent(entity);
        hybridRows.push(parent);
        for (const f of entity.familyMembers || []) {
          hybridRows.push(normalizeMember(f, parent));
        }
      }
    }

    // 🧩 Safety filter
    flatRows = hybridRows.filter(r => !r.familyOnly || r.isFamily);
  } else if (data.length && (data[0].type === "user" || data[0].type === "family")) {
    flatRows = fromFlatEntities(data);
  } else {
    const usersShape = data.map(enrichParent);
    flatRows = flattenUsersForUI(usersShape);
  }

  searchCache.current.set(query, flatRows);
  return flatRows;
}


    // fallback
    const fallback = localFilterRows(query);
    searchCache.current.set(query, fallback);
    return fallback;
  } catch (e) {
    if (e.name === "AbortError") return []; // ignore aborted requests
    console.warn("ℹ️ search fallback (local):", e.message);
    const fallback = localFilterRows(query);
    searchCache.current.set(query, fallback);
    return fallback;
  }
};



  /* -------- workshops per user/family -------- */
  const getUserWorkshops = async ({ userId, familyId }) => {
    const base = `/api/users/${encodeURIComponent(userId)}/workshops`;
    const url = familyId ? `${base}?familyId=${encodeURIComponent(familyId)}` : base;
    const res = await apiFetch(url);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Failed to fetch workshops");
    return Array.isArray(data) ? data : [];
  };

  /* -------- update entity (user or family) -------- */
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
    // soft revalidate + clear caches
    try {
      await fetchProfiles({ limit: 1000, compact: 1 });
      searchCache.current.clear();
    } catch {}
    return { success: true };
  };
// inside ProfileProvider, next to updateEntity()
const deleteUser = async (userId, { cascade = true } = {}) => {
  try {
    const url = cascade
      ? `/api/users/${encodeURIComponent(userId)}?cascade=1` // if you added the optional flag
      : `/api/users/${encodeURIComponent(userId)}`;

    const res = await apiFetch(url, { method: "DELETE" });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.message || "Delete failed");

    // revalidate + clear caches
    await fetchProfiles({ limit: 1000, compact: 1 });
    searchCache.current.clear();

    return { success: true, message: data?.message || "Deleted" };
  } catch (err) {
    console.error("❌ [profiles] deleteUser", err);
    return { success: false, message: err.message };
  }
};

  const value = {
    // data
    profiles: rows,         // flattened + normalized rows
    loading,
    error,
    // methods
    fetchProfiles,          // revalidate
    searchProfiles,         // server-first search
    getUserWorkshops,       // workshops for user/family
    updateEntity,         // unified update passthrough
    deleteUser,           // deleteUser
  };

  return <ProfileCtx.Provider value={value}>{children}</ProfileCtx.Provider>;
}
