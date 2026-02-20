export interface NormalizedPerson {
  email?: string;
  phone?: string;
  first_name?: string;
  last_name?: string;
  display_name?: string;
  bio?: string;
  location?: string;
  avatar_url?: string;
  company_name?: string;
  company_domain?: string;
  job_title?: string;
  social_profiles?: Array<{
    platform: string;
    profile_url?: string;
    username?: string;
  }>;
  source: string;
  source_id?: string;
  custom_data?: Record<string, unknown>;
}

export interface NormalizedInteraction {
  interaction_type: string;
  direction?: string;
  subject?: string;
  content?: string;
  occurred_at: string;
  duration_minutes?: number;
  participant_emails: string[];
  source: string;
  source_id?: string;
  source_url?: string;
  metadata?: Record<string, unknown>;
}

export interface SyncResult {
  people: NormalizedPerson[];
  interactions: NormalizedInteraction[];
  cursor: Record<string, unknown> | null;
  hasMore: boolean;
}

export interface IntegrationConnector {
  id: string;
  name: string;
  description: string;
  icon: string;
  auth: "oauth" | "file" | "none";

  getAuthUrl?(redirectUri: string, state: string): string;
  handleCallback?(
    code: string,
    redirectUri: string
  ): Promise<{
    accessToken: string;
    refreshToken?: string;
    expiresAt?: Date;
  }>;

  sync(config: {
    accessToken?: string;
    refreshToken?: string;
    cursor: Record<string, unknown>;
    metadata?: Record<string, unknown>;
    workspaceId: string;
  }): Promise<SyncResult>;

  parseFile?(file: Buffer, filename: string): Promise<SyncResult>;
}

export interface SyncSummary {
  peopleCreated: number;
  peopleUpdated: number;
  companiesCreated: number;
  interactionsCreated: number;
}
