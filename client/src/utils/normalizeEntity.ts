import { getEntityIdentifiers, withEntityFlags, type EntityLike } from "./entityTypes.ts";

export function normalizeEntity(raw: EntityLike = {}): EntityLike {
  if (!raw || typeof raw !== "object") return {};

  // entity-type flags (isFamily, isParent, etc.)
  const flagged = withEntityFlags(raw);

  // merge backend → flagged (flagged never overwrites actual data)
  const merged = { ...raw, ...flagged };

  const { key: identityKey, parentKey } =
    getEntityIdentifiers(merged);

  const entityKey = identityKey || "";

  return {
    ...merged,
    entityKey,
    __entityKey: parentKey ? `${parentKey}:${entityKey}` : entityKey,

    // standardized fields
    name: merged.name || "",
    phone: merged.phone || "",
    email: merged.email || "",
    city: merged.city || "",
    idNumber: merged.idNumber || "",
    relation: merged.relation || "",
    parentName: merged.parentName || "",
    birthDate: merged.birthDate || null,
  };
}
