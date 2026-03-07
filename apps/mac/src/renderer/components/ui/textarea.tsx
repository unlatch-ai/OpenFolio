import * as React from "react";
import { cn } from "@/lib/utils";

export function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "flex min-h-[120px] w-full rounded-[20px] border border-[rgba(45,37,24,0.14)] bg-white/75 px-4 py-3 text-sm text-[#232018] outline-none placeholder:text-[#7a6f5f] focus:border-[#1f5b55]",
        className,
      )}
      {...props}
    />
  );
}
