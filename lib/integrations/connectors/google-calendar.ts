import type {
  IntegrationConnector,
  NormalizedInteraction,
  NormalizedPerson,
  SyncResult,
} from "../types";

interface CalendarEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{
    email: string;
    displayName?: string;
    self?: boolean;
    responseStatus?: string;
  }>;
  organizer?: { email: string; displayName?: string; self?: boolean };
  htmlLink?: string;
  status?: string;
}

function durationMinutes(
  start: CalendarEvent["start"],
  end: CalendarEvent["end"]
): number | undefined {
  const s = start?.dateTime;
  const e = end?.dateTime;
  if (!s || !e) return undefined;
  return Math.round(
    (new Date(e).getTime() - new Date(s).getTime()) / 60000
  );
}

export const googleCalendarConnector: IntegrationConnector = {
  id: "google-calendar",
  name: "Google Calendar",
  description: "Import meetings and events from Google Calendar.",
  icon: "Calendar",
  auth: "oauth",

  // OAuth is shared with Gmail — uses the same Google OAuth flow
  // getAuthUrl and handleCallback are handled by the shared Google OAuth routes

  async sync(config) {
    const accessToken = config.accessToken;
    if (!accessToken) throw new Error("No access token available");

    const people: NormalizedPerson[] = [];
    const interactions: NormalizedInteraction[] = [];
    const seenEmails = new Set<string>();

    // Determine time range
    const syncToken = config.cursor?.calendarSyncToken as string | undefined;
    const timeMin =
      !syncToken
        ? new Date(Date.now() - 90 * 86400 * 1000).toISOString()
        : undefined;

    let pageToken: string | undefined;
    let newSyncToken: string | undefined;

    do {
      const url = new URL(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events"
      );
      url.searchParams.set("maxResults", "100");
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");

      if (syncToken && !pageToken) {
        url.searchParams.set("syncToken", syncToken);
      } else if (timeMin) {
        url.searchParams.set("timeMin", timeMin);
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
          `Calendar API error: ${err.error?.message || resp.status}`
        );
      }

      const data = await resp.json();
      const events: CalendarEvent[] = data.items || [];
      pageToken = data.nextPageToken;
      if (data.nextSyncToken) newSyncToken = data.nextSyncToken;

      for (const event of events) {
        if (event.status === "cancelled") continue;

        const startTime =
          event.start?.dateTime || event.start?.date;
        if (!startTime) continue;

        // Extract people from attendees
        const participantEmails: string[] = [];
        for (const attendee of event.attendees || []) {
          if (attendee.self) continue;
          participantEmails.push(attendee.email.toLowerCase());
          if (!seenEmails.has(attendee.email.toLowerCase())) {
            seenEmails.add(attendee.email.toLowerCase());
            const person: NormalizedPerson = {
              email: attendee.email.toLowerCase(),
              source: "google-calendar",
            };
            if (attendee.displayName) {
              const parts = attendee.displayName.split(/\s+/);
              person.first_name = parts[0];
              person.last_name = parts.slice(1).join(" ") || undefined;
              person.display_name = attendee.displayName;
            }
            people.push(person);
          }
        }

        interactions.push({
          interaction_type: "meeting",
          subject: event.summary || "Untitled Event",
          content: event.description || undefined,
          occurred_at: new Date(startTime).toISOString(),
          duration_minutes: durationMinutes(event.start, event.end),
          participant_emails: participantEmails,
          source: "google-calendar",
          source_id: event.id,
          source_url: event.htmlLink || undefined,
          metadata: {
            location: event.location,
          },
        });
      }
    } while (pageToken);

    return {
      people,
      interactions,
      cursor: {
        ...config.cursor,
        calendarSyncToken: newSyncToken || syncToken || null,
      },
      hasMore: false,
    };
  },
};
