/**
 * errorTranslator.js — Map backend error payloads into Hebrew, UX-friendly strings
 * -------------------------------------------------------------------------------
 * DATA FLOW
 * • Source: API failures from `apiFetch` callers (Login, Register, profile pages) pass `{ status, payload }` to
 * `translateAuthError`/`translateNetworkError`.
 * • Flow: The helpers extract raw server messages (string, object, array) → normalize keys → map them to Hebrew
 * phrases → return `{ message, details }`. Parents surface `message` in toast/UI and optionally display
 * `details` as bullet hints under fields.
 * • Downstream: Returned text is read-only; UI owners decide where to render it. No mutation of the original error
 * object occurs, keeping network layer pure.
 */

const AUTH_ERROR_MESSAGES = {
  login: {
    400: {
      messageMap: {
        "Invalid email or password": "כתובת האימייל או הסיסמה אינם נכונים.",
        "Validation error": "כתובת האימייל או הסיסמה חסרים או אינם תקינים.",
      },
      default: "כתובת האימייל או הסיסמה אינם נכונים.",
    },
    401: { default: "ההרשאה פגה. התחברו מחדש." },
    404: { default: "לא מצאנו משתמש עם הפרטים שסופקו." },
    429: {
      default: "בוצעו יותר מדי ניסיונות התחברות. המתינו מספר דקות ונסו שוב.",
    },
    500: { default: "אירעה תקלה זמנית בשרת. נסו שוב מאוחר יותר." },
    default: "לא ניתן היה להשלים את ההתחברות עם הפרטים שסיפקתם.",
  },
  register: {
    400: {
      messageMap: {
        // Joi / Celebrate pattern keys
        "Password must include an uppercase letter, lowercase letter, number, and special character.":
          "הסיסמה אינה עומדת בדרישות (אות גדולה, אות קטנה, מספר ותו מיוחד)",
        "password must include an uppercase letter, lowercase letter, number, and special character.":
          "הסיסמה אינה עומדת בדרישות (אות גדולה, אות קטנה, מספר ותו מיוחד)",
        "password must include a letter, number, and special character.":
          "הסיסמה אינה עומדת בדרישות (אות גדולה, אות קטנה, מספר ותו מיוחד)",
        "validation error": "חלק מהשדות אינם עומדים בדרישות. בדקו ונסו שוב.",
      },
      default: "חלק מהפרטים אינם תקינים. ודאו את הערכים ונסו שוב.",
    },
    409: {
      default:
        "אחד מהערכים שהוזנו (אימייל או טלפון) כבר קיים במערכת. אנא נסה שנית עם ערך שונה",
    },
    429: {
      default: "בוצעו יותר מדי ניסיונות. המתינו מספר דקות ונסו שוב.",
    },
    500: {
      default: "לא ניתן היה להשלים את ההרשמה כרגע. נסו שוב מאוחר יותר.",
    },
    default: "הרשמה נכשלה. בדקו את הפרטים ונסו שוב.",
  },
  otp_send: {
    200: {
      messageMap: {
        "If the account is eligible, a verification code has been sent.": "אם החשבון קיים, שלחנו קוד אימות למייל.",
      },
      default: "אם החשבון קיים, שלחנו קוד אימות למייל.",
    },
    400: {
      messageMap: {
        "Email is required": "חסרה כתובת אימייל.",
      },
      default: "לא ניתן לשלוח קוד אימות כעת.",
    },
    429: { default: "בוצעו יותר מדי בקשות קוד. נסו שוב מאוחר יותר." },
    500: { default: "שליחת הקוד נכשלה זמנית. נסו שוב מאוחר יותר." },
    default: "לא ניתן לשלוח קוד אימות כעת.",
  },
  otp_verify: {
    200: { default: "התחברות באמצעות קוד הצליחה." },
    400: {
      messageMap: {
        "Invalid or expired verification code. Request a new code and try again.": "קוד האימות שגוי או פג תוקף. בקשו קוד חדש ונסו שוב.",
      },
      default: "קוד האימות שגוי או פג תוקף.",
    },
    401: { default: "אין הרשאה לבצע את הפעולה." },
    404: { default: "המשתמש לא נמצא." },
    429: { default: "בוצעו יותר מדי ניסיונות אימות. המתינו ונסו שוב." },
    default: "אימות הקוד נכשל. נסו שוב.",
  },
  registration_verify: {
    200: { default: "האימות הושלם בהצלחה." },
    201: { default: "החשבון נוצר בהצלחה." },
    400: {
      messageMap: {
        "Registration could not be completed. Request a new code or use password reset if you already have an account.":
          "לא ניתן להשלים את ההרשמה. בקשו קוד חדש או בצעו איפוס סיסמה אם כבר קיים חשבון.",
      },
      default: "לא ניתן להשלים את ההרשמה. בקשו קוד חדש או בצעו איפוס סיסמה.",
    },
    404: { default: "הבקשה להרשמה לא נמצאה." },
    429: { default: "בוצעו יותר מדי ניסיונות. המתינו ונסו שוב." },
    default: "האימות נכשל. נסו שוב.",
  },
};

