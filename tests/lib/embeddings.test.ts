/**
 * Unit tests for lib/embeddings.ts
 *
 * Tests the text building and data merging functions used for
 * generating embeddings across OpenFolio entity types. These are pure
 * functions that don't depend on external services.
 */

import { describe, it, expect } from 'vitest'
import {
  buildPersonEmbeddingText,
  buildCompanyEmbeddingText,
  buildInteractionEmbeddingText,
  buildNoteEmbeddingText,
  buildEmbeddingTextFromCSVRow,
  mergeCustomData,
} from '@/lib/embeddings'

// =============================================================================
// buildPersonEmbeddingText
// =============================================================================

describe('buildPersonEmbeddingText', () => {
  it('includes all basic fields when present', () => {
    const result = buildPersonEmbeddingText({
      first_name: 'John',
      last_name: 'Doe',
      email: 'john@example.com',
      phone: '+1234567890',
      bio: 'Software engineer and open-source contributor',
      location: 'San Francisco, CA',
      relationship_type: 'professional',
    })

    expect(result).toContain('Name: John Doe')
    expect(result).toContain('Email: john@example.com')
    expect(result).toContain('Phone: +1234567890')
    expect(result).toContain('Bio: Software engineer and open-source contributor')
    expect(result).toContain('Location: San Francisco, CA')
    expect(result).toContain('Relationship: professional')
  })

  it('prefers display_name over first/last when present', () => {
    const result = buildPersonEmbeddingText({
      first_name: 'John',
      last_name: 'Doe',
      display_name: 'Johnny D',
    })

    expect(result).toContain('Name: Johnny D')
    expect(result).not.toContain('Name: John Doe')
  })

  it('falls back to first/last name when display_name is absent', () => {
    const result = buildPersonEmbeddingText({
      first_name: 'Jane',
      last_name: 'Smith',
      display_name: null,
    })

    expect(result).toContain('Name: Jane Smith')
  })

  it('handles missing name fields gracefully', () => {
    const result = buildPersonEmbeddingText({
      email: 'anon@example.com',
      first_name: null,
      last_name: null,
      display_name: null,
    })

    expect(result).toContain('Email: anon@example.com')
    expect(result).not.toContain('Name:')
  })

  it('includes company affiliations with roles', () => {
    const result = buildPersonEmbeddingText(
      { first_name: 'Alice', last_name: 'Chen' },
      [
        { name: 'Acme Corp', role: 'CTO' },
        { name: 'Open Source Foundation', role: null },
      ]
    )

    expect(result).toContain('Companies: Acme Corp (CTO), Open Source Foundation')
  })

  it('includes tags', () => {
    const result = buildPersonEmbeddingText(
      { first_name: 'Bob' },
      undefined,
      [{ name: 'investor' }, { name: 'advisor' }, { name: 'NYC' }]
    )

    expect(result).toContain('Tags: investor, advisor, NYC')
  })

  it('includes recent interactions (limited to 5)', () => {
    const interactions = [
      { interaction_type: 'email', subject: 'Follow-up on demo', occurred_at: '2024-06-01' },
      { interaction_type: 'meeting', subject: 'Quarterly review', occurred_at: '2024-05-15' },
      { interaction_type: 'call', subject: null, occurred_at: '2024-05-01' },
      { interaction_type: 'email', subject: 'Contract draft', occurred_at: '2024-04-20' },
      { interaction_type: 'meeting', subject: 'Kickoff', occurred_at: '2024-04-10' },
      { interaction_type: 'email', subject: 'Should be excluded', occurred_at: '2024-03-01' },
    ]

    const result = buildPersonEmbeddingText(
      { first_name: 'Carol' },
      undefined,
      undefined,
      interactions
    )

    expect(result).toContain('Recent Interactions:')
    expect(result).toContain('email: Follow-up on demo')
    expect(result).toContain('meeting: Quarterly review')
    expect(result).toContain('call: untitled')
    expect(result).toContain('email: Contract draft')
    expect(result).toContain('meeting: Kickoff')
    expect(result).not.toContain('Should be excluded')
  })

  it('includes custom_data fields', () => {
    const result = buildPersonEmbeddingText({
      first_name: 'Dan',
      custom_data: {
        linkedin_url: 'https://linkedin.com/in/dan',
        interests: 'AI, music',
      },
    })

    expect(result).toContain('linkedin_url: https://linkedin.com/in/dan')
    expect(result).toContain('interests: AI, music')
  })

  it('skips null/empty/undefined custom_data values', () => {
    const result = buildPersonEmbeddingText({
      first_name: 'Eve',
      custom_data: {
        filled: 'has value',
        empty: '',
        nullish: null,
        undef: undefined,
      },
    })

    expect(result).toContain('filled: has value')
    expect(result).not.toContain('empty:')
    expect(result).not.toContain('nullish:')
    expect(result).not.toContain('undef:')
  })

  it('returns minimal output with almost-empty person', () => {
    const result = buildPersonEmbeddingText({})

    expect(result).toBe('')
  })

  it('does not include companies/tags/interactions sections when arrays are empty', () => {
    const result = buildPersonEmbeddingText(
      { first_name: 'Frank' },
      [],
      [],
      []
    )

    expect(result).not.toContain('Companies:')
    expect(result).not.toContain('Tags:')
    expect(result).not.toContain('Recent Interactions:')
  })
})

