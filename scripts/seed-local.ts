/**
 * Seed local Supabase with a dev user and workspace membership.
 *
 * Usage:
 *   npx tsx scripts/seed-local.ts
 *   npx tsx scripts/seed-local.ts --email dev@local.test --password devpassword
 */

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });
config();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('Missing env vars: NEXT_PUBLIC_SUPABASE_URL/SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY required');
  process.exit(1);
}

const isLocal = supabaseUrl.includes('127.0.0.1') || supabaseUrl.includes('localhost');
if (!isLocal) {
  console.error(`Refusing to seed non-local Supabase URL: ${supabaseUrl}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const emailArgIndex = args.indexOf('--email');
const passwordArgIndex = args.indexOf('--password');
const email = emailArgIndex >= 0 ? args[emailArgIndex + 1] : 'dev@local.test';
const password = passwordArgIndex >= 0 ? args[passwordArgIndex + 1] : 'devpassword';

if (!email || !password) {
  console.error('Usage: npx tsx scripts/seed-local.ts --email <email> --password <password>');
  process.exit(1);
}

const WORKSPACE_ID = '11111111-1111-1111-1111-111111111111';
const WORKSPACE_SLUG = 'local-demo';
const WORKSPACE_NAME = 'Local Demo Workspace';

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

async function ensureWorkspace() {
  const { error } = await supabase
    .from('workspaces')
    .upsert({ id: WORKSPACE_ID, slug: WORKSPACE_SLUG, name: WORKSPACE_NAME }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to upsert workspace:', error);
    process.exit(1);
  }
}

async function ensureUser() {
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });

  if (error) {
    if (error.code === 'email_exists') {
      const { data: existing } = await supabase.auth.admin.listUsers();
      const user = existing?.users?.find(u => u.email === email);
      return user?.id;
    }

    console.error('Failed to create user:', error);
    process.exit(1);
  }

  return data.user?.id;
}

async function ensureProfile(userId: string) {
  const { error } = await supabase
    .from('profiles')
    .upsert({ id: userId, role: 'user' }, { onConflict: 'id' });

  if (error) {
    console.error('Failed to upsert profile:', error);
    process.exit(1);
  }
}

async function ensureMembership(userId: string) {
  const { error } = await supabase
    .from('workspace_members')
    .upsert({ user_id: userId, workspace_id: WORKSPACE_ID, role: 'owner' }, { onConflict: 'user_id,workspace_id' });

  if (error) {
    console.error('Failed to upsert workspace member:', error);
    process.exit(1);
  }
}

async function run() {
  await ensureWorkspace();
  const userId = await ensureUser();
  if (!userId) {
    console.error('Failed to resolve user ID for seed user.');
    process.exit(1);
  }

  await ensureProfile(userId);
  await ensureMembership(userId);

  console.log('✅ Local seed complete');
  console.log(`User: ${email}`);
  console.log(`Password: ${password}`);
  console.log(`Workspace: ${WORKSPACE_NAME} (${WORKSPACE_ID})`);
}

run().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
