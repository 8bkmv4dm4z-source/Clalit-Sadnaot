/**
 * FamilyEditorModal.tsx — Family Management Modal (Full Server Sync)
 * Uses shadcn/ui Dialog, AlertDialog, Input, Button + Sonner toast
 */

import React, { useState } from "react";
import { apiFetch } from "../../utils/apiFetch";
import { normalizeError } from "../../utils/normalizeError";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

interface FamilyEditorModalProps {
  user: any;
  onClose: () => void;
  onSave?: (data: any) => void;
}

export default function FamilyEditorModal({ user, onClose, onSave }: FamilyEditorModalProps) {
  const [list, setList] = useState<any[]>(user.familyMembers || []);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ idx: number; name: string } | null>(null);

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
      toast.error("חסר מזהה בן משפחה (entityKey)");
      return;
    }

    try {
      setSaving(true);
      await apiFetch(`/api/users/${encodeURIComponent(memberKey)}`, {
        method: "DELETE",
      });

      const updatedList = list.filter((_: any, i: number) => i !== idx);
      setList(updatedList);

      onSave?.({ ...user, familyMembers: updatedList });
      window.dispatchEvent(new Event("entity-updated"));
      toast.success(`${member.name || "בן משפחה"} נמחק בהצלחה`);
    } catch (e: any) {
      toast.error("שגיאה במחיקת בן המשפחה: " + e.message);
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
      toast.success("בני המשפחה נשמרו בהצלחה");
    } catch (e: any) {
      const normalized = normalizeError(e, { fallbackMessage: "Update failed" });
      toast.error("שגיאה בשמירת בני משפחה: " + normalized.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
        <DialogContent className="max-w-2xl" dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold text-gray-800">ניהול בני משפחה</DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[60vh] pr-1">
          <div className="space-y-4">
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

                <div className="flex justify-end mt-3">
                  <Button
                    variant="link"
                    onClick={() => setDeleteConfirm({ idx, name: m.name || "בן המשפחה" })}
                    disabled={saving}
                    className="text-red-600 text-sm hover:text-red-700 disabled:opacity-60"
                  >
                    🗑️ מחק
                  </Button>
                </div>
              </div>
            ))}

            <Button
              variant="outline"
              onClick={addMember}
              disabled={saving}
              className="w-full rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium border-indigo-200"
            >
              ➕ הוסף בן משפחה
            </Button>
          </div>
          </ScrollArea>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={onClose} className="rounded-xl">
              ביטול
            </Button>
            <Button onClick={saveAll} disabled={saving} className="rounded-xl">
              {saving ? "שומר..." : "שמור"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => { if (!open) setDeleteConfirm(null); }}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת בן משפחה</AlertDialogTitle>
            <AlertDialogDescription>
              האם אתה בטוח שברצונך למחוק את {deleteConfirm?.name}?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteConfirm) {
                  deleteMember(deleteConfirm.idx);
                  setDeleteConfirm(null);
                }
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              מחק
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
