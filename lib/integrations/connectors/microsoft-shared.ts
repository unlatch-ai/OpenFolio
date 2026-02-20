interface MicrosoftTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  error?: string;
  error_description?: string;
}

const MICROSOFT_CLIENT_ID = process.env.MICROSOFT_CLIENT_ID || "";
const MICROSOFT_CLIENT_SECRET = process.env.MICROSOFT_CLIENT_SECRET || "";
const MICROSOFT_TENANT_ID = process.env.MICROSOFT_TENANT_ID || "common";

const MICROSOFT_SCOPES = [
  "offline_access",
  "User.Read",
  "Contacts.Read",
  "Mail.Read",
  "Calendars.Read",
].join(" ");

export function getMicrosoftAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: MICROSOFT_CLIENT_ID,
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: MICROSOFT_SCOPES,
    state,
  });

  return `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize?${params.toString()}`;
}

export async function exchangeMicrosoftCode(code: string, redirectUri: string) {
  const resp = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    }
  );

  const data = (await resp.json()) as MicrosoftTokenResponse;
  if (!resp.ok || !data.access_token) {
    throw new Error(
      `Microsoft token exchange failed: ${data.error_description || data.error || "unknown_error"}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function refreshMicrosoftAccessToken(refreshToken: string) {
  const resp = await fetch(
    `https://login.microsoftonline.com/${MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: MICROSOFT_CLIENT_ID,
        client_secret: MICROSOFT_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    }
  );

  const data = (await resp.json()) as MicrosoftTokenResponse;
  if (!resp.ok || !data.access_token) {
    throw new Error(
      `Microsoft token refresh failed: ${data.error_description || data.error || "unknown_error"}`
    );
  }

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export async function graphGetWithRetry(
  url: string,
  accessToken: string,
  maxAttempts = 3
): Promise<Response> {
  let attempt = 0;
  let lastResponse: Response | undefined;

  while (attempt < maxAttempts) {
    attempt++;
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (response.ok) {
      return response;
    }

    lastResponse = response;

    if (!(response.status === 429 || response.status >= 500) || attempt >= maxAttempts) {
      break;
    }

    const retryAfter = response.headers.get("retry-after");
    const retryAfterMs = retryAfter ? Number(retryAfter) * 1000 : 0;
    const backoffMs = Math.max(500 * 2 ** (attempt - 1), retryAfterMs || 0);
    await new Promise((resolve) => setTimeout(resolve, backoffMs));
  }

  return lastResponse as Response;
}

export function isInvalidDeltaToken(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybeError = error as { code?: string; message?: string };
  const code = maybeError.code || "";
  const message = maybeError.message || "";
  return (
    code.toLowerCase().includes("syncstatenotfound") ||
    code.toLowerCase().includes("invalidsynctoken") ||
    message.toLowerCase().includes("delta token")
  );
}
