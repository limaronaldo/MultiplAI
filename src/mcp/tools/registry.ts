import { tools, getHandler } from './tools/registry';
  const getGitHubClient = deps.getGitHubClient ?? createLazy(() => new GitHubClient());
  const getPlannerAgent = deps.getPlannerAgent ?? createLazy(() => new PlannerAgent());
  const getCoderAgent = deps.getCoderAgent ?? createLazy(() => new CoderAgent());
  const getOrchestrator =
    deps.getOrchestrator ?? createLazy(() => new Orchestrator());
  const getDb = deps.getDb ?? (() => db);
  const getStaticStore = deps.getStaticMemoryStore ?? getStaticMemoryStore;
  const getLearningStore = deps.getLearningStore ?? (() => getLearningMemoryStore());
  const startBackgroundTaskRunner =
    deps.startBackgroundTaskRunner ??
    ((task: Task) => {
      const orchestrator = getOrchestrator();
      void runTaskToStableState(task, orchestrator).catch((error) => {
        console.error(`[MCP] Error processing task ${task.id}:`, error);
      });
    });

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools,
  }));

  // Register tool call handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const handlerCreator = getHandler(request.params.name);
    const handler = handlerCreator({
      getGitHubClient,
      getPlannerAgent,
      getCoderAgent,
      getDb,
      getStaticMemoryStore: getStaticStore,
      getLearningStore,
      startBackgroundTaskRunner,
    });
    const result = await handler(request.params.arguments ?? {});
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2),
        },
      ],
    };
  });