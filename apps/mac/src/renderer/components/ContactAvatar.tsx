import { useMemo } from "react";
import { Users } from "lucide-react";

const COLORS = ["var(--person-lilac)", "var(--person-rose)", "var(--person-moss)", "var(--person-amber)", "var(--person-slate)", "var(--person-clay)"];

export function personColor(id: string) {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) hash = ((hash << 5) - hash + id.charCodeAt(index)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return `${parts[0][0]}${parts.length > 1 ? parts.at(-1)?.[0] : ""}`.toUpperCase();
}

export function ContactAvatar({ name, personId, size = 36, isGroup = false, className = "" }: { name: string; personId?: string; size?: number; isGroup?: boolean; className?: string }) {
  const style = useMemo(() => ({ width: size, height: size, background: personColor(personId || name), fontSize: size * 0.34 }), [name, personId, size]);
  return <span className={`contact-avatar ${className}`} style={style} aria-label={isGroup ? `${name}, group conversation` : name}>{isGroup ? <Users aria-hidden="true" /> : initials(name)}</span>;
}
