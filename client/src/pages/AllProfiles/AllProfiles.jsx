// src/pages/AllProfiles/AllProfiles.jsx
/**
 * AllProfiles.jsx — Context-first UI (no direct fetches)
 * ------------------------------------------------------
 * ✅ Source of truth: ProfileContext (profiles/search/update/workshops)
 * ✅ No-search: show first 100 only
 * ✅ Search: context.searchProfiles() only (debounced 300ms)
 * ✅ 3-dot dropdown fixed (no auto-close on open)
 * ✅ Optimistic inline edit -> soft revalidate via context
 *
 * Entity identity:
 * - We normalize every row via withEntityFlags(row)
 * - Identity is based primarily on `entityKey` (same as WorkshopContext, waitlist, etc.)
 * - existingIds (from WorkshopParticipantsModal) are treated as entityKey strings
 */

import { createPortal } from "react-dom";
import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical } from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useProfiles } from "../../layouts/ProfileContext";
import { useWorkshops } from "../../layouts/WorkshopContext";
import {
  getEntityIdentifiers,
  isFamilyEntity as isFamilyEntityHelper,
  withEntityFlags,
} from "../../utils/entityTypes";

/* ---------------- helpers ---------------- */
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

const isFamilyEntity = (row) => isFamilyEntityHelper(row);

/**
 * Normalize local search string (similar to backend normalizeSearchQuery)
 */
const normalizeLocalQuery = (value) => {
  let s = String(value ?? "");
  s = s.trim().toLowerCase();
  if (/[^\d-]/.test(s)) s = s.replace(/[\u00A0\s-]+/g, "");
  return s.replace(/[^\w@.\u0590-\u05FF\s]/g, "");
};

/**
 * Local search match:
 * ✅ ONLY entity fields: name, email, phone, city, idNumber
 * ❌ NOT relation, NOT parentName, NOT any parent* fields
 *
 * This guarantees:
 * - Parent appears only if parent matches
 * - Family appears only if family matches
 * - If both match, both are in results
 */
const rowMatchesQuery = (row, normalizedQuery) => {
  if (!normalizedQuery) return true;
  const fields = ["name", "email", "phone", "city", "idNumber"];

  return fields.some((field) => {
    const val = row[field];
    if (!val) return false;
    const valueNorm = normalizeLocalQuery(val);
    return valueNorm.includes(normalizedQuery);
  });
};

/**
 * Build a stable identity key for any entity row.
 * Priority:
 * 1. explicit entityKey / __entityKey (from server / withEntityFlags)
 * 2. getEntityIdentifiers(row).entityKey
 * 3. fallback to getEntityIdentifiers(row).key
 * 4. fallback to _id / id
 */
const buildEntityKey = (row) => {
  if (!row) return "";
  if (row.__entityKey) return String(row.__entityKey);
  if (row.entityKey) return String(row.entityKey);

  const ids = getEntityIdentifiers(row) || {};
  if (ids.entityKey) return String(ids.entityKey);
  if (ids.key) return String(ids.key);

  return String(row._id ?? row.id ?? "");
};

