/**
 * Unit tests for lib/auth.ts
 *
 * Tests the workspace context helper functions. These tests focus on
 * the pure functions (type guards, permission checks) without
 * needing to mock Supabase.
 */

import { describe, it, expect } from 'vitest'
import {
  isWorkspaceContextError,
  requireOwner,
  type WorkspaceContext,
  type WorkspaceContextError,
  type WorkspaceContextResult,
} from '@/lib/auth'

describe('isWorkspaceContextError', () => {
  it('returns true for error objects', () => {
    const error: WorkspaceContextError = {
      error: 'Unauthorized',
      status: 401,
    }

    expect(isWorkspaceContextError(error)).toBe(true)
  })

  it('returns false for success context', () => {
    const context: WorkspaceContext = {
      user: { id: 'user-123', email: 'test@example.com' },
      workspaceId: 'ws-456',
      workspaceRole: 'member',
    }

    expect(isWorkspaceContextError(context)).toBe(false)
  })

  it('correctly narrows type for success case', () => {
    const result: WorkspaceContextResult = {
      user: { id: 'user-123', email: 'test@example.com' },
      workspaceId: 'ws-456',
      workspaceRole: 'owner',
    }

    if (!isWorkspaceContextError(result)) {
      // TypeScript should know this is WorkspaceContext
      expect(result.workspaceId).toBe('ws-456')
      expect(result.user.id).toBe('user-123')
    }
  })

  it('correctly narrows type for error case', () => {
    const result: WorkspaceContextResult = {
      error: 'Not found',
      status: 404,
    }

    if (isWorkspaceContextError(result)) {
      // TypeScript should know this is WorkspaceContextError
      expect(result.error).toBe('Not found')
      expect(result.status).toBe(404)
    }
  })
})

describe('requireOwner', () => {
  it('returns true for workspace owners', () => {
    const ctx: WorkspaceContext = {
      user: { id: 'user-123' },
      workspaceId: 'ws-456',
      workspaceRole: 'owner',
    }

    expect(requireOwner(ctx)).toBe(true)
  })

  it('returns false for regular members', () => {
    const ctx: WorkspaceContext = {
      user: { id: 'user-123' },
      workspaceId: 'ws-456',
      workspaceRole: 'member',
    }

    expect(requireOwner(ctx)).toBe(false)
  })
})

describe('WorkspaceContext types', () => {
  it('accepts valid workspace roles', () => {
    const ownerCtx: WorkspaceContext = {
      user: { id: 'user-123' },
      workspaceId: 'ws-456',
      workspaceRole: 'owner',
    }

    const memberCtx: WorkspaceContext = {
      user: { id: 'user-123' },
      workspaceId: 'ws-456',
      workspaceRole: 'member',
    }

    expect(ownerCtx.workspaceRole).toBe('owner')
    expect(memberCtx.workspaceRole).toBe('member')
  })

  it('handles optional email field', () => {
    const withEmail: WorkspaceContext = {
      user: { id: 'user-123', email: 'test@example.com' },
      workspaceId: 'ws-456',
      workspaceRole: 'member',
    }

    const withoutEmail: WorkspaceContext = {
      user: { id: 'user-123' },
      workspaceId: 'ws-456',
      workspaceRole: 'member',
    }

    expect(withEmail.user.email).toBe('test@example.com')
    expect(withoutEmail.user.email).toBeUndefined()
  })
})

describe('WorkspaceContextError types', () => {
  it('uses appropriate HTTP status codes', () => {
    const unauthorized: WorkspaceContextError = {
      error: 'Unauthorized',
      status: 401,
    }

    const forbidden: WorkspaceContextError = {
      error: 'Not a member of this workspace',
      status: 403,
    }

    const notFound: WorkspaceContextError = {
      error: 'No workspace found',
      status: 404,
    }

    expect(unauthorized.status).toBe(401)
    expect(forbidden.status).toBe(403)
    expect(notFound.status).toBe(404)
  })
})
