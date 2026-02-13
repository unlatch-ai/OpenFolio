import { Judgeval, type NodeTracer, Example } from "judgeval";

// Singleton Judgeval client
let client: Judgeval | null = null;
let tracerPromise: Promise<NodeTracer> | null = null;

export function getJudgevalClient(): Judgeval {
  if (!client) {
    client = Judgeval.create();
  }
  return client;
}

export function getTracer(): Promise<NodeTracer> {
  if (!tracerPromise) {
    const jClient = getJudgevalClient();
    tracerPromise = jClient.nodeTracer.create({
      projectName: "openfolio-agent",
      enableEvaluation: true,
      enableMonitoring: true,
      resourceAttributes: {
        "service.name": "openfolio-api",
        "service.version": "1.0.0",
      },
    });
  }
  return tracerPromise;
}

// ============================================================================
// SCORERS - Fetch from Judgment Platform
// ============================================================================
// NOTE: In the TypeScript SDK, scorers must be created in the Judgment Platform UI
// then fetched here using client.scorers.promptScorer.get("Scorer Name")
//
// Create these scorers at: https://app.judgmentlabs.ai → Scorers → New Scorer
//
// Recommended scorers to create:
//
// 1. "OpenFolio Response Relevancy" (Type: Examples)
//    Prompt: Evaluate whether the agent's response is relevant and helpful
//            for the user's event planning query.
//            User Query: {{input}}
//            Agent Response: {{actual_output}}
//    Threshold: 0.7
//    Options: {"Irrelevant": 0, "Partially relevant": 0.5, "Helpful": 0.8, "Very helpful": 1}
//
// 2. "OpenFolio Citation Format" (Type: Examples)
//    Prompt: Check if citations use format: [Name](person:uuid), [Name](company:uuid),
//            [Name](interaction:uuid). Response: {{actual_output}}
//    Threshold: 0.8
//    Options: {"Missing citations": 0, "Some correct": 0.5, "All correct": 1}
//
// 3. "OpenFolio Trace Helpfulness" (Type: Traces)
//    Prompt: Evaluate overall helpfulness of this agent execution for personal CRM queries.
//            Consider tool usage, search quality, and response actionability.
//    Threshold: 0.6
//    Options: {"Unhelpful": 0, "Partial": 0.5, "Helpful": 0.8, "Excellent": 1}
//
// 4. "OpenFolio Tool Usage Quality" (Type: Traces)
//    Prompt: Evaluate tool selection and execution quality.
//            Tools: getSchema, executeSql.
//    Threshold: 0.6
//    Options: {"Poor": 0, "Acceptable": 0.5, "Good": 0.8, "Excellent": 1}

/**
 * Get a PromptScorer by name from the Judgment Platform
 * Scorers must be created in the platform UI first
 */
export async function getPromptScorer(name: string) {
  const client = getJudgevalClient();
  return client.scorers.promptScorer.get(name);
}

/**
 * Get a TracePromptScorer by name from the Judgment Platform
 * These evaluate entire traces, not just input/output pairs
 */
export async function getTracePromptScorer(name: string) {
  const client = getJudgevalClient();
  return client.scorers.tracePromptScorer.get(name);
}

/**
 * Get OpenFolio-specific scorers (must be created in platform first)
 */
export async function getOpenFolioScorers() {
  return {
    responseRelevancy: await getPromptScorer("OpenFolio Response Relevancy"),
    citationFormat: await getPromptScorer("OpenFolio Citation Format"),
    traceHelpfulness: await getTracePromptScorer("OpenFolio Trace Helpfulness"),
    toolUsageQuality: await getTracePromptScorer("OpenFolio Tool Usage Quality"),
  };
}

// ============================================================================
// BUILT-IN SCORERS - Ready to use, no configuration needed
// ============================================================================

/**
 * Get pre-built scorers from Judgment Labs
 * These are optimized and well-tested evaluators
 */
export function getBuiltInScorers() {
  const client = getJudgevalClient();
  return {
    /** Evaluates if the output is relevant to the input */
    answerRelevancy: client.scorers.builtIn.answerRelevancy(),
    /** Evaluates if the output is factually correct */
    answerCorrectness: client.scorers.builtIn.answerCorrectness(),
    /** Evaluates if the output is faithful to provided context */
    faithfulness: client.scorers.builtIn.faithfulness(),
  };
}

// ============================================================================
// EXAMPLE CREATION - For evaluation data
// ============================================================================

/**
 * Create an Example for evaluation
 * Examples are the unit of evaluation - they contain input, output, and optional context
 */
export function createExample(params: {
  input: string;
  actualOutput: string;
  expectedOutput?: string;
  context?: string[];
  retrievalContext?: string[];
  metadata?: Record<string, unknown>;
}) {
  return Example.create({
    input: params.input,
    actual_output: params.actualOutput,
    expected_output: params.expectedOutput,
    context: params.context,
    retrieval_context: params.retrievalContext,
    ...params.metadata,
  });
}

/**
 * Create an Example specifically for OpenFolio agent responses
 */
export function createAgentExample(params: {
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

// ============================================================================
// ASYNC EVALUATION HELPERS - For production monitoring
// ============================================================================

/**
 * Evaluate an agent response in production (non-blocking)
 * Uses built-in answerRelevancy scorer which doesn't require platform setup
 *
 * Example usage in route handler:
 * ```ts
 * const tracer = await getTracer();
 * const example = createAgentExample({
 *   userMessage: message,
 *   agentResponse: response,
 *   toolsCalled: ["getSchema", "executeSql"],
 * });
 *
 * // Run evaluation asynchronously (doesn't block response)
 * evaluateWithBuiltIn(tracer, example);
 * ```
 */
export function evaluateWithBuiltIn(
  tracer: NodeTracer,
  example: ReturnType<typeof Example.create>
) {
  const builtIn = getBuiltInScorers();
  tracer.asyncEvaluate(builtIn.answerRelevancy, example);
}

/**
 * Evaluate an agent response with custom scorers from the platform
 * Scorers must be created in Judgment Platform first
 *
 * Example usage:
 * ```ts
 * const tracer = await getTracer();
 * const scorer = await getPromptScorer("OpenFolio Response Relevancy");
 * if (scorer) {
 *   const example = createAgentExample({ userMessage, agentResponse });
 *   tracer.asyncEvaluate(scorer, example);
 * }
 * ```
 */
export async function evaluateWithCustomScorer(
  tracer: NodeTracer,
  scorerName: string,
  example: ReturnType<typeof Example.create>
) {
  const scorer = await getPromptScorer(scorerName);
  if (scorer) {
    tracer.asyncEvaluate(scorer, example);
  }
}

/**
 * Evaluate the full agent trace with a TracePromptScorer
 * Scorer must be created in Judgment Platform first
 *
 * Example usage:
 * ```ts
 * const tracer = await getTracer();
 * const scorer = await getTracePromptScorer("OpenFolio Trace Helpfulness");
 * if (scorer) {
 *   tracer.asyncTraceEvaluate(scorer);
 * }
 * ```
 */
export async function evaluateTrace(
  tracer: NodeTracer,
  scorerName: string
) {
  const scorer = await getTracePromptScorer(scorerName);
  if (scorer) {
    tracer.asyncTraceEvaluate(scorer);
  }
}

// Re-export types and classes for convenience
export { Judgeval, Example };
export type { NodeTracer };
