const mongoose = require("mongoose");

const WorkshopSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    type: { type: String, default: "", trim: true },
    ageGroup: { type: String, default: "", trim: true },

    /** 📍 Location (Validated City + Address) */
    city: { type: String, required: true, trim: true }, // ✅ חובה
    address: { type: String, default: "", trim: true }, // ✅ כתובת נבדקת מול העיר
    studio: { type: String, default: "", trim: true },
    coach: { type: String, default: "", trim: true },

    /** 🗓 Scheduling */
    days: {
      type: [String],
      default: [],
      validate: {
        validator: (arr) => arr.length > 0,
        message: "At least one meeting day is required",
      },
    },
    hour: { type: String, default: "", trim: true },
    sessionsCount: { type: Number, default: 4, min: 1 },
    startDate: { type: Date, required: false },
    endDate: { type: Date },
    inactiveDates: { type: [Date], default: [] },

    /** 📋 Details */
    available: { type: Boolean, default: true },
    description: { type: String, default: "" },
    price: { type: Number, default: 0 },
    image: { type: String, default: "" },

    /** 👥 Participants */
    participants: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    familyRegistrations: [
      {
        parentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        familyMemberId: { type: mongoose.Schema.Types.ObjectId, required: true },
        name: { type: String, required: true },
        relation: { type: String, default: "" },
        idNumber: { type: String, default: "" },
        phone: { type: String, default: "" },
        birthDate: { type: String, default: "" },
      },
    ],

    /** 🕒 Waiting list */
    waitingList: [
      {
        parentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        familyMemberId: { type: mongoose.Schema.Types.ObjectId },
        name: { type: String, required: true },
        relation: { type: String, default: "" },
        idNumber: { type: String, default: "" },
        phone: { type: String, default: "" },
        birthDate: { type: String, default: "" },
      },
    ],
    waitingListMax: { type: Number, default: 10, min: 0 },
    autoEnrollOnVacancy: { type: Boolean, default: false },

    participantsCount: { type: Number, default: 0 },
    maxParticipants: { type: Number, default: 20, min: 0 },
  },
  { timestamps: true }
);

/* ============================================================
   🧮 Middleware — Auto calculate endDate (with inactiveDates)
   ============================================================ */
WorkshopSchema.pre("save", function (next) {
  if (this.startDate && Array.isArray(this.days) && this.days.length > 0 && this.sessionsCount) {
    try {
      const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const start = new Date(this.startDate);
      let sessions = 0;
      const current = new Date(start);

      const inactiveSet = new Set(
        (this.inactiveDates || []).map((d) => new Date(d).toDateString())
      );

      while (sessions < this.sessionsCount) {
        const dayName = weekdays[current.getDay()];
        const dateStr = current.toDateString();

        if (this.days.includes(dayName) && !inactiveSet.has(dateStr)) {
          sessions++;
        }

        current.setDate(current.getDate() + 1);
      }

      this.endDate = current;
    } catch (err) {
      console.warn("⚠️ Error calculating endDate:", err.message);
    }
  }

  // ✅ update participantsCount
  const familyCount = this.familyRegistrations?.length || 0;
  const directCount = this.participants?.length || 0;
  this.participantsCount = directCount + familyCount;

  next();
});

/* ============================================================
   ✅ Helper — Capacity check
   ============================================================ */
WorkshopSchema.methods.canAddParticipant = function () {
  if (this.maxParticipants === 0) return true;
  const total = (this.participants?.length || 0) + (this.familyRegistrations?.length || 0);
  return total < this.maxParticipants;
};

module.exports = mongoose.model("Workshop", WorkshopSchema);
