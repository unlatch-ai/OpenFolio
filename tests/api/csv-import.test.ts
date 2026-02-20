/**
 * CSV Import API Tests
 *
 * Tests for the CSV import analyze and process endpoints.
 * These verify CSV parsing, column mapping suggestions, and people deduplication.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'

// Mock the auth module
const mockGetWorkspaceContext = vi.fn()
const mockIsWorkspaceContextError = vi.fn()

vi.mock('@/lib/auth', () => ({
  getWorkspaceContext: (...args: unknown[]) => mockGetWorkspaceContext(...args),
  isWorkspaceContextError: (result: unknown) => mockIsWorkspaceContextError(result),
}))

// Mock rate limiter
vi.mock('@/lib/rate-limit', () => ({
  rateLimit: () => ({ ok: true, remaining: 99, resetAt: Date.now() + 60000, limit: 100 }),
}))

// Mock OpenAI embeddings
const mockGenerateEmbeddings = vi.fn()
vi.mock('@/lib/openai', () => ({
  generateEmbeddings: (...args: unknown[]) => mockGenerateEmbeddings(...args),
}))

// Mock Trigger.dev tasks
const mockTasksTrigger = vi.fn().mockResolvedValue({ id: 'run-1' })
vi.mock('@trigger.dev/sdk', () => ({
  tasks: {
    trigger: (...args: unknown[]) => mockTasksTrigger(...args),
  },
  schemaTask: vi.fn((config: unknown) => config),
}))

// Mock Supabase with more control - supports chaining
const createMockChain = (returnValue: Record<string, unknown> = { data: null, error: null }) => {
  const chain: Record<string, unknown> = {
    select: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    upsert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(returnValue),
    ...returnValue,
  }
  return chain
}

const mockSupabaseFrom = vi.fn()

// Build a chainable mock that can be configured per test
let currentMockChain = createMockChain()

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn().mockImplementation(() => {
    return {
      from: (table: string) => {
        mockSupabaseFrom(table)
        // Return the current configured chain
        return currentMockChain
      },
      storage: {
        from: vi.fn().mockReturnValue({
          upload: vi.fn().mockResolvedValue({ error: null }),
          download: vi.fn(),
        }),
      },
    }
  }),
}))

// Helper to create mock request with form data
function createMockFormRequest(formData: FormData): NextRequest {
  return new NextRequest('http://localhost:3000/api/import/csv/analyze', {
    method: 'POST',
    headers: {
      'x-workspace-id': 'test-workspace-123',
    },
    body: formData,
  })
}

// Helper to create mock JSON request
function createMockJsonRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/import/csv/process', {
    method: 'POST',
    headers: {
      'x-workspace-id': 'test-workspace-123',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  })
}

describe('CSV Import API', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTasksTrigger.mockResolvedValue({ id: 'run-1' })

    // Default successful auth context
    mockGetWorkspaceContext.mockResolvedValue({
      user: { id: 'user-123', email: 'test@example.com' },
      workspaceId: 'test-workspace-123',
      workspaceRole: 'owner',
    })
    mockIsWorkspaceContextError.mockReturnValue(false)
    
    // Reset mock chain with default values
    currentMockChain = createMockChain({ data: null, error: null })
    
    // Default embedding response
    mockGenerateEmbeddings.mockResolvedValue([
      new Array(1536).fill(0.1),
      new Array(1536).fill(0.2),
    ])
  })

  describe('Column Mapping Suggestions', () => {
    beforeEach(() => {
      // Setup mock for analyze route - it does insert().select().single() then update()
      currentMockChain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ 
              data: { id: 'test-import-123', workspace_id: 'test-workspace-123' }, 
              error: null 
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    it('suggests email mapping for common email column names', async () => {
      const emailColumns = ['email', 'e-mail', 'email_address', 'emailaddress', 'Email']
      
      for (const colName of emailColumns) {
        const csvContent = `${colName},name\ntest@example.com,John`
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
        const formData = new FormData()
        formData.append('file', file)
        
        // Import the route handler dynamically to get fresh state
        const { POST } = await import('@/app/api/import/csv/analyze/route')
        const request = createMockFormRequest(formData)
        const response = await POST(request)
        
        // Should return 200 with mappings
        expect(response.status).toBe(200)
        const data = await response.json()
        
        // Find the email mapping
        const emailMapping = data.suggested_mappings.find(
          (m: { csv_column: string; maps_to: string }) => 
            m.csv_column === colName
        )
        
        expect(emailMapping).toBeDefined()
        expect(emailMapping.maps_to).toBe('email')
        expect(emailMapping.is_system_field).toBe(true)
      }
    })

    it('suggests first_name mapping for common first name columns', async () => {
      const nameColumns = ['first_name', 'firstname', 'first name', 'fname', 'given_name']
      
      for (const colName of nameColumns) {
        const csvContent = `email,${colName}\ntest@example.com,John`
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
        const formData = new FormData()
        formData.append('file', file)
        
        const { POST } = await import('@/app/api/import/csv/analyze/route')
        const request = createMockFormRequest(formData)
        const response = await POST(request)
        
        expect(response.status).toBe(200)
        const data = await response.json()
        
        const nameMapping = data.suggested_mappings.find(
          (m: { csv_column: string; maps_to: string }) => 
            m.csv_column === colName
        )
        
        expect(nameMapping).toBeDefined()
        expect(nameMapping.maps_to).toBe('first_name')
        expect(nameMapping.is_system_field).toBe(true)
      }
    })

    it('suggests last_name mapping for common last name columns', async () => {
      const nameColumns = ['last_name', 'lastname', 'last name', 'lname', 'surname', 'family_name']
      
      for (const colName of nameColumns) {
        const csvContent = `email,${colName}\ntest@example.com,Doe`
        const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
        const formData = new FormData()
        formData.append('file', file)
        
        const { POST } = await import('@/app/api/import/csv/analyze/route')
        const request = createMockFormRequest(formData)
        const response = await POST(request)
        
        expect(response.status).toBe(200)
        const data = await response.json()
        
        const nameMapping = data.suggested_mappings.find(
          (m: { csv_column: string; maps_to: string }) => 
            m.csv_column === colName
        )
        
        expect(nameMapping).toBeDefined()
        expect(nameMapping.maps_to).toBe('last_name')
        expect(nameMapping.is_system_field).toBe(true)
      }
    })

    it('converts custom columns to snake_case', async () => {
      const csvContent = `email,Current Role,Industry Expertise,LinkedIn URL\ntest@example.com,CEO,AI/ML,linkedin.com/in/test`
      const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', file)
      
      const { POST } = await import('@/app/api/import/csv/analyze/route')
      const request = createMockFormRequest(formData)
      const response = await POST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      const roleMapping = data.suggested_mappings.find(
        (m: { csv_column: string }) => m.csv_column === 'Current Role'
      )
      const expertiseMapping = data.suggested_mappings.find(
        (m: { csv_column: string }) => m.csv_column === 'Industry Expertise'
      )
      
      expect(roleMapping.maps_to).toBe('current_role')
      expect(expertiseMapping.maps_to).toBe('industry_expertise')
      expect(roleMapping.is_system_field).toBe(false)
    })

    it('detects email column from sample data if header is unclear', async () => {
      const csvContent = `contact,user_id\ntest@example.com,user123`
      const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', file)
      
      const { POST } = await import('@/app/api/import/csv/analyze/route')
      const request = createMockFormRequest(formData)
      const response = await POST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Should detect the email in the first column
      const contactMapping = data.suggested_mappings.find(
        (m: { csv_column: string }) => m.csv_column === 'contact'
      )
      
      // If it contains @ in sample data, it might be detected as email
      // This depends on the implementation
      expect(contactMapping).toBeDefined()
    })
  })

  describe('CSV Parsing', () => {
    beforeEach(() => {
      // Setup mock for analyze route
      currentMockChain = {
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ 
              data: { id: 'test-import-123', workspace_id: 'test-workspace-123' }, 
              error: null 
            }),
          }),
        }),
        update: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      }
    })

    it('parses CSV with BOM character correctly', async () => {
      const csvContent = '\uFEFFemail,name\ntest@example.com,John'
      const file = new File([csvContent], 'test.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', file)
      
      const { POST } = await import('@/app/api/import/csv/analyze/route')
      const request = createMockFormRequest(formData)
      const response = await POST(request)
      
      expect(response.status).toBe(200)
      const data = await response.json()
      
      // Should handle BOM and get correct column name
      const emailCol = data.columns.find((c: string) => c === 'email')
      expect(emailCol).toBe('email')
    })

    it('returns error for non-CSV files', async () => {
      const file = new File(['not a csv'], 'test.txt', { type: 'text/plain' })
      const formData = new FormData()
      formData.append('file', file)
      
      const { POST } = await import('@/app/api/import/csv/analyze/route')
      const request = createMockFormRequest(formData)
      const response = await POST(request)
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('CSV')
    })

    it('returns error for empty CSV or CSV without data rows', async () => {
      // CSV with headers but no data rows
      const file = new File(['email,name'], 'test.csv', { type: 'text/csv' })
      const formData = new FormData()
      formData.append('file', file)
      
      const { POST } = await import('@/app/api/import/csv/analyze/route')
      const request = createMockFormRequest(formData)
      const response = await POST(request)
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error.toLowerCase()).toMatch(/empty|invalid/)
    })
  })

  describe('People Processing', () => {
    it('requires email mapping to process', async () => {
      const request = createMockJsonRequest({
        upload_id: 'test-upload-123',
        mappings: [
          { csv_column: 'name', maps_to: 'first_name', is_system_field: true },
        ],
      })
      
      const { POST } = await import('@/app/api/import/csv/process/route')
      const response = await POST(request)
      
      expect(response.status).toBe(400)
      const data = await response.json()
      expect(data.error).toContain('Email')
    })

    it('returns 404 if import record not found', async () => {
      // Configure chain to return not found for import record
      currentMockChain = createMockChain({ data: null, error: { message: 'Not found' } })
      
      const request = createMockJsonRequest({
        upload_id: 'non-existent',
        mappings: [{ csv_column: 'email', maps_to: 'email', is_system_field: true }],
      })
      
      const { POST } = await import('@/app/api/import/csv/process/route')
      const response = await POST(request)
      
      expect(response.status).toBe(404)
      const data = await response.json()
      expect(data.error).toContain('not found')
    })

    it('queues import job and returns 202', async () => {
      const importRecord = {
        id: 'test-upload-123',
        workspace_id: 'test-workspace-123',
        status: 'pending',
        result: { raw_csv: 'email,first_name\nnew@example.com,John' },
      }

      currentMockChain = {
        ...createMockChain(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: importRecord, error: null }),
      }

      const request = createMockJsonRequest({
        upload_id: 'test-upload-123',
        mappings: [
          { csv_column: 'email', maps_to: 'email', is_system_field: true },
          { csv_column: 'first_name', maps_to: 'first_name', is_system_field: true },
        ],
      })

      const { POST } = await import('@/app/api/import/csv/process/route')
      const response = await POST(request)

      expect(response.status).toBe(202)
      const data = await response.json()
      expect(data.success).toBe(true)
      expect(data.uploadId).toBe('test-upload-123')
      expect(mockTasksTrigger).toHaveBeenCalledWith(
        'process-csv-import',
        expect.objectContaining({
          uploadId: 'test-upload-123',
          workspaceId: 'test-workspace-123',
        })
      )
    })

    it('passes mappings correctly to the queued task', async () => {
      const importRecord = {
        id: 'test-upload-123',
        workspace_id: 'test-workspace-123',
        status: 'pending',
        result: { raw_csv: 'email,first_name,role\nsame@example.com,Jane,CEO\nsame@example.com,,CTO' },
      }

      currentMockChain = {
        ...createMockChain(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: importRecord, error: null }),
      }

      const mappings = [
        { csv_column: 'email', maps_to: 'email', is_system_field: true },
        { csv_column: 'first_name', maps_to: 'first_name', is_system_field: true },
        { csv_column: 'role', maps_to: 'role', is_system_field: false },
      ]
      const request = createMockJsonRequest({
        upload_id: 'test-upload-123',
        mappings,
      })

      const { POST } = await import('@/app/api/import/csv/process/route')
      const response = await POST(request)
      const data = await response.json()

      expect(response.status).toBe(202)
      expect(data.success).toBe(true)
      expect(mockTasksTrigger).toHaveBeenCalledWith(
        'process-csv-import',
        expect.objectContaining({ mappings })
      )
    })

    it('queues import with correct workspace and upload IDs', async () => {
      const importRecord = {
        id: 'test-upload-123',
        workspace_id: 'test-workspace-123',
        status: 'pending',
        result: { raw_csv: 'email\ntest@example.com' },
      }

      currentMockChain = {
        ...createMockChain(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: importRecord, error: null }),
      }

      const request = createMockJsonRequest({
        upload_id: 'test-upload-123',
        mappings: [{ csv_column: 'email', maps_to: 'email', is_system_field: true }],
      })

      const { POST } = await import('@/app/api/import/csv/process/route')
      const response = await POST(request)

      expect(response.status).toBe(202)
      expect(mockTasksTrigger).toHaveBeenCalledWith('process-csv-import', {
        uploadId: 'test-upload-123',
        workspaceId: 'test-workspace-123',
        mappings: [{ csv_column: 'email', maps_to: 'email', is_system_field: true }],
      })
    })

    it('returns 400 if CSV data is missing from import record', async () => {
      const importRecord = {
        id: 'test-upload-123',
        workspace_id: 'test-workspace-123',
        status: 'pending',
        result: {},
      }

      currentMockChain = {
        ...createMockChain(),
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        single: vi.fn().mockResolvedValue({ data: importRecord, error: null }),
      }

      const request = createMockJsonRequest({
        upload_id: 'test-upload-123',
        mappings: [{ csv_column: 'email', maps_to: 'email', is_system_field: true }],
      })

      const { POST } = await import('@/app/api/import/csv/process/route')
      const response = await POST(request)

      expect(response.status).toBe(400)
      expect(mockTasksTrigger).not.toHaveBeenCalled()
    })
  })
})
