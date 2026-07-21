import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[120px] w-full min-w-0 resize-y rounded-[var(--radius-control)] border border-input bg-background px-3 py-2.5 text-[length:var(--type-body-size)] leading-[var(--type-body-line)] text-foreground outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30",
        className,
      )}
      {...props}
    />
  );
}
