const mongoose = require("mongoose");
const nodeCrypto = require("node:crypto");
const { hashId } = require("../utils/hashId");

/* ============================================================
   🧱 Workshop Schema — Optimized for High-Performance Search
   ============================================================ */
const WorkshopSchema = new mongoose.Schema(
  {
    workshopKey: {
      type: String,
      default: () => nodeCrypto.randomUUID(),
      index: true,
      unique: true,
    },
    hashedId: {
      type: String,
      unique: true,
      index: true,
    },

    title: { type: String, required: true, trim: true },
    type: { type: String, default: "", trim: true },
    ageGroup: { type: String, default: "", trim: true },

    city: { type: String, required: true, trim: true },
    address: { type: String, default: "", trim: true },
    studio: { type: String, default: "", trim: true },
    coach: { type: String, default: "", trim: true },

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
    startDate: { type: Date },
    endDate: { type: Date },
    inactiveDates: { type: [Date], default: [] },

    available: { type: Boolean, default: true },
    adminHidden: { type: Boolean, default: false },
    description: { type: String, default: "" },
    price: { type: Number, default: 0 },
image: { 
    type: String, 
    default: 'functional_training', // Set a valid ID from your list
    trim: true 
  },
    /** 👥 Participants */
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      }
    ],

    familyRegistrations: [
      {
        parentUser: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
        },
        familyMemberId: {
          type: mongoose.Schema.Types.ObjectId,
        },
        parentKey: { type: String, default: "" },
        familyMemberKey: { type: String, default: "" },
        name: String,
        relation: String,
        idNumber: String,
        phone: String,
        birthDate: Date,
      },
    ],

    waitingList: [
      {
        parentUser: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        familyMemberId: { type: mongoose.Schema.Types.ObjectId },
        parentKey: { type: String, default: "" },
        familyMemberKey: { type: String, default: "" },
        name: { type: String, default: "" },
        relation: { type: String, default: "" },
        idNumber: { type: String, default: "" },
        phone: { type: String, default: "" },
        birthDate: { type: String, default: "" },
      },
    ],

    waitingListMax: { type: Number, default: 10, min: 0 },
    autoEnrollOnVacancy: { type: Boolean, default: false },

    participantsCount: { type: Number, default: 0, min: 0 },
    waitingListCount: { type: Number, default: 0, min: 0 },
    maxParticipants: { type: Number, default: 20, min: 0 },
  },
  { timestamps: true }
);

/* ============================================================
   Auto calc hashedId + endDate
   ============================================================ */
WorkshopSchema.pre("validate", function (next) {
  if (!this.workshopKey) this.workshopKey = nodeCrypto.randomUUID();
  next();
});

WorkshopSchema.pre("save", function (next) {
  if (!this.hashedId && this._id) this.hashedId = hashId("workshop", this._id.toString());
  next();
});

WorkshopSchema.pre("save", function (next) {
  try {
    if (this.startDate && this.days?.length > 0 && this.sessionsCount) {
      const weekdays = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];
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
    }

    next();
  } catch (err) {
    console.warn("⚠️ endDate calc error:", err.message);
    next();
  }
});

/* ============================================================
   Capacity function
   ============================================================ */
WorkshopSchema.methods.canAddParticipant = function () {
  if (this.maxParticipants === 0) return true;
  return this.participantsCount < this.maxParticipants;
};

/* ============================================================
   Indexes
   ============================================================ */
WorkshopSchema.index({ city: 1 });
WorkshopSchema.index({ coach: 1 });
WorkshopSchema.index({ type: 1 });
WorkshopSchema.index({ available: 1 });
WorkshopSchema.index({ adminHidden: 1 });
WorkshopSchema.index({ startDate: 1 });
WorkshopSchema.index({ city: 1, coach: 1, type: 1, available: 1 });

WorkshopSchema.index({ "familyRegistrations.familyMemberId": 1 });
WorkshopSchema.index({ "familyRegistrations.idNumber": 1 });

WorkshopSchema.index(
  {
    title: "text",
    description: "text",
    coach: "text",
    type: "text",
    city: "text",
  },
  {
    weights: {
      title: 5,
      coach: 4,
      type: 3,
      city: 2,
      description: 1,
    },
    name: "WorkshopTextIndex",
  }
);

module.exports = mongoose.model("Workshop", WorkshopSchema);
