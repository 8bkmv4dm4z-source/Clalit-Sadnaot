export const formatParticipantContact = (entity = {}) => ({
  name: entity?.name || "",
  email: entity?.email || "",
  phone: entity?.phone || "",
});
