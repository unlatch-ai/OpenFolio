import type * as React from "react";
import { ScrollArea } from "@/renderer/components/ui/scroll-area";
import { cn } from "@/lib/utils";

export function Conversation({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <ScrollArea className={cn("h-[320px] rounded-lg border border-border bg-muted/50 p-4", className)}>
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
    <div className={cn("max-w-[88%] rounded-lg px-4 py-3 text-sm leading-6", role === "assistant"
      ? "bg-muted text-foreground"
      : "ml-auto bg-primary text-primary-foreground")}>
      {children}
    </div>
  );
}
