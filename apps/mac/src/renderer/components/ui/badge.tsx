import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex min-h-5 flex-none items-center gap-1 whitespace-nowrap rounded-[var(--radius-control)] px-2 text-[length:var(--type-meta-size)] leading-[var(--type-meta-line)] font-medium",
  {
    variants: {
      variant: {
        default: "bg-secondary text-secondary-foreground",
        secondary: "bg-muted text-muted-foreground",
        success: "bg-[var(--success-soft)] text-[var(--success)]",
        warning: "bg-[var(--warning-soft)] text-[var(--warning)]",
        danger: "bg-[var(--critical-soft)] text-[var(--critical)]",
        info: "bg-primary/5 text-primary",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

export function Badge({
  className,
  variant,
  ...props
}: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}