// =============================================================================
// buildCompanyEmbeddingText
// =============================================================================

describe('buildCompanyEmbeddingText', () => {
  it('includes all basic fields when present', () => {
    const result = buildCompanyEmbeddingText({
      name: 'Acme Corp',
      domain: 'acme.com',
      industry: 'Technology',
      location: 'New York, NY',
      description: 'Enterprise software company specializing in CRM tools',
    })

    expect(result).toContain('Company Name: Acme Corp')
    expect(result).toContain('Domain: acme.com')
    expect(result).toContain('Industry: Technology')
    expect(result).toContain('Location: New York, NY')
    expect(result).toContain('Description: Enterprise software company specializing in CRM tools')
  })

  it('includes key people with roles', () => {
    const result = buildCompanyEmbeddingText(
      { name: 'StartupCo' },
      [
        { first_name: 'Alice', last_name: 'Chen', role: 'CEO' },
        { first_name: 'Bob', last_name: null, role: 'CTO' },
        { first_name: null, last_name: 'Williams', role: null },
      ]
    )

    expect(result).toContain('Key People: Alice Chen (CEO), Bob (CTO), Williams')
  })

  it('includes metadata fields', () => {
    const result = buildCompanyEmbeddingText({
      name: 'MetaCo',
      metadata: {
        employee_count: 500,
        founded: '2015',
        empty_val: '',
        null_val: null,
      },
    })

    expect(result).toContain('employee_count: 500')
    expect(result).toContain('founded: 2015')
    expect(result).not.toContain('empty_val')
    expect(result).not.toContain('null_val')
  })

  it('works with minimal data (name only)', () => {
    const result = buildCompanyEmbeddingText({ name: 'MinimalCo' })

    expect(result).toBe('Company Name: MinimalCo')
  })

  it('does not include key people section when array is empty', () => {
    const result = buildCompanyEmbeddingText({ name: 'NoPeopleCo' }, [])

    expect(result).not.toContain('Key People:')
  })
})

// =============================================================================
// buildInteractionEmbeddingText
// =============================================================================

