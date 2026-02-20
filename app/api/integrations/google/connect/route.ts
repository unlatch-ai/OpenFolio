import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  getWorkspaceContext,
  isWorkspaceContextError,
} from "@/lib/auth";
import { getConnector } from "@/lib/integrations/registry";

function signState(payload: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
}

export async function GET(request: NextRequest) {
  const ctx = await getWorkspaceContext(request);
  if (isWorkspaceContextError(ctx)) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  const connector = getConnector("gmail");
  if (!connector?.getAuthUrl) {
    return NextResponse.json(
      { error: "Gmail connector not available" },
      { status: 500 }
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || request.nextUrl.origin;
  const redirectUri = `${appUrl}/api/integrations/google/callback`;
  const payload = JSON.stringify({
    workspaceId: ctx.workspaceId,
    userId: ctx.user.id,
    ts: Date.now(),
  });
  const sig = signState(payload);
  const state = `${Buffer.from(payload).toString("base64url")}.${sig}`;

  const authUrl = connector.getAuthUrl(redirectUri, state);
  return NextResponse.redirect(authUrl);
}