function ActionMenu({
  onEdit,
  onShowWorkshops,
  onDeleteFromWorkshops,
  onDeleteEntity,
  disabled = false,
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const portalRef = useRef(document.createElement("div"));

  /* Mount a detached element into <body> so dropdown isn’t clipped by table overflow */
  useEffect(() => {
    const node = portalRef.current;
    document.body.appendChild(node);
    return () => {
      if (node && node.parentNode) node.parentNode.removeChild(node);
    };
  }, []);

  /* Close on outside click */
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  /* Compute dynamic position + RTL-safe alignment */
  const rect = ref.current?.getBoundingClientRect() || {};
  const htmlDir =
    document.documentElement.getAttribute("dir") ||
    document.body.getAttribute("dir") ||
    "ltr";
  const isRTL = htmlDir.toLowerCase() === "rtl";

  const menu = (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -4 }}
          transition={{ duration: 0.15 }}
          className="absolute bg-white border border-gray-200 rounded-md shadow-lg text-sm overflow-hidden z-[99999]"
          style={{
            top: rect.bottom + window.scrollY + 4,
            width: 176,
            ...(isRTL
              ? {
                  // RTL → open slightly to the right (so it’s centered visually)
                  right: window.innerWidth - rect.left + window.scrollX - 8,
                }
              : {
                  // LTR → open slightly to the right of the button
                  left: rect.right - 168 + window.scrollX,
                }),
          }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => {
              setOpen(false);
              onEdit?.();
            }}
            className="block w-full text-right px-3 py-2 hover:bg-gray-50"
          >
            ✏️ ערוך
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onShowWorkshops?.();
            }}
            className="block w-full text-right px-3 py-2 hover:bg-gray-50"
          >
            🎟 ראה סדנאות
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDeleteFromWorkshops?.();
            }}
            className="block w-full text-right px-3 py-2 hover:bg-red-50 text-red-600"
          >
            🗑 מחק מכל הסדנאות
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDeleteEntity?.();
            }}
            className="block w-full text-right px-3 py-2 hover:bg-red-100 text-red-700"
          >
            🧨 מחק פרופיל
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      <div
        ref={ref}
        className="relative inline-block text-right z-[5000]"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="p-1.5 rounded hover:bg-gray-100 w-8 h-8 flex items-center justify-center"
          onClick={() => !disabled && setOpen((v) => !v)}
          disabled={disabled}
        >
          <MoreVertical size={18} />
        </button>
      </div>
      {createPortal(menu, portalRef.current)}
    </>
  );
}

