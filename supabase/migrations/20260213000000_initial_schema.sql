-- OpenFolio Initial Schema Migration
-- Created: 2026-02-13
-- Includes: Infrastructure tables + OpenFolio domain tables

-- ============================================================================
-- EXTENSIONS
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

-- ============================================================================
-- INFRASTRUCTURE TABLES
-- ============================================================================

-- Workspaces
CREATE TABLE workspaces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE,
    website TEXT,
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (synced from auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'user' CHECK (role = 'user'),
    email TEXT,
    full_name TEXT,
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workspace members (many-to-many users <-> workspaces)
CREATE TABLE workspace_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, workspace_id)
);

-- Workspace invites
CREATE TABLE workspace_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    role TEXT DEFAULT 'member' CHECK (role IN ('owner', 'member')),
    invited_by UUID REFERENCES auth.users(id),
    token_hash TEXT UNIQUE,
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- App-level invites (invite-only signup)
CREATE TABLE app_invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ,
    accepted_at TIMESTAMPTZ,
    invited_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_sent_at TIMESTAMPTZ
);

-- Waitlist entries
CREATE TABLE waitlist_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    reason TEXT,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'invited', 'rejected')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chats
CREATE TABLE chats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages
CREATE TABLE chat_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id UUID NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id UUID REFERENCES auth.users(id),
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT,
    tool_calls JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Import records
CREATE TABLE import_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    import_type TEXT NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    file_name TEXT,
    file_size BIGINT,
    progress JSONB DEFAULT '{}',
    result JSONB DEFAULT '{}',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

-- ============================================================================
-- OPENFOLIO DOMAIN TABLES
-- ============================================================================

-- People: unified contact directory
CREATE TABLE people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    email TEXT,
    phone TEXT,
    first_name TEXT,
    last_name TEXT,
    display_name TEXT,
    avatar_url TEXT,
    relationship_type TEXT DEFAULT 'contact',
    relationship_strength REAL,
    last_contacted_at TIMESTAMPTZ,
    next_followup_at TIMESTAMPTZ,
    bio TEXT,
    location TEXT,
    custom_data JSONB DEFAULT '{}',
    sources TEXT[] DEFAULT '{}',
    source_ids JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, email)
);

-- Social profiles
CREATE TABLE social_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    platform TEXT NOT NULL,
    profile_url TEXT,
    username TEXT,
    metadata JSONB DEFAULT '{}',
    verified BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, person_id, platform, username)
);

-- Companies
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    domain TEXT,
    website TEXT,
    industry TEXT,
    location TEXT,
    description TEXT,
    logo_url TEXT,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Person <-> Company
CREATE TABLE person_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT,
    department TEXT,
    is_current BOOLEAN DEFAULT TRUE,
    started_at TIMESTAMPTZ,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(person_id, company_id, role)
);

-- Interactions
CREATE TABLE interactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    interaction_type TEXT NOT NULL,
    direction TEXT,
    subject TEXT,
    content TEXT,
    summary TEXT,
    occurred_at TIMESTAMPTZ NOT NULL,
    duration_minutes INTEGER,
    source_integration TEXT,
    source_id TEXT,
    source_url TEXT,
    metadata JSONB DEFAULT '{}',
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, source_integration, source_id)
);

-- Interaction <-> Person
CREATE TABLE interaction_people (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    interaction_id UUID NOT NULL REFERENCES interactions(id) ON DELETE CASCADE,
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    role TEXT DEFAULT 'participant',
    UNIQUE(interaction_id, person_id, role)
);

-- Tags
CREATE TABLE tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, name)
);

-- Person <-> Tag
CREATE TABLE person_tags (
    person_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (person_id, tag_id)
);

-- Company <-> Tag
CREATE TABLE company_tags (
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    PRIMARY KEY (company_id, tag_id)
);

-- Notes
CREATE TABLE notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    person_id UUID REFERENCES people(id) ON DELETE CASCADE,
    company_id UUID REFERENCES companies(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    embedding VECTOR(1536),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CHECK (person_id IS NOT NULL OR company_id IS NOT NULL)
);

-- Integrations
CREATE TABLE integrations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    status TEXT DEFAULT 'active',
    access_token_encrypted TEXT,
    refresh_token_encrypted TEXT,
    token_expires_at TIMESTAMPTZ,
    last_synced_at TIMESTAMPTZ,
    sync_cursor JSONB DEFAULT '{}',
    sync_config JSONB DEFAULT '{}',
    account_email TEXT,
    account_name TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(workspace_id, provider, account_email)
);

