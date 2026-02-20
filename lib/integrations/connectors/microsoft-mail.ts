import type {
  IntegrationConnector,
  NormalizedInteraction,
  NormalizedPerson,
} from "../types";
import {
  exchangeMicrosoftCode,
  getMicrosoftAuthUrl,
  graphGetWithRetry,
  isInvalidDeltaToken,
  refreshMicrosoftAccessToken,
} from "./microsoft-shared";

interface MicrosoftEmailAddress {
  address?: string;
  name?: string;
}

interface MicrosoftRecipient {
  emailAddress?: MicrosoftEmailAddress;
}

interface MicrosoftMessage {
  id: string;
  subject?: string;
  bodyPreview?: string;
  from?: MicrosoftRecipient;
  toRecipients?: MicrosoftRecipient[];
  ccRecipients?: MicrosoftRecipient[];
  receivedDateTime?: string;
  webLink?: string;
  conversationId?: string;
  "@removed"?: { reason?: string };
}

function toEmail(value: string | undefined): string | undefined {
  if (!value) return undefined;
  return value.toLowerCase();
}

function toPerson(email: string, name?: string): NormalizedPerson {
  const person: NormalizedPerson = {
    email,
    source: "microsoft-mail",
  };

  if (name && name.trim()) {
    const cleaned = name.trim();
    const parts = cleaned.split(/\s+/);
    person.first_name = parts[0];
    person.last_name = parts.slice(1).join(" ") || undefined;
    person.display_name = cleaned;
  }

  return person;
}

function collectEmails(...recipientGroups: Array<MicrosoftRecipient[] | undefined>): string[] {
  const emails = new Set<string>();

  for (const group of recipientGroups) {
    for (const recipient of group || []) {
      const email = toEmail(recipient.emailAddress?.address);
      if (email) emails.add(email);
    }
  }

  return Array.from(emails);
}

export const microsoftMailConnector: IntegrationConnector = {
  id: "microsoft-mail",
  name: "Microsoft Mail",
  description: "Import email interactions from Microsoft 365.",
  icon: "Mail",
  auth: "oauth",

  getAuthUrl(redirectUri: string, state: string): string {
    return getMicrosoftAuthUrl(redirectUri, state);
  },

  async handleCallback(code: string) {
    return exchangeMicrosoftCode(
      code,
      `${process.env.NEXT_PUBLIC_APP_URL}/api/integrations/microsoft/callback`
    );
  },

  async sync(config) {
    let accessToken = config.accessToken;

    if (!accessToken && config.refreshToken) {
      const refreshed = await refreshMicrosoftAccessToken(config.refreshToken);
      accessToken = refreshed.accessToken;
    }

    if (!accessToken) {
      throw new Error("No access token available");
    }

    const people: NormalizedPerson[] = [];
    const interactions: NormalizedInteraction[] = [];
    const seenEmails = new Set<string>();

    let nextUrl: string | undefined =
      typeof config.cursor?.mailDeltaLink === "string"
        ? config.cursor.mailDeltaLink
        : "https://graph.microsoft.com/v1.0/me/messages/delta?$select=id,subject,bodyPreview,from,toRecipients,ccRecipients,receivedDateTime,webLink,conversationId&$top=50";

    let deltaLink: string | undefined;
    let totalMessages = 0;
    const maxMessages = 200;

    while (nextUrl && totalMessages < maxMessages) {
      const response = await graphGetWithRetry(nextUrl, accessToken);
      const payload = await response.json();

      if (!response.ok) {
        if (isInvalidDeltaToken(payload?.error) && config.cursor?.mailDeltaLink) {
          return this.sync({ ...config, cursor: {} });
        }

        throw new Error(
          `Microsoft Mail API error: ${payload?.error?.message || response.status}`
        );
      }

      const messages = (payload.value || []) as MicrosoftMessage[];

      for (const message of messages) {
        if (totalMessages >= maxMessages) break;
        if (message["@removed"]) continue;

        const fromEmail = toEmail(message.from?.emailAddress?.address);
        const fromName = message.from?.emailAddress?.name;

        if (fromEmail && !seenEmails.has(fromEmail)) {
          seenEmails.add(fromEmail);
          people.push(toPerson(fromEmail, fromName));
        }

        const participantEmails = collectEmails(
          fromEmail ? [{ emailAddress: { address: fromEmail, name: fromName } }] : [],
          message.toRecipients,
          message.ccRecipients
        );

        for (const recipientEmail of participantEmails) {
          if (!seenEmails.has(recipientEmail)) {
            seenEmails.add(recipientEmail);
            people.push(toPerson(recipientEmail));
          }
        }

        if (participantEmails.length > 0) {
          interactions.push({
            interaction_type: "email",
            direction: "inbound",
            subject: message.subject || undefined,
            content: message.bodyPreview || undefined,
            occurred_at: message.receivedDateTime || new Date().toISOString(),
            participant_emails: participantEmails,
            source: "microsoft-mail",
            source_id: message.id,
            source_url: message.webLink || undefined,
            metadata: {
              conversationId: message.conversationId,
            },
          });
        }

        totalMessages++;
      }

      nextUrl = payload["@odata.nextLink"];
      deltaLink = payload["@odata.deltaLink"] || deltaLink;
    }

    return {
      people,
      interactions,
      cursor: {
        ...config.cursor,
        mailDeltaLink: deltaLink || config.cursor?.mailDeltaLink || null,
      },
      hasMore: false,
    };
  },
};
