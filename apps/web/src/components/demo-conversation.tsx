"use client";

import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Suggestions,
  Suggestion,
} from "@/components/ai-elements/suggestion";

const demoMessages = [
  {
    role: "user" as const,
    content: "Who should I follow up with this week?",
  },
  {
    role: "assistant" as const,
    content:
      "Based on your message history, here are three contacts with stale conversations:\n\n1. **Alex Chen** — Last message was 12 days ago. He mentioned grabbing coffee.\n2. **Jordan Lee** — You discussed a project deadline that's passed. No follow-up yet.\n3. **Sam Rivera** — Hasn't replied to your question about the trip from 9 days ago.",
  },
];

const suggestions = [
  "Who did I message most last month?",
  "Show recent threads with Alex",
  "What topics came up with Jordan?",
  "Find messages about the project deadline",
];

export function DemoConversation() {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header bar */}
      <div className="flex items-center gap-3 px-5 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center justify-center size-7 rounded-md bg-primary">
          <Bot className="size-4 text-primary-foreground" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-medium">OpenFolio AI</p>
          <p className="text-xs text-muted-foreground">
            Grounded in your local relationship graph
          </p>
        </div>
        <Badge variant="outline">
          <span className="size-1.5 rounded-full bg-accent" />
          Local
        </Badge>
      </div>

      {/* Messages */}
      <div className="flex flex-col gap-6 p-5">
        {demoMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex w-full max-w-[90%] flex-col gap-1 ${
              msg.role === "user" ? "ml-auto items-end" : ""
            }`}
          >
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground px-1">
              {msg.role === "user" ? "You" : "OpenFolio"}
            </span>
            <div
              className={`rounded-lg px-4 py-3 text-sm leading-relaxed ${
                msg.role === "user"
                  ? "bg-secondary text-foreground"
                  : "text-foreground"
              }`}
            >
              {msg.role === "assistant" ? (
                <div className="space-y-2">
                  {msg.content.split("\n\n").map((para, j) => (
                    <p key={j}>
                      {para.split(/(\*\*[^*]+\*\*)/).map((part, k) =>
                        part.startsWith("**") && part.endsWith("**") ? (
                          <strong key={k}>{part.slice(2, -2)}</strong>
                        ) : (
                          <span key={k}>{part}</span>
                        )
                      )}
                    </p>
                  ))}
                </div>
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div className="px-5 pb-4">
        <Suggestions className="gap-2">
          {suggestions.map((s) => (
            <Suggestion key={s} suggestion={s} />
          ))}
        </Suggestions>
      </div>

      {/* Input area */}
      <div className="border-t border-border p-4 bg-muted/20">
        <div className="flex items-center gap-3 rounded-lg border border-border bg-background px-4 py-2.5">
          <span className="text-sm text-muted-foreground flex-1">
            Ask about your relationship history...
          </span>
          <kbd className="hidden sm:inline-flex items-center rounded border border-border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Enter
          </kbd>
        </div>
      </div>
    </div>
  );
}
