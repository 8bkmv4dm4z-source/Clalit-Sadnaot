// server/models/Workshop.js
const mongoose = require("mongoose");

/**
 * Workshop Schema
 * ----------------------------------
 * - Tracks participants and max capacity
 * - Automatically updates participantsCount on save
 * - Includes familyRegistrations with full details snapshot
 */
const WorkshopSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: "", trim: true },
    ageGroup: { type: String, default: "", trim: true },
    city: { type: String, default: "", trim: true },
    studio: { type: String, default: "", trim: true },
    coach: { type: String, default: "", trim: true },
    day: { type: String, default: "", trim: true },
    hour: { type: String, default: "", trim: true },
    available: { type: Boolean, default: true },
    description: { type: String, default: "" },
    price: { type: Number, default: 0 },
    image: { type: String, default: "" },

    /** ✅ Participants management */
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    /** ✅ Family member registrations — full snapshot for reports/UI */
    familyRegistrations: [
  {
    parentUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    familyMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true, // 🔥 לא לשים ref כאן
    },
    name: { type: String, required: true },
    relation: { type: String, default: "" },
    idNumber: { type: String, default: "" },
    phone: { type: String, default: "" },
    birthDate: { type: String, default: "" },
  },
],


    participantsCount: { type: Number, default: 0 },

    /** ✅ Capacity control */
    maxParticipants: { type: Number, default: 20, min: 0 },
  },
  { timestamps: true }
);

/* ============================================================
   ✅ Middleware — Auto update participantsCount on save
   ============================================================ */
WorkshopSchema.pre("save", function (next) {
  const familyCount = Array.isArray(this.familyRegistrations)
    ? this.familyRegistrations.length
    : 0;
  const directCount = Array.isArray(this.participants)
    ? this.participants.length
    : 0;
  this.participantsCount = directCount + familyCount;
  next();
});

/* ============================================================
   ✅ Helper method — Check capacity before adding
   ============================================================ */
WorkshopSchema.methods.canAddParticipant = function () {
  if (this.maxParticipants === 0) return true; // unlimited capacity
  const current =
    (this.participants?.length || 0) + (this.familyRegistrations?.length || 0);
  return current < this.maxParticipants;
};

module.exports = mongoose.model("Workshop", WorkshopSchema);
