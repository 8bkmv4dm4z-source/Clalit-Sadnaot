import CardBase from "../common/CardBase";
import InfoRow from "../common/InfoRow";

export default function PersonCard({ person }) {
  return (
    <CardBase className="mb-3">
      <InfoRow label="שם" value={person.name} />
      <InfoRow label="מייל" value={person.email} />
      <InfoRow label="טלפון" value={person.phone} />
      {person.relation && <InfoRow label="קשר משפחתי" value={person.relation} />}
    </CardBase>
  );
}
