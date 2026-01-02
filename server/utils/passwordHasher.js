const bcrypt = require("bcryptjs");

let argon2 = null;
try {
  // Optional dependency for environments that restrict native builds.
  // When present, Argon2id is used; otherwise bcrypt remains as a fallback.
  // eslint-disable-next-line global-require
  argon2 = require("argon2");
} catch (err) {
  if (process.env.NODE_ENV !== "production") {
    console.warn("[SECURITY] argon2 unavailable, falling back to bcrypt:", err.message);
  }
}

const ARGON2_OPTS = argon2
  ? {
      type: argon2.argon2id,
      memoryCost: Math.max(2 ** 16, argon2.defaults.memoryCost || 0),
      timeCost: Math.max(3, argon2.defaults.timeCost || 0),
      parallelism: Math.max(1, argon2.defaults.parallelism || 1),
    }
  : null;

const isBcryptHash = (hash = "") => hash.startsWith("$2");

const hashPassword = async (plain) => {
  if (!plain || typeof plain !== "string") {
    throw new Error("Password is required for hashing");
  }
  if (argon2 && ARGON2_OPTS) {
    return argon2.hash(plain, ARGON2_OPTS);
  }
  return bcrypt.hash(plain, 12);
};

const verifyPassword = async (plain, storedHash = "") => {
  if (!storedHash) return false;
  if (isBcryptHash(storedHash)) {
    return bcrypt.compare(plain, storedHash);
  }
  if (argon2 && storedHash.startsWith("$argon2")) {
    return argon2.verify(storedHash, plain);
  }
  // Fallback for unexpected formats
  return bcrypt.compare(plain, storedHash);
};

const upgradeHashIfNeeded = async (userDoc, plain, currentHash) => {
  if (!argon2 || !ARGON2_OPTS) return false;
  if (!userDoc || !currentHash || !isBcryptHash(currentHash)) return false;
  const newHash = await argon2.hash(plain, ARGON2_OPTS);
  userDoc.passwordHash = newHash;
  try {
    await userDoc.save();
  } catch (err) {
    console.warn("[SECURITY] failed to upgrade hash:", err.message);
    return false;
  }
  return true;
};

module.exports = {
  hashPassword,
  verifyPassword,
  upgradeHashIfNeeded,
  isBcryptHash,
};
