import { Suspense } from "react";
import LoginClient from "./LoginClient";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-4">
          <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
            Loading...
          </h1>
          <p className="text-muted-foreground">Preparing your login screen.</p>
        </div>
      }
    >
      <LoginClient />
    </Suspense>
  );
}
