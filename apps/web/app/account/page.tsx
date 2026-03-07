"use client";

import Link from "next/link";
import { ConvexAuthProvider, useAuthActions } from "@convex-dev/auth/react";
import { api } from "@openfolio/hosted";
import { ConvexReactClient, useConvexAuth, useQuery } from "convex/react";

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
      <div className="page-shell">
        <div className="page-frame">
          <section className="hero">
            <p className="eyebrow">Hosted account</p>
            <h1>Checking your OpenFolio session.</h1>
            <p>Convex Auth is loading your account state.</p>
          </section>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="page-frame">
        <nav className="nav">
          <strong>OpenFolio</strong>
          <div className="nav-links">
            <Link href="/">Home</Link>
            <Link href="/docs">Docs</Link>
          </div>
        </nav>

        <section className="hero">
          <p className="eyebrow">Hosted account</p>
          <h1>Manage your optional hosted OpenFolio account.</h1>
          <p>
            The local graph stays on your Mac. This hosted account handles identity, billing,
            hosted AI entitlements, managed connectors, and future hosted MCP / remote access.
          </p>

          {isAuthenticated ? (
            <div className="feature-grid">
              <article className="feature-card">
                <h3>Signed in</h3>
                <p>{currentUser?.email || "No email available"}</p>
              </article>
              <article className="feature-card">
                <h3>Capabilities</h3>
                <p>{cloudStatus?.capabilities.length ? cloudStatus.capabilities.join(", ") : "No paid capabilities enabled yet."}</p>
              </article>
            </div>
          ) : (
            <p>You are not signed in yet. You can still use the local Mac app without an account.</p>
          )}

          <div className="hero-actions">
            {isAuthenticated ? (
              <button className="button primary" onClick={() => void signOut()}>
                Sign out
              </button>
            ) : (
              <button className="button primary" onClick={() => void startGoogleSignIn()}>
                Continue with Google
              </button>
            )}
            <a className="button secondary" href="https://github.com/unlatch-ai/OpenFolio/releases">
              Download the Mac app
            </a>
          </div>
        </section>
      </div>
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