-- Sync logs
CREATE TABLE sync_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    integration_id UUID NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    status TEXT NOT NULL,
    items_synced INTEGER DEFAULT 0,
    items_created INTEGER DEFAULT 0,
    items_updated INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ
);

CREATE TABLE duplicate_candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    person_a_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    person_b_id UUID NOT NULL REFERENCES people(id) ON DELETE CASCADE,
    confidence NUMERIC(3,2) NOT NULL DEFAULT 0,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Get workspace IDs for a user (used in RLS policies)
CREATE OR REPLACE FUNCTION get_user_workspace_ids(user_uuid UUID)
RETURNS SETOF UUID
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT workspace_id FROM workspace_members WHERE user_id = user_uuid;
$$;

-- Check if user is workspace owner
CREATE OR REPLACE FUNCTION is_workspace_owner(user_uuid UUID, ws_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS(
    SELECT 1 FROM workspace_members
    WHERE user_id = user_uuid AND workspace_id = ws_id AND role = 'owner'
  );
$$;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', '')
  );
  RETURN NEW;
END;
$$;

-- Only create trigger if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
    CREATE TRIGGER on_auth_user_created
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_user();
  END IF;
END
$$;

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Apply updated_at triggers
CREATE TRIGGER update_people_updated_at BEFORE UPDATE ON people FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_notes_updated_at BEFORE UPDATE ON notes FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_integrations_updated_at BEFORE UPDATE ON integrations FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON chats FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER update_workspaces_updated_at BEFORE UPDATE ON workspaces FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Execute readonly SQL (for AI agent)
-- Note: uses SECURITY INVOKER so RLS policies apply to the calling user
CREATE OR REPLACE FUNCTION execute_readonly_query(query_text TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  result JSONB;
  row_count INTEGER;
BEGIN
  EXECUTE 'SELECT COALESCE(jsonb_agg(row_to_json(t)), ''[]''::jsonb) FROM (' || query_text || ') t'
    INTO result;
  row_count := jsonb_array_length(result);
  RETURN jsonb_build_object('results', result, 'row_count', row_count);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('error', SQLERRM, 'detail', SQLSTATE);
END;
$$;

-- List table columns (for AI agent schema introspection)
CREATE OR REPLACE FUNCTION list_table_columns()
RETURNS TABLE(table_name TEXT, column_name TEXT, data_type TEXT, is_nullable TEXT)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT c.table_name::TEXT, c.column_name::TEXT, c.data_type::TEXT, c.is_nullable::TEXT
  FROM information_schema.columns c
  WHERE c.table_schema = 'public'
  ORDER BY c.table_name, c.ordinal_position;
$$;

-- List JSON keys for a column (for AI agent)
CREATE OR REPLACE FUNCTION list_json_keys(p_table TEXT, p_column TEXT, p_workspace_id UUID DEFAULT NULL)
RETURNS TABLE(key TEXT, count BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_workspace_id IS NOT NULL THEN
    RETURN QUERY EXECUTE format(
      'SELECT k::TEXT, COUNT(*)::BIGINT FROM public.%I t, jsonb_object_keys(t.%I) k WHERE t.workspace_id = $1 GROUP BY k ORDER BY count DESC',
      p_table, p_column
    ) USING p_workspace_id;
  ELSE
    RETURN QUERY EXECUTE format(
      'SELECT k::TEXT, COUNT(*)::BIGINT FROM public.%I t, jsonb_object_keys(t.%I) k GROUP BY k ORDER BY count DESC',
      p_table, p_column
    );
  END IF;
END;
$$;

-- Reload PostgREST schema cache
CREATE OR REPLACE FUNCTION reload_pgrst_schema()
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pg_notify('pgrst', 'reload schema');
$$;

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

-- Enable RLS on all tables
ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_invites ENABLE ROW LEVEL SECURITY;
ALTER TABLE waitlist_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE chats ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE people ENABLE ROW LEVEL SECURITY;
ALTER TABLE social_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE interaction_people ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE company_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE duplicate_candidates ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own profile
CREATE POLICY "profiles select own" ON profiles FOR SELECT USING (id = auth.uid());
CREATE POLICY "profiles update own" ON profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Workspaces: members can read and update
CREATE POLICY "workspaces select" ON workspaces FOR SELECT
    USING (id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "workspaces update" ON workspaces FOR UPDATE
    USING (id IN (SELECT get_user_workspace_ids(auth.uid())));

-- Workspace members: can see members of own workspaces
CREATE POLICY "workspace_members select" ON workspace_members FOR SELECT
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "workspace_members insert" ON workspace_members FOR INSERT
    WITH CHECK (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "workspace_members delete" ON workspace_members FOR DELETE
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));

-- Workspace invites
CREATE POLICY "workspace_invites workspace" ON workspace_invites FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));

