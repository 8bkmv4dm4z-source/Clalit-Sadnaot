const crypto = require("node:crypto");

if (!process.env.PUBLIC_ID_SECRET) {
  throw new Error("PUBLIC_ID_SECRET is required");
}

const SECRET = process.env.PUBLIC_ID_SECRET;

// 🔐 Rotation detection (non-secret, safe to log)
const SECRET_FINGERPRINT = crypto
  .createHash("sha256")
  .update(SECRET)
  .digest("hex")
  .slice(0, 10);

console.log(`[HASH] PUBLIC_ID_SECRET fingerprint=${SECRET_FINGERPRINT}`);

function hashId(type, id) {
  if (!type || !id) {
    throw new Error("hashId requires type and id");
  }

  return crypto
    .createHmac("sha256", SECRET)
    .update(`${type}:${id.toString()}`)
    .digest("base64url")
    .slice(0, 22);
}

module.exports = { hashId };
