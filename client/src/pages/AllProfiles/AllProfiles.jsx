// src/pages/AllProfiles/AllProfiles.jsx
/**
 * AllProfiles.jsx — Context-first UI (no direct fetches)
 * ------------------------------------------------------
 * ✅ Source of truth: ProfileContext (profiles/search/update/workshops)
 * ✅ No-search: show first 100 only
 * ✅ Search: context.searchProfiles() only (debounced 350ms)
 * ✅ 3-dot dropdown fixed (no auto-close on open)
 * ✅ Optimistic inline edit -> soft revalidate via context
 * ✅ New: 🗑 מחק מכל הסדנאות (via WorkshopContext.unregisterEntityFromWorkshop)
 */
import { createPortal } from "react-dom";

import React, { useMemo, useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MoreVertical } from "lucide-react";
import { useAuth } from "../../layouts/AuthLayout";
import { useProfiles } from "../../layouts/ProfileContext";
import { useWorkshops } from "../../layouts/WorkshopContext";

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

const buildEntityId = (row) =>
  row?.isFamily ? [String(row.parentId), String(row._id)] : [String(row?._id)];

const normalizeRow = (row) => {
  const isFamily = !!row.isFamily;
  return {
    ...row,
    entityId: isFamily ? [String(row.parentId), String(row._id)] : [String(row._id)],
    age: typeof row.age === "number" ? row.age : calcAge(row.birthDate),
    displayEmail: isFamily ? row.email || row.parentEmail : row.email,
    canCharge:
      typeof row.canCharge === "boolean" ? row.canCharge : !!row?.parentCanCharge || false,
  };
};



function ActionMenu({ onEdit, onShowWorkshops, onDeleteFromWorkshops }) {
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
          onClick={() => setOpen((v) => !v)}
        >
          <MoreVertical size={18} />
        </button>
      </div>
      {createPortal(menu, portalRef.current)}
    </>
  );
}



