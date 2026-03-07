import type * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium", {
  variants: {
    variant: {
      default: "bg-[#ddd4c9] text-[#3f382f]",
      success: "bg-[#c8e1d9] text-[#235048]",
      warning: "bg-[#f7e0b8] text-[#71561a]",
      danger: "bg-[#f4d2cf] text-[#8a302d]",
      info: "bg-[#d8e4ef] text-[#32546a]",
    },
  },
  defaultVariants: {
    variant: "default",
  },
});

export function Badge({ className, variant, ...props }: React.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}
