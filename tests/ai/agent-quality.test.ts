import { describe, it, expect, beforeAll } from "vitest";
import {
  getTestClient,
  getTestPromptScorer,
  getTestTracePromptScorer,
  isJudgmentConfigured,
  Example,
} from "../lib/judgeval-test-utils";

/**
 * Agent Response Quality Tests
 *
 * These tests verify the quality aspects of agent responses:
 * 1. Citation format compliance
 * 2. Hallucination detection
 * 3. Markdown structure
 * 4. Actionable recommendations
 * 5. Error handling
 *
 * Tests are skipped if JUDGMENT_API_KEY and JUDGMENT_ORG_ID are not set.
 */
describe("Agent Response Quality", { skip: !isJudgmentConfigured() }, () => {
  let client: ReturnType<typeof getTestClient>;

  beforeAll(() => {
    client = getTestClient();
  });

  describe("Platform Scorer Integration", () => {
    it("should fetch OpenFolio Citation Format scorer", async () => {
      const scorer = await getTestPromptScorer("OpenFolio Citation Format");
      expect(scorer).toBeDefined();
    });

    it("should fetch OpenFolio Trace Helpfulness scorer", async () => {
      const scorer = await getTestTracePromptScorer("OpenFolio Trace Helpfulness");
      expect(scorer).toBeDefined();
    });

    it("should fetch OpenFolio Tool Usage Quality scorer", async () => {
      const scorer = await getTestTracePromptScorer("OpenFolio Tool Usage Quality");
      expect(scorer).toBeDefined();
    });
  });

  describe("Citation Format Validation", () => {
    it("should validate correctly formatted citations", () => {
      const example = Example.create({
        actual_output: `Based on your query, here are the results:
          - [Alice Johnson](person:123e4567-e89b-12d3-a456-426614174000) at
          - [Acme Corp](company:987fcdeb-51a2-3bc4-d567-890123456789)
          See recent [Coffee Chat](interaction:abcdef12-3456-7890-abcd-ef1234567890) for context.`,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("person:");
      expect(output).toContain("company:");
      expect(output).toContain("interaction:");
    });
  });

  describe("Response Markdown Structure", () => {
    it("should format responses with proper markdown headers", () => {
      const wellFormattedResponse = `## Search Results

Here are the people matching your criteria:

### Key Contacts
- [Alice Johnson](person:abc123) - Engineering Manager at Google
  - Last contacted: January 15, 2026
  - Relationship: Strong

### Their Companies
- [Google](company:company456) - Tech giant, Mountain View

For more context, see [Last Meeting Notes](interaction:xyz789).`;

      const example = Example.create({
        input: "Find my contacts at Google",
        actual_output: wellFormattedResponse,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("## ");
      expect(output).toContain("### ");
      expect(output).toContain("- [");
    });

    it("should use bullet points for lists", () => {
      const response = `Here are people in your network from the finance industry:
- [Bob Smith](person:a123) - CFO at FinCorp
- [Carol Lee](person:b456) - Investment Analyst
- [Dave Park](person:c789) - Portfolio Manager`;

      const example = Example.create({
        input: "Find people in finance",
        actual_output: response,
      });

      const output = example.getProperty("actual_output") as string;
      const lines = output.split("\n");
      const bulletLines = lines.filter((l: string) => l.trim().startsWith("-"));
      expect(bulletLines.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe("Actionable Recommendations", () => {
    it("should include next steps in recommendations", () => {
      const responseWithRecommendations = `Based on your networking goals, I recommend:

1. **Primary Contact**: [Alice Johnson](person:p123)
   - Why: Strong relationship, recently active

2. **New Introduction**: [Bob Chen](person:p456)
   - Why: Mutual connection through [Acme Corp](company:c789)

**Next Steps:**
- Reach out to Alice about the project
- Review your [Last Meeting](interaction:i789) notes for context`;

      const example = Example.create({
        input: "Who should I reach out to about the AI project?",
        actual_output: responseWithRecommendations,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("recommend");
      expect(output).toContain("Next Steps");
      expect(output).toContain("Why:");
    });

    it("should explain reasoning behind recommendations", () => {
      const response = `I recommend reaching out to [Alice Johnson](person:alice123) because:
- You last spoke 2 weeks ago about a similar topic
- She has expertise in this area
- Your relationship strength is high`;

      const example = Example.create({
        input: "Who should I contact about the partnership?",
        actual_output: response,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("because");
    });
  });

  describe("Empty Results Handling", () => {
    it("should handle no search results gracefully", () => {
      const emptyResultsResponse = `I searched for people matching "quantum computing researchers in Antarctica" but didn't find any results in your network.

**Suggestions:**
- Try broadening your search to include related fields
- Search for "quantum computing" contacts in major tech hubs
- Consider adding new contacts from recent conferences

Would you like me to search with different criteria?`;

      const example = Example.create({
        input: "Find quantum computing researchers in Antarctica",
        actual_output: emptyResultsResponse,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("didn't find");
      expect(output).toContain("Suggestions");
    });

    it("should offer alternative search suggestions", () => {
      const response = `No exact matches found for "underwater photography contacts."

Try these alternatives:
- Search for "photography" or "marine biology" contacts
- Look for people with outdoor/adventure interests
- Check companies in the media or environmental sectors`;

      const example = Example.create({
        input: "Find underwater photography contacts",
        actual_output: response,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("alternatives");
    });
  });

  describe("Error Response Quality", () => {
    it("should provide helpful error messages", () => {
      const errorResponse = `I encountered an issue while searching the database. This might be due to:
- Temporary database connectivity issues
- Invalid search parameters

Please try:
1. Simplifying your search query
2. Waiting a moment and trying again

If the issue persists, contact support.`;

      const example = Example.create({
        input: "Search with invalid parameters",
        actual_output: errorResponse,
      });

      const output = example.getProperty("actual_output") as string;
      expect(output).toContain("issue");
      expect(output).toContain("try");
    });
  });
});
