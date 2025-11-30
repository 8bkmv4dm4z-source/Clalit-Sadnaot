/**
 * errorTranslator.js — Map backend error payloads into Hebrew, UX-friendly strings
 * -------------------------------------------------------------------------------
 * DATA FLOW
 * • Source: API failures from `apiFetch` callers (Login, Register, profile pages) pass `{ status, payload }` to
 *   `translateAuthError`/`translateNetworkError`.
 * • Flow: The helpers extract raw server messages (string, object, array) → normalize keys → map them to Hebrew
 *   phrases → return `{ message, details }`. Parents surface `message` in toast/UI and optionally display
 *   `details` as bullet hints under fields.
 * • Downstream: Returned text is read-only; UI owners decide where to render it. No mutation of the original error
 *   object occurs, keeping network layer pure.
 *
 * API FLOW
 * • Aligns with backend Celebrate/Joi validation: `extractValidationDetails` inspects `payload.details` and nested
 *   structures emitted by the Express validator pipeline so the client can show actionable hints without exposing
 *   raw server wording.
 * • Authentication failures differentiate by action (login/register) using `AUTH_ERROR_MESSAGES`, ensuring each
 *   form displays context-aware copy while sharing the generic fallback dictionary for unknown statuses.
 *
 * IMPLEMENTATION NOTES
 * • Extraction utilities are resilient to untrusted shapes (strings, arrays, nested objects) to avoid runtime
 *   crashes when the server returns unexpected structures.
 * • The translator never throws; callers can safely destructure `{ message, details }` even if the payload is
 *   undefined or a network error occurred before reaching the API.
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
        "A user with this email or phone already exists":
          "כבר קיים משתמש עם כתובת האימייל או מספר הטלפון שסופקו.",
        "Email or phone is required":
          "יש להזין כתובת אימייל או מספר טלפון תקף אחד לפחות.",
        "Password must include a letter, number, and special character.":
          "הסיסמה חייבת לכלול לפחות אות, מספר וסימן מיוחד.",
        "Validation error":
          "חלק מהשדות אינם עומדים בדרישות. בדקו ונסו שוב.",
      },
      default: "חלק מהפרטים אינם תקינים. ודאו את הערכים ונסו שוב.",
    },
    409: {
      default:
        "בקשה זו כבר עובדה עבור המשתמש. נסו להתחבר או לאפס סיסמה.",
    },
    429: {
      default: "בוצעו יותר מדי ניסיונות. המתינו מספר דקות ונסו שוב.",
    },
    500: {
      default: "לא ניתן היה להשלים את ההרשמה כרגע. נסו שוב מאוחר יותר.",
    },
    default: "הרשמה נכשלה. בדקו את הפרטים ונסו שוב.",
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

const VALIDATION_HINT_RULES = [
  { test: (msg) => msg.includes("email"), message: "כתובת האימייל אינה תקינה." },
  {
    test: (msg) => msg.includes("password") && msg.includes("pattern"),
    message: "הסיסמה חייבת לכלול לפחות אות, ספרה וסימן מיוחד.",
  },
  {
    test: (msg) => msg.includes("password") && msg.includes("length"),
    message: "הסיסמה חייבת להכיל לפחות 10 תווים.",
  },
  { test: (msg) => msg.includes("name"), message: "נא להזין שם מלא." },
  {
    test: (msg) => msg.includes("phone"),
    message: "מספר הטלפון אינו תקין.",
  },
  {
    test: (msg) => msg.includes("idnumber"),
    message: "מספר תעודת הזהות אינו תקין.",
  },
  { test: (msg) => msg.includes("city"), message: "נא להזין שם עיר תקין." },
];

/**
 * Normalize raw backend validation strings into user-facing Hebrew hints.
 *
 * @param {string} rawMessage - Message emitted by Joi/Celebrate (often in English, with field names).
 * @returns {string} Localized message that aligns with frontend field expectations.
 * @description Applies substring heuristics rather than strict equality so minor server wording changes still map to
 * actionable hints. If no heuristic matches, returns a generic validation error.
 */
function toHebrewValidationMessage(rawMessage) {
  if (!rawMessage) return "";
  const normalized = String(rawMessage).replace(/["']/g, "").toLowerCase();
  const rule = VALIDATION_HINT_RULES.find((entry) => entry.test(normalized));
  if (rule) return rule.message;
  if (normalized.includes("password")) {
    return "הסיסמה אינה עומדת בדרישות האבטחה.";
  }
  return "חלק מהשדות אינם תקינים. בדקו ונסו שוב.";
}

/**
 * Extract a meaningful message string from unknown error payload shapes.
 *
 * @param {unknown} payload - Server error body (string | array | object) returned by fetch().json().
 * @returns {string} Best-effort human-readable message or an empty string if none found.
 * @description Recursively walks nested `errors`/`details` arrays to surface the deepest message so UI can display a
 * single concise line. Avoids throwing on malformed payloads to keep the error boundary calm.
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
 *
 * @param {unknown} payload - Response body that may include nested details arrays.
 * @returns {string[]} Deduplicated, localized validation messages suitable for bullet lists near form fields.
 * @description The collector is intentionally tolerant of unknown keys; it recurses into `errors`, `details`, and
 * `body.details` to gather anything resembling a validation message before mapping it through
 * `toHebrewValidationMessage`.
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
 *
 * @param {"login" | "register"} action - Auth flow issuing the request; determines dictionary lookup.
 * @param {number} status - HTTP status code from the failed response.
 * @param {unknown} payload - Parsed JSON body returned from the server.
 * @returns {{ message: string, details: string[] }} Primary toast message plus optional validation hints.
 * @description Prefers action-specific mappings, then HTTP status defaults, and finally a generic fallback so UI
 * always has something to display. Extracted `details` help highlight field-level problems alongside the toast.
 */
export function translateAuthError(action, status, payload) {
  const dictionary = AUTH_ERROR_MESSAGES[action] || {};
  const serverMessage = extractServerMessage(payload);
  const statusEntry = dictionary[status];

  let message = "";

  if (statusEntry) {
    if (statusEntry.messageMap && serverMessage) {
      const mapped = statusEntry.messageMap[serverMessage];
      if (mapped) message = mapped;
    }
    if (!message) {
      if (typeof statusEntry === "string") message = statusEntry;
      else if (statusEntry.default) message = statusEntry.default;
    }
  }

  if (!message) {
    message = dictionary.default || GENERIC_MESSAGES[status] || GENERIC_MESSAGES.default;
  }

  const details = extractValidationDetails(payload);

  return { message, details };
}

/**
 * Translate network-level failures (fetch exceptions) into consistent Hebrew UX copy.
 *
 * @param {Error & { message?: string, name?: string }} error - Error thrown by fetch or network stack.
 * @returns {{ message: string, details: string[] }} Network warning and empty details list.
 * @description Detects failed fetch calls (e.g., offline, DNS) and returns a friendly retry suggestion. Details are
 * intentionally empty because network issues are not field-specific.
 */
export function translateNetworkError(error) {
  if (error?.name === "TypeError" && error.message?.includes("fetch")) {
    return { message: NETWORK_MESSAGE, details: [] };
  }
  return { message: NETWORK_MESSAGE, details: [] };
}