describe('buildInteractionEmbeddingText', () => {
  it('includes all basic fields', () => {
    const result = buildInteractionEmbeddingText({
      interaction_type: 'meeting',
      direction: 'inbound',
      subject: 'Product demo',
      occurred_at: '2024-06-15T14:00:00Z',
      source_integration: 'google_calendar',
      summary: 'Discussed product roadmap and pricing.',
    })

    expect(result).toContain('Type: meeting')
    expect(result).toContain('Direction: inbound')
    expect(result).toContain('Subject: Product demo')
    expect(result).toContain('Date: 2024-06-15T14:00:00Z')
    expect(result).toContain('Source: google_calendar')
    expect(result).toContain('Summary: Discussed product roadmap and pricing.')
  })

  it('includes participants with roles', () => {
    const result = buildInteractionEmbeddingText(
      { interaction_type: 'email', subject: 'Intro' },
      [
        { first_name: 'Alice', last_name: 'Chen', role: 'sender' },
        { first_name: 'Bob', last_name: 'Smith', role: 'recipient' },
      ]
    )

    expect(result).toContain('Participants: Alice Chen (sender), Bob Smith (recipient)')
  })

  it('prefers summary over content when both present', () => {
    const result = buildInteractionEmbeddingText({
      interaction_type: 'email',
      summary: 'Quick sync about launch timeline',
      content: 'Hi team, I wanted to follow up on the launch timeline we discussed...',
    })

    expect(result).toContain('Summary: Quick sync about launch timeline')
    expect(result).not.toContain('Content:')
  })

  it('falls back to truncated content when summary is absent', () => {
    const longContent = 'A'.repeat(600)
    const result = buildInteractionEmbeddingText({
      interaction_type: 'email',
      content: longContent,
    })

    expect(result).toContain('Content:')
    // Content should be truncated at 500 chars
    const contentLine = result.split('\n').find(l => l.startsWith('Content:'))
    expect(contentLine).toBeDefined()
    // "Content: " is 9 chars, plus 500 chars of content
    expect(contentLine!.length).toBe(9 + 500)
  })

  it('omits content/summary lines when neither is present', () => {
    const result = buildInteractionEmbeddingText({
      interaction_type: 'call',
    })

    expect(result).toBe('Type: call')
    expect(result).not.toContain('Summary:')
    expect(result).not.toContain('Content:')
  })

  it('does not include participants section when array is empty', () => {
    const result = buildInteractionEmbeddingText(
      { interaction_type: 'meeting' },
      []
    )

    expect(result).not.toContain('Participants:')
  })
})

// =============================================================================
// buildNoteEmbeddingText
// =============================================================================

describe('buildNoteEmbeddingText', () => {
  it('includes note content', () => {
    const result = buildNoteEmbeddingText({
      content: 'Met at the conference, interested in partnership.',
    })

    expect(result).toBe('Note: Met at the conference, interested in partnership.')
  })

  it('includes person context when provided', () => {
    const result = buildNoteEmbeddingText(
      { content: 'Great conversation about AI trends.' },
      { first_name: 'Alice', last_name: 'Chen' }
    )

    expect(result).toContain('About Person: Alice Chen')
    expect(result).toContain('Note: Great conversation about AI trends.')
  })

  it('includes company context when provided', () => {
    const result = buildNoteEmbeddingText(
      { content: 'Their Series B closed last week.' },
      null,
      { name: 'Acme Corp' }
    )

    expect(result).toContain('About Company: Acme Corp')
    expect(result).toContain('Note: Their Series B closed last week.')
    expect(result).not.toContain('About Person:')
  })

  it('includes both person and company context', () => {
    const result = buildNoteEmbeddingText(
      { content: 'Discussed role change to VP Engineering.' },
      { first_name: 'Bob', last_name: 'Smith' },
      { name: 'TechCo' }
    )

    expect(result).toContain('About Person: Bob Smith')
    expect(result).toContain('About Company: TechCo')
    expect(result).toContain('Note: Discussed role change to VP Engineering.')

    // Verify ordering: person first, then company, then note
    const lines = result.split('\n')
    expect(lines[0]).toContain('About Person')
    expect(lines[1]).toContain('About Company')
    expect(lines[2]).toContain('Note')
  })

  it('handles null person and company gracefully', () => {
    const result = buildNoteEmbeddingText(
      { content: 'General observation.' },
      null,
      null
    )

    expect(result).toBe('Note: General observation.')
    expect(result).not.toContain('About Person:')
    expect(result).not.toContain('About Company:')
  })

  it('handles person with partial name', () => {
    const result = buildNoteEmbeddingText(
      { content: 'Quick note.' },
      { first_name: 'Alice', last_name: null }
    )

    expect(result).toContain('About Person: Alice')
  })
})

