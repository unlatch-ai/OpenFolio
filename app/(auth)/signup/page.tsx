import { Suspense } from "react";
import SignupClient from "./SignupClient";

export const dynamic = "force-dynamic";

export default function SignupPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
            Loading...
          </h1>
          <p className="text-muted-foreground">Preparing your signup form.</p>
        </div>
      }
    >
      <SignupClient />
    </Suspense>
  );
}
