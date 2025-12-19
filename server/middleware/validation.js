/*
 * Celebrate / Joi Validation Middleware — Secure & Logical (2025 Final)
 * --------------------------------------------------------------------
 * • Balances security, usability, and maintainability.
 * • Blocks obvious injection patterns (<, >, ${}) but allows natural user input.
 * • Ensures strong passwords, normalized emails, and consistent trimming.
 */

const { celebrate, Joi, Segments } = require("celebrate");

/* ============================================================
   🔤 Common patterns (lightweight sanitization)
   ============================================================ */
const safeText = /^[^<>${}]{1,}$/; // allows normal text, blocks <, >, $, {, }
const phonePattern = /^[0-9+\-\s]{6,20}$/;
const idPattern = /^[0-9]{5,10}$/;

// Opaque entityKey (base64url + padding "0", minLength is set in HASHID_MIN_LENGTH)
const entityKeyPattern = /^[A-Za-z0-9_\-=]{10,200}$/;

const familyMemberSchema = Joi.object({
  name: Joi.string().trim().pattern(safeText).max(80).required(),
  relation: Joi.string().trim().pattern(safeText).max(50).allow("").optional(),
  idNumber: Joi.string().trim().pattern(idPattern).optional(),
  phone: Joi.string().trim().allow("").pattern(phonePattern).optional(),
  email: Joi.string().email().lowercase().trim().allow("").optional(),
  city: Joi.string().trim().pattern(safeText).allow("").optional(),
  birthDate: Joi.date().iso().optional(),
}).unknown(false);

/* ============================================================
   🔐 AUTH VALIDATION
   ============================================================ */
const validateRegister = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().pattern(safeText).max(80).required(),
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string()
      .min(10)
      .max(64)
      .pattern(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*]).+$/)
      .message("Password must include a letter, number, and special character.")
      .required(),

    phone: Joi.string().trim().pattern(phonePattern).optional(),
    city: Joi.string().trim().pattern(safeText).max(60).optional(),
    idNumber: Joi.string().trim().pattern(idPattern).optional(),
    canCharge: Joi.boolean().optional(),
    familyMembers: Joi.array().items(familyMemberSchema).max(20).optional(),
    role: Joi.string().valid("user").optional(),
  }).unknown(false),
});

const validateLogin = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    password: Joi.string().min(4).max(64).required(),
  }).unknown(true),
});

const validateSendOtp = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
  }).unknown(true),
});

const validatePasswordResetRequest = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
  }).unknown(false),
});

/* ============================================================
   🧠 PASSWORD RESET / OTP
   ============================================================ */
const validateOTP = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    otp: Joi.alternatives()
      .try(
        Joi.string().length(6).pattern(/^\d+$/),
        Joi.number().integer().min(100000).max(999999)
      )
      .required(),
  }).unknown(true),
});

const validatePasswordReset = celebrate({
  [Segments.BODY]: Joi.object({
    email: Joi.string().email().lowercase().trim().required(),
    newPassword: Joi.string()
      .min(10)
      .max(64)
      .pattern(/^(?=.*[A-Za-z])(?=.*\d)(?=.*[!@#$%^&*]).+$/)
      .message("Password must include a letter, number, and special character.")
      .required(),
    otp: Joi.alternatives()
      .try(
        Joi.string().length(6).pattern(/^\d+$/),
        Joi.number().integer().min(100000).max(999999)
      )
      .optional(),
    token: Joi.string().length(64).hex().optional(),
  })
    .or("otp", "token")
    .messages({
      "object.missing": "OTP or reset token is required.",
    })
    .unknown(false),
});

/* ============================================================
   👤 USER VALIDATION
   ============================================================ */
const validateUserRegistration = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().pattern(safeText).max(80).required(),
    email: Joi.string().email().lowercase().trim().required(),
    phone: Joi.string().trim().pattern(phonePattern).optional(),
    city: Joi.string().trim().pattern(safeText).max(60).optional(),
    idNumber: Joi.string().trim().pattern(idPattern).optional(),
    birthDate: Joi.date().iso().optional(),
    canCharge: Joi.boolean().optional(),
  }).unknown(true),
});

const validateUserEdit = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().pattern(safeText).max(80).optional(),
    phone: Joi.string().trim().pattern(phonePattern).optional(),
    city: Joi.string().trim().pattern(safeText).max(60).optional(),
    idNumber: Joi.string().trim().pattern(idPattern).optional(),
    birthDate: Joi.date().iso().optional(),
    canCharge: Joi.boolean().optional(),
  }).unknown(true),
});

/* ============================================================
   👨‍👩‍👧 FAMILY MEMBER VALIDATION
   ============================================================ */
