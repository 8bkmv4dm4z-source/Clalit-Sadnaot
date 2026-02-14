const sid = (v) => (v == null ? "" : String(v));

export function deriveWorkshopsByEntity({
  displayedWorkshops = [],
  userWorkshopMap = {},
  familyWorkshopMap = {},
  userEntity = null,
  user = null,
  familyMembers = [],
  allEntities = [],
}) {
  if (!userEntity?.entityKey && !userEntity?._id) return {};

  const list = displayedWorkshops || [];
  const map = {};

  const uid = sid(userEntity.entityKey || userEntity._id || user?._id);
  map[uid] = {
    name: userEntity.fullName || userEntity.name || "אני",
    relation: "",
    entityKey: userEntity.entityKey,
    workshops: list.filter((w) => Boolean(userWorkshopMap[sid(w._id)])),
  };

  const members = familyMembers.length ? familyMembers : allEntities.filter((e) => e.isFamily);

  members.forEach((m) => {
    const mid = sid(m.entityKey || m._id);
    const ws = list.filter((w) => {
      const fm = familyWorkshopMap?.[sid(w._id)]?.map(sid) || [];
      if (fm.includes(uid)) return false;
      return fm.includes(mid);
    });

    if (ws.length) {
      map[mid] = {
        name: m.name,
        relation: m.relation,
        entityKey: m.entityKey,
        workshops: ws,
      };
    }
  });

  return map;
}
