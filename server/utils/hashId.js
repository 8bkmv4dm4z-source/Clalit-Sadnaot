const crypto = require("node:crypto");

function getSecret() {
  if (!process.env.PUBLIC_ID_SECRET) {
    throw new Error("PUBLIC_ID_SECRET is required");
  }
  return process.env.PUBLIC_ID_SECRET;
}

function hashId(type, id) {
  if (!type || !id) {
    throw new Error("hashId requires type and id");
  }

  const SECRET = getSecret();

  return crypto
    .createHmac("sha256", SECRET)
    .update(`${type}:${id.toString()}`)
    .digest("base64url")
    .slice(0, 22);
}

module.exports = { hashId };