-- App invites: public read for token verification
CREATE POLICY "app_invites select" ON app_invites FOR SELECT USING (true);

-- Waitlist: public insert and select
CREATE POLICY "waitlist_entries insert" ON waitlist_entries FOR INSERT WITH CHECK (true);
CREATE POLICY "waitlist_entries select" ON waitlist_entries FOR SELECT USING (true);

-- Standard workspace isolation for all domain tables
CREATE POLICY "people workspace isolation" ON people FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "social_profiles workspace isolation" ON social_profiles FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "companies workspace isolation" ON companies FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "person_companies workspace isolation" ON person_companies FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "interactions workspace isolation" ON interactions FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "interaction_people workspace isolation" ON interaction_people FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "tags workspace isolation" ON tags FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "person_tags workspace isolation" ON person_tags FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "company_tags workspace isolation" ON company_tags FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "notes workspace isolation" ON notes FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "integrations workspace isolation" ON integrations FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "sync_logs workspace isolation" ON sync_logs FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "chats workspace isolation" ON chats FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "chat_messages workspace isolation" ON chat_messages FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "import_records workspace isolation" ON import_records FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));
CREATE POLICY "duplicate_candidates workspace isolation" ON duplicate_candidates FOR ALL
    USING (workspace_id IN (SELECT get_user_workspace_ids(auth.uid())));

-- ============================================================================
-- VECTOR SEARCH FUNCTIONS
-- ============================================================================

