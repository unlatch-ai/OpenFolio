export function FolioMark({
  label,
}: {
  label: string;
}) {
  return (
    <div className="folio-mark" aria-hidden="true">
      <span>{label}</span>
    </div>
  );
}