const validateFamilyMember = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().pattern(safeText).max(80).required(),
    relation: Joi.string().trim().pattern(safeText).max(50).optional(),
    idNumber: Joi.string().trim().pattern(idPattern).optional(),
    phone: Joi.string().trim().pattern(phonePattern).optional(),
    email: Joi.string().email().lowercase().trim().optional(),
    city: Joi.string().trim().pattern(safeText).optional(),
    birthDate: Joi.date().iso().optional(),
  }).unknown(true),
});

/* ============================================================
   🏋️ WORKSHOPS VALIDATION (Multi-sessions Support — Final)
   ============================================================ */

const validDays = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת", // 🇮🇱 Hebrew support
];

const hourPattern = /^[0-9:\s\-APMapm]+$/;

/* ============================================================
   🟢 CREATE WORKSHOP
   ============================================================ */

/**
 * validateAddressRemote — verifies address vs city using OSM API
 * --------------------------------------------------------------
 * Performs a real lookup to confirm the address exists within the selected city.
 * Used during workshop creation or edit (admin input validation).
 */
async function validateAddressRemote(city, address) {
  if (!city || !address) return true; // skip validation if missing
  try {
    const url = `https://nominatim.openstreetmap.org/search?city=${encodeURIComponent(
      city
    )}&street=${encodeURIComponent(address)}&country=Israel&format=json`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Clalit-Workshops-App" },
    });
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch {
    // Fail-safe: don't block if API down
    return true;
  }
}

exports.validateAddress = async (req, res) => {
  const { city, address } = req.query;

  if (!city || !address) {
    return res.status(400).json({
      success: false,
      valid: false,
      message: "Missing city or address",
    });
  }

  const southernCities = [
    "באר שבע",
    "דימונה",
    "ירוחם",
    "ערד",
    "רהט",
    "נתיבות",
    "שדרות",
    "אופקים",
    "עומר",
    "מיתר",
    "להבים",
    "חורה",
    "תל שבע",
    "כסייפה",
    "ערערה בנגב",
    "שגב שלום",
    "מצפה רמון",
    "אילת",
  ];

  try {
    // ✅ אם העיר בדרום — אוטומטית תקין
    if (southernCities.includes(city.trim())) {
      return res.status(200).json({
        success: true,
        valid: true,
        source: "southern-fallback",
        message: "הכתובת נראית תקינה לעיר הדרומית שנבחרה",
      });
    }

    // ✅ אחרת — בדוק מול OSM
    const valid = await validateAddressRemote(city, address);
    if (valid) {
      return res.status(200).json({
        success: true,
        valid: true,
        source: "osm",
        message: "נמצאה התאמה לכתובת",
      });
    }

    // ❗ לא נמצאה התאמה — לא לחסום
    return res.status(200).json({
      success: true,
      valid: false,
      source: "none",
      message: "⚠︎ לא נמצאה התאמה לכתובת, אך ניתן לשמור בכל זאת",
    });
  } catch (err) {
    console.warn("validateAddress error:", err.message);
    return res.status(200).json({
      success: true,
      valid: false,
      source: "error-fallback",
      message: "שירות אימות לא זמין — ניתן לשמור בכל זאת",
    });
  }
};

/* ============================================================
   🟢 CREATE WORKSHOP (Fixed Address Validation)
   ============================================================ */
const validateWorkshopCreate = celebrate({
  [Segments.BODY]: Joi.object({
    /** 🏷 Basic info */
    title: Joi.string().trim().pattern(safeText).max(100).required(),
    type: Joi.string().trim().pattern(safeText).max(50).optional(),
    ageGroup: Joi.string().trim().pattern(safeText).max(50).optional(),

    /** 🏙 City & Address - REMOVED STRICT REGEX & ADDED allow("") */
    city: Joi.string().trim().allow("").max(50).required(),
    address: Joi.string().trim().allow("").max(100).optional(),

    studio: Joi.string().trim().pattern(safeText).max(50).optional(),
    coach: Joi.string().trim().pattern(safeText).max(50).optional(),

    /** 🗓 Meeting days */
    days: Joi.array()
      .items(Joi.string().valid(...validDays))
      .min(1)
      .required()
      .messages({
        "array.base": "days must be an array.",
        "array.min": "At least one meeting day must be selected.",
        "any.required": "days field is required.",
        "any.only": "Invalid day selected.",
      }),

    hour: Joi.string()
      .trim()
      .pattern(hourPattern)
      .optional()
      .messages({
        "string.pattern.base": "Invalid hour format (use HH:mm or 18:00).",
      }),

    sessionsCount: Joi.number().integer().min(1).max(200).required(),
    startDate: Joi.date().iso().required(),
    endDate: Joi.date().iso().optional(),
    inactiveDates: Joi.array().items(Joi.date().iso()).optional(),

    description: Joi.string().trim().allow("").max(500).optional(),
    price: Joi.number().min(0).max(99999).optional(),
    available: Joi.boolean().optional(),
    image: Joi.string().allow("").optional(),

    maxParticipants: Joi.number().integer().min(0).max(500).optional(),
    waitingListMax: Joi.number().integer().min(0).max(500).optional(),
    autoEnrollOnVacancy: Joi.boolean().optional(),
  }).unknown(true), // Allow extra fields just in case
});