-- Match people by embedding similarity
CREATE OR REPLACE FUNCTION match_people_text(
    query_embedding TEXT,
    match_threshold FLOAT,
    match_count INT,
    p_workspace_id UUID
)
RETURNS TABLE(
    id UUID, workspace_id UUID, email TEXT, phone TEXT,
    first_name TEXT, last_name TEXT, display_name TEXT, avatar_url TEXT,
    relationship_type TEXT, relationship_strength REAL,
    last_contacted_at TIMESTAMPTZ, bio TEXT, location TEXT,
    custom_data JSONB, sources TEXT[], source_ids JSONB,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id, p.workspace_id, p.email, p.phone,
        p.first_name, p.last_name, p.display_name, p.avatar_url,
        p.relationship_type, p.relationship_strength,
        p.last_contacted_at, p.bio, p.location,
        p.custom_data, p.sources, p.source_ids,
        p.created_at, p.updated_at,
        (1 - (p.embedding <=> query_embedding::vector))::FLOAT AS similarity
    FROM people p
    WHERE p.workspace_id = p_workspace_id
      AND p.embedding IS NOT NULL
      AND (1 - (p.embedding <=> query_embedding::vector)) > match_threshold
    ORDER BY p.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- Match companies
CREATE OR REPLACE FUNCTION match_companies_text(
    query_embedding TEXT,
    match_threshold FLOAT,
    match_count INT,
    p_workspace_id UUID
)
RETURNS TABLE(
    id UUID, workspace_id UUID, name TEXT, domain TEXT,
    website TEXT, industry TEXT, location TEXT, description TEXT,
    logo_url TEXT, metadata JSONB,
    created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        c.id, c.workspace_id, c.name, c.domain,
        c.website, c.industry, c.location, c.description,
        c.logo_url, c.metadata,
        c.created_at, c.updated_at,
        (1 - (c.embedding <=> query_embedding::vector))::FLOAT AS similarity
    FROM companies c
    WHERE c.workspace_id = p_workspace_id
      AND c.embedding IS NOT NULL
      AND (1 - (c.embedding <=> query_embedding::vector)) > match_threshold
    ORDER BY c.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- Match interactions
CREATE OR REPLACE FUNCTION match_interactions_text(
    query_embedding TEXT,
    match_threshold FLOAT,
    match_count INT,
    p_workspace_id UUID
)
RETURNS TABLE(
    id UUID, workspace_id UUID, interaction_type TEXT, direction TEXT,
    subject TEXT, content TEXT, summary TEXT,
    occurred_at TIMESTAMPTZ, duration_minutes INT,
    source_integration TEXT, source_id TEXT, source_url TEXT,
    metadata JSONB, created_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        i.id, i.workspace_id, i.interaction_type, i.direction,
        i.subject, i.content, i.summary,
        i.occurred_at, i.duration_minutes,
        i.source_integration, i.source_id, i.source_url,
        i.metadata, i.created_at,
        (1 - (i.embedding <=> query_embedding::vector))::FLOAT AS similarity
    FROM interactions i
    WHERE i.workspace_id = p_workspace_id
      AND i.embedding IS NOT NULL
      AND (1 - (i.embedding <=> query_embedding::vector)) > match_threshold
    ORDER BY i.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- Match notes
CREATE OR REPLACE FUNCTION match_notes_text(
    query_embedding TEXT,
    match_threshold FLOAT,
    match_count INT,
    p_workspace_id UUID
)
RETURNS TABLE(
    id UUID, workspace_id UUID, person_id UUID, company_id UUID,
    content TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ,
    similarity FLOAT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        n.id, n.workspace_id, n.person_id, n.company_id,
        n.content, n.created_at, n.updated_at,
        (1 - (n.embedding <=> query_embedding::vector))::FLOAT AS similarity
    FROM notes n
    WHERE n.workspace_id = p_workspace_id
      AND n.embedding IS NOT NULL
      AND (1 - (n.embedding <=> query_embedding::vector)) > match_threshold
    ORDER BY n.embedding <=> query_embedding::vector
    LIMIT match_count;
END;
$$;

-- ============================================================================
-- INDEXES
-- ============================================================================

-- Workspace lookups
CREATE INDEX idx_people_workspace ON people(workspace_id);
CREATE INDEX idx_companies_workspace ON companies(workspace_id);
CREATE INDEX idx_interactions_workspace ON interactions(workspace_id);
CREATE INDEX idx_tags_workspace ON tags(workspace_id);
CREATE INDEX idx_notes_workspace ON notes(workspace_id);
CREATE INDEX idx_social_profiles_workspace ON social_profiles(workspace_id);
CREATE INDEX idx_person_companies_workspace ON person_companies(workspace_id);
CREATE INDEX idx_interaction_people_workspace ON interaction_people(workspace_id);
CREATE INDEX idx_integrations_workspace ON integrations(workspace_id);
CREATE INDEX idx_sync_logs_workspace ON sync_logs(workspace_id);
CREATE INDEX idx_duplicate_candidates_workspace ON duplicate_candidates(workspace_id);
CREATE INDEX idx_duplicate_candidates_status ON duplicate_candidates(workspace_id, status);
CREATE INDEX idx_chats_workspace ON chats(workspace_id);
CREATE INDEX idx_chat_messages_chat ON chat_messages(chat_id);
CREATE INDEX idx_import_records_workspace ON import_records(workspace_id);

-- People lookups
CREATE INDEX idx_people_email ON people(workspace_id, email);
CREATE INDEX idx_people_name ON people(workspace_id, last_name, first_name);
CREATE INDEX idx_people_relationship_type ON people(workspace_id, relationship_type);
CREATE INDEX idx_people_last_contacted ON people(workspace_id, last_contacted_at DESC NULLS LAST);

-- Interactions lookups
CREATE INDEX idx_interactions_occurred ON interactions(workspace_id, occurred_at DESC);
CREATE INDEX idx_interactions_type ON interactions(workspace_id, interaction_type);
CREATE INDEX idx_interaction_people_person ON interaction_people(person_id);
CREATE INDEX idx_interaction_people_interaction ON interaction_people(interaction_id);

-- Person company lookups
CREATE INDEX idx_person_companies_person ON person_companies(person_id);
CREATE INDEX idx_person_companies_company ON person_companies(company_id);

-- Social profile lookups
CREATE INDEX idx_social_profiles_person ON social_profiles(person_id);

-- Note lookups
CREATE INDEX idx_notes_person ON notes(person_id);
CREATE INDEX idx_notes_company ON notes(company_id);

-- Tag lookups
CREATE INDEX idx_person_tags_person ON person_tags(person_id);
CREATE INDEX idx_person_tags_tag ON person_tags(tag_id);
CREATE INDEX idx_company_tags_company ON company_tags(company_id);
CREATE INDEX idx_company_tags_tag ON company_tags(tag_id);

-- Workspace members
CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_workspace_members_workspace ON workspace_members(workspace_id);

-- Vector similarity search indexes (ivfflat with cosine distance)
CREATE INDEX idx_people_embedding ON people USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_companies_embedding ON companies USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_interactions_embedding ON interactions USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
CREATE INDEX idx_notes_embedding ON notes USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- ============================================================================
-- STORAGE
-- ============================================================================

-- Storage bucket for imports
INSERT INTO storage.buckets (id, name, public)
VALUES ('imports', 'imports', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy for imports bucket
CREATE POLICY "imports_bucket_access" ON storage.objects FOR ALL
    USING (bucket_id = 'imports');
