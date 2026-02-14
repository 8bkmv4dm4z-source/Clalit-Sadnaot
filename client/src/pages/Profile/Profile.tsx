/**
 * Profile.tsx — User Profile Page (Full DB-Sync, Hebrew UI + English Notes)
 * -----------------------------------------------------------------------
 * Updates user via /api/users/update-entity (AuthContext updateEntity)
 * Always fetches /api/users/getMe on mount (single source of truth)
 */

import React, { useCallback, useMemo, useState, useEffect } from "react";
import { useAuth } from "../../layouts/AuthLayout";
import { useWorkshops } from "../../layouts/WorkshopContext";
import { apiFetch } from "../../utils/apiFetch";
import { normalizeError } from "../../utils/normalizeError";
import { useAdminCapabilityStatus } from "../../context/AdminCapabilityContext";
import EditEntityModal from "../../components/people/EditEntityModal";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

const normalizeBirthDate = (value: any): string => {
  if (!value) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);

  const asString = String(value).trim();
  if (!asString) return "";

  const [datePart] = asString.split("T");
  if (/^\d{4}-\d{2}-\d{2}$/.test(datePart)) return datePart;

  const parsed = new Date(asString);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return "";
};

const normalizeProfilePayload = (payload: any = {}) => ({
  entityKey: payload.entityKey || "",
  name: payload.name || "",
  email: payload.email || "",
  phone: payload.phone || "",
  city: payload.city || "",
  birthDate: normalizeBirthDate(payload.birthDate),
});

