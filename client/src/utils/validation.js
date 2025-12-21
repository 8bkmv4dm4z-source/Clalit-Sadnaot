/**
 * validation.js — Client-side validation helpers
 * ------------------------------------------------
 * Matches Joi logic on server/middleware/validation.js
 */
const PATTERNS = {
  // Matches server/middleware/validation.js
  safeText: /^[^<>${}]{1,}$/,
  phone: /^[0-9+\-\s]{6,20}$/,
  idNumber: /^[0-9]{5,10}$/,
  password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*]).+$/,
};

const HEBREW_MESSAGES = {
  required: (label) => `נא להזין ${label}.`,
  email: "נא להזין כתובת אימייל תקינה.",
  phone: "נא להזין מספר טלפון תקין (ספרות, רווחים, מקפים או +).",
  passwordLength: "הסיסמה חייבת להכיל לפחות 8 תווים.",
  passwordUpper: "הסיסמה חייבת לכלול לפחות אות אחת גדולה (A-Z).",
  passwordLower: "הסיסמה חייבת לכלול לפחות אות אחת קטנה (a-z).",
  passwordSpecial: "הסיסמה חייבת לכלול לפחות תו מיוחד אחד (!@#$%^&*).",
  passwordDigit: "הסיסמה חייבת לכלול לפחות ספרה אחת.",
  passwordConfirm: "הסיסמאות אינן תואמות.",
  safeText: "השדה מכיל תווים אסורים (<, >) לצרכי אבטחה.",
  israelId: "מספר תעודת הזהות שהוזן אינו תקין.",
};

export const validateRequired = (value, label) => {
  const isValid = Boolean(String(value || "").trim());
  return { valid: isValid, message: isValid ? "" : HEBREW_MESSAGES.required(label) };
};

export const validateEmail = (value) => {
  const email = String(value || "").trim();
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = pattern.test(email);
  return { valid, message: valid ? "" : HEBREW_MESSAGES.email };
};

export const validatePhone = (value) => {
  const normalized = String(value || "").trim();
  const valid = PATTERNS.phone.test(normalized);
  return { valid, message: valid ? "" : HEBREW_MESSAGES.phone };
};

export const validatePasswordComplexity = (value) => {
  const password = String(value || "");
  
  // ✅ SYNCED: Check for 8 characters (matches server Joi .min(8))
  if (password.length < 8) {
    return { valid: false, message: HEBREW_MESSAGES.passwordLength };
  }

  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: HEBREW_MESSAGES.passwordUpper };
  }
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: HEBREW_MESSAGES.passwordLower };
  }
  if (!/[!@#$%^&*]/.test(password)) {
    return { valid: false, message: HEBREW_MESSAGES.passwordSpecial };
  }
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: HEBREW_MESSAGES.passwordDigit };
  }
  return { valid: true, message: "" };
};

export const validatePasswordConfirmation = (password, confirm) => {
  const match = String(password || "") === String(confirm || "");
  return { valid: match, message: match ? "" : HEBREW_MESSAGES.passwordConfirm };
};

export const validateSafeText = (value, label = "השדה") => {
  const text = String(value || "").trim();
  if (!text) return { valid: true, message: "" };
  const valid = PATTERNS.safeText.test(text);
  return { valid, message: valid ? "" : `${label} ${HEBREW_MESSAGES.safeText}` };
};

export const validateIsraeliId = (value) => {
  const digits = String(value || "").replace(/\D/g, "");

  if (!PATTERNS.idNumber.test(digits)) {
    return { valid: false, message: HEBREW_MESSAGES.israelId };
  }

  const padded = digits.padStart(9, "0");
  let sum = 0;
  for (let i = 0; i < padded.length; i += 1) {
    let inc = Number(padded[i]) * ((i % 2) + 1);
    if (inc > 9) inc -= 9;
    sum += inc;
  }
  const valid = sum % 10 === 0;
  return { valid, message: valid ? "" : HEBREW_MESSAGES.israelId };
};

export const HEBREW_VALIDATION_MESSAGES = HEBREW_MESSAGES;
