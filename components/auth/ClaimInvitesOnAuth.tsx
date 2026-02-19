"use client";

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { getClientRuntimeMode } from "@/lib/runtime-mode";

const CLAIM_INVITES_FLAG = "of_claim_invites";

export default function ClaimInvitesOnAuth() {
  const didRun = useRef(false);

  useEffect(() => {
    if (getClientRuntimeMode().authMode === "none") return;
    if (didRun.current) return;
    didRun.current = true;

    const existingFlag = typeof window !== "undefined"
      ? window.sessionStorage.getItem(CLAIM_INVITES_FLAG)
      : null;

    if (existingFlag) return;

    const run = async () => {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const response = await fetch("/api/auth/claim-invites", { method: "POST" });
      let result: { claimed?: number } | null = null;

      try {
        result = await response.json();
      } catch {
        result = null;
      }

      if (response.ok) {
        window.sessionStorage.setItem(CLAIM_INVITES_FLAG, "1");
        if (result?.claimed && result.claimed > 0) {
          toast.success(`Welcome! You've joined ${result.claimed} organization(s).`);
        } else {
          toast.success("Welcome back!");
        }
      }
    };

    void run();
  }, []);

  return null;
}
