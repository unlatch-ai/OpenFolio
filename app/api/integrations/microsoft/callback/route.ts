import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getConnector } from "@/lib/integrations/registry";
import { encrypt } from "@/lib/integrations/encryption";
import { syncIntegration } from "@/src/trigger/sync-integration";
import { upsertIntegrationSchedule } from "@/lib/integrations/schedule";

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
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const code = request.nextUrl.searchParams.get("code");
  const stateParam = request.nextUrl.searchParams.get("state");
  const error = request.nextUrl.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=${encodeURIComponent(
        `microsoft_${error}`
      )}`
    );
  }

  if (!code || !stateParam) {
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=missing_params`
    );
  }

  const state = verifyState(stateParam);
  if (!state) {
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=invalid_state`
    );
  }

  const connector = getConnector("microsoft-mail");
  if (!connector?.handleCallback) {
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=connector_unavailable`
    );
  }

  const redirectUri = `${appUrl}/api/integrations/microsoft/callback`;

  try {
    const tokens = await connector.handleCallback(code, redirectUri);
    const { accountEmail, accountName } = await fetchMicrosoftProfile(
      tokens.accessToken
    );
    const supabase = createAdminClient();

    const providers = [
      "microsoft-mail",
      "microsoft-calendar",
      "microsoft-contacts",
    ];
    const integrationIds: string[] = [];

    for (const provider of providers) {
      const { data: integration, error: upsertError } = await supabase
        .from("integrations")
        .upsert(
          {
            workspace_id: state.workspaceId,
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
        )
        .select("id")
        .single();

      if (upsertError) {
        throw new Error(
          `Failed to save ${provider} integration: ${upsertError.message}`
        );
      }

      if (integration?.id) {
        integrationIds.push(integration.id);
      }
    }

    if (integrationIds.length === 0) {
      throw new Error("No integrations were created for Microsoft provider");
    }

    for (const integrationId of integrationIds) {
      // Create daily sync schedule (02:00 UTC default; user can change via autosync settings)
      try {
        const scheduleId = await upsertIntegrationSchedule(integrationId);
        await supabase
          .from("integrations")
          .update({ metadata: { trigger_schedule_id: scheduleId } as never })
          .eq("id", integrationId);
      } catch (scheduleError) {
        console.error("Failed to create sync schedule", { integrationId, scheduleError });
      }

      // Trigger immediate initial sync
      try {
        await supabase
          .from("integrations")
          .update({ status: "syncing", last_sync_error: null })
          .eq("id", integrationId);

        await syncIntegration.trigger(
          { integrationId, workspaceId: state.workspaceId },
          { idempotencyKey: `initial-sync:${integrationId}` }
        );
      } catch (triggerError) {
        await supabase
          .from("integrations")
          .update({
            status: "error",
            last_sync_error:
              triggerError instanceof Error
                ? triggerError.message
                : "Failed to queue initial sync",
          })
          .eq("id", integrationId);
      }
    }

    return NextResponse.redirect(
      `${appUrl}/app/settings?success=microsoft`
    );
  } catch (err) {
    console.error("Microsoft OAuth callback error:", err);
    return NextResponse.redirect(
      `${appUrl}/app/settings?error=token_exchange_failed`
    );
  }
}
