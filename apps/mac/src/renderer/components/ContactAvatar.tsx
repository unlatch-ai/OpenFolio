import { useMemo } from "react";
import { Users } from "lucide-react";

/**
 * Deterministic gradient avatar based on name/handle.
 * Each person gets a unique, warm-toned gradient that stays consistent.
 */

const GRADIENT_PAIRS = [
  ["#f97316", "#ef4444"], // orange → red
  ["#f59e0b", "#f97316"], // amber → orange
  ["#ec4899", "#8b5cf6"], // pink → purple
  ["#06b6d4", "#3b82f6"], // cyan → blue
  ["#10b981", "#06b6d4"], // emerald → cyan
  ["#8b5cf6", "#ec4899"], // purple → pink
  ["#f43f5e", "#f97316"], // rose → orange
  ["#14b8a6", "#22d3ee"], // teal → cyan
  ["#a855f7", "#6366f1"], // purple → indigo
  ["#fb923c", "#fbbf24"], // orange → amber
];

function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return (name[0] || "?").toUpperCase();
}

interface ContactAvatarProps {
  name: string;
  size?: number;
  isGroup?: boolean;
  className?: string;
}

export function ContactAvatar({ name, size = 36, isGroup = false, className = "" }: ContactAvatarProps) {
  const style = useMemo(() => {
    const idx = hashString(name) % GRADIENT_PAIRS.length;
    const [from, to] = GRADIENT_PAIRS[idx];
    return {
      width: size,
      height: size,
      borderRadius: "50%",
      background: `linear-gradient(135deg, ${from}, ${to})`,
      display: "flex",
      alignItems: "center" as const,
      justifyContent: "center" as const,
      color: "white",
      fontSize: size * 0.38,
      fontWeight: 600,
      flexShrink: 0,
      letterSpacing: "-0.02em",
    };
  }, [name, size]);

  if (isGroup) {
    return (
      <div style={style} className={className}>
        <Users size={size * 0.4} />
      </div>
    );
  }

  return (
    <div style={style} className={className}>
      {getInitials(name)}
    </div>
  );
}
