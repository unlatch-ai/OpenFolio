import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnector } from "@/lib/integrations/registry";
import { encrypt } from "@/lib/integrations/encryption";

const STATE_MAX_AGE_MS = 10 * 60 * 1000;

function verifyState(
  stateParam: string
): { workspaceId: string; userId: string } | null {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const dotIndex = stateParam.lastIndexOf(".");
  if (dotIndex === -1) return null;

  const payloadB64 = stateParam.slice(0, dotIndex);
  const sig = stateParam.slice(dotIndex + 1);

  const payload = Buffer.from(payloadB64, "base64url").toString("utf-8");
  const expectedSig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (
    !crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expectedSig, "hex"))
  ) {
    return null;
  }

  try {
    const data = JSON.parse(payload);
    if (typeof data.ts === "number" && Date.now() - data.ts > STATE_MAX_AGE_MS) {
      return null;
    }

    return { workspaceId: data.workspaceId, userId: data.userId };
  } catch {
    return null;
  }
}

async function fetchMicrosoftProfile(accessToken: string) {
  const response = await fetch(
    "https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail",
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!response.ok) {
    return { accountEmail: null, accountName: null };
  }

  const profile = (await response.json()) as {
    displayName?: string;
    userPrincipalName?: string;
    mail?: string;
  };

  return {
    accountEmail: profile.mail || profile.userPrincipalName || null,
    accountName: profile.displayName || null,
  };
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=${encodeURIComponent(
        `microsoft_${error}`
      )}`
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

  const connector = getConnector("microsoft-mail");
  if (!connector?.handleCallback) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=connector_unavailable`
    );
  }

  try {
    const tokens = await connector.handleCallback(code);
    const { accountEmail, accountName } = await fetchMicrosoftProfile(
      tokens.accessToken
    );
    const supabase = createAdminClient();

    const providers = [
      "microsoft-mail",
      "microsoft-calendar",
      "microsoft-contacts",
    ];

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
          account_email: accountEmail,
          account_name: accountName,
        },
        { onConflict: "workspace_id,provider" }
      );
    }

    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?success=microsoft`
    );
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/app/settings/integrations?error=token_exchange_failed`
    );
  }
}
