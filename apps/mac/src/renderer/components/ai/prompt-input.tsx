import { SendHorizonal } from "lucide-react";
import { Button } from "@/renderer/components/ui/button";
import { Textarea } from "@/renderer/components/ui/textarea";

export function PromptInput({
  value,
  onChange,
  onSubmit,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <Textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Ask about your relationship history, likely follow-ups, or what changed in the latest import."
        className="min-h-[112px] resize-none border-none bg-transparent px-0 py-0 focus:border-none"
      />
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">AI Elements-style surface, backed by the local OpenFolio runtime.</p>
        <Button onClick={onSubmit} disabled={disabled || value.trim().length === 0}>
          Ask
          <SendHorizonal size={15} />
        </Button>
      </div>
    </div>
  );
}
