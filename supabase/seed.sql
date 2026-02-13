-- OpenFolio Local Seed Data
-- For local development only. Use scripts/seed-local.ts to create auth user + membership.
-- Does NOT reference auth.users — only populates domain tables.

-- ============================================================================
-- DEMO WORKSPACE
-- ============================================================================

INSERT INTO workspaces (id, name, slug, website, settings) VALUES
('00000000-0000-0000-0000-000000000001', 'Demo Workspace', 'demo', 'https://demo.openfolio.dev', '{}')
ON CONFLICT (id) DO NOTHING;

-- ============================================================================
-- TAGS
-- ============================================================================

INSERT INTO tags (id, workspace_id, name, color) VALUES
('a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'investor', '#10B981'),
('a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'friend', '#3B82F6'),
('a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'colleague', '#8B5CF6'),
('a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'tech', '#F59E0B'),
('a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'ai', '#EF4444'),
('a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'design', '#EC4899'),
('a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'founder', '#14B8A6'),
('a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'mentor', '#F97316'),
('a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'hiring', '#6366F1'),
('a0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'warm-intro', '#06B6D4')
ON CONFLICT (workspace_id, name) DO NOTHING;

-- ============================================================================
-- COMPANIES
-- ============================================================================

INSERT INTO companies (id, workspace_id, name, domain, website, industry, location, description, metadata) VALUES
('c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'Anthropic', 'anthropic.com', 'https://anthropic.com', 'AI Safety', 'San Francisco, CA',
 'AI safety company building reliable, interpretable, and steerable AI systems.',
 '{"founded": 2021, "employees_range": "500-1000"}'),
('c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'Google', 'google.com', 'https://google.com', 'Technology', 'Mountain View, CA',
 'Multinational technology company focusing on search, cloud computing, and AI.',
 '{"founded": 1998, "employees_range": "100000+"}'),
('c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'Stripe', 'stripe.com', 'https://stripe.com', 'Fintech', 'San Francisco, CA',
 'Financial infrastructure platform for the internet economy.',
 '{"founded": 2010, "employees_range": "5000-10000"}'),
('c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'OpenAI', 'openai.com', 'https://openai.com', 'AI Research', 'San Francisco, CA',
 'AI research and deployment company focused on ensuring AGI benefits all of humanity.',
 '{"founded": 2015, "employees_range": "1000-5000"}'),
('c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'Vercel', 'vercel.com', 'https://vercel.com', 'Developer Tools', 'San Francisco, CA',
 'Platform for frontend developers, providing tools for building and deploying web applications.',
 '{"founded": 2015, "employees_range": "500-1000"}')
ON CONFLICT (workspace_id, name) DO NOTHING;

-- ============================================================================
-- PEOPLE (15 varied contacts)
-- ============================================================================

INSERT INTO people (id, workspace_id, email, phone, first_name, last_name, display_name, relationship_type, relationship_strength, last_contacted_at, next_followup_at, bio, location, custom_data, sources, source_ids) VALUES
-- 1. Close colleague at Anthropic
('d0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'sarah.chen@example.com', '+1-415-555-0101', 'Sarah', 'Chen', 'Sarah Chen',
 'colleague', 0.92, '2026-02-10 14:30:00+00', '2026-02-17 10:00:00+00',
 'Senior Research Scientist at Anthropic. Works on constitutional AI and RLHF.',
 'San Francisco, CA', '{"title": "Senior Research Scientist", "interests": ["AI safety", "alignment"]}',
 ARRAY['manual'], '{}'),

-- 2. Investor contact
('d0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'marcus.johnson@example.com', '+1-650-555-0102', 'Marcus', 'Johnson', 'Marcus Johnson',
 'investor', 0.75, '2026-01-28 11:00:00+00', '2026-02-28 09:00:00+00',
 'Partner at Sequoia Capital. Focuses on AI and infrastructure deals.',
 'Menlo Park, CA', '{"title": "Partner", "fund": "Sequoia Capital", "check_size": "$5M-$50M"}',
 ARRAY['linkedin'], '{"linkedin": "marcus-johnson-seq"}'),

-- 3. Friend from Google
('d0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'priya.patel@example.com', NULL, 'Priya', 'Patel', 'Priya Patel',
 'friend', 0.88, '2026-02-08 18:00:00+00', NULL,
 'Staff Engineer at Google DeepMind. Previously at Meta AI Research.',
 'Mountain View, CA', '{"title": "Staff Engineer", "interests": ["LLMs", "multimodal AI", "climbing"]}',
 ARRAY['gmail'], '{"gmail": "priya.patel@example.com"}'),

-- 4. Stripe engineer - potential hire
('d0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'alex.rivera@example.com', '+1-415-555-0104', 'Alex', 'Rivera', 'Alex Rivera',
 'contact', 0.65, '2026-01-15 16:00:00+00', '2026-02-20 14:00:00+00',
 'Senior Software Engineer at Stripe. Full-stack with focus on payment infrastructure.',
 'San Francisco, CA', '{"title": "Senior Software Engineer", "years_experience": 8}',
 ARRAY['csv_upload'], '{}'),

-- 5. Designer friend
('d0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'emma.wright@example.com', NULL, 'Emma', 'Wright', 'Emma Wright',
 'friend', 0.80, '2026-02-05 12:00:00+00', NULL,
 'Freelance product designer. Previously at Figma and Notion.',
 'Brooklyn, NY', '{"title": "Product Designer", "portfolio": "emmawright.design", "interests": ["design systems", "accessibility"]}',
 ARRAY['manual'], '{}'),

-- 6. OpenAI researcher
('d0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 'david.kim@example.com', '+1-415-555-0106', 'David', 'Kim', 'David Kim',
 'colleague', 0.70, '2026-01-20 10:00:00+00', '2026-03-01 10:00:00+00',
 'Research Engineer at OpenAI working on tool use and agent frameworks.',
 'San Francisco, CA', '{"title": "Research Engineer", "interests": ["agents", "tool use", "code generation"]}',
 ARRAY['linkedin', 'manual'], '{"linkedin": "davidkim-oai"}'),

-- 7. Vercel DevRel
('d0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
 'lena.morales@example.com', NULL, 'Lena', 'Morales', 'Lena Morales',
 'contact', 0.55, '2026-01-10 15:00:00+00', NULL,
 'Developer Relations Engineer at Vercel. Runs Next.js community events.',
 'Austin, TX', '{"title": "DevRel Engineer", "interests": ["Next.js", "React", "edge computing"]}',
 ARRAY['twitter'], '{"twitter": "@lenamorales_dev"}'),

-- 8. Mentor - seasoned exec
('d0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
 'robert.tanaka@example.com', '+1-510-555-0108', 'Robert', 'Tanaka', 'Robert Tanaka',
 'mentor', 0.95, '2026-02-12 09:00:00+00', '2026-02-19 09:00:00+00',
 'Former CTO of Notion. Angel investor and startup advisor.',
 'Berkeley, CA', '{"title": "Angel Investor / Advisor", "investments": 24, "interests": ["SaaS", "AI", "dev tools"]}',
 ARRAY['manual'], '{}'),

-- 9. Founder friend
('d0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
 'jasmine.okafor@example.com', '+1-212-555-0109', 'Jasmine', 'Okafor', 'Jasmine Okafor',
 'friend', 0.82, '2026-02-01 17:00:00+00', '2026-02-25 11:00:00+00',
 'CEO and co-founder of Lumina AI. YC W24 batch. Building AI-native analytics.',
 'New York, NY', '{"title": "CEO & Co-founder", "company": "Lumina AI", "funding_stage": "Series A"}',
 ARRAY['manual', 'gmail'], '{"gmail": "jasmine.okafor@example.com"}'),

-- 10. Phone-only contact (met at event)
('d0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 NULL, '+1-408-555-0110', 'Tom', 'Nakamura', 'Tom Nakamura',
 'contact', 0.30, '2026-01-05 20:00:00+00', NULL,
 'VP of Engineering at a stealth startup. Met at NeurIPS afterparty.',
 'San Jose, CA', '{"title": "VP Engineering", "context": "Met at NeurIPS 2025 afterparty"}',
 ARRAY['manual'], '{}'),

-- 11. Recruiter
('d0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
 'claire.dubois@example.com', '+1-415-555-0111', 'Claire', 'Dubois', 'Claire Dubois',
 'contact', 0.45, '2026-01-22 13:00:00+00', NULL,
 'Technical recruiter specializing in AI/ML roles at top-tier companies.',
 'San Francisco, CA', '{"title": "Senior Technical Recruiter", "company": "TalentSearch"}',
 ARRAY['linkedin'], '{"linkedin": "claire-dubois-recruit"}'),

-- 12. Old college friend at Google
('d0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001',
 'james.liu@example.com', '+1-408-555-0112', 'James', 'Liu', 'James Liu',
 'friend', 0.72, '2025-12-15 19:00:00+00', '2026-03-15 18:00:00+00',
 'Product Manager at Google Cloud. Stanford CS class of 2018.',
 'Sunnyvale, CA', '{"title": "Product Manager", "interests": ["cloud infrastructure", "basketball", "cooking"]}',
 ARRAY['manual', 'gmail'], '{"gmail": "james.liu@example.com"}'),

-- 13. Conference speaker contact
('d0000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001',
 'ana.kowalski@example.com', NULL, 'Ana', 'Kowalski', 'Dr. Ana Kowalski',
 'contact', 0.40, '2026-01-30 11:30:00+00', NULL,
 'Assistant Professor at MIT CSAIL. Research focus on human-AI interaction.',
 'Cambridge, MA', '{"title": "Assistant Professor", "institution": "MIT CSAIL", "interests": ["HCI", "AI UX", "user studies"]}',
 ARRAY['manual'], '{}'),

-- 14. Co-founder prospect
('d0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001',
 'nina.zhang@example.com', '+1-650-555-0114', 'Nina', 'Zhang', 'Nina Zhang',
 'colleague', 0.85, '2026-02-11 16:00:00+00', '2026-02-14 10:00:00+00',
 'Ex-Stripe tech lead. Interested in building something new in the AI infrastructure space.',
 'Palo Alto, CA', '{"title": "Independent", "previous_company": "Stripe", "years_experience": 10}',
 ARRAY['manual', 'linkedin'], '{"linkedin": "nina-zhang-eng"}'),

-- 15. Casual acquaintance from community
('d0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001',
 'omar.hassan@example.com', NULL, 'Omar', 'Hassan', 'Omar Hassan',
 'contact', 0.25, '2025-11-20 14:00:00+00', NULL,
 'Independent developer and open source contributor. Active in the Supabase community.',
 'Portland, OR', '{"title": "Indie Developer", "interests": ["open source", "Supabase", "Rust"]}',
 ARRAY['twitter'], '{"twitter": "@omarhassan_dev"}')
ON CONFLICT (workspace_id, email) DO NOTHING;

-- ============================================================================
-- PERSON <-> COMPANY ASSOCIATIONS
-- ============================================================================

INSERT INTO person_companies (id, person_id, company_id, workspace_id, role, department, is_current) VALUES
('bc000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'Senior Research Scientist', 'Research', TRUE),
('bc000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Staff Engineer', 'DeepMind', TRUE),
('bc000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004', 'c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Senior Software Engineer', 'Payments', TRUE),
('bc000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000006', 'c0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'Research Engineer', 'Core Research', TRUE),
('bc000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000007', 'c0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'DevRel Engineer', 'Developer Experience', TRUE),
('bc000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000012', 'c0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'Product Manager', 'Cloud', TRUE),
('bc000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000014', 'c0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'Tech Lead', 'Platform', FALSE)
ON CONFLICT (person_id, company_id, role) DO NOTHING;

-- ============================================================================
-- SOCIAL PROFILES
-- ============================================================================

INSERT INTO social_profiles (id, person_id, workspace_id, platform, profile_url, username, verified) VALUES
('5b000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'linkedin', 'https://linkedin.com/in/sarah-chen-ai', 'sarah-chen-ai', TRUE),
('5b000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'twitter', 'https://x.com/sarahchen_ml', '@sarahchen_ml', FALSE),
('5b000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'linkedin', 'https://linkedin.com/in/marcus-johnson-seq', 'marcus-johnson-seq', TRUE),
('5b000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'twitter', 'https://x.com/emmawright_', '@emmawright_', FALSE),
('5b000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'dribbble', 'https://dribbble.com/emmawright', 'emmawright', FALSE),
('5b000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'twitter', 'https://x.com/lenamorales_dev', '@lenamorales_dev', TRUE),
('5b000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'github', 'https://github.com/lenamorales', 'lenamorales', FALSE),
('5b000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'linkedin', 'https://linkedin.com/in/jasmine-okafor', 'jasmine-okafor', TRUE),
('5b000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'twitter', 'https://x.com/jasmineokafor', '@jasmineokafor', TRUE),
('5b000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'linkedin', 'https://linkedin.com/in/nina-zhang-eng', 'nina-zhang-eng', TRUE),
('5b000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'twitter', 'https://x.com/omarhassan_dev', '@omarhassan_dev', FALSE),
('5b000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001', 'github', 'https://github.com/omarhassan', 'omarhassan', FALSE)
ON CONFLICT (workspace_id, person_id, platform, username) DO NOTHING;

-- ============================================================================
-- PERSON <-> TAG ASSOCIATIONS
-- ============================================================================

INSERT INTO person_tags (person_id, tag_id, workspace_id) VALUES
-- Sarah Chen: colleague, ai, tech
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Marcus Johnson: investor, warm-intro
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001'),
-- Priya Patel: friend, ai, tech
('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Alex Rivera: hiring, tech
('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Emma Wright: friend, design
('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001'),
-- David Kim: colleague, ai
('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
-- Lena Morales: tech
('d0000000-0000-0000-0000-000000000007', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Robert Tanaka: mentor, investor, tech
('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000008', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Jasmine Okafor: founder, friend, ai
('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000009', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
-- Nina Zhang: colleague, hiring, tech
('d0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001'),
('d0000000-0000-0000-0000-000000000014', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Omar Hassan: tech
('d0000000-0000-0000-0000-000000000015', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (person_id, tag_id) DO NOTHING;

-- ============================================================================
-- COMPANY <-> TAG ASSOCIATIONS
-- ============================================================================

INSERT INTO company_tags (company_id, tag_id, workspace_id) VALUES
-- Anthropic: ai, tech
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Google: ai, tech
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Stripe: tech
('c0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- OpenAI: ai, tech
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001'),
('c0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001'),
-- Vercel: tech
('c0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001')
ON CONFLICT (company_id, tag_id) DO NOTHING;

-- ============================================================================
-- INTERACTIONS (22 varied interactions)
-- ============================================================================

INSERT INTO interactions (id, workspace_id, interaction_type, direction, subject, content, summary, occurred_at, duration_minutes, source_integration, source_id, metadata) VALUES
-- Emails
('e0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'email', 'outbound', 'Follow up on alignment research paper',
 'Hi Sarah, great catching up yesterday. Wanted to share my thoughts on the constitutional AI paper you mentioned. I think the approach to reward hacking could be extended with...',
 'Followed up with Sarah about alignment research paper and shared thoughts on constitutional AI approaches.',
 '2026-02-10 14:30:00+00', NULL, 'gmail', 'msg-001', '{"thread_id": "thread-abc"}'),

('e0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'email', 'inbound', 'Re: Investment opportunity in AI infrastructure',
 'Thanks for the deck. The TAM analysis is compelling. I have a few questions about your go-to-market strategy and would love to discuss over a call next week.',
 'Marcus responded positively to investment deck and wants to schedule a call to discuss GTM strategy.',
 '2026-01-28 11:00:00+00', NULL, 'gmail', 'msg-002', '{"thread_id": "thread-def"}'),

('e0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'email', 'outbound', 'Intro to Jasmine Okafor (Lumina AI)',
 'Hi Marcus, wanted to introduce you to Jasmine Okafor, CEO of Lumina AI. They are building AI-native analytics and just closed their seed round. I think this could be interesting for Sequoia.',
 'Sent warm intro connecting Marcus (Sequoia) with Jasmine (Lumina AI) for potential Series A discussion.',
 '2026-02-02 09:00:00+00', NULL, 'gmail', 'msg-003', '{"thread_id": "thread-ghi"}'),

('e0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'email', 'inbound', 'Exciting role at Anthropic - Research Engineer',
 'Hi, I came across your profile and think you would be a great fit for a Research Engineer role at Anthropic. The team is working on...',
 'Claire (recruiter) reached out about a Research Engineer role at Anthropic.',
 '2026-01-22 13:00:00+00', NULL, 'gmail', 'msg-004', '{}'),

('e0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 'email', 'outbound', 'Checking in - how is the new role?',
 'Hey Alex, been a while since we connected. How is everything going at Stripe? I saw the new payment links feature launched - looks great!',
 'Reached out to Alex at Stripe to catch up and congratulate on the payment links launch.',
 '2026-01-15 16:00:00+00', NULL, 'gmail', 'msg-005', '{}'),

('e0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 'email', 'outbound', 'Design feedback on dashboard mockups',
 'Hi Emma, I just uploaded the latest dashboard mockups to Figma. Would love your honest feedback on the information hierarchy and color palette.',
 'Shared dashboard mockups with Emma for design feedback.',
 '2026-02-05 12:00:00+00', NULL, 'gmail', 'msg-006', '{"figma_link": "https://figma.com/file/..."}'),

-- Meetings
('e0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
 'meeting', 'none', 'Weekly mentorship call with Robert',
 'Discussed fundraising strategy, market positioning, and upcoming investor meetings. Robert suggested focusing the pitch on the data moat angle.',
 'Weekly mentor call. Robert advised focusing pitch on data moat and suggested connecting with 2 more VCs.',
 '2026-02-12 09:00:00+00', 45, 'calendar', 'cal-001', '{"meeting_url": "https://meet.google.com/abc-def"}'),

('e0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
 'meeting', 'none', 'Priya + David: AI agents brainstorm',
 'Three-way discussion about the current state of AI agents. Covered tool use, planning, and multi-agent coordination. Priya shared insights from DeepMind multimodal work.',
 'Brainstorm session on AI agents with Priya (Google) and David (OpenAI). Covered tool use and multi-agent coordination.',
 '2026-02-08 18:00:00+00', 60, 'calendar', 'cal-002', '{}'),

('e0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001',
 'meeting', 'none', 'Coffee chat with Nina Zhang',
 'Nina shared her experience leading the platform team at Stripe. She is exploring new opportunities and interested in building AI infrastructure. Discussed potential co-founding.',
 'Coffee with Nina. She is leaving Stripe and interested in co-founding something in AI infrastructure.',
 '2026-02-11 16:00:00+00', 90, NULL, NULL, '{"location": "Blue Bottle Coffee, Palo Alto"}'),

('e0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001',
 'meeting', 'none', 'Investor pitch practice with Jasmine',
 'Ran through the Series A pitch deck together. Jasmine gave feedback on the narrative arc and suggested leading with the customer pain point story.',
 'Pitch practice with Jasmine. Got feedback on narrative arc and storytelling approach for Series A pitch.',
 '2026-02-01 17:00:00+00', 60, 'calendar', 'cal-003', '{}'),

('e0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001',
 'meeting', 'none', 'Next.js community meetup',
 'Attended Vercel community meetup organized by Lena. Talked about server components patterns and the new compiler. Met a few interesting developers.',
 'Attended Next.js meetup organized by Lena at Vercel. Good conversations about server components.',
 '2026-01-10 15:00:00+00', 120, NULL, NULL, '{"location": "Vercel HQ, San Francisco", "event_type": "community_meetup"}'),

('e0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001',
 'meeting', 'none', 'NeurIPS afterparty networking',
 'Met several interesting people at the NeurIPS afterparty. Exchanged numbers with Tom Nakamura, VP Eng at a stealth startup.',
 'Networking at NeurIPS afterparty. Met Tom Nakamura and a few others.',
 '2026-01-05 20:00:00+00', 180, NULL, NULL, '{"location": "The Box SF", "event": "NeurIPS 2025 Afterparty"}'),

-- Messages (Slack, iMessage, etc.)
('e0000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001',
 'message', 'outbound', NULL,
 'Hey Priya, just saw the Gemini 3 announcement. Incredible multimodal capabilities. Would love to hear your take when you have a sec.',
 'Messaged Priya about the Gemini 3 announcement.',
 '2026-02-06 10:00:00+00', NULL, 'imessage', 'im-001', '{}'),

('e0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001',
 'message', 'inbound', NULL,
 'Haha yeah it has been wild internally. The multimodal stuff is next level. Lets grab lunch this week and I will give you the full scoop.',
 'Priya responded about Gemini 3 and suggested lunch to discuss.',
 '2026-02-06 10:15:00+00', NULL, 'imessage', 'im-002', '{}'),

('e0000000-0000-0000-0000-000000000015', '00000000-0000-0000-0000-000000000001',
 'message', 'outbound', NULL,
 'Robert, quick question - do you think we should prioritize the enterprise pilot or the self-serve launch for Q2?',
 'Asked Robert for strategic advice on Q2 priorities.',
 '2026-02-11 14:00:00+00', NULL, 'slack', 'slack-001', '{"channel": "dm"}'),

('e0000000-0000-0000-0000-000000000016', '00000000-0000-0000-0000-000000000001',
 'message', 'inbound', NULL,
 'Enterprise pilot. Every time. The learnings from one serious customer are worth more than 100 self-serve signups at this stage.',
 'Robert advised prioritizing enterprise pilot over self-serve for Q2.',
 '2026-02-11 14:30:00+00', NULL, 'slack', 'slack-002', '{"channel": "dm"}'),

('e0000000-0000-0000-0000-000000000017', '00000000-0000-0000-0000-000000000001',
 'message', 'outbound', NULL,
 'Emma, the new design system looks incredible. The accessibility improvements are 🔥. Can I share it with a few founder friends?',
 'Complimented Emma on her design system work and asked to share it.',
 '2026-02-04 11:00:00+00', NULL, 'slack', 'slack-003', '{}'),

-- Phone calls
('e0000000-0000-0000-0000-000000000018', '00000000-0000-0000-0000-000000000001',
 'call', 'outbound', 'Quick sync with David on agent tooling',
 'Called David to discuss his latest work on agent tool use at OpenAI. Shared some ideas about how tool calling could work with structured outputs.',
 'Quick call with David about agent tooling and structured outputs.',
 '2026-01-20 10:00:00+00', 25, NULL, NULL, '{}'),

('e0000000-0000-0000-0000-000000000019', '00000000-0000-0000-0000-000000000001',
 'call', 'inbound', 'James catching up',
 'James called out of the blue. Catching up on life - he is thinking about leaving Google and exploring startup ideas in cloud cost optimization.',
 'Surprise call from James. He is considering leaving Google to start something in cloud cost optimization.',
 '2025-12-15 19:00:00+00', 40, NULL, NULL, '{}'),

('e0000000-0000-0000-0000-000000000020', '00000000-0000-0000-0000-000000000001',
 'call', 'outbound', 'Follow up with Tom from NeurIPS',
 'Called Tom to follow up from our NeurIPS conversation. His stealth startup is working on AI-native databases. Interesting but early.',
 'Followed up with Tom. His startup is building AI-native databases. Interesting concept but very early stage.',
 '2026-01-08 11:00:00+00', 20, NULL, NULL, '{}'),

-- LinkedIn interactions
('e0000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-000000000001',
 'message', 'inbound', NULL,
 'Hi! I saw your talk at the AI Engineering Summit. Really resonated with your point about building AI products vs AI features. Would love to connect.',
 'Ana (MIT professor) reached out on LinkedIn after seeing conference talk.',
 '2026-01-30 11:30:00+00', NULL, 'linkedin', 'li-001', '{}'),

('e0000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-000000000001',
 'message', 'outbound', NULL,
 'Hey Nina, just wanted to say - after our coffee chat, I have been thinking a lot about what you said about the infrastructure gap. I think there is a real opportunity here. Want to grab dinner this week to dig deeper?',
 'Followed up with Nina after coffee chat to explore co-founding opportunity further.',
 '2026-02-12 08:00:00+00', NULL, 'imessage', 'im-003', '{}')
ON CONFLICT (workspace_id, source_integration, source_id) DO NOTHING;

-- ============================================================================
-- INTERACTION <-> PERSON ASSOCIATIONS
-- ============================================================================

INSERT INTO interaction_people (id, interaction_id, person_id, workspace_id, role) VALUES
-- Email: Sarah alignment paper
('1b000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001', 'recipient'),
-- Email: Marcus investment
('1b000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'sender'),
-- Email: Intro Marcus <> Jasmine
('1b000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001', 'recipient'),
('1b000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'mentioned'),
-- Email: Claire recruiter
('1b000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000004', 'd0000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-000000000001', 'sender'),
-- Email: Alex Stripe
('1b000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000005', 'd0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001', 'recipient'),
-- Email: Emma design feedback
('1b000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000006', 'd0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'recipient'),
-- Meeting: Robert mentor call
('1b000000-0000-0000-0000-000000000008', 'e0000000-0000-0000-0000-000000000007', 'd0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Meeting: AI agents brainstorm (Priya + David)
('1b000000-0000-0000-0000-000000000009', 'e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'participant'),
('1b000000-0000-0000-0000-000000000010', 'e0000000-0000-0000-0000-000000000008', 'd0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Meeting: Nina coffee
('1b000000-0000-0000-0000-000000000011', 'e0000000-0000-0000-0000-000000000009', 'd0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Meeting: Jasmine pitch practice
('1b000000-0000-0000-0000-000000000012', 'e0000000-0000-0000-0000-000000000010', 'd0000000-0000-0000-0000-000000000009', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Meeting: Lena community meetup
('1b000000-0000-0000-0000-000000000013', 'e0000000-0000-0000-0000-000000000011', 'd0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001', 'organizer'),
-- Meeting: NeurIPS - Tom
('1b000000-0000-0000-0000-000000000014', 'e0000000-0000-0000-0000-000000000012', 'd0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Message: Priya Gemini outbound
('1b000000-0000-0000-0000-000000000015', 'e0000000-0000-0000-0000-000000000013', 'd0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'recipient'),
-- Message: Priya Gemini inbound
('1b000000-0000-0000-0000-000000000016', 'e0000000-0000-0000-0000-000000000014', 'd0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001', 'sender'),
-- Message: Robert Q2 question
('1b000000-0000-0000-0000-000000000017', 'e0000000-0000-0000-0000-000000000015', 'd0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'recipient'),
-- Message: Robert Q2 reply
('1b000000-0000-0000-0000-000000000018', 'e0000000-0000-0000-0000-000000000016', 'd0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001', 'sender'),
-- Message: Emma design system
('1b000000-0000-0000-0000-000000000019', 'e0000000-0000-0000-0000-000000000017', 'd0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001', 'recipient'),
-- Call: David agent tooling
('1b000000-0000-0000-0000-000000000020', 'e0000000-0000-0000-0000-000000000018', 'd0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Call: James catch up
('1b000000-0000-0000-0000-000000000021', 'e0000000-0000-0000-0000-000000000019', 'd0000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-000000000001', 'participant'),
-- Call: Tom follow up
('1b000000-0000-0000-0000-000000000022', 'e0000000-0000-0000-0000-000000000020', 'd0000000-0000-0000-0000-000000000010', '00000000-0000-0000-0000-000000000001', 'participant'),
-- LinkedIn: Ana message
('1b000000-0000-0000-0000-000000000023', 'e0000000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000013', '00000000-0000-0000-0000-000000000001', 'sender'),
-- iMessage: Nina follow up
('1b000000-0000-0000-0000-000000000024', 'e0000000-0000-0000-0000-000000000022', 'd0000000-0000-0000-0000-000000000014', '00000000-0000-0000-0000-000000000001', 'recipient')
ON CONFLICT (interaction_id, person_id, role) DO NOTHING;

-- ============================================================================
-- NOTES
-- ============================================================================

INSERT INTO notes (id, workspace_id, person_id, company_id, content) VALUES
-- Note about Sarah
('f0000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000001',
 'd0000000-0000-0000-0000-000000000001', NULL,
 'Sarah is one of the most thoughtful researchers I know. She has deep expertise in RLHF and constitutional AI. Great potential collaborator on any alignment-related project. She mentioned she might be open to advising startups in the AI safety space.'),

-- Note about Marcus
('f0000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
 'd0000000-0000-0000-0000-000000000002', NULL,
 'Marcus is interested in AI infrastructure plays. His sweet spot is $5M-$50M checks. He values strong technical teams and defensible data moats. Best to approach with a clear TAM story and evidence of product-market fit. Robert introduced us.'),

-- Note about Robert
('f0000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000001',
 'd0000000-0000-0000-0000-000000000008', NULL,
 'Robert is an incredible mentor. His advice on enterprise sales strategy has been invaluable. He has a strong network in the dev tools and SaaS space. Weekly calls on Wednesdays at 9am PT. Always responsive on Slack.'),

-- Note about Nina (potential co-founder)
('f0000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000001',
 'd0000000-0000-0000-0000-000000000014', NULL,
 'Nina is seriously considering leaving Stripe. She led the platform team (15 engineers) and has deep experience with distributed systems and payment infrastructure. She is interested in AI infrastructure and wants to build something from scratch. Strong co-founder potential - need to move fast before she takes another offer.'),

-- Note about Anthropic (company note)
('f0000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000001',
 NULL, 'c0000000-0000-0000-0000-000000000001',
 'Anthropic is the most interesting AI safety company right now. Their approach to constitutional AI is unique. Several contacts there including Sarah (research) and Claire reached out about an RE role. Good to maintain strong relationships here regardless of what we build.'),

-- Note about Jasmine
('f0000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000001',
 'd0000000-0000-0000-0000-000000000009', NULL,
 'Jasmine is crushing it at Lumina AI. Their analytics product has real traction with enterprise customers. She is a great sounding board for fundraising strategy - she just closed their seed round at $8M. Connected her with Marcus at Sequoia for potential Series A.'),

-- Note about Google (company note)
('f0000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000001',
 NULL, 'c0000000-0000-0000-0000-000000000002',
 'Two key contacts at Google: Priya in DeepMind and James in Cloud. Both are well-connected internally. Priya is the go-to for anything related to multimodal AI research. James knows the enterprise cloud sales motion well.'),

-- Note about Emma
('f0000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000001',
 'd0000000-0000-0000-0000-000000000005', NULL,
 'Emma is the best product designer I know for developer tools and data-heavy UIs. She designed the Notion sidebar and Figma component library. If we ever need a design advisor or fractional head of design, she should be the first call.')
ON CONFLICT DO NOTHING;
