import type {
  IntegrationConnector,
  NormalizedPerson,
  SyncResult,
} from "../types";

interface GoogleContact {
  resourceName: string;
  names?: Array<{
    displayName?: string;
    givenName?: string;
    familyName?: string;
  }>;
  emailAddresses?: Array<{ value: string; type?: string }>;
  phoneNumbers?: Array<{ value: string; type?: string }>;
  organizations?: Array<{
    name?: string;
    title?: string;
    domain?: string;
  }>;
  addresses?: Array<{ formattedValue?: string; type?: string }>;
  biographies?: Array<{ value: string }>;
  photos?: Array<{ url: string; default?: boolean }>;
  urls?: Array<{ value: string; type?: string }>;
}

export const googleContactsConnector: IntegrationConnector = {
  id: "google-contacts",
  name: "Google Contacts",
  description: "Import contacts from Google Contacts.",
  icon: "Users",
  auth: "oauth",

  // OAuth is shared with Gmail — uses the same Google OAuth flow

  async sync(config) {
    const accessToken = config.accessToken;
    if (!accessToken) throw new Error("No access token available");

    const people: NormalizedPerson[] = [];
    let pageToken: string | undefined;
    const syncToken = config.cursor?.contactsSyncToken as
      | string
      | undefined;

    do {
      const url = new URL(
        "https://people.googleapis.com/v1/people/me/connections"
      );
      url.searchParams.set(
        "personFields",
        "names,emailAddresses,phoneNumbers,organizations,addresses,biographies,photos,urls"
      );
      url.searchParams.set("pageSize", "100");

      if (syncToken && !pageToken) {
        url.searchParams.set("syncToken", syncToken);
        url.searchParams.set("requestSyncToken", "true");
      } else {
        url.searchParams.set("requestSyncToken", "true");
      }
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const resp = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!resp.ok) {
        // If sync token is invalid, do a full sync
        if (resp.status === 410 && syncToken) {
          return this.sync({ ...config, cursor: {} });
        }
        const err = await resp.json();
        throw new Error(
          `People API error: ${err.error?.message || resp.status}`
        );
      }

      const data = await resp.json();
      const contacts: GoogleContact[] = data.connections || [];
      pageToken = data.nextPageToken;

      for (const contact of contacts) {
        const name = contact.names?.[0];
        const email = contact.emailAddresses?.[0]?.value;
        const phone = contact.phoneNumbers?.[0]?.value;
        const org = contact.organizations?.[0];
        const address = contact.addresses?.[0]?.formattedValue;
        const bio = contact.biographies?.[0]?.value;
        const photo = contact.photos?.find((p) => !p.default)?.url;

        // Skip contacts without any identifying info
        if (!name?.displayName && !email) continue;

        const person: NormalizedPerson = {
          email: email?.toLowerCase(),
          phone: phone || undefined,
          first_name: name?.givenName || undefined,
          last_name: name?.familyName || undefined,
          display_name: name?.displayName || undefined,
          company_name: org?.name || undefined,
          company_domain: org?.domain || undefined,
          job_title: org?.title || undefined,
          location: address || undefined,
          bio: bio || undefined,
          avatar_url: photo || undefined,
          source: "google-contacts",
          source_id: contact.resourceName,
        };

        // Extract social profiles from URLs
        const socialProfiles: NormalizedPerson["social_profiles"] = [];
        for (const u of contact.urls || []) {
          if (u.value.includes("linkedin.com")) {
            socialProfiles.push({
              platform: "linkedin",
              profile_url: u.value,
            });
          } else if (u.value.includes("twitter.com") || u.value.includes("x.com")) {
            socialProfiles.push({
              platform: "twitter",
              profile_url: u.value,
            });
          }
        }
        if (socialProfiles.length > 0) {
          person.social_profiles = socialProfiles;
        }

        people.push(person);
      }

      // Store sync token from final page
      if (data.nextSyncToken) {
        return {
          people,
          interactions: [],
          cursor: {
            ...config.cursor,
            contactsSyncToken: data.nextSyncToken,
          },
          hasMore: false,
        };
      }
    } while (pageToken);

    return {
      people,
      interactions: [],
      cursor: config.cursor,
      hasMore: false,
    };
  },
};
