/**
 * EditEntityModal.jsx — Universal Edit Modal
 * -------------------------------------------------------------
 * ✅ Modern UI (similar to profile page)
 * ✅ Animations with smooth fade & scale-in
 * ✅ Works for both user & family member
 * ✅ Editable fields: all main user vars
 * ✅ Saves without page reload
 */

import React, { useState, useEffect } from "react";
import { apiFetch } from "../../utils/apiFetch";
import { normalizeError } from "../../utils/normalizeError";
import { motion, AnimatePresence } from "framer-motion";

export default function EditEntityModal({ entity, onClose, onSave }) {
  const [form, setForm] = useState({ ...entity });
  const [saving, setSaving] = useState(false);

  const handleChange = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const saveEntity = async () => {
    try {
      setSaving(true);

      const { entityKey, _id, parentId, isFamily, ...rest } = form;
      const updates = { ...rest };
      if (isFamily) {
        delete updates.idNumber;
        delete updates.city;
      }
      const targetKey = entityKey || _id;

      if (!targetKey) {
        throw new Error("Missing entity key for update");
      }

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
          res.normalizedError ||
          normalizeError(null, {
            status: res.status,
            payload: data,
            fallbackMessage: "Update failed",
          })
        );
      }

      onSave?.({ entityKey: targetKey, ...updates });
      onClose?.();
    } catch (e) {
      const normalized = normalizeError(e, { fallbackMessage: "Update failed" });
      alert("❌ שגיאה בעדכון: " + normalized.message);
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => (document.body.style.overflow = "auto");
  }, []);

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-lg bg-white rounded-2xl shadow-2xl p-6 overflow-y-auto max-h-[85vh]"
          dir="rtl"
          onClick={(e) => e.stopPropagation()}
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ duration: 0.25 }}
        >
          {/* --- Header --- */}
          <div className="text-center mb-4">
            <h3 className="text-2xl font-bold text-indigo-700 mb-1">
              עריכת {form.isFamily ? "בן משפחה" : "משתמש"}
            </h3>
            <p className="text-gray-500 text-sm">
              כל השדות ניתנים לעריכה, כולל תאריך לידה
            </p>
          </div>

          <hr className="my-4" />

          {/* --- Form --- */}
          <div className="space-y-4">
            <Field label="שם מלא">
              <input
                className="input w-full"
                value={form.name || ""}
                onChange={(e) => handleChange("name", e.target.value)}
              />
            </Field>

            <Field label="אימייל">
              <input
                className="input w-full"
                value={form.email || ""}
                onChange={(e) => handleChange("email", e.target.value)}
              />
            </Field>

            <Field label="טלפון">
              <input
                className="input w-full"
                value={form.phone || ""}
                onChange={(e) => handleChange("phone", e.target.value)}
              />
            </Field>

            {!form.isFamily && (
              <Field label="עיר">
                <input
                  className="input w-full"
                  value={form.city || ""}
                  onChange={(e) => handleChange("city", e.target.value)}
                />
              </Field>
            )}

            <Field label="תאריך לידה">
              <input
                type="date"
                className="input w-full"
                value={(form.birthDate || "").split("T")[0] || ""}
                onChange={(e) => handleChange("birthDate", e.target.value)}
              />
            </Field>

            {!form.isFamily && (
              <Field label="תעודת זהות">
                <input
                  className="input w-full"
                  value={form.idNumber || ""}
                  onChange={(e) => handleChange("idNumber", e.target.value)}
                />
              </Field>
            )}

            {form.isFamily && (
              <Field label="קשר משפחתי">
                <input
                  className="input w-full"
                  value={form.relation || ""}
                  onChange={(e) => handleChange("relation", e.target.value)}
                />
              </Field>
            )}
          </div>

          {/* --- Actions --- */}
          <div className="flex justify-end gap-3 mt-8">
            <button
              onClick={onClose}
              className="btn bg-gray-200 text-gray-700 hover:bg-gray-300"
            >
              ביטול
            </button>
            <button
              onClick={saveEntity}
              disabled={saving}
              className="btn bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              {saving ? "שומר..." : "שמור"}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* 🧩 Reusable labeled field */
function Field({ label, children }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}:</label>
      {children}
    </div>
  );
}
