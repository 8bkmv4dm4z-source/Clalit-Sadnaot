/**
 * FamilyEditorModal.tsx — Family Management Modal (Full Server Sync)
 * Uses shadcn/ui Input, Button components
 */

import React, { useState } from "react";
import { apiFetch } from "../../utils/apiFetch";
import { normalizeError } from "../../utils/normalizeError";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface FamilyEditorModalProps {
  user: any;
  onClose: () => void;
  onSave?: (data: any) => void;
}

export default function FamilyEditorModal({ user, onClose, onSave }: FamilyEditorModalProps) {
  const [list, setList] = useState<any[]>(user.familyMembers || []);
  const [saving, setSaving] = useState(false);

  const updateField = (idx: number, key: string, value: string) => {
    setList((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [key]: value };
      return next;
    });
  };

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

  const resolveMemberKey = (member: any) => member?.entityKey || member?._id || "";

  const deleteMember = async (idx: number) => {
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

      const updatedList = list.filter((_: any, i: number) => i !== idx);
      setList(updatedList);

      onSave?.({ ...user, familyMembers: updatedList });
      window.dispatchEvent(new Event("entity-updated"));
      alert(`✅ ${member.name || "בן משפחה"} נמחק בהצלחה`);
    } catch (e: any) {
      alert("❌ שגיאה במחיקת בן המשפחה: " + e.message);
    } finally {
      setSaving(false);
    }
  };

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
            (res as any).normalizedError ||
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
    } catch (e: any) {
      const normalized = normalizeError(e, { fallbackMessage: "Update failed" });
      alert("❌ שגיאה בשמירת בני משפחה: " + normalized.message);
    } finally {
      setSaving(false);
    }
  };

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
          {list.map((m: any, idx: number) => (
            <div
              key={m.entityKey || m._id || idx}
              className="border border-gray-200 rounded-xl p-4 bg-gray-50"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  placeholder="שם"
                  value={m.name || ""}
                  onChange={(e) => updateField(idx, "name", e.target.value)}
                />
                <Input
                  placeholder="קשר"
                  value={m.relation || ""}
                  onChange={(e) => updateField(idx, "relation", e.target.value)}
                />
                <Input
                  placeholder="טלפון"
                  value={m.phone || ""}
                  onChange={(e) => updateField(idx, "phone", e.target.value)}
                />
                <Input
                  type="date"
                  value={(m.birthDate || "").split("T")[0] || ""}
                  onChange={(e) => updateField(idx, "birthDate", e.target.value)}
                />
                <Input
                  placeholder="אימייל (לא חובה)"
                  value={m.email || ""}
                  onChange={(e) => updateField(idx, "email", e.target.value)}
                />
              </div>

              {/* Delete Button */}
              <div className="flex justify-end mt-3">
                <Button
                  variant="link"
                  onClick={() => deleteMember(idx)}
                  disabled={saving}
                  className="text-red-600 text-sm hover:text-red-700 disabled:opacity-60"
                >
                  🗑️ מחק
                </Button>
              </div>
            </div>
          ))}

          {/* Add Button */}
          <Button
            variant="outline"
            onClick={addMember}
            disabled={saving}
            className="w-full rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium border-indigo-200"
          >
            ➕ הוסף בן משפחה
          </Button>
        </div>

        {/* Actions */}
        <div className="flex justify-end gap-2 mt-6">
          <Button
            variant="secondary"
            onClick={onClose}
            className="rounded-xl"
          >
            ביטול
          </Button>
          <Button
            onClick={saveAll}
            disabled={saving}
            className="rounded-xl"
          >
            {saving ? "שומר..." : "שמור"}
          </Button>
        </div>
      </div>
    </div>
  );
}
