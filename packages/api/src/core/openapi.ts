/**
 * OpenAPI/Swagger Documentation Generator
 * Issue #342 - Auto-generates OpenAPI 3.0 spec from Zod schemas and route definitions
 */

import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";

// ============================================
// OpenAPI Types
// ============================================

interface OpenAPIInfo {
  title: string;
  description: string;
  version: string;
  contact?: {
    name?: string;
    url?: string;
    email?: string;
  };
  license?: {
    name: string;
    url?: string;
  };
}

interface OpenAPIServer {
  url: string;
  description?: string;
}

interface OpenAPIParameter {
  name: string;
  in: "query" | "path" | "header" | "cookie";
  description?: string;
  required?: boolean;
  schema: Record<string, unknown>;
  example?: unknown;
}

interface OpenAPIRequestBody {
  description?: string;
  required?: boolean;
  content: {
    [mediaType: string]: {
      schema: Record<string, unknown>;
      example?: unknown;
    };
  };
}

interface OpenAPIResponse {
  description: string;
  content?: {
    [mediaType: string]: {
      schema: Record<string, unknown>;
      example?: unknown;
    };
  };
}

interface OpenAPIOperation {
  tags?: string[];
  summary?: string;
  description?: string;
  operationId?: string;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses: Record<string, OpenAPIResponse>;
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  post?: OpenAPIOperation;
  put?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  patch?: OpenAPIOperation;
}

interface OpenAPISecurityScheme {
  type: "apiKey" | "http" | "oauth2" | "openIdConnect";
  description?: string;
  name?: string;
  in?: "query" | "header" | "cookie";
  scheme?: string;
  bearerFormat?: string;
}

interface OpenAPISpec {
  openapi: "3.0.3";
  info: OpenAPIInfo;
  servers: OpenAPIServer[];
  paths: Record<string, OpenAPIPathItem>;
  components: {
    schemas: Record<string, unknown>;
    securitySchemes?: Record<string, OpenAPISecurityScheme>;
  };
  security?: Array<Record<string, string[]>>;
  tags?: Array<{ name: string; description?: string }>;
}

// ============================================
// Zod Schema Conversion
// ============================================

/**
 * Convert a Zod schema to OpenAPI-compatible JSON Schema
 */
export function zodToOpenAPI(schema: z.ZodTypeAny): Record<string, unknown> {
  const jsonSchema = zodToJsonSchema(schema, {
    $refStrategy: "none",
    target: "openApi3",
  });

  // Remove $schema property (not needed in OpenAPI)
  const { $schema, ...rest } = jsonSchema as Record<string, unknown>;
  return rest;
}

// ============================================
// Common Schemas
// ============================================

// Task schemas
const TaskStatusSchema = z.enum([
  "NEW",
  "PLANNING",
  "PLANNING_DONE",
  "BREAKING_DOWN",
  "BREAKDOWN_DONE",
  "ORCHESTRATING",
  "CODING",
  "CODING_DONE",
  "TESTING",
  "TESTS_PASSED",
  "TESTS_FAILED",
  "FIXING",
  "REFLECTING",
  "REPLANNING",
  "REVIEWING",
  "REVIEW_APPROVED",
  "REVIEW_REJECTED",
  "PR_CREATED",
  "WAITING_HUMAN",
  "COMPLETED",
  "FAILED",
]);

