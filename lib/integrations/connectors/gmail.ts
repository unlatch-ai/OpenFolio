import type {
  IntegrationConnector,
  NormalizedPerson,
  NormalizedInteraction,
  SyncResult,
} from "../types";

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/contacts.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
].join(" ");

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
  internalDate?: string;
}

function getHeader(
  message: GmailMessage,
  name: string
): string | undefined {
  return message.payload?.headers?.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}

function extractEmails(headerValue: string): string[] {
  const emailRegex = /[\w.+-]+@[\w.-]+\.\w+/g;
  return [...new Set(headerValue.match(emailRegex) || [])].map((e) =>
    e.toLowerCase()
  );
}

function emailToPerson(email: string, name?: string): NormalizedPerson {
  const person: NormalizedPerson = {
    email,
    source: "gmail",
  };
  if (name && name !== email) {
    const cleaned = name.replace(/["'<>]/g, "").trim();
    if (cleaned) {
      const parts = cleaned.split(/\s+/);
      person.first_name = parts[0];
      person.last_name = parts.slice(1).join(" ") || undefined;
      person.display_name = cleaned;
    }
  }
  return person;
}

function parseNameAndEmail(
  raw: string
): { email: string; name?: string } | null {
  const match = raw.match(/^(?:"?([^"<]*)"?\s*)?<?([^>]+@[^>]+)>?$/);
  if (match) {
    return { email: match[2].trim().toLowerCase(), name: match[1]?.trim() };
  }
  const emailMatch = raw.match(/([\w.+-]+@[\w.-]+\.\w+)/);
  if (emailMatch) {
    return { email: emailMatch[1].toLowerCase() };
  }
  return null;
}

async function refreshAccessToken(
  refreshToken: string
): Promise<{ accessToken: string; expiresAt: Date }> {
  const resp = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  const data = await resp.json();
  if (!resp.ok) throw new Error(`Token refresh failed: ${data.error}`);
  return {
    accessToken: data.access_token,
    expiresAt: new Date(Date.now() + data.expires_in * 1000),
  };
}

export const gmailConnector: IntegrationConnector = {
  id: "gmail",
  name: "Gmail",
  description: "Import emails and contacts from Gmail.",
  icon: "Mail",
  auth: "oauth",

  getAuthUrl(redirectUri: string, state: string): string {
    const params = new URLSearchParams({
      client_id: GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: SCOPES,
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  },

  async handleCallback(code: string) {
    const resp = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/google/callback`,
      }),
    });
    const data = await resp.json();
    if (!resp.ok)
      throw new Error(`Token exchange failed: ${data.error_description || data.error}`);

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: new Date(Date.now() + data.expires_in * 1000),
    };
  },

  async sync(config) {
    let accessToken = config.accessToken;

    // Refresh token if needed
    if (config.refreshToken && !accessToken) {
      const refreshed = await refreshAccessToken(config.refreshToken);
      accessToken = refreshed.accessToken;
    }

    if (!accessToken) throw new Error("No access token available");

    const people: NormalizedPerson[] = [];
    const interactions: NormalizedInteraction[] = [];
    const seenEmails = new Set<string>();

    // Fetch messages — initial sync: last 90 days, incremental via historyId
    const query =
      config.cursor?.historyId
        ? undefined
        : `after:${Math.floor(Date.now() / 1000 - 90 * 86400)}`;

    let pageToken: string | undefined;
    let messagesProcessed = 0;
    const maxMessages = 200;

    // If we have a historyId, use history API for incremental sync
    if (config.cursor?.historyId) {
      const historyUrl = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/history"
      );
      historyUrl.searchParams.set(
        "startHistoryId",
        String(config.cursor.historyId)
      );
      historyUrl.searchParams.set("historyTypes", "messageAdded");
      historyUrl.searchParams.set("maxResults", "100");

      const resp = await fetch(historyUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (resp.ok) {
        const data = await resp.json();
        const messageIds: string[] = [];
        for (const history of data.history || []) {
          for (const msg of history.messagesAdded || []) {
            messageIds.push(msg.message.id);
          }
        }

        for (const msgId of messageIds.slice(0, maxMessages)) {
          const msg = await fetchMessage(accessToken, msgId);
          if (msg) {
            processMessage(msg, people, interactions, seenEmails);
          }
        }

        return {
          people,
          interactions,
          cursor: { historyId: data.historyId || config.cursor.historyId },
          hasMore: false,
        };
      }
      // If history fails (e.g., historyId too old), fall through to full sync
    }

    // Full sync: list messages
    do {
      const listUrl = new URL(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages"
      );
      listUrl.searchParams.set("maxResults", "50");
      if (query) listUrl.searchParams.set("q", query);
      if (pageToken) listUrl.searchParams.set("pageToken", pageToken);

      const resp = await fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(`Gmail API error: ${err.error?.message || resp.status}`);
      }

      const data = await resp.json();
      const messages: Array<{ id: string }> = data.messages || [];
      pageToken = data.nextPageToken;

      for (const stub of messages) {
        if (messagesProcessed >= maxMessages) break;
        const msg = await fetchMessage(accessToken, stub.id);
        if (msg) {
          processMessage(msg, people, interactions, seenEmails);
          messagesProcessed++;
        }
      }

      if (messagesProcessed >= maxMessages) break;
    } while (pageToken);

    // Get current historyId for cursor
    const profileResp = await fetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/profile",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const profile = await profileResp.json();

    return {
      people,
      interactions,
      cursor: { historyId: profile.historyId },
      hasMore: false,
    };
  },
};

async function fetchMessage(
  accessToken: string,
  messageId: string
): Promise<GmailMessage | null> {
  const resp = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!resp.ok) return null;
  return resp.json();
}

function processMessage(
  msg: GmailMessage,
  people: NormalizedPerson[],
  interactions: NormalizedInteraction[],
  seenEmails: Set<string>
) {
  const from = getHeader(msg, "From") || "";
  const to = getHeader(msg, "To") || "";
  const cc = getHeader(msg, "Cc") || "";
  const subject = getHeader(msg, "Subject") || "";
  const date = msg.internalDate
    ? new Date(parseInt(msg.internalDate)).toISOString()
    : new Date().toISOString();

  // Extract people from headers
  const allRecipients = [from, to, cc].join(", ");
  for (const raw of allRecipients.split(",")) {
    const parsed = parseNameAndEmail(raw.trim());
    if (parsed && !seenEmails.has(parsed.email)) {
      seenEmails.add(parsed.email);
      people.push(emailToPerson(parsed.email, parsed.name));
    }
  }

  // Create interaction
  const participantEmails = extractEmails(allRecipients);
  if (participantEmails.length > 0) {
    interactions.push({
      interaction_type: "email",
      direction: "inbound",
      subject,
      content: msg.snippet || undefined,
      occurred_at: date,
      participant_emails: participantEmails,
      source: "gmail",
      source_id: msg.id,
      metadata: { threadId: msg.threadId },
    });
  }
}
