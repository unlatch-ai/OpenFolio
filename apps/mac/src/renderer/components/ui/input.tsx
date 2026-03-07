import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-border bg-background px-4 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-ring",
        className,
      )}
      {...props}
    />
  );
}