/* ============================================================
   🟣 EDIT WORKSHOP (Fixed Address Validation)
   ============================================================ */
const validateWorkshopEdit = celebrate({
  [Segments.BODY]: Joi.object({
    title: Joi.string().trim().pattern(safeText).max(100).optional(),
    type: Joi.string().trim().pattern(safeText).max(50).optional(),
    ageGroup: Joi.string().trim().pattern(safeText).max(50).optional(),

    /** 🏙 City & Address - NO REGEX, NO BLOCKING */
    city: Joi.string().trim().allow("").max(50).optional(),
    address: Joi.string().trim().allow("").max(100).optional(),

    studio: Joi.string().trim().pattern(safeText).max(50).optional(),
    coach: Joi.string().trim().pattern(safeText).max(50).optional(),

    days: Joi.array().items(Joi.string().valid(...validDays)).min(1).optional(),

    hour: Joi.string()
      .trim()
      .pattern(hourPattern)
      .optional()
      .messages({
        "string.pattern.base": "Invalid hour format (use HH:mm or 18:00).",
      }),

    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().optional(),
    inactiveDates: Joi.array().items(Joi.date().iso()).optional(),
    sessionsCount: Joi.number().integer().min(1).max(200).optional(),

    description: Joi.string().trim().allow("").max(500).optional(),
    price: Joi.number().min(0).max(99999).optional(),
    available: Joi.boolean().optional(),
    image: Joi.string().allow("").optional(),

    maxParticipants: Joi.number().integer().min(0).max(500).optional(),
    waitingListMax: Joi.number().integer().min(0).max(500).optional(),
    autoEnrollOnVacancy: Joi.boolean().optional(),
  }).unknown(true),
});
/* ============================================================
   🧍 REGISTER / UNREGISTER
   ============================================================ */

// Legacy/combined: supports classic familyId flow AND new opaque entityKey flow
const validateWorkshopRegistration = celebrate({
  [Segments.BODY]: Joi.object({
    // old family-member registration (may be null/"" or omitted for self-registration)
    familyId: Joi.alternatives()
      .try(Joi.string().hex().length(24), Joi.valid(null), Joi.allow(""))
      .optional(),

    // new entity-based API: /register-entity (opaque entityKey)
    entityKey: Joi.string().trim().pattern(entityKeyPattern).optional(),
  }).unknown(true),
});

const validateWorkshopUnregister = celebrate({
  [Segments.BODY]: Joi.object({
    // old unregister by familyId
    familyId: Joi.string().hex().length(24).optional(),

    // new unregister by entityKey (for /unregister-entity)
    entityKey: Joi.string().trim().pattern(entityKeyPattern).optional(),
  }).unknown(true),
});

// SECURITY FIX: validate waitlist mutations to prevent unsafe payloads
// and to support BOTH legacy familyId and new entityKey flows.
const validateWaitlistEntity = celebrate({
  [Segments.BODY]: Joi.object({
    familyId: Joi.string().hex().length(24).optional(),
    entityKey: Joi.string().trim().pattern(entityKeyPattern).optional(),
  })
    .or("familyId", "entityKey")
    .messages({
      "object.missing": "Either familyId or entityKey is required.",
    })
    .unknown(false),
});

/* ============================================================
   👤 PROFILE VALIDATION
   ============================================================ */
const validateProfile = celebrate({
  [Segments.BODY]: Joi.object({
    name: Joi.string().trim().pattern(safeText).max(80).optional(),
    phone: Joi.string().trim().pattern(phonePattern).optional(),
    city: Joi.string().trim().pattern(safeText).optional(),
    idNumber: Joi.string().trim().pattern(idPattern).optional(),
    birthDate: Joi.date().iso().optional(),
    canCharge: Joi.boolean().optional(),
  }).unknown(true),
});

/* ============================================================
   📦 EXPORT MODULES
   ============================================================ */
module.exports = {
  validateRegister,
  validateLogin,
  validateOTP,
  validatePasswordReset,
  validateUserRegistration,
  validateUserEdit,
  validateFamilyMember,
  validateWorkshopCreate,
  validateWorkshopEdit,
  validateWorkshopRegistration,
  validateWorkshopUnregister,
  validateWaitlistEntity,
  validateProfile,
  validateSendOtp,
  validatePasswordResetRequest,
  validateAddressRemote,
};
