import { Suspense } from "react";
import InviteClient from "./InviteClient";

export const dynamic = "force-dynamic";

export default function InvitePage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
            Checking invite...
          </h1>
          <p className="text-muted-foreground">Please wait while we verify your invite.</p>
        </div>
      }
    >
      <InviteClient />
    </Suspense>
  );
}
