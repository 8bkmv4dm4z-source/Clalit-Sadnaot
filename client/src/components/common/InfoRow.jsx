export default function InfoRow({ label, value }) {
  return (
    <div className="flex justify-between border-b py-1">
      <span className="font-semibold">{label}</span>
      <span>{value}</span>
    </div>
  );
}
