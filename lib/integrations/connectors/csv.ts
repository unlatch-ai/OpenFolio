import type {
  IntegrationConnector,
  NormalizedPerson,
  SyncResult,
} from "../types";

// Common CSV column name mappings
const COLUMN_MAPS: Record<string, Record<string, string>> = {
  generic: {
    first_name: "first_name",
    firstname: "first_name",
    "first name": "first_name",
    last_name: "last_name",
    lastname: "last_name",
    "last name": "last_name",
    name: "display_name",
    "full name": "display_name",
    fullname: "display_name",
    email: "email",
    "email address": "email",
    e_mail: "email",
    phone: "phone",
    "phone number": "phone",
    telephone: "phone",
    company: "company_name",
    "company name": "company_name",
    organization: "company_name",
    title: "job_title",
    "job title": "job_title",
    position: "job_title",
    role: "job_title",
    location: "location",
    city: "location",
    address: "location",
    bio: "bio",
    notes: "bio",
    description: "bio",
    website: "website",
    url: "website",
    linkedin: "linkedin_url",
    "linkedin url": "linkedin_url",
    twitter: "twitter_handle",
    "twitter handle": "twitter_handle",
  },
  linkedin: {
    "first name": "first_name",
    "last name": "last_name",
    "email address": "email",
    company: "company_name",
    position: "job_title",
    "connected on": "connected_on",
    url: "linkedin_url",
  },
};

function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function detectPreset(headers: string[]): string {
  const lower = headers.map((h) => h.toLowerCase());
  if (
    lower.includes("first name") &&
    lower.includes("last name") &&
    lower.includes("connected on")
  ) {
    return "linkedin";
  }
  return "generic";
}

function mapRow(
  headers: string[],
  values: string[],
  columnMap: Record<string, string>
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toLowerCase().trim();
    const field = columnMap[header];
    const value = values[i]?.trim();
    if (field && value) {
      mapped[field] = value;
    }
  }
  return mapped;
}

function rowToPerson(row: Record<string, string>, source: string): NormalizedPerson {
  const person: NormalizedPerson = {
    source,
    first_name: row.first_name,
    last_name: row.last_name,
    display_name: row.display_name,
    email: row.email,
    phone: row.phone,
    company_name: row.company_name,
    company_domain: row.company_domain,
    job_title: row.job_title,
    location: row.location,
    bio: row.bio,
  };

  // Split display_name into first/last if not already set
  if (!person.first_name && person.display_name) {
    const parts = person.display_name.split(/\s+/);
    person.first_name = parts[0];
    person.last_name = parts.slice(1).join(" ") || undefined;
  }

  // Extract social profiles
  const socialProfiles: NormalizedPerson["social_profiles"] = [];
  if (row.linkedin_url) {
    socialProfiles.push({
      platform: "linkedin",
      profile_url: row.linkedin_url,
    });
  }
  if (row.twitter_handle) {
    socialProfiles.push({
      platform: "twitter",
      username: row.twitter_handle.replace(/^@/, ""),
    });
  }
  if (socialProfiles.length > 0) {
    person.social_profiles = socialProfiles;
  }

  return person;
}

export const csvConnector: IntegrationConnector = {
  id: "csv",
  name: "CSV Import",
  description: "Import contacts from a CSV file. Supports LinkedIn exports.",
  icon: "FileSpreadsheet",
  auth: "file",

  async sync() {
    return { people: [], interactions: [], cursor: null, hasMore: false };
  },

  async parseFile(file: Buffer, filename: string): Promise<SyncResult> {
    const content = file.toString("utf-8");
    const lines = content
      .split(/\r?\n/)
      .filter((line) => line.trim().length > 0);

    if (lines.length < 2) {
      return { people: [], interactions: [], cursor: null, hasMore: false };
    }

    const headers = parseCSVLine(lines[0]);
    const preset = detectPreset(headers);
    const columnMap = COLUMN_MAPS[preset] || COLUMN_MAPS.generic;
    const sourceId = `csv:${filename}`;

    const people: NormalizedPerson[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = parseCSVLine(lines[i]);
      if (values.length === 0 || values.every((v) => !v)) continue;

      const row = mapRow(headers, values, columnMap);
      // Skip rows without any identifying info
      if (!row.first_name && !row.display_name && !row.email) continue;

      people.push(rowToPerson(row, sourceId));
    }

    return {
      people,
      interactions: [],
      cursor: null,
      hasMore: false,
    };
  },
};
