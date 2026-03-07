"use client";

import Link from "next/link";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { api } from "@openfolio/hosted";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL || "https://blessed-pig-525.convex.cloud";
const convexClient = new ConvexReactClient(convexUrl);

function AccountScreen() {
  const { signIn, signOut } = useAuthActions();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const currentUser = useQuery(api.accounts.getCurrentUser, isAuthenticated ? {} : "skip");
  const cloudStatus = useQuery(api.accounts.getCloudStatus, isAuthenticated ? {} : "skip");

  async function startGoogleSignIn() {
    await signIn("google", { redirectTo: `${window.location.origin}/account` });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen">
        <Navbar />
        <div className="mx-auto max-w-5xl px-6 pt-24 pb-20">
          <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">Hosted account</p>
          <h1 className="text-4xl font-bold tracking-tight">Checking your session.</h1>
          <p className="mt-3 text-muted-foreground">Loading account state...</p>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="mx-auto max-w-5xl px-6 pt-24 pb-20">
        <p className="text-xs font-medium uppercase tracking-widest text-muted-foreground mb-4">Hosted account</p>
        <h1 className="text-4xl font-bold tracking-tight">Manage your hosted account.</h1>
        <p className="mt-3 max-w-xl text-muted-foreground leading-relaxed">
          The local graph stays on your Mac. This hosted account handles identity, billing,
          hosted AI entitlements, managed connectors, and future hosted MCP access.
        </p>

        {isAuthenticated ? (
          <div className="mt-10 grid gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader><CardTitle>Signed in</CardTitle></CardHeader>
              <CardContent>
                <CardDescription>{currentUser?.email || "No email available"}</CardDescription>
              </CardContent>
            </Card>
            <Card>
              <CardHeader><CardTitle>Capabilities</CardTitle></CardHeader>
              <CardContent>
                <CardDescription>
                  {cloudStatus?.capabilities.length ? cloudStatus.capabilities.join(", ") : "No paid capabilities enabled yet."}
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            You are not signed in yet. You can still use the local Mac app without an account.
          </p>
        )}

        <div className="mt-8 flex gap-3">
          {isAuthenticated ? (
            <Button onClick={() => void signOut()}>Sign out</Button>
          ) : (
            <Button onClick={() => void startGoogleSignIn()}>Continue with Google</Button>
          )}
          <Button asChild variant="outline">
            <a href="https://github.com/unlatch-ai/OpenFolio/releases">Download the Mac app</a>
          </Button>
        </div>
      </div>
      <Footer />
    </div>
  );
}

export default function AccountPage() {
  return (
    <ConvexAuthProvider client={convexClient}>
      <AccountScreen />
    </ConvexAuthProvider>
  );
}
