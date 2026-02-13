import { Judgeval, Example } from "judgeval";

// Test-specific client (separate from production)
let testClient: Judgeval | null = null;

export function getTestClient(): Judgeval {
  if (!testClient) {
    testClient = Judgeval.create();
  }
  return testClient;
}

// Helper to check if Judgment API is configured
export function isJudgmentConfigured(): boolean {
  return !!(process.env.JUDGMENT_API_KEY && process.env.JUDGMENT_ORG_ID);
}

// ============================================================================
// EXAMPLE FACTORIES - Create Examples for different test scenarios
// ============================================================================

/**
 * Create an Example for agent response tests
 */
export function createAgentTestExample(params: {
  userMessage: string;
  agentResponse: string;
  toolsCalled?: string[];
  searchResults?: unknown[];
}) {
  return Example.create({
    input: params.userMessage,
    actual_output: params.agentResponse,
    metadata: {
      tools_called: params.toolsCalled || [],
      search_results: params.searchResults || [],
    },
  });
}

/**
 * Create an Example for testing with expected output (for correctness checks)
 */
export function createExpectedOutputExample(params: {
  input: string;
  actualOutput: string;
  expectedOutput: string;
  context?: string[];
}) {
  return Example.create({
    input: params.input,
    actual_output: params.actualOutput,
    expected_output: params.expectedOutput,
    context: params.context,
  });
}

/**
 * Create an Example for faithfulness testing (with retrieval context)
 */
export function createFaithfulnessExample(params: {
  input: string;
  actualOutput: string;
  retrievalContext: string[];
}) {
  return Example.create({
    input: params.input,
    actual_output: params.actualOutput,
    retrieval_context: params.retrievalContext,
  });
}

// ============================================================================
// SCORER FETCHERS - Get scorers from platform (must be created there first)
// ============================================================================

/**
 * Get a test scorer by name from the Judgment Platform
 * NOTE: Scorers must be created in the platform UI first
 */
export async function getTestPromptScorer(name: string) {
  const client = getTestClient();
  return client.scorers.promptScorer.get(name);
}

/**
 * Get a test trace scorer by name from the Judgment Platform
 */
export async function getTestTracePromptScorer(name: string) {
  const client = getTestClient();
  return client.scorers.tracePromptScorer.get(name);
}

// ============================================================================
// BUILT-IN SCORERS - Access Judgment Labs' pre-built scorers
// ============================================================================

/**
 * Get built-in scorers for testing
 * These work immediately without platform setup
 */
export function getTestBuiltInScorers() {
  const client = getTestClient();
  return {
    answerRelevancy: client.scorers.builtIn.answerRelevancy(),
    answerCorrectness: client.scorers.builtIn.answerCorrectness(),
    faithfulness: client.scorers.builtIn.faithfulness(),
  };
}

// ============================================================================
// TRACER HELPERS - For tests that need tracing
// ============================================================================

/**
 * Create a test tracer with a unique project name
 */
export async function createTestTracer(testName: string) {
  const client = getTestClient();
  return client.nodeTracer.create({
    projectName: `openfolio-tests-${testName}`,
    enableEvaluation: true,
    enableMonitoring: false, // Don't pollute monitoring with test data
  });
}

// Re-export for convenience
export { Example };