/* ---------------- main component ---------------- */
export default function AllProfiles({ mode = "manage", onSelectUser, existingIds = [] }) {
  const { isAdmin } = useAuth();
  const {
    profiles: contextProfiles = [],
    updateEntity,
    fetchProfiles,
    searchProfiles,
    getUserWorkshops,
    getEntityDetails,
    deleteEntity,
    loading: ctxLoading,
    error: ctxError,
  } = useProfiles();

  // workshops context (for unregister)
  const { unregisterEntityFromWorkshop, fetchWorkshops } = useWorkshops();

  const isSelectMode = mode === "select" && typeof onSelectUser === "function";

  /**
   * existingIds are assumed to be entityKeys (stringified)
   * coming from WorkshopParticipantsModal:
   * [...participants, ...waitlist].map(p => p.__entityKey || getEntityIdentifiers(p).entityKey)
   */
  const existingKeySet = useMemo(
    () => new Set((existingIds || []).map((v) => String(v))),
    [existingIds]
  );

  // Local view-model
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState([]);

  // search results only
  const [entityLoadingId, setEntityLoadingId] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [busyRowKey, setBusyRowKey] = useState(null);

  // for disabling buttons during bulk remove
  const [deletingRowId, setDeletingRowId] = useState(null);

  // Edit + modal state
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [userWorkshops, setUserWorkshops] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  // Flat entities from ProfileContext + basic flags
  const allRows = useMemo(
    () => (contextProfiles || []).map((row) => withEntityFlags(row)),
    [contextProfiles]
  );

  // Final list used by UI:
  // - no search -> first 100 from context
  // - with search -> server search results (post-filtered by local match rule)
  const effectiveProfiles = useMemo(() => {
    const q = search.trim();
    if (!q) {
      // No search → show first 100 flat rows from context
      return allRows.slice(0, 100);
    }
    // Search active → use search results
    return profiles;
  }, [allRows, profiles, search]);

  // Search (server → local filter)
  useEffect(() => {
    const q = search.trim();
    const normalized = normalizeLocalQuery(q);

    if (!q) {
      // When clearing search, also clear search-specific list
      setProfiles([]);
      setIsFetching(false);
      return;
    }

    setIsFetching(true);

    const t = setTimeout(async () => {
      try {
        // Remote search (may be noisy)
        const result = await searchProfiles(q);
        const list = Array.isArray(result)
          ? result.map((r) => withEntityFlags(r))
          : [];

        // Local filter to enforce your exact rule:
        // ✅ match only by own: name/email/phone/city/idNumber
        const filtered = list.filter((row) => rowMatchesQuery(row, normalized));

        setProfiles(filtered);
      } catch (e) {
        console.error("searchProfiles error:", e);
        setProfiles([]);
      } finally {
        setIsFetching(false);
      }
    }, 300);

    return () => clearTimeout(t);
  }, [search, searchProfiles]);

  const startEdit = async (row) => {
    const rowKey = buildEntityKey(row);
    setEditingId(rowKey);
    // Initialize with current row data (which definitely has the ID)
    setEditBuffer({ ...row });
    setEntityLoadingId(rowKey);

    try {
      const enriched = await getEntityDetails(row);
      // ✅ FIX: Merge new details into existing buffer so we don't lose _id/entityKey
      setEditBuffer((prev) => ({ ...prev, ...enriched }));
    } catch (err) {
      console.error("Failed to load entity details", err);
      // Don't alert blocking errors on fetch details, just let user edit what they have
    } finally {
      setEntityLoadingId(null);
    }
  };

  
  const cancelEdit = () => {
    setEditingId(null);
    setEditBuffer({});
  };

  const toggleCanCharge = () =>
    setEditBuffer((p) => ({ ...p, canCharge: !p.canCharge }));

  const optimisticPatchEverywhere = (patcher) => {
    setProfiles((prev) => prev.map(patcher));
    // contextProfiles are refreshed via fetchProfiles after successful update
  };

  const saveEdit = async () => {
    try {
      const ids = getEntityIdentifiers(editBuffer);
      const isFamily = ids.isFamily;
      
      // ✅ FIX: Use editingId as the fallback source of truth for the ID
      const entityKey = ids.entityKey || editingId;
      if (!entityKey) {
        throw new Error("Missing entity key for update");
      }

      const baseUserFields = ["name", "email", "phone", "city", "birthDate", "idNumber"];
      const userAllowed = isAdmin ? [...baseUserFields, "canCharge"] : baseUserFields;
      const allowedKeys = isFamily
        ? ["name", "relation", "idNumber", "phone", "birthDate", "email", "city"]
        : userAllowed;

      const updates = {};
      
      for (const k of allowedKeys) {
        if (editBuffer[k] !== undefined) {
          let val = editBuffer[k];
          
          // ✅ FIX: Convert empty strings to null for unique fields (email/phone)
          // preventing DB "duplicate key" errors on empty strings
          if (typeof val === "string" && val.trim() === "") {
            val = null;
          }
          updates[k] = val;
        }
      }

      // Check if we actually have data to update
      if (Object.keys(updates).length === 0) {
        cancelEdit();
        return;
      }

      const payload = { entityKey, updates };

      // Optimistic Update
      optimisticPatchEverywhere((r) => {
        const k = buildEntityKey(r);
        // Compare loosely (string vs string)
        return String(k) === String(entityKey) ? { ...r, ...updates } : r;
      });

      console.log("Saving payload:", payload); // For debugging
      const result = await updateEntity(payload);
      
      if (!result?.success) {
        throw new Error(result?.message || "Update failed");
      }

      // Refresh list to ensure data consistency
      if (typeof fetchProfiles === "function") {
        await fetchProfiles({ limit: 1000, compact: 1 });
      }

      setEditingId(null);
      setEditBuffer({});
    } catch (err) {
      console.error("Save error:", err);
      alert("שגיאה בשמירה: " + (err.message || "Unknown error"));
      // We do NOT revert optimistic update here to keep UI snappy, 
      // but in a strict app, you might trigger a refresh here to undo changes.
    }
  };
  const showWorkshops = async (row) => {
    try {
      setModalTitle("טוען סדנאות...");
      setUserWorkshops([]);
      setModalLoading(true);
      setShowModal(true);

      const ids = getEntityIdentifiers(row);
      const isFamily = ids.isFamily;
      const entityKey = ids.entityKey;
      const parentKey = ids.parentKey;

      const list = await getUserWorkshops({
        entityKey: isFamily ? parentKey : entityKey,
        familyEntityKey: isFamily ? entityKey : undefined,
      });

      setUserWorkshops(Array.isArray(list) ? list : []);
      setModalTitle(isFamily ? `${row.name} (${row.relation || "בן משפחה"})` : row.name);
    } catch (e) {
      console.error(e);
      setModalTitle("שגיאה בטעינה");
    } finally {
      setModalLoading(false);
    }
  };

  // 🗑 Remove this entity from all workshops (not DB delete)
  const bulkRemoveFromWorkshops = async (row) => {
    const ids = getEntityIdentifiers(row);
    const isFamily = ids.isFamily;
    const entityKey = ids.entityKey;
    const parentKey = ids.parentKey;
    const rowKey = buildEntityKey(row);

    const displayName = isFamily ? `${row.name} (${row.relation || "בן משפחה"})` : row.name;

    if (
      !window.confirm(
        `למחוק את ההרשמות של "${displayName}" מכל הסדנאות? הפעולה בלתי הפיכה.`
      )
    )
      return;

    try {
      setBusyRowKey(rowKey);

      const list = await getUserWorkshops({
        entityKey: isFamily ? parentKey : entityKey,
        familyEntityKey: isFamily ? entityKey : undefined,
      });

      const workshopIds = (Array.isArray(list) ? list : [])
        .map((w) => String(w.workshopKey || w.workshopId || w.id))
        .filter(Boolean);

      for (const wid of workshopIds) {
        // NOTE: unregisterEntityFromWorkshop now expects entityKey
        await unregisterEntityFromWorkshop(wid, entityKey);
      }

      // Optional refreshes
      try {
        await fetchWorkshops();
      } catch (err) {
        console.warn("fetchWorkshops refresh failed", err);
      }
      try {
        await fetchProfiles({ limit: 1000, compact: 1 });
      } catch (err) {
        console.warn("fetchProfiles refresh failed", err);
      }

      alert("כל ההרשמות נמחקו בהצלחה.");
    } catch (e) {
      console.error("bulkRemoveFromWorkshops error:", e);
      alert("שגיאה במחיקה מסדנאות: " + (e?.message || "שגיאה לא ידועה"));
    } finally {
      setBusyRowKey(null);
    }
  };

  const handleDeleteEntity = async (row) => {
    const ids = getEntityIdentifiers(row);
    const isFamily = ids.isFamily;
    const entityKey = ids.entityKey;
    const rowKey = buildEntityKey(row);

    const displayName = isFamily ?
      `${row.name} (${row.relation || "בן משפחה"})` : row.name;
    const confirmMessage = isFamily
      ? `האם למחוק את ${displayName}? פעולה זו תסיר אותו מכל הסדנאות.`
      : `האם למחוק את המשתמש "${displayName}" וכל בני המשפחה המקושרים?`;

    if (!window.confirm(confirmMessage)) return;

    setDeletingRowId(rowKey);
    try {
      const response = await deleteEntity({ entityKey });
      if (!response?.success) throw new Error(response?.message || "Delete failed");
      alert(response.message || (isFamily ? "בן המשפחה נמחק" : "המשתמש נמחק"));
    } catch (err) {
      console.error("Delete entity error:", err);
      alert(err?.message || "שגיאה במחיקת פרופיל");
    } finally {
      setDeletingRowId(null);
    }
  };

  /* ---- guards ---- */
  if (!isAdmin)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-600 text-lg">
        ⛔ אין לך הרשאה לצפות בעמוד זה.
      </div>
    );

  if (ctxLoading)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        ⏳ טוען פרופילים...
      </div>
    );

  if (ctxError)
    return (
      <div className="min-h-screen flex items-center justify-center text-red-500 font-medium">
        ❌ {ctxError}
      </div>
    );

  /* ---- reusable input ---- */
  const renderEditInput = (field, value, placeholder = "") => (
    <input
      className="border rounded px-2 py-1 w-full text-sm"
      value={value ?? ""}
      onChange={(e) => setEditBuffer((p) => ({ ...p, [field]: e.target.value }))}
      placeholder={placeholder}
      type={field === "birthDate" ? "date" : "text"}
      disabled={entityLoadingId === editingId}
    />
  );

  /* ---- skeleton row ---- */
  const SkeletonRow = () => (
    <tr style={{ pointerEvents: "none", overflow: "visible" }}>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-24 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-20 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-20 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-36 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-20 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-10 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-8 w-8 mx-auto bg-gray-200 animate-pulse rounded-full" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-5 w-10 mx-auto bg-gray-200 animate-pulse rounded" />
      </td>
    </tr>
  );

  /* ---------------- UI ---------------- */
  return (
    <div
      dir="rtl"
      className="min-h-screen flex flex-col items-center bg-gray-50 py-10 px-4 sm:px-6"
    >
      {/* Container widened to 98% per request */}
      <div className="w-full max-w-[98%] bg-white rounded-xl shadow p-5 sm:p-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-4 sm:mb-6 gap-3">
          <h2 className="text-2xl sm:text-3xl font-bold text-indigo-700">
            כלל המשתמשים ובני המשפחה
          </h2>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="חפש לפי שם, אימייל, עיר או תעודת זהות..."
            className="input md:w-72 w-full"
          />
        </div>

        {/* ===== Desktop Table ===== */}
{/* 1. Added overflow-x-auto so you can scroll sideways */}
<div className="hidden md:block relative z-0 overflow-x-auto custom-scrollbar pb-10">
  {/* 2. Added min-w-[1200px] so columns are wide enough to show full text */}
  <table className="table table-fixed w-full min-w-[1200px] text-sm">
    <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                {/* 1. NAME (15%) */}
                <th className="w-[15%] p-3 text-right font-semibold text-gray-600">שם</th>
                
                {/* 2. ID (12%) - Moved here */}
                <th className="w-[12%] p-3 text-right font-semibold text-gray-600">ת.ז</th>

                {/* 3. PHONE (14%) - Expanded width */}
                <th className="w-[14%] p-3 text-right font-semibold text-gray-600">טלפון</th>

                {/* 4. EMAIL (24%) - Largest chunk for long emails */}
                <th className="w-[24%] p-3 text-right font-semibold text-gray-600">אימייל</th>

                {/* 5. CITY (10%) */}
                <th className="w-[10%] p-3 text-right font-semibold text-gray-600">עיר</th>

                {/* 6. AGE (5%) */}
                <th className="w-[5%]  p-3 text-right font-semibold text-gray-600">גיל</th>

                {/* 7. CHARGE (8%) */}
                <th className="w-[8%]  p-3 text-center font-semibold text-gray-600">חיוב</th>

                {/* 8. ACTIONS (12%) */}
                <th className="w-[12%] p-3 text-center font-semibold text-gray-600">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {isFetching && effectiveProfiles.length === 0 ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : effectiveProfiles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-gray-500 py-6">
                    לא נמצאו תוצאות מתאימות
                  </td>
                </tr>
              ) : (
                effectiveProfiles.map((r, idx) => {
                  const normalizedRow = withEntityFlags(r);
                  const rowKey = buildEntityKey(normalizedRow);
                  const alreadySelected = existingKeySet.has(String(rowKey));
                  const isEditing = editingId === rowKey;
                  const busy = busyRowKey === rowKey;
                  const isDeleting = deletingRowId === rowKey;
                  const isFamily = normalizedRow.isFamily;

                  const displayEmail = normalizedRow.email || "-";
                  const displayPhone = normalizedRow.phone || "-";
                  const displayCity = normalizedRow.city || "-";
                  const displayIdNumber = normalizedRow.idNumber || "-";

                  const displayAge =
                    typeof normalizedRow.age === "number"
                      ? normalizedRow.age
                      : normalizedRow.birthDate
                      ? calcAge(normalizedRow.birthDate)
                      : null;

                  return (
                    <motion.tr
                      key={rowKey}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className={
                        isFamily
                          ? "bg-green-50"
                          : idx % 2 === 0
                          ? "bg-white"
                          : "bg-gray-50"
                      }
                    >
                   {/* --- 1. NAME --- */}
<td className="p-3 font-medium text-gray-800" title={normalizedRow.name}>
  {/* REMOVED 'truncate' below */}
  <div className="w-full"> 
    {isEditing
      ? renderEditInput("name", editBuffer?.name ?? normalizedRow.name)
      : normalizedRow.name}
  </div>
  {/* (Tags code remains the same...) */}
</td>

{/* --- 2. ID --- */}
<td className="p-3 text-gray-600" title={normalizedRow.idNumber}>
  {/* REMOVED 'truncate' below */}
  <div className="w-full">
    {isEditing
      ? renderEditInput("idNumber", editBuffer?.idNumber ?? normalizedRow.idNumber)
      : displayIdNumber}
  </div>
</td>

{/* --- 3. PHONE --- */}
<td className="p-3 text-gray-600" dir="ltr" title={normalizedRow.phone}>
  {/* REMOVED 'truncate' below */}
  <div className="w-full text-right">
    {isEditing
      ? renderEditInput("phone", editBuffer?.phone ?? normalizedRow.phone)
      : displayPhone}
  </div>
</td>

{/* --- 4. EMAIL --- */}
<td className="p-3 text-gray-600" dir="ltr" title={normalizedRow.email}>
  {/* REMOVED 'truncate' below */}
  <div className="w-full text-right">
    {isEditing
      ? renderEditInput("email", editBuffer?.email ?? normalizedRow.email)
      : displayEmail}
  </div>
</td>

{/* --- 5. CITY --- */}
<td className="p-3 text-gray-600" title={normalizedRow.city}>
  {/* REMOVED 'truncate' below */}
  <div className="w-full">
    {isEditing
      ? renderEditInput("city", editBuffer?.city ?? normalizedRow.city)
      : displayCity}
  </div>
</td>
                      {/* --- 6. AGE --- */}
                      <td className="p-3 text-gray-600">
                        {displayAge ?? "-"}
                      </td>

                      {/* --- 7. CHARGE --- */}
                      <td className="p-3 text-center">
                        {isEditing ? (
                          <button
                            type="button"
                            onClick={toggleCanCharge}
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-full border ${
                              editBuffer?.canCharge
                                ? "bg-green-100 border-green-400"
                                : "bg-red-100 border-red-400"
                            }`}
                            title="החלפת אפשרות חיוב"
                          >
                            {editBuffer?.canCharge ? "✅" : "❌"}
                          </button>
                        ) : (
                          <span>{normalizedRow.canCharge ? "✅" : "❌"}</span>
                        )}
                      </td>

                      {/* --- 8. ACTIONS --- */}
                      <td className="p-3 text-center relative overflow-visible z-[1000]">
                        {isEditing ? (
                          <div className="flex flex-col items-center gap-1">
                            <div className="flex gap-2 justify-center">
                              <button
                                className="btn bg-green-600 text-white text-xs px-3 py-1"
                                onClick={saveEdit}
                              >
                                ✅ שמור
                              </button>
                              <button
                                className="btn bg-gray-300 text-xs px-3 py-1"
                                onClick={cancelEdit}
                              >
                                ❌ בטל
                              </button>
                            </div>
                            {entityLoadingId === rowKey && (
                              <div className="text-xs text-gray-400">
                                טוען נתונים...
                              </div>
                            )}
                          </div>
                        ) : isSelectMode ? (
                          <div className="flex flex-col items-center gap-1">
                            <button
                              className="btn bg-indigo-600 text-white text-xs px-3 py-1 disabled:opacity-50"
                              onClick={() =>
                                onSelectUser?.(withEntityFlags(normalizedRow))
                              }
                              disabled={alreadySelected}
                            >
                              {alreadySelected ? "כבר רשום" : "בחר"}
                            </button>
                            {alreadySelected && (
                              <div className="text-xs text-gray-500">
                                קיים בסדנה
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="inline-block relative z-[2000]">
                            <ActionMenu
                              onEdit={() => startEdit(normalizedRow)}
                              onShowWorkshops={() => showWorkshops(normalizedRow)}
                              onDeleteFromWorkshops={() =>
                                bulkRemoveFromWorkshops(normalizedRow)
                              }
                              onDeleteEntity={() =>
                                handleDeleteEntity(normalizedRow)
                              }
                              disabled={busy || isDeleting}
                            />
                            {busy && (
                              <div className="mt-1 text-xs text-gray-500">
                                מוחק מסדנאות...
                              </div>
                            )}
                            {isDeleting && (
                              <div className="mt-1 text-xs text-red-500">
                                מוחק פרופיל...
                              </div>
                            )}
                          </div>
                        )}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ===== Mobile Cards (No Relation Field) ===== */}
        <div className="md:hidden space-y-3">
          {isFetching && effectiveProfiles.length === 0 ? (
            <div className="rounded-xl border bg-white border-gray-100 shadow-sm p-4">
              <div className="h-4 w-28 bg-gray-200 animate-pulse rounded mb-3" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
              </div>
            </div>
          ) : effectiveProfiles.length === 0 ? (
            <div className="text-center text-gray-500 py-6 font-medium">
              לא נמצאו תוצאות מתאימות
            </div>
          ) : (
            effectiveProfiles.map((r) => {
              const normalizedRow = withEntityFlags(r);
              const rowKey = buildEntityKey(normalizedRow);
              const alreadySelected = existingKeySet.has(String(rowKey));
              const isEditing = editingId === rowKey;
              const busy = busyRowKey === rowKey;
              const isDeleting = deletingRowId === rowKey;
              const isFamily = normalizedRow.isFamily;

              const displayEmail = normalizedRow.email || "-";
              const displayPhone = normalizedRow.phone || "-";
              const displayCity = normalizedRow.city || "-";
              const displayIdNumber = normalizedRow.idNumber || "-";
              const displayAge =
                typeof normalizedRow.age === "number"
                  ? normalizedRow.age
                  : normalizedRow.birthDate
                  ? calcAge(normalizedRow.birthDate)
                  : null;

              return (
                <motion.div
                  key={rowKey}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`rounded-xl border flex flex-col ${
                    isFamily
                      ? "bg-green-50 border-green-100"
                      : "bg-white border-gray-100"
                  } shadow-sm transition-all duration-200`}
                  style={{
                    position: "relative",
                    zIndex: editingId === rowKey ? 3000 : 1,
                    minHeight: "fit-content",
                  }}
                >
                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="font-semibold text-indigo-700 text-base">
                      {isEditing
                        ? renderEditInput(
                            "name",
                            editBuffer?.name ?? normalizedRow.name
                          )
                        : normalizedRow.name}
                    </div>
                    {isFamily && (
                      <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        בן משפחה של {normalizedRow.parentName}
                      </span>
                    )}
                    {!isEditing && (
                      <div className="flex items-center gap-2">
                        {isSelectMode ? (
                          <button
                            className="btn bg-indigo-600 text-white text-xs px-3 py-1 disabled:opacity-50"
                            onClick={() =>
                              onSelectUser?.(withEntityFlags(normalizedRow))
                            }
                            disabled={alreadySelected}
                          >
                            {alreadySelected ? "כבר רשום" : "בחר"}
                          </button>
                        ) : (
                          <ActionMenu
                            onEdit={() => startEdit(normalizedRow)}
                            onShowWorkshops={() => showWorkshops(normalizedRow)}
                            onDeleteFromWorkshops={() =>
                              bulkRemoveFromWorkshops(normalizedRow)
                            }
                            onDeleteEntity={() => handleDeleteEntity(normalizedRow)}
                            disabled={busy || isDeleting}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  <div className="px-4 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                    <Field
                      label="אימייל"
                      isEditing={isEditing}
                      value={displayEmail}
                      input={renderEditInput(
                        "email",
                        editBuffer?.email ?? normalizedRow.email
                      )}
                    />
                    <Field
                      label="טלפון"
                      isEditing={isEditing}
                      value={displayPhone}
                      input={renderEditInput(
                        "phone",
                        editBuffer?.phone ?? normalizedRow.phone
                      )}
                    />
                    <Field
                      label="עיר"
                      isEditing={isEditing}
                      value={displayCity}
                      input={renderEditInput(
                        "city",
                        editBuffer?.city ?? normalizedRow.city
                      )}
                    />
                    <Field
                      label="ת.ז"
                      isEditing={isEditing}
                      value={displayIdNumber}
                      input={renderEditInput(
                        "idNumber",
                        editBuffer?.idNumber ?? normalizedRow.idNumber
                      )}
                    />
                    <Field
                      label="גיל"
                      isEditing={false}
                      value={displayAge ?? "-"}
                    />
                    
                    {/* Relation field removed from Mobile as well for consistency */}

                    <div className="col-span-2">
                      <div className="text-xs text-gray-500 mb-1">חיוב</div>
                      {isEditing ? (
                        <button
                          type="button"
                          onClick={toggleCanCharge}
                          className={`inline-flex items-center justify-center w-9 h-9 rounded-full border ${
                            editBuffer?.canCharge
                              ? "bg-green-100 border-green-400"
                              : "bg-red-100 border-red-400"
                          }`}
                        >
                          {editBuffer?.canCharge ? "✅" : "❌"}
                        </button>
                      ) : (
                        <span className="text-lg">
                          {normalizedRow.canCharge ? "✅" : "❌"}
                        </span>
                      )}
                    </div>
                    {busy && (
                      <div className="col-span-2 text-xs text-gray-500">
                        מוחק מסדנאות...
                      </div>
                    )}
                    {isDeleting && (
                      <div className="col-span-2 text-xs text-red-500">
                        מוחק פרופיל...
                      </div>
                    )}
                  </div>

                  {isEditing && (
                    <div className="px-4 pb-3 flex flex-col gap-2">
                      <div className="flex gap-2">
                        <button
                          className="btn bg-green-600 text-white text-xs px-3 py-2 flex-1"
                          onClick={saveEdit}
                        >
                          שמור
                        </button>
                        <button
                          className="btn bg-gray-300 text-xs px-3 py-2 flex-1"
                          onClick={cancelEdit}
                        >
                          בטל
                        </button>
                      </div>
                      {entityLoadingId === rowKey && (
                        <div className="text-xs text-gray-400 text-center">
                          טוען נתונים...
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              );
            })
          )}
        </div>
      </div>

      {/* Workshops modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            className="fixed inset-0 bg-black/30 flex items-center justify-center z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              className="bg-white rounded-xl shadow-lg w-full max-w-lg p-6"
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-2xl font-bold text-indigo-700 mb-4 text-center">
                {modalTitle}
              </h3>

              {modalLoading ? (
                <div className="flex justify-center items-center h-32">
                  <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600"></div>
                </div>
              ) : userWorkshops.length === 0 ? (
                <div className="text-center text-gray-500 py-6">
                  לא נמצאו סדנאות פעילות למשתמש זה
                </div>
              ) : (
                <ul className="divide-y divide-gray-200 max-h-80 overflow-y-auto">
                  {userWorkshops.map((w, idx) => (
                    <li
                      key={
                        w._id ||
                        w.id ||
                        w.workshopId ||
                        `${w.title || "untitled"}-${w.day || ""}-${w.hour || ""}-${idx}`
                      }
                      className="py-3 px-2"
                    >
                      <div className="font-semibold text-indigo-700">
                        {w.title || "ללא כותרת"}
                      </div>
                      <div className="text-sm text-gray-600">
                        {w.city && <span>{w.city}</span>}
                        {w.day && <span> • {w.day}</span>}
                        {w.hour && <span> • {w.hour}</span>}
                        {w.coach && <span> • מאמן: {w.coach}</span>}
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              <div className="mt-6 flex justify-center">
                <button
                  onClick={() => setShowModal(false)}
                  className="btn bg-gray-300 hover:bg-gray-400 text-gray-800 px-6 py-2 rounded"
                >
                  סגור
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* --- helper for mobile fields --- */
function Field({ label, value, isEditing, input }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      {isEditing ? (
        input
      ) : (
        <div className="text-gray-800 leading-tight break-words">
          {value}
        </div>
      )}
    </div>
  );
}
