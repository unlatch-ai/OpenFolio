/**
 * Unit tests for lib/dedup.ts
 *
 * Tests the deduplication utility functions: Levenshtein distance,
 * name similarity, and merge logic.
 */

import { describe, it, expect } from "vitest";
import { levenshtein, nameSimilarity } from "@/lib/dedup";

// =============================================================================
// levenshtein
// =============================================================================

describe("levenshtein", () => {
  it("returns 0 for identical strings", () => {
    expect(levenshtein("hello", "hello")).toBe(0);
  });

  it("returns string length for empty comparison", () => {
    expect(levenshtein("hello", "")).toBe(5);
    expect(levenshtein("", "world")).toBe(5);
  });

  it("returns 0 for two empty strings", () => {
    expect(levenshtein("", "")).toBe(0);
  });

  it("computes single character difference", () => {
    expect(levenshtein("cat", "bat")).toBe(1);
    expect(levenshtein("cat", "car")).toBe(1);
  });

  it("computes multi-character differences", () => {
    expect(levenshtein("kitten", "sitting")).toBe(3);
  });

  it("handles insertion", () => {
    expect(levenshtein("abc", "abcd")).toBe(1);
  });

  it("handles deletion", () => {
    expect(levenshtein("abcd", "abc")).toBe(1);
  });
});

// =============================================================================
// nameSimilarity
// =============================================================================

describe("nameSimilarity", () => {
  it("returns 1 for identical names", () => {
    expect(nameSimilarity("John Doe", "John Doe")).toBe(1);
  });

  it("is case insensitive", () => {
    expect(nameSimilarity("John Doe", "john doe")).toBe(1);
  });

  it("returns 0 for empty strings", () => {
    expect(nameSimilarity("", "John")).toBe(0);
    expect(nameSimilarity("John", "")).toBe(0);
  });

  it("returns high similarity for minor typos", () => {
    const sim = nameSimilarity("Jonathan Smith", "Jonathon Smith");
    expect(sim).toBeGreaterThan(0.9);
  });

  it("returns low similarity for different names", () => {
    const sim = nameSimilarity("John Doe", "Alice Wang");
    expect(sim).toBeLessThan(0.5);
  });

  it("handles whitespace trimming", () => {
    expect(nameSimilarity("  John Doe  ", "John Doe")).toBe(1);
  });

  it("returns moderate similarity for partial name matches", () => {
    const sim = nameSimilarity("Robert Johnson", "Rob Johnson");
    expect(sim).toBeGreaterThan(0.7);
  });
});
