/**
 * Vitest setup file
 *
 * Mocks external services (OpenAI, Supabase) for unit testing
 */

import { vi } from 'vitest'

// Mock server-only (throws in client contexts but is fine in tests)
vi.mock('server-only', () => ({}))

// Mock OpenAI module - use vi.fn() so tests can override
vi.mock('@/lib/openai', () => ({
  generateEmbedding: vi.fn().mockResolvedValue(new Array(1536).fill(0)),
  generateEmbeddings: vi.fn().mockResolvedValue([]),
}))

// Mock next/headers for API routes
vi.mock('next/headers', () => ({
  headers: vi.fn().mockReturnValue(new Headers()),
  cookies: vi.fn().mockReturnValue({ get: vi.fn(), set: vi.fn() }),
}))

// Mock Supabase client (server)
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  }),
}))

// Mock Supabase client (browser)
vi.mock('@/lib/supabase/client', () => ({
  createClient: vi.fn().mockReturnValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  }),
}))
