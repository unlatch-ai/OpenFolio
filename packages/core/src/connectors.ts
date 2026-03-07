import type {
  ConnectorProvider,
  ConnectorSyncResult,
  NormalizedConnectorInteraction,
  NormalizedConnectorPerson,
} from "@openfolio/shared-types";

export interface LocalConnector {
  id: ConnectorProvider;
  name: string;
  sync(config: {
    accessToken?: string;
    refreshToken?: string;
    cursor: Record<string, unknown>;
    fetchImpl?: typeof fetch;
  }): Promise<ConnectorSyncResult>;
}

type GoogleContact = {
  resourceName: string;
  names?: Array<{ displayName?: string; givenName?: string; familyName?: string }>;
  emailAddresses?: Array<{ value: string }>;
  phoneNumbers?: Array<{ value: string }>;
  organizations?: Array<{ name?: string; title?: string; domain?: string }>;
  addresses?: Array<{ formattedValue?: string }>;
  biographies?: Array<{ value?: string }>;
};

type GmailMessage = {
  id: string;
  snippet?: string;
  internalDate?: string;
  payload?: {
    headers?: Array<{ name: string; value: string }>;
  };
};

function getFetch(fetchImpl?: typeof fetch) {
  return fetchImpl ?? fetch;
}

function lower(value?: string | null) {
  return value?.trim().toLowerCase() ?? null;
}

function gmailHeader(message: GmailMessage, name: string) {
  return message.payload?.headers?.find((header) => header.name.toLowerCase() === name.toLowerCase())?.value;
}

function extractEmails(value: string) {
  const matches = value.match(/[\w.+-]+@[\w.-]+\.\w+/g) ?? [];
  return [...new Set(matches.map((match) => match.toLowerCase()))];
}

export const googleContactsConnector: LocalConnector = {
  id: "google_contacts",
  name: "Google Contacts",
  async sync({ accessToken, cursor, fetchImpl }) {
    if (!accessToken) {
      throw new Error("Google Contacts sync requires an access token.");
    }

    const client = getFetch(fetchImpl);
    const people: NormalizedConnectorPerson[] = [];
    let pageToken: string | undefined;
    let finalSyncToken: string | undefined;
    const syncToken = typeof cursor.syncToken === "string" ? cursor.syncToken : undefined;

    do {
      const url = new URL("https://people.googleapis.com/v1/people/me/connections");
      url.searchParams.set(
        "personFields",
        "names,emailAddresses,phoneNumbers,organizations,addresses,biographies",
      );
      url.searchParams.set("pageSize", "100");
      url.searchParams.set("requestSyncToken", "true");
      if (syncToken && !pageToken) {
        url.searchParams.set("syncToken", syncToken);
      }
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await client(url.toString(), {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        if (response.status === 410 && syncToken) {
          return this.sync({ accessToken, cursor: {}, fetchImpl });
        }

        throw new Error(`Google Contacts sync failed with status ${response.status}.`);
      }

      const data = (await response.json()) as {
        connections?: GoogleContact[];
        nextPageToken?: string;
        nextSyncToken?: string;
      };

      pageToken = data.nextPageToken;
      if (data.nextSyncToken) {
        finalSyncToken = data.nextSyncToken;
      }

      for (const contact of data.connections ?? []) {
        const name = contact.names?.[0];
        const email = lower(contact.emailAddresses?.[0]?.value);
        const phone = contact.phoneNumbers?.[0]?.value ?? null;
        const organization = contact.organizations?.[0];

        if (!name?.displayName && !email && !phone) {
          continue;
        }

        people.push({
          displayName: name?.displayName ?? email ?? phone ?? "Unknown Contact",
          primaryHandle: email ?? phone,
          email,
          phone,
          companyName: organization?.name ?? null,
          companyDomain: organization?.domain ?? null,
          jobTitle: organization?.title ?? null,
          bio: contact.biographies?.[0]?.value ?? null,
          location: contact.addresses?.[0]?.formattedValue ?? null,
          sourceKind: "google_contacts",
          sourceId: contact.resourceName,
        });
      }
    } while (pageToken);

    return {
      people,
      interactions: [],
      cursor: finalSyncToken ? { syncToken: finalSyncToken } : cursor,
      hasMore: false,
    };
  },
};

async function fetchGmailMessage(accessToken: string, messageId: string, fetchImpl?: typeof fetch) {
  const client = getFetch(fetchImpl);
  const response = await client(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Subject&metadataHeaders=Date`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    console.warn(`[openfolio-gmail] Failed to fetch message ${messageId}: HTTP ${response.status}`);
    if (response.status === 401 || response.status === 403) {
      throw new Error(`Gmail access denied (HTTP ${response.status}). Your access token may have expired.`);
    }
    return null;
  }

  return (await response.json()) as GmailMessage;
}

function toNormalizedEmailRecords(message: GmailMessage) {
  const from = gmailHeader(message, "From") ?? "";
  const to = gmailHeader(message, "To") ?? "";
  const cc = gmailHeader(message, "Cc") ?? "";
  const subject = gmailHeader(message, "Subject") ?? "Email";
  const participantHandles = [...new Set([...extractEmails(from), ...extractEmails(to), ...extractEmails(cc)])];

  const people: NormalizedConnectorPerson[] = participantHandles.map((handle) => ({
    displayName: handle,
    primaryHandle: handle,
    email: handle,
    sourceKind: "gmail",
    sourceId: handle,
  }));

  const interaction: NormalizedConnectorInteraction = {
    title: subject,
    summary: message.snippet ?? null,
    occurredAt: Number(message.internalDate ?? Date.now()),
    kind: "email",
    sourceKind: "gmail",
    sourceId: message.id,
    participantHandles,
    metadata: {
      from,
      to,
      cc,
    },
  };

  return { people, interaction };
}

export const gmailConnector: LocalConnector = {
  id: "gmail",
  name: "Gmail",
  async sync({ accessToken, cursor, fetchImpl }) {
    if (!accessToken) {
      throw new Error("Gmail sync requires an access token.");
    }

    const client = getFetch(fetchImpl);
    const profileResponse = await client("https://gmail.googleapis.com/gmail/v1/users/me/profile", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!profileResponse.ok) {
      throw new Error(`Gmail profile lookup failed with status ${profileResponse.status}.`);
    }

    const profile = (await profileResponse.json()) as { historyId?: string };
    const listUrl = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
    listUrl.searchParams.set("maxResults", "25");
    if (!cursor.historyId) {
      listUrl.searchParams.set("q", `after:${Math.floor(Date.now() / 1000 - 90 * 86400)}`);
    }

    const listResponse = await client(listUrl.toString(), {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!listResponse.ok) {
      throw new Error(`Gmail message listing failed with status ${listResponse.status}.`);
    }

    const listing = (await listResponse.json()) as {
      messages?: Array<{ id: string }>;
    };

    const people = new Map<string, NormalizedConnectorPerson>();
    const interactions: NormalizedConnectorInteraction[] = [];

    const messages = await Promise.all(
      (listing.messages ?? []).map((stub) => fetchGmailMessage(accessToken, stub.id, fetchImpl))
    );

    for (const message of messages) {
      if (!message) {
        continue;
      }

      const normalized = toNormalizedEmailRecords(message);
      for (const person of normalized.people) {
        people.set(person.primaryHandle ?? person.displayName, person);
      }
      interactions.push(normalized.interaction);
    }

    return {
      people: [...people.values()],
      interactions,
      cursor: { historyId: profile.historyId ?? cursor.historyId ?? null },
      hasMore: false,
    };
  },
};

export const localConnectors = [googleContactsConnector, gmailConnector] as const;
