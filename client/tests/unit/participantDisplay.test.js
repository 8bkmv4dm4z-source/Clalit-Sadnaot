import test from "node:test";
import assert from "node:assert/strict";
import { formatParticipantContact } from "../../src/utils/participantDisplay.js";

test("formatParticipantContact exposes only name/email/phone", () => {
  const input = {
    name: "User",
    email: "user@example.com",
    phone: "123",
    idNumber: "999",
    birthDate: "2000-01-01",
    entityKey: "entity-1",
    _id: "mongo-id",
  };

  const result = formatParticipantContact(input);
  assert.deepEqual(Object.keys(result).sort(), ["email", "name", "phone"]);
  assert.equal(result.name, "User");
  assert.equal(result.email, "user@example.com");
  assert.equal(result.phone, "123");
});
