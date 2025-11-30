/**
 * validation.js — Client-side validation helpers
 * ------------------------------------------------
 * DATA FLOW
 * • Source: UI forms (Register, Profile, Workshop editors) call these helpers on user-entered strings.
 * • Flow: Each helper returns a `{ valid, message }` object; calling components store that result in state and
 *   surface `message` near the relevant input. The original raw input stays in the parent component's state,
 *   ensuring validation never mutates user data.
 * • Downstream: Parents aggregate multiple validation results to decide whether to submit API requests. When
 *   submission is blocked, the returned `message` bubbles back into the UI as inline helper text.
 *
 * API FLOW
 * • These helpers run before network calls to reduce server load. They mirror backend Joi rules (see server
 *   validators) so that errors are aligned with what the API would reject.
 * • If the server still rejects a request, `errorTranslator.js` maps backend messages to similar Hebrew strings,
 *   keeping the UX consistent across client/server validation paths.
 *
 * IMPLEMENTATION NOTES
 * • All functions are pure and synchronous; they avoid throwing so callers can simply read the `valid` flag.
 * • Messages are centralized in HEBREW_MESSAGES so both validation logic and UI share the same copy without
 *   duplicating strings across components.
 */
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

/**
 * Validate that a field has a non-empty value once trimmed.
 *
 * @param {string | number | undefined | null} value - Raw user input bound to an input element.
 * @param {string} label - Human-friendly field label used in the returned error message.
 * @returns {{ valid: boolean, message: string }} Boolean flag and localized helper text.
 * @description Components typically call this on blur or submit; the immutable return shape allows aggregating
 * results from multiple validators without mutating the original form state.
 */
export const validateRequired = (value, label) => {
  const isValid = Boolean(String(value || "").trim());
  return { valid: isValid, message: isValid ? "" : HEBREW_MESSAGES.required(label) };
};

/**
 * Basic RFC5322-ish email check matching the backend Joi rule.
 *
 * @param {string | undefined | null} value - User-entered email text.
 * @returns {{ valid: boolean, message: string }} Validation result with Hebrew feedback.
 * @description Keeps the regex intentionally lenient (single @ and dot) to avoid false negatives and mirrors the
 * server-side expectation, preventing inconsistent user experiences between client and API.
 */
export const validateEmail = (value) => {
  const email = String(value || "").trim();
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const valid = pattern.test(email);
  return { valid, message: valid ? "" : HEBREW_MESSAGES.email };
};

/**
 * Validate Israeli phone numbers while allowing optional +972 country prefix and dashes.
 *
 * @param {string | undefined | null} value - Input from phone field; non-digit characters are stripped except '+'.
 * @returns {{ valid: boolean, message: string }} Boolean validity and localized message.
 * @description Normalizes the value before applying the regex so UI formatting (spaces/dashes) does not break the
 * validation. This mirrors server-side sanitation to keep client/server aligned.
 */
export const validatePhone = (value) => {
  const digits = String(value || "").replace(/[^0-9+]/g, "");
  const israeliPattern = /^(\+972-?|0)([23489]|5[0-9])[0-9]{7}$/;
  const valid = israeliPattern.test(digits.replace(/-/g, ""));
  return { valid, message: valid ? "" : HEBREW_MESSAGES.phone };
};

/**
 * Enforce password strength rules aligned with backend security requirements.
 *
 * @param {string | undefined | null} value - Raw password string as typed by the user.
 * @returns {{ valid: boolean, message: string }} Message points to the first unmet requirement for clarity.
 * @description Order of checks is deliberate so users receive the most actionable first failure rather than a
 * generic list. Keeps UX consistent with backend rejection reasons.
 */
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

/**
 * Confirm that the repeated password matches the primary password field.
 *
 * @param {string | undefined | null} password - Primary password entry.
 * @param {string | undefined | null} confirm - Confirmation field entry.
 * @returns {{ valid: boolean, message: string }} Validity flag and mismatch helper text.
 * @description Used by Register/Reset flows to gate form submission before hitting the API.
 */
export const validatePasswordConfirmation = (password, confirm) => {
  const match = String(password || "") === String(confirm || "");
  return { valid: match, message: match ? "" : HEBREW_MESSAGES.passwordConfirm };
};

/**
 * Validate Israeli national ID using the checksum algorithm.
 *
 * @param {string | number | undefined | null} value - Raw ID input which may include non-digit characters.
 * @returns {{ valid: boolean, message: string }} Result with localized error when checksum fails.
 * @description Pads shorter IDs to 9 digits (standard practice) before computing the alternating multiplier
 * checksum. This mirrors common Israeli ID validation libraries so frontend behavior matches backend rules.
 */
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
