-- Add automatic sync controls to integrations
ALTER TABLE integrations
  ADD COLUMN auto_sync_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN auto_sync_time_local TIME NOT NULL DEFAULT '02:00:00',
  ADD COLUMN auto_sync_timezone TEXT,
  ADD COLUMN last_sync_error TEXT;

-- Move to one integration account per provider per workspace
ALTER TABLE integrations DROP CONSTRAINT IF EXISTS integrations_workspace_id_provider_account_email_key;
ALTER TABLE integrations ADD CONSTRAINT integrations_workspace_id_provider_key UNIQUE (workspace_id, provider);

-- Improve filtering performance for scheduler
CREATE INDEX IF NOT EXISTS idx_integrations_workspace_auto_sync_status
  ON integrations(workspace_id, auto_sync_enabled, status);