// =============================================================================
// buildEmbeddingTextFromCSVRow
// =============================================================================

describe('buildEmbeddingTextFromCSVRow', () => {
  it('builds text from mapped columns', () => {
    const row = {
      'Email Address': 'test@example.com',
      'Full Name': 'John Doe',
      'Job Title': 'Engineer',
      'Notes': 'Some notes here',
    }

    const mappings = [
      { csv_column: 'Email Address', maps_to: 'email' },
      { csv_column: 'Full Name', maps_to: 'name' },
      { csv_column: 'Job Title', maps_to: 'current_role' },
      { csv_column: 'Notes', maps_to: 'skip' },
    ]

    const result = buildEmbeddingTextFromCSVRow(row, mappings)

    expect(result).toContain('Email: test@example.com')
    expect(result).toContain('Name: John Doe')
    expect(result).toContain('Current Role: Engineer')
    expect(result).not.toContain('Notes')
    expect(result).not.toContain('Some notes here')
  })

  it('skips empty values', () => {
    const row = {
      'Email': 'test@example.com',
      'Name': '',
      'Title': '   ',
    }

    const mappings = [
      { csv_column: 'Email', maps_to: 'email' },
      { csv_column: 'Name', maps_to: 'name' },
      { csv_column: 'Title', maps_to: 'title' },
    ]

    const result = buildEmbeddingTextFromCSVRow(row, mappings)

    expect(result).toContain('Email: test@example.com')
    expect(result).not.toContain('Name:')
    expect(result).not.toContain('Title:')
  })
})

// =============================================================================
// mergeCustomData
// =============================================================================

describe('mergeCustomData', () => {
  it('merges new values into existing data', () => {
    const existing = {
      field_a: 'original',
      field_b: 'keep this',
    }

    const incoming = {
      field_a: 'updated',
      field_c: 'new field',
    }

    const { merged, changed } = mergeCustomData(existing, incoming)

    expect(merged.field_a).toBe('updated')
    expect(merged.field_b).toBe('keep this')
    expect(merged.field_c).toBe('new field')
    expect(changed).toBe(true)
  })

  it('does not overwrite with null/empty values', () => {
    const existing = {
      field_a: 'original',
      field_b: 'keep this',
    }

    const incoming = {
      field_a: null,
      field_b: '',
      field_c: undefined,
    }

    const { merged, changed } = mergeCustomData(existing, incoming)

    expect(merged.field_a).toBe('original')
    expect(merged.field_b).toBe('keep this')
    expect(merged).not.toHaveProperty('field_c')
    expect(changed).toBe(false)
  })

  it('returns changed=false when no actual changes', () => {
    const existing = {
      field_a: 'same',
      field_b: ['item1', 'item2'],
    }

    const incoming = {
      field_a: 'same',
      field_b: ['item1', 'item2'],
    }

    const { merged, changed } = mergeCustomData(existing, incoming)

    expect(merged.field_a).toBe('same')
    expect(changed).toBe(false)
  })

  it('detects changes in array values', () => {
    const existing = {
      tags: ['a', 'b'],
    }

    const incoming = {
      tags: ['a', 'b', 'c'],
    }

    const { merged, changed } = mergeCustomData(existing, incoming)

    expect(merged.tags).toEqual(['a', 'b', 'c'])
    expect(changed).toBe(true)
  })
})
