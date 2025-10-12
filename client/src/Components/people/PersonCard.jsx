import CardBase from "../common/CardBase";
import InfoRow from "../common/InfoRow";

export default function PersonCard({ person, onEdit }) {
  const email = person.email || person.parentEmail || "-"; // ✅ fallback

  return (
    <CardBase className="mb-3 p-4">
      <div className="flex justify-between items-center">
        <div className="space-y-1">
          <InfoRow label="שם" value={person.name} />
          <InfoRow label="מייל" value={email} />
          <InfoRow label="טלפון" value={person.phone || "-"} />
          {person.relation && <InfoRow label="קשר משפחתי" value={person.relation} />}
          {person.idNumber && <InfoRow label="ת.ז" value={person.idNumber} />}
        </div>

        <button
          onClick={() => onEdit(person)}
          className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-lg hover:bg-indigo-200 text-sm"
        >
          ✏️ ערוך
        </button>
      </div>
    </CardBase>
  );
}
