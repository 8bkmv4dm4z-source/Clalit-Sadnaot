/**
 * FamilyEditorModal.jsx — Family Management Modal (Full Server Sync)
 * ------------------------------------------------------------------
 * ✅ Hebrew UI + English dev notes
 * ✅ Add / Edit / Delete family members (all synced via /update-entity)
 * ✅ Uses entityKey for every server call (matches hashed IDs)
 * ✅ Refetch-safe and consistent with updateEntity controller
 */

import React, { useState } from "react";
import { apiFetch } from "../../utils/apiFetch";
import { normalizeError } from "../../utils/normalizeError";

export default function FamilyEditorModal({ user, onClose, onSave }) {
  const [list, setList] = useState(user.familyMembers || []);
  const [saving, setSaving] = useState(false);

  /* ------------------------------------------------------------
     🔹 Update a specific field in a given member index
  ------------------------------------------------------------ */
  const updateField = (idx, key, value) => {
    setList((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

  /* ------------------------------------------------------------
     ➕ Add a new blank family member
  ------------------------------------------------------------ */
  const addMember = () => {
    setList((prev) => [
      ...prev,
      {
        name: "",
        relation: "",
        phone: "",
        email: user.email || "",
        birthDate: "",
      },
    ]);
  };

  const resolveMemberKey = (member) => member?.entityKey || member?._id || "";

  /* ------------------------------------------------------------
     ❌ Delete a family member (server removes from workshops)
  ------------------------------------------------------------ */
  const deleteMember = async (idx) => {
    const member = list[idx];
    if (!member) return;

    const memberKey = resolveMemberKey(member);
    if (!memberKey) {
      alert("❌ חסר מזהה בן משפחה (entityKey)");
      return;
    }

    const confirmDelete = window.confirm(
      `האם אתה בטוח שברצונך למחוק את ${member.name || "בן המשפחה"}?`
    );
    if (!confirmDelete) return;

    try {
      setSaving(true);
      await apiFetch(`/api/users/${encodeURIComponent(memberKey)}`, {
        method: "DELETE",
      });

      const updatedList = list.filter((_, i) => i !== idx);
      setList(updatedList);

      onSave?.({ ...user, familyMembers: updatedList });
      window.dispatchEvent(new Event("entity-updated"));
      alert(`✅ ${member.name || "בן משפחה"} נמחק בהצלחה`);
    } catch (e) {
      alert("❌ שגיאה במחיקת בן המשפחה: " + e.message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------
     💾 Save each member (uses entityKey per member)
  ------------------------------------------------------------ */
  const saveAll = async () => {
    try {
      setSaving(true);

      for (const member of list) {
        const normalized = {
          ...member,
          email: member.email || user.email || "",
        };

        const memberKey = resolveMemberKey(normalized);
        if (!memberKey) {
          throw new Error("חסר מזהה בן משפחה (entityKey)");
        }

        const res = await apiFetch("/api/users/update-entity", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entityKey: memberKey,
            updates: {
              name: normalized.name,
              relation: normalized.relation,
              phone: normalized.phone,
              birthDate: normalized.birthDate,
              email: normalized.email,
            },
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw (
            res.normalizedError ||
            normalizeError(null, {
              status: res.status,
              payload: data,
              fallbackMessage: "Update failed",
            })
          );
        }
      }

      window.dispatchEvent(new Event("entity-updated"));
      onSave?.({ ...user, familyMembers: list });
      onClose?.();
      alert("✅ בני המשפחה נשמרו בהצלחה");
    } catch (e) {
      const normalized = normalizeError(e, { fallbackMessage: "Update failed" });
      alert("❌ שגיאה בשמירת בני משפחה: " + normalized.message);
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------------------------------------
     🧱 UI (Hebrew interface)
  ------------------------------------------------------------ */
  return (
    <div
      className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl p-6"
        dir="rtl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">ניהול בני משפחה</h3>
          <button
            onClick={onClose}
            className="text-gray-600 hover:bg-gray-100 rounded-lg px-3 py-1"
          >
            ✕
          </button>
        </div>

        {/* Members List */}
        <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-1">
          {list.map((m, idx) => (
            <div
              key={m.entityKey || m._id || idx}
              className="border border-gray-200 rounded-xl p-4 bg-gray-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="שם"
                  value={m.name || ""}
                  onChange={(e) => updateField(idx, "name", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="קשר"
                  value={m.relation || ""}
                  onChange={(e) => updateField(idx, "relation", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="טלפון"
                  value={m.phone || ""}
                  onChange={(e) => updateField(idx, "phone", e.target.value)}
                />
                <input
                  type="date"
                  className="border rounded-lg px-3 py-2"
                  value={(m.birthDate || "").split("T")[0] || ""}
                  onChange={(e) => updateField(idx, "birthDate", e.target.value)}
                />
                <input
                  className="border rounded-lg px-3 py-2"
                  placeholder="אימייל (לא חובה)"
                  value={m.email || ""}
                  onChange={(e) => updateField(idx, "email", e.target.value)}
                />
              </div>

              {/* Delete Button */}
              <div className="flex justify-end mt-3">
                <button
                  onClick={() => deleteMember(idx)}
                  disabled={saving}
                  className="text-red-600 text-sm hover:underline disabled:opacity-60"
                >
                  🗑️ מחק
                </button>
              </div>
            </div>
          ))}

          {/* Add Button */}
          <button
            onClick={addMember}
            disabled={saving}
            className="w-full py-2 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium disabled:opacity-60"
          >
            ➕ הוסף בן משפחה
          </button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200"
          >
            ביטול
          </button>
          <button
            onClick={saveAll}
            disabled={saving}
            className="px-4 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "שומר..." : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}
