import type { IntegrationConnector, NormalizedPerson } from "../types";
import {
  graphGetWithRetry,
  isInvalidDeltaToken,
  refreshMicrosoftAccessToken,
} from "./microsoft-shared";

interface MicrosoftContact {
  id: string;
  givenName?: string;
  surname?: string;
  displayName?: string;
  companyName?: string;
  jobTitle?: string;
  emailAddresses?: Array<{
    address?: string;
    name?: string;
  }>;
  businessPhones?: string[];
  mobilePhone?: string;
  homeAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryOrRegion?: string;
  };
  businessAddress?: {
    street?: string;
    city?: string;
    state?: string;
    postalCode?: string;
    countryOrRegion?: string;
  };
  "@removed"?: { reason?: string };
}

function addressToString(address: MicrosoftContact["homeAddress"]): string | undefined {
  if (!address) return undefined;
  const parts = [
    address.street,
    address.city,
    address.state,
    address.postalCode,
    address.countryOrRegion,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(", ") : undefined;
}

export const microsoftContactsConnector: IntegrationConnector = {
  id: "microsoft-contacts",
  name: "Microsoft Contacts",
  description: "Import contacts from Microsoft 365.",
  icon: "Users",
  auth: "oauth",

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

    let nextUrl: string | undefined =
      typeof config.cursor?.contactsDeltaLink === "string"
        ? config.cursor.contactsDeltaLink
        : "https://graph.microsoft.com/v1.0/me/contacts/delta?$select=id,givenName,surname,displayName,companyName,jobTitle,emailAddresses,businessPhones,mobilePhone,homeAddress,businessAddress&$top=100";

    let deltaLink: string | undefined;

    while (nextUrl) {
      const response = await graphGetWithRetry(nextUrl, accessToken);
      const payload = await response.json();

      if (!response.ok) {
        if (isInvalidDeltaToken(payload?.error) && config.cursor?.contactsDeltaLink) {
          return this.sync({ ...config, cursor: {} });
        }

        throw new Error(
          `Microsoft Contacts API error: ${payload?.error?.message || response.status}`
        );
      }

      const contacts = (payload.value || []) as MicrosoftContact[];
      for (const contact of contacts) {
        if (contact["@removed"]) continue;

        const email = contact.emailAddresses?.[0]?.address?.toLowerCase();
        if (!email && !contact.displayName && !contact.givenName) {
          continue;
        }

        people.push({
          email,
          phone: contact.mobilePhone || contact.businessPhones?.[0] || undefined,
          first_name: contact.givenName || undefined,
          last_name: contact.surname || undefined,
          display_name: contact.displayName || undefined,
          company_name: contact.companyName || undefined,
          job_title: contact.jobTitle || undefined,
          location:
            addressToString(contact.businessAddress) ||
            addressToString(contact.homeAddress),
          source: "microsoft-contacts",
          source_id: contact.id,
        });
      }

      nextUrl = payload["@odata.nextLink"];
      deltaLink = payload["@odata.deltaLink"] || deltaLink;
    }

    return {
      people,
      interactions: [],
      cursor: {
        ...config.cursor,
        contactsDeltaLink: deltaLink || config.cursor?.contactsDeltaLink || null,
      },
      hasMore: false,
    };
  },
};