const GENERIC_MESSAGES = {
  400: "הבקשה שנשלחה אינה תקינה.",
  401: "ההרשאה פגה. התחברו מחדש.",
  403: "אין לכם הרשאה לבצע פעולה זו.",
  404: "הפריט המבוקש לא נמצא.",
  429: "בוצעו יותר מדי בקשות. המתינו ונסו שוב.",
  500: "אירעה תקלה זמנית בשרת. נסו שוב מאוחר יותר.",
  default: "אירעה תקלה בלתי צפויה. נסו שוב מאוחר יותר.",
};

const NETWORK_MESSAGE =
  "לא ניתן ליצור קשר עם השרת כרגע. בדקו את החיבור לאינטרנט ונסו שוב.";

// ✅ תיקנתי את החוקים כאן כדי להתאים לשרת החדש (8 תווים, תווים אסורים)
const VALIDATION_HINT_RULES = [
  { test: (msg) => msg.includes("email"), message: "כתובת האימייל אינה תקינה." },
  {
    test: (msg) =>
      msg.includes("password") &&
      (msg.includes("pattern") || msg.includes("uppercase") || msg.includes("lowercase")),
    message: "הסיסמה אינה עומדת בדרישות (אות גדולה, אות קטנה, מספר ותו מיוחד)",
  },
  {
    // ✅ תוקן: שונה מ-10 ל-8 תווים
    test: (msg) => msg.includes("password") && (msg.includes("length") || msg.includes("long") || msg.includes("short")),
    message: "הסיסמה חייבת להכיל לפחות 8 תווים.",
  },
  // ✅ חדש: זיהוי תווים אסורים (<, >) או שמות ארוכים מדי
  { 
    test: (msg) => (msg.includes("name") || msg.includes("city")) && msg.includes("pattern"), 
    message: "השדה מכיל תווים אסורים (כגון <, >) או סימנים לא חוקיים." 
  },
  { test: (msg) => msg.includes("name"), message: "נא להזין שם מלא תקין." },
  {
    test: (msg) => msg.includes("phone"),
    message: "מספר הטלפון אינו תקין.",
  },
  {
    test: (msg) => msg.includes("idnumber"),
    message: "מספר תעודת הזהות אינו תקין.",
  },
  { test: (msg) => msg.includes("city"), message: "נא להזין שם עיר תקין." },
  { 
    test: (msg) => msg.includes("familymembers"), 
    message: "אחד מפרטי בני המשפחה אינו תקין (שם חסר או ת.ז שגויה)." 
  },
];

/**
 * Normalize raw backend validation strings into user-facing Hebrew hints.
 */