/* ---------------- main component ---------------- */
export default function AllProfiles() {
  const { isAdmin } = useAuth();
  const {
    profiles: contextProfiles = [],
    updateEntity,
    fetchProfiles,
    searchProfiles,
    getUserWorkshops,
    getEntityDetails,
    loading: ctxLoading,
    error: ctxError,
  } = useProfiles();

  // workshops context (for unregister)
  const { unregisterEntityFromWorkshop, fetchWorkshops } = useWorkshops();

  // Local view-model
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [entityLoadingId, setEntityLoadingId] = useState(null);
  const [isFetching, setIsFetching] = useState(false);
  const [busyRowKey, setBusyRowKey] = useState(null); // for disabling buttons during bulk remove

  // Edit + modal state
  const [editingId, setEditingId] = useState(null);
  const [editBuffer, setEditBuffer] = useState({});
  const [showModal, setShowModal] = useState(false);
  const [modalTitle, setModalTitle] = useState("");
  const [userWorkshops, setUserWorkshops] = useState([]);
  const [modalLoading, setModalLoading] = useState(false);

  const allRows = useMemo(() => contextProfiles, [contextProfiles]);

  useEffect(() => {
    if (!search.trim()) setProfiles(allRows.slice(0, 100));
  }, [allRows, search]);

  useEffect(() => {
    const q = search.trim();
    if (!q) {
      setProfiles(allRows.slice(0, 100));
      return;
    }
    setIsFetching(true);
    const t = setTimeout(async () => {
      try {
        const result = await searchProfiles(q);
        setProfiles(Array.isArray(result) ? result : []);
      } catch (e) {
        console.error("searchProfiles error:", e);
        setProfiles([]);
      } finally {
        setIsFetching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [search, searchProfiles, allRows]);

  const startEdit = async (row) => {
    const rowKey = buildEntityId(row).join(":");
    setEditingId(rowKey);
    setEditBuffer(normalizeRow(row));
    setEntityLoadingId(rowKey);
    try {
      const enriched = await getEntityDetails(row);
      setEditBuffer(normalizeRow(enriched));
    } catch (err) {
      console.error("Failed to load entity details", err);
      alert(err?.message || "שגיאה בטעינת נתונים");
      setEditingId(null);
      setEditBuffer({});
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
  };

  const saveEdit = async () => {
    try {
      const isFamily = !!editBuffer.isFamily;
      const userId = isFamily ? String(editBuffer.parentId) : String(editBuffer._id);
      const familyId = isFamily ? String(editBuffer._id) : null;

      const allowedKeys = isFamily
        ? ["name", "relation", "idNumber", "phone", "birthDate", "email", "city"]
        : ["name", "idNumber", "birthDate", "phone", "city", "canCharge"];

      const updates = {};
      for (const k of allowedKeys) if (editBuffer[k] !== undefined) updates[k] = editBuffer[k];

      const payload = isFamily
        ? { userId, familyId, parentUserId: userId, updates }
        : { userId, updates };

      const rowKey = editingId;
      optimisticPatchEverywhere((r) => {
        const k = buildEntityId(r).join(":");
        return k === rowKey ? normalizeRow({ ...r, ...updates }) : r;
      });

      const result = await updateEntity(payload);
      if (!result?.success) throw new Error(result?.message || "Update failed");

      if (typeof fetchProfiles === "function") {
        try {
          await fetchProfiles({ limit: 1000, compact: 1 });
        } catch {}
      }

      setEditingId(null);
      setEditBuffer({});
    } catch (err) {
      console.error("Save error:", err);
      alert("שגיאה בשמירה: " + err.message);
    }
  };

  const showWorkshops = async (row) => {
    try {
      setModalTitle("טוען סדנאות...");
      setUserWorkshops([]);
      setModalLoading(true);
      setShowModal(true);

      const isFamily = !!row.isFamily;
      const userId = isFamily ? String(row.parentId) : String(row._id);
      const familyId = isFamily ? String(row._id) : undefined;

      const list = await getUserWorkshops({ userId, familyId });
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
    const isFamily = !!row.isFamily;
    const displayName = isFamily ? `${row.name} (${row.relation || "בן משפחה"})` : row.name;
    if (
      !window.confirm(
        `למחוק את ההרשמות של "${displayName}" מכל הסדנאות? הפעולה בלתי הפיכה.`
      )
    )
      return;

    const rowKey = buildEntityId(row).join(":");
    try {
      setBusyRowKey(rowKey);

      const userId = isFamily ? String(row.parentId) : String(row._id);
      const familyId = isFamily ? String(row._id) : undefined;

      const list = await getUserWorkshops({ userId, familyId });
      const workshopIds = (Array.isArray(list) ? list : [])
        .map((w) => String(w.workshopId || w._id || w.id))
        .filter(Boolean);

      for (const wid of workshopIds) {
        // familyId present => unregister family member, else unregister user
        await unregisterEntityFromWorkshop(wid, familyId || null);
      }

      // Optional refreshes
      try { await fetchWorkshops(); } catch {}
      try { await fetchProfiles({ limit: 1000, compact: 1 }); } catch {}

      alert("כל ההרשמות נמחקו בהצלחה.");
    } catch (e) {
      console.error("bulkRemoveFromWorkshops error:", e);
      alert("שגיאה במחיקה מסדנאות: " + (e?.message || "שגיאה לא ידועה"));
    } finally {
      setBusyRowKey(null);
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
        <div className="h-4 w-36 bg-gray-200 animate-pulse rounded" />
      </td>
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
        <div className="h-4 w-10 bg-gray-200 animate-pulse rounded" />
      </td>
      <td className="p-3 text-center relative overflow-visible z-10">
        <div className="h-4 w-16 bg-gray-200 animate-pulse rounded" />
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
    <div dir="rtl" className="min-h-screen flex flex-col items-center bg-gray-50 py-10 px-4 sm:px-6">
      <div className="w-full max-w-6xl bg-white rounded-xl shadow p-5 sm:p-8">
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
<div className="hidden md:block relative z-0" style={{ overflow: "visible" }}>
            <table className="table table-fixed w-full text-sm">
            <thead>
              <tr>
                <th className="w-[16%]">שם</th>
                <th className="w-[18%]">אימייל</th>
                <th className="w-[14%]">טלפון</th>
                <th className="w-[12%]">עיר</th>
                <th className="w-[12%]">ת.ז</th>
                <th className="w-[8%]">גיל</th>
                <th className="w-[10%]">קשר</th>
                <th className="w-[6%] text-center">חיוב</th>
                <th className="w-[10%] text-center">פעולות</th>
              </tr>
            </thead>

            <tbody>
              {isFetching && profiles.length === 0 ? (
                <>
                  <SkeletonRow />
                  <SkeletonRow />
                  <SkeletonRow />
                </>
              ) : profiles.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-gray-500 py-6">
                    לא נמצאו תוצאות מתאימות
                  </td>
                </tr>
              ) : (
                profiles.map((r, idx) => {
                  const rowKey = buildEntityId(r).join(":");
                  const isEditing = editingId === rowKey;
                  const busy = busyRowKey === rowKey;

                  return (
                    <motion.tr
                      key={rowKey}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.15 }}
                      className={
                        r.isFamily ? "bg-green-50" : idx % 2 === 0 ? "bg-white" : "bg-gray-50"
                      }
                    >
                      {/* name */}
                      <td className="p-3 font-medium text-gray-800">
                        {isEditing ? renderEditInput("name", editBuffer?.name ?? r.name) : r.name}
                        {r.isFamily && (
                          <span className="mr-2 text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                            בן משפחה של {r.parentName}
                          </span>
                        )}
                      </td>

                      {/* email */}
                      <td className="p-3">
                        {isEditing
                          ? renderEditInput("email", editBuffer?.email ?? r.email)
                          : r.displayEmail || "-"}
                      </td>

                      {/* phone */}
                      <td className="p-3">
                        {isEditing
                          ? renderEditInput("phone", editBuffer?.phone ?? r.phone)
                          : r.phone || "-"}
                      </td>

                      {/* city */}
                      <td className="p-3">
                        {isEditing
                          ? renderEditInput("city", editBuffer?.city ?? r.city)
                          : r.city || "-"}
                      </td>

                      {/* idNumber */}
                      <td className="p-3">
                        {isEditing
                          ? renderEditInput("idNumber", editBuffer?.idNumber ?? r.idNumber)
                          : r.idNumber || "-"}
                      </td>

                      {/* age */}
                      <td className="p-3">{r.age ?? "-"}</td>

                      {/* relation */}
                      <td className="p-3">
                        {isEditing
                          ? renderEditInput(
                              "relation",
                              editBuffer?.relation ?? (r.isFamily ? r.relation ?? "" : "")
                            )
                          : r.isFamily
                          ? r.relation || "בן משפחה"
                          : "-"}
                      </td>

                      {/* canCharge */}
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
                          <span>{r.canCharge ? "✅" : "❌"}</span>
                        )}
                      </td>

                      {/* actions */}
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
                          <div className="text-xs text-gray-400">טוען נתונים...</div>
                        )}
                      </div>
                    ) : (
    <div className="inline-block relative z-[2000]">
      <ActionMenu
        onEdit={() => startEdit(r)}
        onShowWorkshops={() => showWorkshops(r)}
        onDeleteFromWorkshops={() => bulkRemoveFromWorkshops(r)}
      />
      {busy && (
        <div className="mt-1 text-xs text-gray-500">מוחק מסדנאות...</div>
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

        {/* ===== Mobile Cards ===== */}
        <div className="md:hidden space-y-3">
          {isFetching && profiles.length === 0 ? (
            <div className="rounded-xl border bg-white border-gray-100 shadow-sm p-4">
              <div className="h-4 w-28 bg-gray-200 animate-pulse rounded mb-3" />
              <div className="grid grid-cols-2 gap-3">
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
                <div className="h-4 bg-gray-200 animate-pulse rounded" />
              </div>
            </div>
          ) : profiles.length === 0 ? (
            <div className="text-center text-gray-500 py-6 font-medium">
              לא נמצאו תוצאות מתאימות
            </div>
          ) : (
            profiles.map((r) => {
              const rowKey = buildEntityId(r).join(":");
              const isEditing = editingId === rowKey;
              const busy = busyRowKey === rowKey;

              return (
             <motion.div
  key={rowKey}
  layout
  initial={{ opacity: 0, y: 6 }}
  animate={{ opacity: 1, y: 0 }}
  exit={{ opacity: 0 }}
  className={`rounded-xl border flex flex-col ${
    r.isFamily ? "bg-green-50 border-green-100" : "bg-white border-gray-100"
  } shadow-sm transition-all duration-200`}
  style={{
    position: "relative",
    zIndex: editingId === rowKey ? 3000 : 1,
    minHeight: "fit-content",
  }}
>


                  <div className="px-4 pt-3 pb-2 flex items-center justify-between">
                    <div className="font-semibold text-indigo-700 text-base">
                      {isEditing ? renderEditInput("name", editBuffer?.name ?? r.name) : r.name}
                    </div>
                    {r.isFamily && (
                      <span className="text-[11px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full">
                        בן משפחה של {r.parentName}
                      </span>
                    )}
                    {!isEditing && (
                      <div className="flex items-center gap-2">
                        <ActionMenu
                          onEdit={() => startEdit(r)}
                          onShowWorkshops={() => showWorkshops(r)}
                          onDeleteFromWorkshops={() => bulkRemoveFromWorkshops(r)}
                        />
                      </div>
                    )}
                  </div>

<div
  className="px-4 pb-3 grid gap-3 text-sm"
  style={{
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    alignItems: "start",
  }}
>
                    <Field
                      label="אימייל"
                      isEditing={isEditing}
                      value={r.displayEmail || "-"}
                      input={renderEditInput("email", editBuffer?.email ?? r.email)}
                    />
                    <Field
                      label="טלפון"
                      isEditing={isEditing}
                      value={r.phone || "-"}
                      input={renderEditInput("phone", editBuffer?.phone ?? r.phone)}
                    />
                    <Field
                      label="עיר"
                      isEditing={isEditing}
                      value={r.city || "-"}
                      input={renderEditInput("city", editBuffer?.city ?? r.city)}
                    />
                    <Field
                      label="ת.ז"
                      isEditing={isEditing}
                      value={r.idNumber || "-"}
                      input={renderEditInput("idNumber", editBuffer?.idNumber ?? r.idNumber)}
                    />
                    <Field label="גיל" isEditing={false} value={r.age ?? "-"} />
                    <Field
                      label="קשר"
                      isEditing={isEditing}
                      value={r.isFamily ? r.relation || "בן משפחה" : "-"}
                      input={renderEditInput(
                        "relation",
                        editBuffer?.relation ?? (r.isFamily ? r.relation ?? "" : "")
                      )}
                    />
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
                        <span className="text-lg">{r.canCharge ? "✅" : "❌"}</span>
                      )}
                    </div>
                    {busy && (
                      <div className="col-span-2 text-xs text-gray-500">מוחק מסדנאות...</div>
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
                        <div className="text-xs text-gray-400 text-center">טוען נתונים...</div>
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
        <div className="text-gray-800 leading-tight">{value}</div>
      )}
    </div>
  );
}