const TaskSchema = z.object({
  id: z.string().uuid(),
  githubRepo: z.string(),
  githubIssueNumber: z.number().int(),
  githubIssueTitle: z.string(),
  githubIssueBody: z.string(),
  status: TaskStatusSchema,
  linearIssueId: z.string().optional(),
  definitionOfDone: z.array(z.string()).optional(),
  plan: z.array(z.string()).optional(),
  targetFiles: z.array(z.string()).optional(),
  branchName: z.string().optional(),
  currentDiff: z.string().optional(),
  commitMessage: z.string().optional(),
  prNumber: z.number().int().optional(),
  prUrl: z.string().url().optional(),
  prTitle: z.string().optional(),
  attemptCount: z.number().int(),
  maxAttempts: z.number().int(),
  lastError: z.string().optional(),
  estimatedComplexity: z.enum(["XS", "S", "M", "L", "XL"]).optional(),
  estimatedEffort: z.enum(["low", "medium", "high"]).optional(),
  isOrchestrated: z.boolean(),
  parentTaskId: z.string().uuid().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const TaskEventSchema = z.object({
  id: z.string().uuid(),
  taskId: z.string().uuid(),
  eventType: z.string(),
  payload: z.record(z.unknown()),
  createdAt: z.string().datetime(),
});

const JobStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

const JobSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  status: JobStatusSchema,
  totalTasks: z.number().int(),
  completedTasks: z.number().int(),
  failedTasks: z.number().int(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

const HealthCheckSchema = z.object({
  status: z.enum(["ok", "degraded", "unhealthy"]),
  timestamp: z.string().datetime(),
  version: z.string(),
  environment: z.string(),
  totalLatencyMs: z.number(),
  checks: z.record(
    z.object({
      status: z.enum(["ok", "error"]),
      latencyMs: z.number().optional(),
      message: z.string().optional(),
      details: z.record(z.unknown()).optional(),
    })
  ),
});

const CostSummarySchema = z.object({
  totalCost: z.number(),
  totalTokens: z.number(),
  totalRequests: z.number(),
  byModel: z.array(
    z.object({
      model: z.string(),
      cost: z.number(),
      tokens: z.number(),
      requests: z.number(),
    })
  ),
  byAgent: z.array(
    z.object({
      agent: z.string(),
      cost: z.number(),
      tokens: z.number(),
      requests: z.number(),
    })
  ),
  period: z.object({
    start: z.string().datetime(),
    end: z.string().datetime(),
  }),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.string().optional(),
});

const ModelConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.enum(["anthropic", "openai", "openrouter"]),
  costPerTask: z.number(),
  description: z.string(),
  capabilities: z.array(z.string()),
});

// ============================================
// API Endpoint Definitions
// ============================================

interface EndpointDef {
  method: "get" | "post" | "put" | "delete" | "patch";
  path: string;
  tags: string[];
  summary: string;
  description?: string;
  operationId: string;
  parameters?: OpenAPIParameter[];
  requestBody?: {
    description?: string;
    required?: boolean;
    schema: z.ZodTypeAny;
    example?: unknown;
  };
  responses: {
    [statusCode: string]: {
      description: string;
      schema?: z.ZodTypeAny;
      example?: unknown;
    };
  };
  security?: Array<Record<string, string[]>>;
  deprecated?: boolean;
}

const endpoints: EndpointDef[] = [
  // Root
  {
    method: "get",
    path: "/",
    tags: ["System"],
    summary: "Welcome page",
    description:
      "Returns API documentation. HTML for browsers, JSON for API clients.",
    operationId: "getRoot",
    responses: {
      "200": {
        description: "API information and endpoint list",
        schema: z.object({
          name: z.string(),
          description: z.string(),
          version: z.string(),
          environment: z.string(),
          endpoints: z.array(
            z.object({
              method: z.string(),
              path: z.string(),
              description: z.string(),
            })
          ),
        }),
      },
    },
  },

  // Health
  {
    method: "get",
    path: "/api/health",
    tags: ["System"],
    summary: "Health check",
    description:
      "Returns system health status including database, GitHub API, and LLM providers.",
    operationId: "getHealth",
    responses: {
      "200": {
        description: "System is healthy",
        schema: HealthCheckSchema,
      },
      "503": {
        description: "System is unhealthy",
        schema: HealthCheckSchema,
      },
    },
  },

  // Stats
  {
    method: "get",
    path: "/api/stats",
    tags: ["Analytics"],
    summary: "Dashboard statistics",
    description: "Get aggregated statistics for the dashboard.",
    operationId: "getStats",
    parameters: [
      {
        name: "repo",
        in: "query",
        description: "Filter by repository (owner/repo)",
        required: false,
        schema: { type: "string" },
        example: "limaronaldo/MultiplAI",
      },
      {
        name: "days",
        in: "query",
        description: "Number of days to look back",
        required: false,
        schema: { type: "integer", default: 30 },
      },
    ],
    responses: {
      "200": {
        description: "Dashboard statistics",
        schema: z.object({
          totalTasks: z.number(),
          byStatus: z.record(z.number()),
          successRate: z.number(),
          avgProcessingTimeSeconds: z.number().nullable(),
          dailyTasks: z.array(
            z.object({
              date: z.string(),
              total: z.number(),
              completed: z.number(),
              failed: z.number(),
            })
          ),
          topRepos: z.array(
            z.object({
              repo: z.string(),
              count: z.number(),
            })
          ),
        }),
      },
    },
  },

  // Tasks
  {
    method: "get",
    path: "/api/tasks",
    tags: ["Tasks"],
    summary: "List tasks",
    description: "Get a list of tasks with optional filtering.",
    operationId: "listTasks",
    parameters: [
      {
        name: "status",
        in: "query",
        description: "Filter by status",
        required: false,
        schema: { type: "string", enum: TaskStatusSchema.options },
      },
      {
        name: "repo",
        in: "query",
        description: "Filter by repository",
        required: false,
        schema: { type: "string" },
      },
      {
        name: "limit",
        in: "query",
        description: "Maximum number of tasks to return",
        required: false,
        schema: { type: "integer", default: 50 },
      },
      {
        name: "offset",
        in: "query",
        description: "Offset for pagination",
        required: false,
        schema: { type: "integer", default: 0 },
      },
    ],
    responses: {
      "200": {
        description: "List of tasks",
        schema: z.object({
          tasks: z.array(TaskSchema),
          total: z.number(),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/tasks/{id}",
    tags: ["Tasks"],
    summary: "Get task details",
    description: "Get detailed information about a specific task.",
    operationId: "getTask",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Task ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "Task details with events",
        schema: z.object({
          task: TaskSchema,
          events: z.array(TaskEventSchema),
        }),
      },
      "400": {
        description: "Invalid task ID",
        schema: ErrorResponseSchema,
      },
      "404": {
        description: "Task not found",
        schema: ErrorResponseSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/tasks/{id}/process",
    tags: ["Tasks"],
    summary: "Trigger task processing",
    description: "Manually trigger processing of a task.",
    operationId: "processTask",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Task ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "Task processing started",
        schema: z.object({
          ok: z.boolean(),
          taskId: z.string(),
          status: TaskStatusSchema,
        }),
      },
      "400": {
        description: "Invalid task ID",
        schema: ErrorResponseSchema,
      },
      "404": {
        description: "Task not found",
        schema: ErrorResponseSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/tasks/{id}/reject",
    tags: ["Tasks"],
    summary: "Reject task",
    description: "Reject a task with feedback.",
    operationId: "rejectTask",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Task ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    requestBody: {
      description: "Rejection feedback",
      required: true,
      schema: z.object({
        feedback: z.string().describe("Reason for rejection"),
      }),
    },
    responses: {
      "200": {
        description: "Task rejected",
        schema: z.object({
          ok: z.boolean(),
          taskId: z.string(),
          status: z.literal("FAILED"),
        }),
      },
      "400": {
        description: "Invalid request",
        schema: ErrorResponseSchema,
      },
    },
  },

  // Task Cleanup
  {
    method: "post",
    path: "/api/tasks/cleanup",
    tags: ["Tasks"],
    summary: "Clean up stale tasks",
    description:
      "Clean up tasks stuck in intermediate states. Retryable states go back to NEW, others are marked FAILED.",
    operationId: "cleanupTasks",
    parameters: [
      {
        name: "hours",
        in: "query",
        description: "Hours threshold for staleness",
        required: false,
        schema: { type: "integer", default: 24 },
      },
      {
        name: "dryRun",
        in: "query",
        description: "Only report what would be cleaned",
        required: false,
        schema: { type: "boolean", default: false },
      },
    ],
    responses: {
      "200": {
        description: "Cleanup results",
        schema: z.object({
          message: z.string(),
          dryRun: z.boolean(),
          threshold: z.object({
            hours: z.number(),
            cutoff: z.string().datetime(),
          }),
          processed: z.number(),
          results: z.array(
            z.object({
              id: z.string(),
              title: z.string(),
              previousStatus: z.string(),
              newStatus: z.string(),
              action: z.enum(["retry", "failed"]),
            })
          ),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/tasks/cleanup/stats",
    tags: ["Tasks"],
    summary: "Get stale task statistics",
    description: "Preview how many tasks would be affected by cleanup.",
    operationId: "getCleanupStats",
    parameters: [
      {
        name: "hours",
        in: "query",
        description: "Hours threshold for staleness",
        required: false,
        schema: { type: "integer", default: 24 },
      },
    ],
    responses: {
      "200": {
        description: "Stale task statistics",
        schema: z.object({
          threshold: z.object({
            hours: z.number(),
            cutoff: z.string().datetime(),
          }),
          staleTasks: z.number(),
          byStatus: z.record(z.number()),
          wouldRetry: z.number(),
          wouldFail: z.number(),
          oldestStaleTask: z.string().datetime().nullable(),
        }),
      },
    },
  },

  // Jobs
  {
    method: "get",
    path: "/api/jobs",
    tags: ["Jobs"],
    summary: "List jobs",
    description: "Get a list of batch processing jobs.",
    operationId: "listJobs",
    parameters: [
      {
        name: "limit",
        in: "query",
        description: "Maximum number of jobs to return",
        required: false,
        schema: { type: "integer", default: 20 },
      },
    ],
    responses: {
      "200": {
        description: "List of jobs",
        schema: z.object({
          jobs: z.array(JobSchema),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/jobs/{id}",
    tags: ["Jobs"],
    summary: "Get job details",
    description: "Get detailed information about a specific job.",
    operationId: "getJob",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Job ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "Job details",
        schema: JobSchema,
      },
      "404": {
        description: "Job not found",
        schema: ErrorResponseSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/jobs",
    tags: ["Jobs"],
    summary: "Create job",
    description: "Create a new batch processing job for multiple issues.",
    operationId: "createJob",
    requestBody: {
      description: "Job configuration",
      required: true,
      schema: z.object({
        name: z.string().describe("Job name"),
        repo: z.string().describe("Repository (owner/repo)"),
        issueNumbers: z.array(z.number().int()).describe("Issue numbers to process"),
      }),
      example: {
        name: "Fix all bug issues",
        repo: "limaronaldo/MultiplAI",
        issueNumbers: [1, 2, 3],
      },
    },
    responses: {
      "201": {
        description: "Job created",
        schema: z.object({
          job: JobSchema,
        }),
      },
      "400": {
        description: "Invalid request",
        schema: ErrorResponseSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/jobs/{id}/run",
    tags: ["Jobs"],
    summary: "Start job",
    description: "Start processing a pending job.",
    operationId: "runJob",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Job ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "Job started",
        schema: z.object({
          ok: z.boolean(),
          jobId: z.string(),
          status: JobStatusSchema,
        }),
      },
      "400": {
        description: "Job cannot be started",
        schema: ErrorResponseSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/jobs/{id}/cancel",
    tags: ["Jobs"],
    summary: "Cancel job",
    description: "Cancel a running job.",
    operationId: "cancelJob",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Job ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "Job cancelled",
        schema: z.object({
          ok: z.boolean(),
          jobId: z.string(),
          status: z.literal("cancelled"),
        }),
      },
      "400": {
        description: "Job cannot be cancelled",
        schema: ErrorResponseSchema,
      },
    },
  },

  // Cost Tracking
  {
    method: "get",
    path: "/api/costs",
    tags: ["Costs"],
    summary: "Get cost summary",
    description: "Get LLM usage cost summary for a date range.",
    operationId: "getCosts",
    parameters: [
      {
        name: "start",
        in: "query",
        description: "Start date (ISO format)",
        required: false,
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "end",
        in: "query",
        description: "End date (ISO format)",
        required: false,
        schema: { type: "string", format: "date-time" },
      },
      {
        name: "range",
        in: "query",
        description: "Shorthand for date range (7d, 30d, 90d)",
        required: false,
        schema: { type: "string", enum: ["7d", "30d", "90d"] },
      },
    ],
    responses: {
      "200": {
        description: "Cost summary",
        schema: CostSummarySchema,
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/by-model",
    tags: ["Costs"],
    summary: "Get costs by model",
    description: "Get cost breakdown by LLM model.",
    operationId: "getCostsByModel",
    parameters: [
      {
        name: "range",
        in: "query",
        description: "Date range (7d, 30d, 90d)",
        required: false,
        schema: { type: "string", default: "30d" },
      },
    ],
    responses: {
      "200": {
        description: "Cost breakdown by model",
        schema: z.object({
          byModel: z.array(
            z.object({
              model: z.string(),
              cost: z.number(),
              tokens: z.number(),
              requests: z.number(),
            })
          ),
          period: z.object({
            days: z.number(),
            start: z.string().datetime(),
          }),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/by-agent",
    tags: ["Costs"],
    summary: "Get costs by agent",
    description: "Get cost breakdown by agent type.",
    operationId: "getCostsByAgent",
    parameters: [
      {
        name: "range",
        in: "query",
        description: "Date range (7d, 30d, 90d)",
        required: false,
        schema: { type: "string", default: "30d" },
      },
    ],
    responses: {
      "200": {
        description: "Cost breakdown by agent",
        schema: z.object({
          byAgent: z.array(
            z.object({
              agent: z.string(),
              cost: z.number(),
              tokens: z.number(),
              requests: z.number(),
            })
          ),
          period: z.object({
            days: z.number(),
            start: z.string().datetime(),
          }),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/daily",
    tags: ["Costs"],
    summary: "Get daily costs",
    description: "Get daily cost breakdown for charting.",
    operationId: "getDailyCosts",
    parameters: [
      {
        name: "range",
        in: "query",
        description: "Date range (7d, 30d, 90d)",
        required: false,
        schema: { type: "string", default: "30d" },
      },
    ],
    responses: {
      "200": {
        description: "Daily cost breakdown",
        schema: z.object({
          daily: z.array(
            z.object({
              date: z.string(),
              cost: z.number(),
              tokens: z.number(),
              requests: z.number(),
            })
          ),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/task/{id}",
    tags: ["Costs"],
    summary: "Get task cost",
    description: "Get cost breakdown for a specific task.",
    operationId: "getTaskCost",
    parameters: [
      {
        name: "id",
        in: "path",
        description: "Task ID (UUID)",
        required: true,
        schema: { type: "string", format: "uuid" },
      },
    ],
    responses: {
      "200": {
        description: "Task cost breakdown",
        schema: z.object({
          taskId: z.string(),
          totalCost: z.number(),
          byAgent: z.array(
            z.object({
              agent: z.string(),
              cost: z.number(),
              tokens: z.number(),
            })
          ),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/alerts",
    tags: ["Costs"],
    summary: "Get budget alerts",
    description: "Check for budget threshold alerts.",
    operationId: "getBudgetAlerts",
    responses: {
      "200": {
        description: "Budget alerts",
        schema: z.object({
          alerts: z.array(
            z.object({
              type: z.enum(["warning", "critical"]),
              message: z.string(),
              currentSpend: z.number(),
              threshold: z.number(),
            })
          ),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/optimizations",
    tags: ["Costs"],
    summary: "Get cost optimizations",
    description: "Get suggestions for reducing LLM costs.",
    operationId: "getCostOptimizations",
    responses: {
      "200": {
        description: "Optimization suggestions",
        schema: z.object({
          suggestions: z.array(
            z.object({
              priority: z.enum(["low", "medium", "high"]),
              title: z.string(),
              description: z.string(),
              estimatedSavings: z.number().optional(),
            })
          ),
        }),
      },
    },
  },
  {
    method: "get",
    path: "/api/costs/export",
    tags: ["Costs"],
    summary: "Export cost data",
    description: "Export cost data in CSV or JSON format.",
    operationId: "exportCosts",
    parameters: [
      {
        name: "format",
        in: "query",
        description: "Export format",
        required: false,
        schema: { type: "string", enum: ["json", "csv"], default: "json" },
      },
      {
        name: "range",
        in: "query",
        description: "Date range (7d, 30d, 90d)",
        required: false,
        schema: { type: "string", default: "30d" },
      },
    ],
    responses: {
      "200": {
        description: "Exported cost data",
      },
    },
  },

  // Model Configuration
  {
    method: "get",
    path: "/api/config/models",
    tags: ["Configuration"],
    summary: "Get model configuration",
    description: "Get current model assignments for each agent position.",
    operationId: "getModelConfig",
    responses: {
      "200": {
        description: "Model configuration",
        schema: z.object({
          configs: z.array(
            z.object({
              position: z.string(),
              modelId: z.string(),
              updatedAt: z.string().datetime(),
            })
          ),
          availableModels: z.array(ModelConfigSchema),
        }),
      },
    },
  },
  {
    method: "put",
    path: "/api/config/models",
    tags: ["Configuration"],
    summary: "Update model configuration",
    description: "Update model assignment for a specific position.",
    operationId: "updateModelConfig",
    requestBody: {
      description: "Model assignment",
      required: true,
      schema: z.object({
        position: z.string().describe("Agent position (e.g., planner, coder_xs_low)"),
        modelId: z.string().describe("Model ID to assign"),
      }),
    },
    responses: {
      "200": {
        description: "Configuration updated",
        schema: z.object({
          success: z.boolean(),
          position: z.string(),
          modelId: z.string(),
          updatedAt: z.string().datetime(),
        }),
      },
      "400": {
        description: "Invalid position or model",
        schema: ErrorResponseSchema,
      },
    },
  },
  {
    method: "post",
    path: "/api/config/models/reset",
    tags: ["Configuration"],
    summary: "Reset model configuration",
    description: "Reset all model assignments to defaults.",
    operationId: "resetModelConfig",
    responses: {
      "200": {
        description: "Configuration reset",
        schema: z.object({
          success: z.boolean(),
          message: z.string(),
        }),
      },
    },
  },

  // Rate Limiting
  {
    method: "get",
    path: "/api/rate-limit/stats",
    tags: ["System"],
    summary: "Get rate limit stats",
    description: "Get current rate limiting statistics.",
    operationId: "getRateLimitStats",
    responses: {
      "200": {
        description: "Rate limit statistics",
        schema: z.object({
          enabled: z.boolean(),
          stats: z.object({
            totalKeys: z.number(),
            totalRequests: z.number(),
          }),
          config: z.record(
            z.object({
              maxRequests: z.number(),
              windowMs: z.number(),
            })
          ),
        }),
      },
    },
  },

  // Review
  {
    method: "get",
    path: "/api/review/pending",
    tags: ["Review"],
    summary: "Get pending reviews",
    description: "Get issues awaiting human review.",
    operationId: "getPendingReviews",
    responses: {
      "200": {
        description: "Pending reviews",
        schema: z.object({
          tasks: z.array(TaskSchema),
        }),
      },
    },
  },

  // Logs
  {
    method: "get",
    path: "/api/logs/stream",
    tags: ["System"],
    summary: "Stream logs (SSE)",
    description: "Server-Sent Events stream for real-time log updates.",
    operationId: "streamLogs",
    responses: {
      "200": {
        description: "SSE stream of log events",
      },
    },
  },

  // Webhooks
  {
    method: "post",
    path: "/webhooks/github",
    tags: ["Webhooks"],
    summary: "GitHub webhook receiver",
    description:
      "Receives GitHub webhook events (issues, check_run, pull_request_review, push).",
    operationId: "handleGitHubWebhook",
    security: [{ webhookSignature: [] }],
    requestBody: {
      description: "GitHub webhook payload",
      required: true,
      schema: z.object({
        action: z.string(),
        repository: z.object({
          full_name: z.string(),
        }),
      }),
    },
    responses: {
      "200": {
        description: "Webhook processed",
        schema: z.object({
          ok: z.boolean(),
          message: z.string(),
          taskId: z.string().optional(),
        }),
      },
      "401": {
        description: "Invalid webhook signature",
        schema: ErrorResponseSchema,
      },
    },
  },
];

// ============================================
// OpenAPI Spec Generator
// ============================================

/**
 * Generate the complete OpenAPI specification
 */
export function generateOpenAPISpec(): OpenAPISpec {
  const version = process.env.npm_package_version || "1.0.0";
  const baseUrl =
    process.env.NODE_ENV === "production"
      ? "https://autodev.fly.dev"
      : "http://localhost:3000";

  const spec: OpenAPISpec = {
    openapi: "3.0.3",
    info: {
      title: "AutoDev API",
      description: `
AutoDev is an autonomous development system that uses LLMs to resolve GitHub issues automatically.

## Features
- **Autonomous Issue Resolution**: Receives issues via webhook, plans implementation, generates code, and creates PRs
- **Multi-Model Support**: Routes tasks to optimal models based on complexity and effort
- **Automatic Escalation**: Failures trigger progressively more capable models
- **Cost Tracking**: Monitor and optimize LLM usage costs
- **Linear Integration**: Two-way sync with Linear for issue tracking

## Authentication
Most endpoints are public for monitoring. The GitHub webhook endpoint requires HMAC-SHA256 signature verification.

## Rate Limiting
API endpoints are rate-limited to prevent abuse:
- Webhooks: 100 requests/minute
- API endpoints: 60 requests/minute
- Heavy operations: 10 requests/minute
      `.trim(),
      version,
      contact: {
        name: "AutoDev",
        url: "https://github.com/limaronaldo/MultiplAI",
      },
      license: {
        name: "MIT",
        url: "https://opensource.org/licenses/MIT",
      },
    },
    servers: [
      {
        url: baseUrl,
        description:
          process.env.NODE_ENV === "production"
            ? "Production server"
            : "Development server",
      },
    ],
    paths: {},
    components: {
      schemas: {
        Task: zodToOpenAPI(TaskSchema),
        TaskEvent: zodToOpenAPI(TaskEventSchema),
        TaskStatus: zodToOpenAPI(TaskStatusSchema),
        Job: zodToOpenAPI(JobSchema),
        JobStatus: zodToOpenAPI(JobStatusSchema),
        HealthCheck: zodToOpenAPI(HealthCheckSchema),
        CostSummary: zodToOpenAPI(CostSummarySchema),
        ModelConfig: zodToOpenAPI(ModelConfigSchema),
        Error: zodToOpenAPI(ErrorResponseSchema),
      },
      securitySchemes: {
        webhookSignature: {
          type: "apiKey",
          name: "X-Hub-Signature-256",
          in: "header",
          description:
            "GitHub webhook HMAC-SHA256 signature for payload verification",
        },
      },
    },
    tags: [
      { name: "System", description: "System health and configuration" },
      { name: "Tasks", description: "Task management and processing" },
      { name: "Jobs", description: "Batch job processing" },
      { name: "Costs", description: "LLM cost tracking and analytics" },
      { name: "Configuration", description: "Model configuration" },
      { name: "Review", description: "Human review queue" },
      { name: "Webhooks", description: "GitHub webhook handlers" },
      { name: "Analytics", description: "Dashboard statistics" },
    ],
  };

  // Build paths from endpoint definitions
  for (const endpoint of endpoints) {
    const path = endpoint.path.replace(/:(\w+)/g, "{$1}");

    if (!spec.paths[path]) {
      spec.paths[path] = {};
    }

    const operation: OpenAPIOperation = {
      tags: endpoint.tags,
      summary: endpoint.summary,
      description: endpoint.description,
      operationId: endpoint.operationId,
      responses: {},
      deprecated: endpoint.deprecated,
    };

    // Add parameters
    if (endpoint.parameters) {
      operation.parameters = endpoint.parameters;
    }

    // Add request body
    if (endpoint.requestBody) {
      operation.requestBody = {
        description: endpoint.requestBody.description,
        required: endpoint.requestBody.required,
        content: {
          "application/json": {
            schema: zodToOpenAPI(endpoint.requestBody.schema),
            example: endpoint.requestBody.example,
          },
        },
      };
    }

    // Add responses
    for (const [statusCode, response] of Object.entries(endpoint.responses)) {
      operation.responses[statusCode] = {
        description: response.description,
      };

      if (response.schema) {
        operation.responses[statusCode].content = {
          "application/json": {
            schema: zodToOpenAPI(response.schema),
            example: response.example,
          },
        };
      }
    }

    // Add security
    if (endpoint.security) {
      operation.security = endpoint.security;
    }

    spec.paths[path][endpoint.method] = operation;
  }

  return spec;
}

/**
 * Get the OpenAPI spec as JSON
 */
export function getOpenAPIJSON(): string {
  return JSON.stringify(generateOpenAPISpec(), null, 2);
}
