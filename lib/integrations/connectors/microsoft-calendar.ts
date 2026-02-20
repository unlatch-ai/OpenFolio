import type {
  IntegrationConnector,
  NormalizedInteraction,
  NormalizedPerson,
} from "../types";
import {
  graphGetWithRetry,
  isInvalidDeltaToken,
  refreshMicrosoftAccessToken,
} from "./microsoft-shared";

interface MicrosoftCalendarAttendee {
  emailAddress?: {
    address?: string;
    name?: string;
  };
}

interface MicrosoftCalendarEvent {
  id: string;
  subject?: string;
  bodyPreview?: string;
  start?: { dateTime?: string; timeZone?: string };
  end?: { dateTime?: string; timeZone?: string };
  attendees?: MicrosoftCalendarAttendee[];
  organizer?: {
    emailAddress?: {
      address?: string;
      name?: string;
    };
  };
  webLink?: string;
  location?: { displayName?: string };
  isCancelled?: boolean;
  "@removed"?: { reason?: string };
}

function parseDate(eventDate: { dateTime?: string; timeZone?: string } | undefined): string | undefined {
  if (!eventDate?.dateTime) return undefined;
  const parsed = new Date(eventDate.dateTime);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function durationMinutes(startIso?: string, endIso?: string): number | undefined {
  if (!startIso || !endIso) return undefined;
  return Math.max(
    0,
    Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000)
  );
}

export const microsoftCalendarConnector: IntegrationConnector = {
  id: "microsoft-calendar",
  name: "Microsoft Calendar",
  description: "Import meetings and events from Microsoft 365.",
  icon: "Calendar",
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
    const interactions: NormalizedInteraction[] = [];
    const seenEmails = new Set<string>();

    let nextUrl: string | undefined =
      typeof config.cursor?.calendarDeltaLink === "string"
        ? config.cursor.calendarDeltaLink
        : "https://graph.microsoft.com/v1.0/me/events/delta?$select=id,subject,bodyPreview,start,end,attendees,organizer,webLink,location,isCancelled&$top=100";

    let deltaLink: string | undefined;

    while (nextUrl) {
      const response = await graphGetWithRetry(nextUrl, accessToken);
      const payload = await response.json();

      if (!response.ok) {
        if (isInvalidDeltaToken(payload?.error) && config.cursor?.calendarDeltaLink) {
          return this.sync({ ...config, cursor: {} });
        }

        throw new Error(
          `Microsoft Calendar API error: ${payload?.error?.message || response.status}`
        );
      }

      const events = (payload.value || []) as MicrosoftCalendarEvent[];
      for (const event of events) {
        if (event["@removed"] || event.isCancelled) continue;

        const startIso = parseDate(event.start);
        if (!startIso) continue;
        const endIso = parseDate(event.end);

        const participantEmails: string[] = [];
        for (const attendee of event.attendees || []) {
          const email = attendee.emailAddress?.address?.toLowerCase();
          if (!email) continue;
          participantEmails.push(email);
          if (!seenEmails.has(email)) {
            seenEmails.add(email);
            const name = attendee.emailAddress?.name;
            const person: NormalizedPerson = {
              email,
              source: "microsoft-calendar",
            };
            if (name) {
              const parts = name.split(/\s+/);
              person.first_name = parts[0];
              person.last_name = parts.slice(1).join(" ") || undefined;
              person.display_name = name;
            }
            people.push(person);
          }
        }

        interactions.push({
          interaction_type: "meeting",
          subject: event.subject || "Untitled Event",
          content: event.bodyPreview || undefined,
          occurred_at: startIso,
          duration_minutes: durationMinutes(startIso, endIso),
          participant_emails: Array.from(new Set(participantEmails)),
          source: "microsoft-calendar",
          source_id: event.id,
          source_url: event.webLink || undefined,
          metadata: {
            location: event.location?.displayName,
            organizer: event.organizer?.emailAddress?.address,
          },
        });
      }

      nextUrl = payload["@odata.nextLink"];
      deltaLink = payload["@odata.deltaLink"] || deltaLink;
    }

    return {
      people,
      interactions,
      cursor: {
        ...config.cursor,
        calendarDeltaLink: deltaLink || config.cursor?.calendarDeltaLink || null,
      },
      hasMore: false,
    };
  },
};
