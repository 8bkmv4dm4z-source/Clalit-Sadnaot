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

export function translateNetworkError(error) {
  if (error?.name === "TypeError" && error.message?.includes("fetch")) {
    return { message: NETWORK_MESSAGE, details: [] };
  }
  return { message: NETWORK_MESSAGE, details: [] };
}