export default function Profile() {
  const { user, updateEntity } = useAuth() as any;
  const { fetchWorkshops } = useWorkshops() as any;
  const { canAccessAdmin, isChecking } = useAdminCapabilityStatus() as any;

  const [form, setForm] = useState(normalizeProfilePayload(user));
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingFamilyMember, setEditingFamilyMember] = useState<any>(null);
  const [familyEntityKeys, setFamilyEntityKeys] = useState<string[]>([]);
  const [familyEntities, setFamilyEntities] = useState<any[]>([]);

  const refreshUser = useCallback(async () => {
    try {
      const res = await apiFetch("/api/users/getMe");
      const data = await res.json();
      if (res.ok && data?.data?.entityKey) {
        const payload = data.data;
        setForm(normalizeProfilePayload(payload));
        const keys = Array.isArray(payload.familyMembers)
          ? payload.familyMembers.map((member: any) => member?.entityKey).filter(Boolean)
          : [];
        setFamilyEntityKeys(keys);
      }
    } catch (err: any) {
      const normalized = normalizeError(err, { fallbackMessage: "Failed to refresh user data" });
      console.warn("Failed to refresh user data:", normalized.message);
    }
  }, []);

  useEffect(() => {
    if (user) {
      setForm(normalizeProfilePayload(user));
      const keys = Array.isArray(user.familyMembers)
        ? user.familyMembers.map((member: any) => member?.entityKey).filter(Boolean)
        : [];
      setFamilyEntityKeys(keys);
    }
  }, [user]);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const handleChange = (key: string, value: string) => setForm((p: any) => ({ ...p, [key]: value }));

  const handleSave = async () => {
    try {
      setSaving(true);

      const updates = {
        name: form.name,
        phone: form.phone,
        city: form.city,
        birthDate: normalizeBirthDate(form.birthDate) || null,
      };

      const payload = { entityKey: user.entityKey, updates };
      const result = await updateEntity(payload);

      if (!result.success) throw new Error(result.message);

      await fetchWorkshops();

      alert("✅ הנתונים עודכנו בהצלחה!");
      setEditMode(false);
    } catch (err: any) {
      alert("❌ שגיאה בעדכון הפרופיל: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setForm(normalizeProfilePayload(user));
    setEditMode(false);
  };

  const calcAge = (birthDate: string) => {
    if (!birthDate) return "";
    const diff = Date.now() - new Date(birthDate).getTime();
    return Math.floor(diff / (1000 * 60 * 60 * 24 * 365.25));
  };

  const familyMembers = useMemo(() => familyEntities, [familyEntities]);

  const canEditFamily = !!user?.entityKey && (!isChecking && (canAccessAdmin || user?.entityKey === form.entityKey));

  const fetchEntityDetails = useCallback(async (entityKey: string) => {
    const res = await apiFetch(`/api/users/entity/${encodeURIComponent(entityKey)}`);
    const data = await res.json();
    if (!res.ok) {
      throw (
        (res as any).normalizedError ||
        normalizeError(null, {
          status: res.status,
          payload: data,
          fallbackMessage: "Failed to load entity",
        })
      );
    }
    return data;
  }, []);

  useEffect(() => {
    let alive = true;
    const loadFamilyEntities = async () => {
      if (!familyEntityKeys.length) {
        if (alive) setFamilyEntities([]);
        return;
      }
      try {
        const results = await Promise.all(
          familyEntityKeys.map((key) => fetchEntityDetails(key).catch(() => null))
        );
        if (!alive) return;
        setFamilyEntities(results.filter(Boolean));
      } catch (err: any) {
        if (!alive) return;
        console.warn("Failed to load family entities:", err.message);
        setFamilyEntities([]);
      }
    };
    loadFamilyEntities();
    return () => {
      alive = false;
    };
  }, [familyEntityKeys, fetchEntityDetails]);

  if (!user)
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-500">
        ⏳ טוען נתוני משתמש...
      </div>
    );

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-indigo-100 via-blue-50 to-gray-50 py-10 flex justify-center"
      dir="rtl"
    >
      <div className="w-full max-w-lg container-box p-8 animate-fade-in">
        {/* Header */}
        <div className="flex items-center gap-5 mb-8 border-b pb-5 border-indigo-200">
          <img
            src={`https://ui-avatars.com/api/?name=${encodeURIComponent(
              user.name || "משתמש"
            )}&background=6366F1&color=fff&size=120`}
            alt="avatar"
            className="rounded-full w-24 h-24 shadow-md"
          />
          <div>
            <h2 className="text-2xl font-bold text-gray-900 font-[Poppins]">
              {form.name || "משתמש"}
            </h2>
          </div>
        </div>

        {/* Fields */}
        <div className="space-y-5">
          <ProfileField
            label="שם מלא"
            value={form.name}
            editMode={editMode}
            onChange={(v: string) => handleChange("name", v)}
          />
          <ProfileField label="אימייל" value={form.email} editMode={false} />
          <ProfileField
            label="תאריך לידה"
            type="date"
            value={form.birthDate}
            editMode={editMode}
            onChange={(v: string) => handleChange("birthDate", v)}
            displayExtra={
              !editMode && form.birthDate ? `(${calcAge(form.birthDate)} שנים)` : ""
            }
          />
          <ProfileField
            label="עיר"
            value={form.city}
            editMode={editMode}
            onChange={(v: string) => handleChange("city", v)}
          />
          <ProfileField
            label="טלפון"
            value={form.phone}
            editMode={editMode}
            onChange={(v: string) => handleChange("phone", v)}
          />
        </div>

        {/* Family members */}
        <div className="mt-6 p-4 rounded-xl border border-indigo-200 bg-indigo-50">
          <h3 className="text-lg font-semibold text-gray-800 mb-2">בני משפחה</h3>
          <p className="text-sm text-gray-600 mb-3">
            ניתן לערוך בני משפחה באמצעות כפתור עריכה לצד כל כרטיס.
          </p>
          {familyMembers.length === 0 ? (
            <p className="text-gray-600 text-sm">לא נמצאו בני משפחה.</p>
          ) : (
            <div className="space-y-3">
              {familyMembers.map((member: any) => (
                <div
                  key={member.entityKey}
                  className="flex flex-col gap-2 rounded-xl border border-indigo-100 bg-white/80 p-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-gray-800 font-semibold">
                        {member.name || "ללא שם"}
                      </div>
                      {member.relation && (
                        <div className="text-xs text-gray-500">
                          קשר: {member.relation}
                        </div>
                      )}
                    </div>
                    {canEditFamily && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        className="text-xs"
                        onClick={async () => {
                          try {
                            const entity = await fetchEntityDetails(member.entityKey);
                            setEditingFamilyMember(entity);
                          } catch (err: any) {
                            alert(`❌ שגיאה בטעינת פרטי בן המשפחה: ${err.message}`);
                          }
                        }}
                      >
                        ✏️ ערוך
                      </Button>
                    )}
                  </div>
                  <div className="grid gap-2 text-sm text-gray-700 sm:grid-cols-2">
                    <span>טלפון: {member.phone || "-"}</span>
                    <span>
                      תאריך לידה:{" "}
                      {member.birthDate
                        ? new Date(member.birthDate).toLocaleDateString("he-IL")
                        : "-"}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="mt-10 flex flex-wrap gap-3 justify-end">
          {editMode ? (
            <>
              <Button
                onClick={handleSave}
                disabled={saving}
                className={saving ? "cursor-not-allowed" : ""}
              >
                {saving ? "שומר..." : "💾 שמור"}
              </Button>
              <Button onClick={handleCancel} variant="secondary">
                ביטול
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => setEditMode(true)}>
                ✏️ ערוך פרטים
              </Button>
            </>
          )}
        </div>
      </div>

      {editingFamilyMember && (
        <EditEntityModal
          entity={editingFamilyMember}
          onClose={() => setEditingFamilyMember(null)}
          onSave={async () => {
            setEditingFamilyMember(null);
            await refreshUser();
          }}
        />
      )}
    </div>
  );
}

/* ProfileField Subcomponent */
interface ProfileFieldProps {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  editMode: boolean;
  type?: string;
  displayExtra?: string;
}

function ProfileField({ label, value, onChange, editMode, type = "text", displayExtra = "" }: ProfileFieldProps) {
  return (
    <div className="p-4 rounded-xl border border-indigo-200 bg-indigo-50">
      <span className="text-gray-700 font-medium">{label}:</span>
      {editMode ? (
        <Input
          type={type}
          value={value || ""}
          onChange={(e) => onChange?.(e.target.value)}
          className="mt-2"
        />
      ) : (
        <p className="text-gray-800 mt-1">
          {value || "-"} {displayExtra}
        </p>
      )}
    </div>
  );
}