function toHebrewValidationMessage(rawMessage) {
  if (!rawMessage) return "";
  const normalized = String(rawMessage).replace(/["']/g, "").toLowerCase();

  const rule = VALIDATION_HINT_RULES.find((entry) => entry.test(normalized));
  if (rule) return rule.message;
  
  if (normalized.includes("password")) {
    return "הסיסמה אינה עומדת בדרישות (אות גדולה, אות קטנה, מספר ותו מיוחד)";
  }
  // אם זו שגיאת Pattern כללית שלא תפסנו למעלה
  if (normalized.includes("pattern") || normalized.includes("fails to match")) {
      if (normalized.includes("safetext") || normalized.includes("<>")) {
        return "השדה מכיל תווים אסורים (<, >) לצרכי אבטחה";
      }
      return "אחד השדות מכיל תווים לא חוקיים.";
  }

  return "חלק מהשדות אינם תקינים. בדקו ונסו שוב.";
}

/**
 * Extract a meaningful message string from unknown error payload shapes.
 */
export function extractServerMessage(payload) {
  if (!payload) return "";
  if (typeof payload === "string") return payload;
  if (Array.isArray(payload)) {
    return extractServerMessage(payload[0]);
  }
  if (typeof payload === "object") {
    if (typeof payload.message === "string") return payload.message;
    if (typeof payload.error === "string") return payload.error;
    if (Array.isArray(payload.errors) && payload.errors.length) {
      return extractServerMessage(payload.errors[0]);
    }
    if (payload.details) {
      if (typeof payload.details.message === "string") {
        return payload.details.message;
      }
      if (Array.isArray(payload.details)) {
        return extractServerMessage(payload.details[0]);
      }
      if (payload.details.body?.details?.length) {
        return extractServerMessage(payload.details.body.details[0]);
      }
    }
  }
  return "";
}

/**
 * Collect detailed validation hints from complex Celebrate/Joi responses.
 */
export function extractValidationDetails(payload) {
  const rawMessages = [];

  if (!payload) return rawMessages;

  const collect = (value) => {
    if (!value) return;
    if (Array.isArray(value)) {
      value.forEach(collect);
      return;
    }
    if (typeof value === "string") {
      rawMessages.push(value);
      return;
    }
    if (typeof value === "object") {
      if (typeof value.message === "string") {
        rawMessages.push(value.message);
      }
      if (value.body?.details) collect(value.body.details);
      if (value.details) collect(value.details);
      if (value.errors) collect(value.errors);
    }
  };

  collect(payload);

  const unique = Array.from(new Set(rawMessages.filter(Boolean)));
  return unique.map(toHebrewValidationMessage);
}

/**
 * Translate authentication-related API errors into Hebrew messages tailored to the action.
 */
export function translateAuthError(action, status, payload) {
  const dictionary = AUTH_ERROR_MESSAGES[action] || {};
  const serverMessage = extractServerMessage(payload);
  const statusEntry = dictionary[status];

  let message = "";
  const normalizedServer = serverMessage ? serverMessage.toLowerCase() : "";

  if (statusEntry) {
    if (statusEntry.messageMap && serverMessage) {
      const mapped = statusEntry.messageMap[serverMessage];
      if (mapped) message = mapped;
      else {
        const fuzzyMatch = Object.entries(statusEntry.messageMap).find(
          ([key]) => normalizedServer && normalizedServer.includes(key.toLowerCase())
        );
        if (fuzzyMatch) message = fuzzyMatch[1];
      }
    }
    if (!message) {
      if (typeof statusEntry === "string") message = statusEntry;
      else if (statusEntry.default) message = statusEntry.default;
    }
  }

  if (!message) {
    message = dictionary.default || GENERIC_MESSAGES[status] || GENERIC_MESSAGES.default;
  }

  // Post-detection for validation specifics (ensure no generic responses)
  if (status === 400) {
    if (
      normalizedServer.includes("password") &&
      (normalizedServer.includes("pattern") ||
        normalizedServer.includes("uppercase") ||
        normalizedServer.includes("lowercase"))
    ) {
      message = "הסיסמה אינה עומדת בדרישות (אות גדולה, אות קטנה, מספר ותו מיוחד)";
    } else if (
      normalizedServer.includes("safetext") ||
      normalizedServer.includes("<>") ||
      normalizedServer.includes("fails to match the required pattern: /^[^<>${}]{1,}$/")
    ) {
      message = "השדה מכיל תווים אסורים (<, >) לצרכי אבטחה";
    }
  }

  const details = extractValidationDetails(payload);

  return { message, details };
}

/**
 * Translate network-level failures.
 */
export function translateNetworkError(error) {
  if (error?.name === "TypeError" && error.message?.includes("fetch")) {
    return { message: NETWORK_MESSAGE, details: [] };
  }
  return { message: NETWORK_MESSAGE, details: [] };
}

export const translateServerError = (payload) => {
    const { message, details } = translateAuthError('register', 400, payload); // משתמש בלוגיקה של register כברירת מחדל
    return message + (details.length ? ` (${details[0]})` : "");
};
