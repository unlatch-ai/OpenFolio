"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import ClaimInvitesOnAuth from "@/components/auth/ClaimInvitesOnAuth";
import { createClient } from "@/lib/supabase/client";

type InvitePreview = {
  workspace: { id: string; name: string };
  role: "owner" | "member";
  inviterName: string | null;
  expiresAt: string;
};

export default function InviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [invite, setInvite] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAccepting, setIsAccepting] = useState(false);
  const [isAuthed, setIsAuthed] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      if (!token) {
        if (active) {
          setError("Missing invite token");
          setIsLoading(false);
        }
        return;
      }

      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (active) setIsAuthed(Boolean(user));

      try {
        const response = await fetch(`/api/workspace/invites/preview?token=${encodeURIComponent(token)}`);
        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || "Invite not found");
        }
        const data = await response.json();
        if (active) setInvite(data);
      } catch (err) {
        if (active) setError(err instanceof Error ? err.message : "Invite not found");
      } finally {
        if (active) setIsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token]);

  const handleAccept = async () => {
    if (!token) return;
    setIsAccepting(true);
    try {
      const response = await fetch("/api/workspace/invites/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to accept invite");
      }
      router.push("/app");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invite");
    } finally {
      setIsAccepting(false);
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
          Checking invite...
        </h1>
        <p className="text-muted-foreground">Please wait while we verify your invite.</p>
      </div>
    );
  }

  if (error || !invite) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
          Invite unavailable
        </h1>
        <p className="text-muted-foreground">
          {error || "This invite link is invalid or expired."}
        </p>
        <Button onClick={() => router.push("/login")} className="w-full h-11 font-medium">
          Log in
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <ClaimInvitesOnAuth />
      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-medium tracking-tight text-foreground">
          Join {invite.workspace.name}
        </h1>
        <p className="text-muted-foreground">
          {invite.inviterName ? `${invite.inviterName} invited you` : "You've been invited"} as a {invite.role}.
        </p>
      </div>

      {!isAuthed ? (
        <div className="space-y-3">
          <Button
            className="w-full h-11 font-medium"
            onClick={() => router.push(`/login?redirectTo=/invite?token=${encodeURIComponent(token || "")}`)}
          >
            Log in to accept
          </Button>
          <Button
            variant="outline"
            className="w-full h-11 font-medium"
            onClick={() => router.push(`/signup?token=${encodeURIComponent(token || "")}`)}
          >
            Create account
          </Button>
        </div>
      ) : (
        <Button
          className="w-full h-11 font-medium"
          onClick={handleAccept}
          disabled={isAccepting}
        >
          {isAccepting ? "Accepting..." : "Accept invite"}
        </Button>
      )}
    </div>
  );
}
