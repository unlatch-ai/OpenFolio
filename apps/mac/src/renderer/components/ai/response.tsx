import type { AskResponse } from "@openfolio/shared-types";
import { Badge } from "@/renderer/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/renderer/components/ui/card";

export function ResponsePanel({ response }: { response: AskResponse | null }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <Badge variant="info">{response?.provider ?? "local"}</Badge>
        <CardTitle>AI Answer</CardTitle>
      </CardHeader>
      <CardContent>
        <p>{response?.answer || "Ask a question to generate a grounded answer with citations from your local graph."}</p>
      </CardContent>
    </Card>
  );
}
