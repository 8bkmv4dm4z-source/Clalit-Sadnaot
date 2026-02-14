/**
 * EditEntityModal.tsx — Universal Edit Modal
 * Uses shadcn/ui Dialog, Input, Label, Button + Sonner toast
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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface EditEntityModalProps {
  entity: any;
  onClose: () => void;
  onSave?: (data: any) => void;
}

export default function EditEntityModal({ entity, onClose, onSave }: EditEntityModalProps) {
  const [form, setForm] = useState({ ...entity });
  const [saving, setSaving] = useState(false);

  const handleChange = (key: string, value: string) => {
    setForm((prev: any) => ({ ...prev, [key]: value }));
  };

  const saveEntity = async () => {
    try {
      setSaving(true);

      const { entityKey, familyEntityKey, isFamily, ...rest } = form;
      const targetKey = entityKey || familyEntityKey;

      if (!targetKey) {
        throw new Error("Missing entityKey for update");
      }

      const userAllowed = new Set(["name", "email", "phone", "city", "birthDate", "idNumber", "canCharge"]);
      const familyAllowed = new Set(["name", "relation", "phone", "email", "birthDate"]);
      const blocked = new Set([
        "entityKey",
        "familyEntityKey",
        "_id",
        "id",
        "parentId",
        "parentUserId",
        "parentKey",
        "parentName",
        "parentEmail",
        "parentPhone",
        "entityType",
        "isFamily",
        "__entityKey",
        "adminHidden",
        "roles",
        "role",
      ]);

      const allow = isFamily ? familyAllowed : userAllowed;
      const updates: Record<string, any> = {};
      Object.entries(rest).forEach(([key, value]) => {
        if (blocked.has(key)) return;
        if (!allow.has(key)) return;
        if (typeof value === "string" && value.trim() === "") return;
        if (value === null || value === undefined) return;
        updates[key] = value;
      });

      const res = await apiFetch(`/api/users/update-entity`, {
        method: "PUT",
        body: JSON.stringify({
          entityKey: targetKey,
          updates,
        }),
      });

      const data = await res.json();
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

      onSave?.({ entityKey: targetKey, ...updates });
      onClose?.();
    } catch (e: any) {
      const normalized = normalizeError(e, { fallbackMessage: "Update failed" });
      toast.error("שגיאה בעדכון: " + normalized.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className="max-w-lg overflow-y-auto max-h-[85vh]" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-indigo-700">
            עריכת {form.isFamily ? "בן משפחה" : "משתמש"}
          </DialogTitle>
          <DialogDescription>
            כל השדות ניתנים לעריכה, כולל תאריך לידה
          </DialogDescription>
        </DialogHeader>

        <hr className="my-2" />

        <div className="space-y-4">
          <Field label="שם מלא">
            <Input
              value={form.name || ""}
              onChange={(e) => handleChange("name", e.target.value)}
            />
          </Field>

          <Field label="אימייל">
            <Input
              value={form.email || ""}
              onChange={(e) => handleChange("email", e.target.value)}
            />
          </Field>

          <Field label="טלפון">
            <Input
              value={form.phone || ""}
              onChange={(e) => handleChange("phone", e.target.value)}
            />
          </Field>

          {!form.isFamily && (
            <Field label="עיר">
              <Input
                value={form.city || ""}
                onChange={(e) => handleChange("city", e.target.value)}
              />
            </Field>
          )}

          <Field label="תאריך לידה">
            <Input
              type="date"
              value={(form.birthDate || "").split("T")[0] || ""}
              onChange={(e) => handleChange("birthDate", e.target.value)}
            />
          </Field>

          {!form.isFamily && (
            <Field label="תעודת זהות">
              <Input
                value={form.idNumber || ""}
                onChange={(e) => handleChange("idNumber", e.target.value)}
              />
            </Field>
          )}

          {form.isFamily && (
            <Field label="קשר משפחתי">
              <Input
                value={form.relation || ""}
                onChange={(e) => handleChange("relation", e.target.value)}
              />
            </Field>
          )}
        </div>

        <DialogFooter className="gap-2 mt-4">
          <Button variant="secondary" onClick={onClose}>
            ביטול
          </Button>
          <Button onClick={saveEntity} disabled={saving}>
            {saving ? "שומר..." : "שמור"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="block text-sm font-medium text-gray-700 mb-1">{label}:</Label>
      {children}
    </div>
  );
}
