CREATE TABLE IF NOT EXISTS instance_settings (
  id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
  default_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  default_workspace_id UUID REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_instance_settings_updated_at
  BEFORE UPDATE ON instance_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();

ALTER TABLE instance_settings ENABLE ROW LEVEL SECURITY;

