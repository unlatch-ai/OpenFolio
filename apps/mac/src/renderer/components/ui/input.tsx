import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      className={cn(
        "flex h-11 w-full rounded-[18px] border border-[rgba(45,37,24,0.14)] bg-white/75 px-4 text-sm text-[#232018] outline-none ring-0 placeholder:text-[#7a6f5f] focus:border-[#1f5b55]",
        className,
      )}
      {...props}
    />
  );
}
