import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnector } from "@/lib/integrations/registry";
import { encrypt } from "@/lib/integrations/encryption";

const STATE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

function verifyState(stateParam: string): { workspaceId: string; userId: string } | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const dotIndex = stateParam.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = stateParam.slice(0, dotIndex);
  const sig = stateParam.slice(dotIndex + 1);

  const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const expectedSig = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))) {
    return null;
  }

  try {
    const data = JSON.parse(payload);
    // Check expiry
    if (typeof data.ts === "number" && Date.now() - data.ts > STATE_MAX_AGE_MS) {
      return null;
    }
    return { workspaceId: data.workspaceId, userId: data.userId };
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=${encodeURIComponent(error)}`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=missing_params`
    );
  }

  const state = verifyState(stateParam);
  if (!state) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=invalid_state`
    );
  }

  const connector = getConnector("gmail");
  if (!connector?.handleCallback) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=connector_unavailable`
    );
  }

  try {
    const tokens = await connector.handleCallback(code);
    const supabase = createAdminClient();

    // Store integration for each Google service (gmail, calendar, contacts)
    const providers = ["gmail", "google-calendar", "google-contacts"];
    for (const provider of providers) {
      await supabase.from("integrations").upsert(
        {
          workspace_id: state.workspaceId,
          user_id: state.userId,
          provider,
          access_token_encrypted: encrypt(tokens.accessToken),
          refresh_token_encrypted: tokens.refreshToken
            ? encrypt(tokens.refreshToken)
            : null,
          token_expires_at: tokens.expiresAt?.toISOString() || null,
          status: "active",
        },
        { onConflict: "workspace_id,provider" }
      );
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?success=google`
    );
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=token_exchange_failed`
    );
  }
}
