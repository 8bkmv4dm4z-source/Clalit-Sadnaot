const scrub = (s = "") =>
  String(s)
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, "Bearer ***")
    .replace(
      /("(password|pass|token|secret|authorization|otp|code|email|phone|idNumber|birthDate)"\s*:\s*")([^"]+)/gi,
      "$1***"
    )
    .replace(
      /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
      "[REDACTED_EMAIL]"
    );

module.exports = { scrub };
