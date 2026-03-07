import type * as React from "react";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function Conversation({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ScrollArea className={cn("h-[320px] rounded-[20px] border border-[rgba(45,37,24,0.08)] bg-white/70 p-4", className)}>
      <div className="space-y-4">{children}</div>
    </ScrollArea>
  );
}

export function ConversationMessage({
  role,
  children,
}: {
  role: "assistant" | "user";
  children: React.ReactNode;
}) {
  return (
    <div className={cn("max-w-[88%] rounded-[22px] px-4 py-3 text-sm leading-6", role === "assistant"
      ? "bg-[#f4ecdf] text-[#3d3327]"
      : "ml-auto bg-[#1f5b55] text-[#f8f3ea]")}>
      {children}
    </div>
  );
}
