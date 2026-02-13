// =============================================================================
// INFRASTRUCTURE TYPES (workspace, auth, membership)
// =============================================================================

/**
 * Workspace (multi-tenant container for users)
 */
export interface Workspace {
  id: string;
  name: string;
  slug: string;
  website?: string | null;
  settings?: Record<string, unknown>;
  created_at: string;
}

/**
 * User profile (global, not workspace-specific)
 */
export interface Profile {
  id: string;
  role: 'user';
  email?: string | null;
  full_name?: string | null;
  avatar_url?: string | null;
  created_at: string;
  updated_at?: string | null;
}

/**
 * Workspace membership (many-to-many user-workspace)
 */
export interface WorkspaceMember {
  id: string;
  user_id: string;
  workspace_id: string;
  role: 'owner' | 'member';
  created_at: string;
}

/**
 * Pending workspace invite
 */
export interface WorkspaceInvite {
  id: string;
  workspace_id: string;
  email: string;
  role: 'owner' | 'member';
  invited_by: string;
  created_at: string;
  token_hash?: string;
  expires_at?: string;
  accepted_at?: string | null;
  last_sent_at?: string | null;
}

/**
 * Workspace with user's role (for workspace switcher)
 */
export interface UserWorkspace extends Workspace {
  role: 'owner' | 'member';
}

// =============================================================================
// CORE ENTITIES (OpenFolio personal CRM)
// =============================================================================

/**
 * Person — a contact in the user's network
 */
export interface Person {
  id: string;
  workspace_id: string;
  email?: string | null;
  phone?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  avatar_url?: string | null;
  relationship_type: string;
  relationship_strength?: number | null;
  last_contacted_at?: string | null;
  next_followup_at?: string | null;
  bio?: string | null;
  location?: string | null;
  custom_data: Record<string, unknown>;
  sources: string[];
  source_ids: Record<string, string>;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

/**
 * Social profile linked to a person (LinkedIn, Twitter, etc.)
 */
export interface SocialProfile {
  id: string;
  person_id: string;
  workspace_id: string;
  platform: string;
  profile_url?: string | null;
  username?: string | null;
  metadata: Record<string, unknown>;
  verified: boolean;
  created_at: string;
}

/**
 * Company — an organization tracked in the CRM
 */
export interface Company {
  id: string;
  workspace_id: string;
  name: string;
  domain?: string | null;
  website?: string | null;
  industry?: string | null;
  location?: string | null;
  description?: string | null;
  logo_url?: string | null;
  metadata: Record<string, unknown>;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

/**
 * Person-Company relationship (employment / affiliation)
 */
export interface PersonCompany {
  id: string;
  person_id: string;
  company_id: string;
  workspace_id: string;
  role?: string | null;
  department?: string | null;
  is_current: boolean;
  started_at?: string | null;
  ended_at?: string | null;
  created_at: string;
}

/**
 * Interaction — a logged meeting, email, call, etc.
 */
export interface Interaction {
  id: string;
  workspace_id: string;
  interaction_type: string;
  direction?: string | null;
  subject?: string | null;
  content?: string | null;
  summary?: string | null;
  occurred_at: string;
  duration_minutes?: number | null;
  source_integration?: string | null;
  source_id?: string | null;
  source_url?: string | null;
  metadata: Record<string, unknown>;
  embedding?: number[] | null;
  created_at: string;
}

/**
 * Join table linking interactions to people with a role (sender, recipient, etc.)
 */
export interface InteractionPerson {
  id: string;
  interaction_id: string;
  person_id: string;
  workspace_id: string;
  role: string;
}

/**
 * Tag for categorizing people, companies, etc.
 */
export interface Tag {
  id: string;
  workspace_id: string;
  name: string;
  color?: string | null;
  created_at: string;
}

/**
 * Note attached to a person or company
 */
export interface Note {
  id: string;
  workspace_id: string;
  person_id?: string | null;
  company_id?: string | null;
  content: string;
  embedding?: number[] | null;
  created_at: string;
  updated_at: string;
}

// =============================================================================
// INTEGRATIONS & SYNC
// =============================================================================

/**
 * Third-party integration (e.g. Google, LinkedIn)
 */
export interface Integration {
  id: string;
  workspace_id: string;
  provider: string;
  status: string;
  access_token_encrypted?: string | null;
  refresh_token_encrypted?: string | null;
  token_expires_at?: string | null;
  last_synced_at?: string | null;
  sync_cursor: Record<string, unknown>;
  sync_config: Record<string, unknown>;
  account_email?: string | null;
  account_name?: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

/**
 * Sync log entry for tracking integration sync runs
 */
export interface SyncLog {
  id: string;
  integration_id: string;
  workspace_id: string;
  status: string;
  items_synced: number;
  items_created: number;
  items_updated: number;
  error_message?: string | null;
  started_at: string;
  completed_at?: string | null;
}

// =============================================================================
// IMPORT TYPES
// =============================================================================

/**
 * Import record for tracking import progress
 */
export interface ImportRecord {
  id: string;
  workspace_id: string;
  import_type: 'csv_people';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  file_name?: string | null;
  file_size?: number | null;
  progress: ImportProgress;
  result: ImportResult;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ImportProgress {
  step: 'queued' | 'uploading' | 'processing' | 'complete' | 'error';
  processed: number;
  total: number;
  peopleCreated?: number;
  peopleUpdated?: number;
  message?: string;
}

export interface ImportResult {
  uploadId?: string;
  processed?: number;
  people_created?: number;
  people_updated?: number;
  errors?: string[];
}

// =============================================================================
// CSV IMPORT TYPES
// =============================================================================

export interface CSVAnalyzeResponse {
  columns: string[];
  sample_rows: Record<string, string>[];
  row_count: number;
  suggested_mappings: CSVColumnMapping[];
}

export interface CSVColumnMapping {
  csv_column: string;
  maps_to: string; // 'email' | 'first_name' | 'last_name' | 'skip' | custom key
  is_system_field: boolean;
}

export interface CSVProcessRequest {
  upload_id: string;
  mappings: CSVColumnMapping[];
}

export interface CSVProcessResponse {
  success: boolean;
  people_created: number;
  people_updated: number;
  errors: string[];
}

// =============================================================================
// SEARCH TYPES
// =============================================================================

export interface SearchRequest {
  query: string;
  entity_types?: ('people' | 'companies' | 'interactions' | 'notes')[];
  filters?: {
    relationship_type?: string;
    interaction_type?: string;
    date_after?: string;
    date_before?: string;
    tag?: string;
  };
  limit?: number;
}

export interface SearchResult {
  type: 'person' | 'company' | 'interaction' | 'note';
  score: number;
  data: Person | Company | Interaction | Note;
}

export interface SearchResponse {
  results: SearchResult[];
}

// =============================================================================
// AGENT TOOL TYPES
// =============================================================================

export interface AgentToolCall {
  name: string;
  arguments: Record<string, unknown>;
}

export interface SearchPeopleArgs {
  query: string;
  relationship_type?: string;
  tags?: string[];
  has_email?: boolean;
  limit?: number;
}

export interface SearchCompaniesArgs {
  query: string;
  industry?: string;
  has_people?: boolean;
  limit?: number;
}

export interface SearchInteractionsArgs {
  query: string;
  interaction_type?: string;
  direction?: string;
  date_from?: string;
  date_to?: string;
  person_id?: string;
  limit?: number;
}
