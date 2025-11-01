const HEBREW_MESSAGES = {
  required: (label) => `נא להזין ${label}.`,
  email: "נא להזין כתובת אימייל תקינה.",
  phone: "נא להזין מספר טלפון ישראלי תקין (ספרות וללא רווחים מיותרים).",
  passwordLength: "הסיסמה חייבת להכיל לפחות 10 תווים.",
  passwordUpper: "הסיסמה חייבת לכלול לפחות אות אחת גדולה (A-Z).",
  passwordSpecial: "הסיסמה חייבת לכלול לפחות תו מיוחד אחד (!@#$%^&*).",
  passwordDigit: "הסיסמה חייבת לכלול לפחות ספרה אחת.",
  passwordConfirm: "הסיסמאות אינן תואמות.",
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
  const digits = String(value || "").replace(/[^0-9+]/g, "");
  const israeliPattern = /^(\+972-?|0)([23489]|5[0-9])[0-9]{7}$/;
  const valid = israeliPattern.test(digits.replace(/-/g, ""));
  return { valid, message: valid ? "" : HEBREW_MESSAGES.phone };
};

export const validatePasswordComplexity = (value) => {
  const password = String(value || "");
  if (password.length < 10) {
    return { valid: false, message: HEBREW_MESSAGES.passwordLength };
  }
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: HEBREW_MESSAGES.passwordUpper };
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

export const validateIsraeliId = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  if (digits.length < 5 || digits.length > 9) {
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
