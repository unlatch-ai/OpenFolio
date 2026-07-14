export function FolioMark({
  number,
  label,
}: {
  number: string;
  label: string;
}) {
  return (
    <div className="folio-mark" aria-hidden="true">
      <span>{number}</span>
      <i />
      <span>{label}</span>
    </div>
  );
}
