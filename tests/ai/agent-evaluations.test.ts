import { describe, it, expect, beforeAll } from "vitest";
import {
  getTestClient,
  createAgentTestExample,
  createExpectedOutputExample,
  createFaithfulnessExample,
  getTestBuiltInScorers,
  getTestPromptScorer,
  isJudgmentConfigured,
} from "../lib/judgeval-test-utils";

/**
 * Agent LLM Evaluation Tests
 *
 * These tests demonstrate different evaluation patterns using Judgment Labs:
 * 1. Custom PromptScorers - LLM-as-a-judge with your own rubrics (created in platform)
 * 2. Built-in Scorers - Pre-built, optimized evaluators
 * 3. Example creation patterns - Different Example types for different use cases
 *
 * Tests are skipped if JUDGMENT_API_KEY and JUDGMENT_ORG_ID are not set.
 */
describe("Agent LLM Evaluations", { skip: !isJudgmentConfigured() }, () => {
  let client: ReturnType<typeof getTestClient>;

  beforeAll(() => {
    client = getTestClient();
  });

  describe("Custom PromptScorer Tests", () => {
    it("should fetch OpenFolio Response Relevancy scorer from platform", async () => {
      const scorer = await getTestPromptScorer("OpenFolio Response Relevancy");
      expect(scorer).toBeDefined();
    });

    it("should fetch OpenFolio Citation Format scorer from platform", async () => {
      const scorer = await getTestPromptScorer("OpenFolio Citation Format");
      expect(scorer).toBeDefined();
    });

    it("should create examples for people search queries", () => {
      const example = createAgentTestExample({
        userMessage: "Find contacts who work in AI",
        agentResponse: `I found several people in your network who work in AI:
          - [Alice Johnson](person:abc123) - ML Engineer at DeepMind
          - [Bob Chen](person:def456) - AI Research Lead
          Both have strong backgrounds in machine learning.`,
        toolsCalled: ["executeSql"],
      });

      // Verify example structure using getProperty (camelCase)
      expect(example.getProperty("input")).toContain("work in AI");
      expect(example.getProperty("actual_output")).toContain("Alice Johnson");
      const metadata = example.getProperty("metadata") as { tools_called: string[] };
      expect(metadata?.tools_called).toContain("executeSql");
    });

    it("should create examples for company search queries", () => {
      const example = createAgentTestExample({
        userMessage: "Find companies in the healthcare industry",
        agentResponse: `Found companies in healthcare:
          - [MedTech Corp](company:xyz789) - Digital health platform, Series B`,
        toolsCalled: ["executeSql"],
      });

      const metadata = example.getProperty("metadata") as { tools_called: string[] };
      expect(metadata?.tools_called).toContain("executeSql");
    });

    it("should create examples for interaction search queries", () => {
      const example = createAgentTestExample({
        userMessage: "Find recent meetings about product launch",
        agentResponse: `Here are recent interactions about the product launch:
          - [Product Launch Sync](interaction:int123) - Meeting on Jan 15
          - [Launch Planning Call](interaction:int456) - Call on Jan 12`,
        toolsCalled: ["executeSql"],
      });

      const metadata = example.getProperty("metadata") as { tools_called: string[] };
      expect(metadata?.tools_called).toContain("executeSql");
      expect(example.getProperty("actual_output")).toContain("Product Launch Sync");
    });

    it("should create examples for complex multi-entity queries", () => {
      const example = createAgentTestExample({
        userMessage:
          "Find people at Google and our recent interactions with them",
        agentResponse: `Here's what I found:

          People at Google:
          - [Sarah Kim](person:p123) - Engineering Manager

          Recent Interactions:
          - [Coffee Chat with Sarah](interaction:i456) - Met last week to discuss partnership`,
        toolsCalled: ["getSchema", "executeSql"],
      });

      const metadata = example.getProperty("metadata") as { tools_called: string[] };
      expect(metadata?.tools_called).toContain("getSchema");
      expect(metadata?.tools_called).toContain("executeSql");
    });
  });

  describe("Built-in Scorer Tests", () => {
    it("should access built-in answer relevancy scorer", () => {
      const builtIn = getTestBuiltInScorers();
      expect(builtIn.answerRelevancy).toBeDefined();
    });

    it("should access built-in answer correctness scorer", () => {
      const builtIn = getTestBuiltInScorers();
      expect(builtIn.answerCorrectness).toBeDefined();
    });

    it("should access built-in faithfulness scorer", () => {
      const builtIn = getTestBuiltInScorers();
      expect(builtIn.faithfulness).toBeDefined();
    });
  });

  describe("Expected Output Examples", () => {
    it("should create examples with expected output for correctness checks", () => {
      const example = createExpectedOutputExample({
        input: "How many people do we know at Acme Corp?",
        actualOutput: "You have 5 contacts at Acme Corp.",
        expectedOutput: "There are 5 people linked to Acme Corp in your network.",
      });

      expect(example.getProperty("input")).toContain("Acme Corp");
      expect(example.getProperty("expected_output")).toContain("5");
    });
  });

  describe("Faithfulness Examples", () => {
    it("should create examples with retrieval context for faithfulness checks", () => {
      const example = createFaithfulnessExample({
        input: "Tell me about our relationship with Acme Corp",
        actualOutput:
          "You have 5 contacts at Acme Corp, with the most recent interaction being a product demo last week.",
        retrievalContext: [
          "Acme Corp: Enterprise software company, 5 contacts in network.",
          "Most recent interaction: Product demo, January 10, 2026",
          "Key contact: Jane Smith, VP of Engineering",
        ],
      });

      expect(example.getProperty("input")).toContain("Acme Corp");
      const context = example.getProperty("retrieval_context") as string[];
      expect(context).toHaveLength(3);
    });
  });
});
