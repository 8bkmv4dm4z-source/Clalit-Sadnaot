/**
 * FamilyEditorModal.jsx — Manage Family Members
 * ----------------------------------------------
 * - Displays list of family members
 * - Allows adding new one with idNumber, relation, phone, birthDate
 * - Controlled inputs with onChange
 */

import React, { useState } from "react";

export default function FamilyEditorModal({ user, onClose, onSave }) {
  const [family, setFamily] = useState(user?.familyMembers || []);
  const [newMember, setNewMember] = useState({
    name: "",
    relation: "",
    idNumber: "",
    phone: "",
    birthDate: "",
  });

  const handleNewMemberChange = (key, value) => {
    setNewMember((prev) => ({ ...prev, [key]: value }));
  };

  const handleAddMember = () => {
    if (!newMember.name.trim()) return alert("יש להזין שם מלא");
    const updated = [...family, { ...newMember, _id: Date.now().toString() }];
    setFamily(updated);
    setNewMember({
      name: "",
      relation: "",
      idNumber: "",
      phone: "",
      birthDate: "",
    });
  };

  const handleRemove = (id) => {
    setFamily(family.filter((f) => f._id !== id));
  };

  const handleSave = () => {
    onSave(family);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex justify-center items-center z-50">
      <div className="bg-white w-full max-w-xl rounded-2xl shadow-2xl p-8" dir="rtl">
        <h2 className="text-2xl font-bold mb-4 text-indigo-700 font-[Poppins]">
          👨‍👩‍👧 ניהול בני משפחה
        </h2>

        {/* Existing Members */}
        <div className="space-y-3 max-h-60 overflow-y-auto mb-6">
          {family.length > 0 ? (
            family.map((f) => (
              <div
                key={f._id}
                className="p-4 border border-gray-200 rounded-xl bg-gray-50 flex justify-between items-center"
              >
                <div>
                  <p className="font-semibold text-gray-800">{f.name}</p>
                  <p className="text-gray-600 text-sm">
                    {f.relation && `${f.relation} • `}
                    {f.idNumber && `ת"ז: ${f.idNumber} • `}
                    {f.phone || "—"}
                  </p>
                </div>
                <button
                  onClick={() => handleRemove(f._id)}
                  className="text-red-600 hover:text-red-800 text-sm font-medium"
                >
                  ❌ הסר
                </button>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">אין בני משפחה כרגע.</p>
          )}
        </div>

        {/* Add New Member */}
        <div className="border-t border-gray-300 pt-5">
          <h3 className="text-lg font-semibold mb-3 text-gray-800">
            ➕ הוסף בן משפחה חדש
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="שם מלא"
              value={newMember.name}
              onChange={(e) => handleNewMemberChange("name", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="יחס (למשל בן, בת, אח)"
              value={newMember.relation}
              onChange={(e) => handleNewMemberChange("relation", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="תעודת זהות"
              value={newMember.idNumber}
              onChange={(e) => handleNewMemberChange("idNumber", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <input
              type="text"
              placeholder="טלפון"
              value={newMember.phone}
              onChange={(e) => handleNewMemberChange("phone", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
            <input
              type="date"
              value={newMember.birthDate}
              onChange={(e) => handleNewMemberChange("birthDate", e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-400 focus:outline-none"
            />
          </div>

          <button
            onClick={handleAddMember}
            className="mt-4 px-5 py-2.5 rounded-xl bg-indigo-600 text-white font-semibold shadow-sm hover:bg-indigo-700 active:scale-95 transition"
          >
            ➕ הוסף
          </button>
        </div>

        {/* Modal Actions */}
        <div className="mt-8 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-5 py-2.5 rounded-xl bg-gray-100 text-gray-700 font-semibold hover:bg-gray-200 active:scale-95 transition"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            className="px-5 py-2.5 rounded-xl bg-green-600 text-white font-semibold shadow-sm hover:bg-green-700 active:scale-95 transition"
          >
            💾 שמור שינויים
          </button>
        </div>
      </div>
    </div>
  );
}
