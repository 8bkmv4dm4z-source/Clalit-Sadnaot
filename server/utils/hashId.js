const salt = process.env.HASHID_SALT || "default-hash-salt";
const minLength = parseInt(process.env.HASHID_MIN_LENGTH || "10", 10);

const padToLength = (value) => {
  if (value.length >= minLength) return value;
  return value.padEnd(minLength, "0");
};

exports.encodeId = (id) => {
  if (!id) return "";
  const hex = id.toString();
  const salted = `${salt}:${hex}`;
  const encoded = Buffer.from(salted, "utf8").toString("base64url");
  return padToLength(encoded);
};

exports.decodeId = (hashed) => {
  if (!hashed) return null;
  try {
    const trimmed = hashed.replace(/0+$/, "");
    const decoded = Buffer.from(trimmed, "base64url").toString("utf8");
    const prefix = `${salt}:`;
    if (!decoded.startsWith(prefix)) return null;
    const hex = decoded.slice(prefix.length);
    return hex || null;
  } catch {
    return null;
  }
};
