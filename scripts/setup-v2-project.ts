#!/usr/bin/env bun
/**
 * Script para criar o projeto MultiplAI v2 no Linear com todas as issues das 3 ondas
 *
 * Uso: bun run scripts/setup-v2-project.ts
 */

import { LinearService } from "../src/integrations/linear";

const PROJECT_NAME = "MultiplAI v2 - Self Evolution";
const PROJECT_DESCRIPTION =
  "Auto-evolução do MultiplAI em 3 ondas: Hardening, Job/Batch Layer, LangGraph Backend. Sistema usa a si mesmo para implementar melhorias.";

interface IssueDefinition {
  title: string;
  description: string;
  wave: number;
  complexity: "S" | "M" | "L";
  priority: number; // 1=urgent, 2=high, 3=medium, 4=low
  dependencies?: string[];
}

const ISSUES: IssueDefinition[] = [
  // WAVE 1 - Hardening
  {
    title: "Refatorar tipos de Task/TaskEvent e documentar state machine",
    wave: 1,
    complexity: "S",
    priority: 2,
    description: `## Contexto
Antes de evoluir o MultiplAI, precisamos consolidar os tipos core e garantir que a state machine esteja bem documentada e testada. Isso facilita futuras modificações automáticas.

## Requisitos
- Consolidar todos os tipos em \`src/core/types.ts\` com comentários JSDoc explicando cada campo
- Documentar \`TaskStatus\` e \`StatusTransitions\` em \`src/core/state-machine.ts\` com comentários inline
- Criar arquivo \`src/core/__tests__/state-machine.test.ts\` com testes unitários:
  - Testar todas as transições válidas
  - Testar que transições inválidas lançam erro
  - Testar \`isTerminal()\` para estados finais
  - Testar \`getNextAction()\` para cada estado

## Arquivos alvo
- \`src/core/types.ts\`
- \`src/core/state-machine.ts\`
- \`src/core/__tests__/state-machine.test.ts\` (criar)

## Definition of Done
- [ ] Todos os tipos em \`types.ts\` têm comentários JSDoc
- [ ] \`TaskStatus\` tem enum documentado com descrição de cada estado
- [ ] \`state-machine.ts\` tem comentários explicando cada transição
- [ ] Arquivo de testes criado com pelo menos 10 casos de teste
- [ ] Testes passam com \`bun test\`

## Complexidade: S (Small) - Refatoração sem mudança de lógica
`,
  },
  {
    title: "Melhorar estrutura de logs e tracking de eventos",
    wave: 1,
    complexity: "S",
    priority: 3,
    description: `## Contexto
Os logs atuais vão para console. Precisamos de uma estrutura mais robusta para debugging e auditoria, especialmente quando o MultiplAI processar múltiplas tasks.

## Requisitos
- Criar \`src/core/logger.ts\` com:
  - Função \`createTaskLogger(taskId: string)\` que retorna logger contextualizado
  - Níveis: debug, info, warn, error
  - Formato estruturado: \`[TIMESTAMP] [LEVEL] [TASK_ID] [AGENT] message\`
  - Opção de salvar em arquivo via env \`LOG_TO_FILE=true\`
- Atualizar \`Orchestrator\` para usar o novo logger em vez de \`console.log\`
- Garantir que \`logEvent\` nunca quebre o fluxo (já tem try/catch, melhorar mensagem)

## Arquivos alvo
- \`src/core/logger.ts\` (criar)
- \`src/core/orchestrator.ts\`

## Definition of Done
- [ ] \`logger.ts\` criado com funções exportadas
- [ ] Orchestrator usa \`createTaskLogger\` em todos os métodos
- [ ] Logs têm formato consistente com timestamp e task_id
- [ ] Erro em \`logEvent\` não interrompe o fluxo principal
- [ ] Variável \`LOG_TO_FILE\` documentada em \`.env.example\`

## Complexidade: S (Small)
`,
  },
  {
    title: "Hardening do Orchestrator: validações e error handling",
    wave: 1,
    complexity: "M",
    priority: 2,
    dependencies: [
      "Refatorar tipos de Task/TaskEvent e documentar state machine",
    ],
    description: `## Contexto
O Orchestrator precisa ser mais defensivo antes de chamar agentes, validando estados e inputs para evitar erros silenciosos.

## Requisitos
- Adicionar validação no início de cada método \`run*\`:
  - Verificar se \`task.status\` é o esperado para aquela ação
  - Verificar se campos obrigatórios existem (ex: \`branchName\` antes de \`runTests\`)
  - Lançar erro claro se validação falhar
- Melhorar \`failTask\`:
  - Incluir stack trace quando disponível
  - Adicionar comentário na issue do GitHub com o erro (opcional, via config)
- Criar tipo \`OrchestratorError\` com campos: \`code\`, \`message\`, \`taskId\`, \`recoverable\`

## Arquivos alvo
- \`src/core/orchestrator.ts\`
- \`src/core/types.ts\`

## Definition of Done
- [ ] Cada método \`run*\` tem validação de estado no início
- [ ] Erros de validação têm mensagens claras indicando o problema
- [ ] \`OrchestratorError\` type criado e usado em \`failTask\`
- [ ] Comentário opcional na issue quando task falha (config: \`COMMENT_ON_FAILURE=true\`)
- [ ] Testes de validação não quebram fluxo existente

## Complexidade: M (Medium)
`,
  },

  // WAVE 2 - Job/Batch Layer
  {
    title: "Adicionar entidade Job e endpoints /jobs para batch processing",
    wave: 2,
    complexity: "M",
    priority: 2,
    dependencies: [
      "Refatorar tipos de Task/TaskEvent e documentar state machine",
      "Hardening do Orchestrator: validações e error handling",
    ],
    description: `## Contexto
Atualmente processamos uma issue por vez. Precisamos de uma camada \`Job\` que agrupa múltiplas tasks para processamento em batch.

## Requisitos
- Criar tipo \`Job\` em \`src/core/types.ts\`:
\`\`\`typescript
interface Job {
  id: string;
  status: JobStatus; // 'pending' | 'running' | 'completed' | 'failed' | 'partial'
  taskIds: string[];
  createdAt: Date;
  updatedAt: Date;
  summary?: JobSummary;
}

interface JobSummary {
  total: number;
  completed: number;
  failed: number;
  prsCreated: string[]; // URLs dos PRs
}
\`\`\`
- Criar \`src/integrations/db-jobs.ts\` com funções:
  - \`createJob(job: Job): Promise<Job>\`
  - \`getJob(id: string): Promise<Job | null>\`
  - \`updateJob(id: string, updates: Partial<Job>): Promise<Job>\`
  - \`listJobs(limit?: number): Promise<Job[]>\`
- Adicionar endpoints em \`src/router.ts\`:
  - \`POST /api/jobs\` - cria job com lista de issue numbers
  - \`GET /api/jobs\` - lista jobs recentes
  - \`GET /api/jobs/:id\` - detalhes do job com status de cada task
  - \`GET /api/jobs/:id/events\` - eventos agregados de todas as tasks

## Arquivos alvo
- \`src/core/types.ts\`
- \`src/integrations/db-jobs.ts\` (criar)
- \`src/router.ts\`

## Definition of Done
- [ ] Tipo \`Job\` e \`JobStatus\` definidos em types.ts
- [ ] Funções de DB para jobs implementadas
- [ ] Endpoint POST /api/jobs cria job e tasks associadas
- [ ] Endpoint GET /api/jobs/:id retorna job com status de cada task
- [ ] Documentar novos endpoints no README.md

## Complexidade: M (Medium)
`,
  },
  {
    title: "Criar JobRunner para processar batch de tasks em paralelo",
    wave: 2,
    complexity: "M",
    priority: 2,
    dependencies: [
      "Adicionar entidade Job e endpoints /jobs para batch processing",
    ],
    description: `## Contexto
Com a entidade Job criada, precisamos de um runner que processe múltiplas tasks do mesmo job em paralelo.

## Requisitos
- Criar \`src/core/job-runner.ts\`:
\`\`\`typescript
class JobRunner {
  constructor(private orchestrator: Orchestrator, private config: JobRunnerConfig) {}

  async run(job: Job): Promise<Job> {
    // 1. Atualiza job para 'running'
    // 2. Para cada taskId, dispara orchestrator.process() em paralelo
    // 3. Usa Promise.allSettled para não falhar se uma task falhar
    // 4. Atualiza job.summary com resultados
    // 5. Define status final: 'completed', 'failed', ou 'partial'
  }
}

interface JobRunnerConfig {
  maxParallel: number; // default: 3
  continueOnError: boolean; // default: true
}
\`\`\`
- Integrar JobRunner no endpoint \`POST /api/jobs\`:
  - Após criar job, iniciar processamento async
  - Retornar job_id imediatamente (não bloquear)
- Adicionar endpoint \`POST /api/jobs/:id/cancel\` para interromper job

## Arquivos alvo
- \`src/core/job-runner.ts\` (criar)
- \`src/router.ts\`
- \`src/core/types.ts\`

## Definition of Done
- [ ] JobRunner implementado com processamento paralelo
- [ ] Config \`maxParallel\` limita concorrência
- [ ] Job continua mesmo se uma task falhar (quando \`continueOnError: true\`)
- [ ] Endpoint cancel marca job como 'cancelled' e para novas tasks
- [ ] Summary final tem contagem correta de completed/failed

## Complexidade: M (Medium)
`,
  },
  {
    title: "Webhook GitHub para criar Jobs automaticamente por label/milestone",
    wave: 2,
    complexity: "M",
    priority: 3,
    dependencies: [
      "Adicionar entidade Job e endpoints /jobs para batch processing",
      "Criar JobRunner para processar batch de tasks em paralelo",
    ],
    description: `## Contexto
Queremos que ao adicionar uma label especial (ex: \`batch-auto-dev\`) a múltiplas issues, o MultiplAI crie um Job automaticamente.

## Requisitos
- Modificar \`src/router.ts\` handler de webhook:
  - Detectar quando issue recebe label \`batch-auto-dev\`
  - Buscar todas as issues abertas do repo com essa mesma label
  - Criar Job com todas essas issues
  - Comentar na issue que disparou: "Job criado com X issues: [link]"
- Suportar também milestone:
  - Se issue tem label \`auto-dev\` E pertence a uma milestone
  - Criar Job com todas as issues da milestone que têm \`auto-dev\`
- Adicionar config em \`.env\`:
  - \`BATCH_LABEL=batch-auto-dev\`
  - \`BATCH_BY_MILESTONE=true\`

## Arquivos alvo
- \`src/router.ts\`
- \`src/integrations/github.ts\` (adicionar método para listar issues por label/milestone)
- \`.env.example\`

## Definition of Done
- [ ] Label \`batch-auto-dev\` dispara criação de Job
- [ ] Job inclui todas as issues com a mesma label
- [ ] Milestone mode funciona quando configurado
- [ ] Comentário automático na issue trigger com link do job
- [ ] Variáveis documentadas em \`.env.example\`

## Complexidade: M (Medium)
`,
  },

  // WAVE 3 - LangGraph Backend
  {
    title: "Criar boilerplate do serviço LangGraph em Python",
    wave: 3,
    complexity: "S",
    priority: 3,
    description: `## Contexto
Estamos criando um novo backend em Python com LangGraph para orquestração mais robusta. Esta issue cria a estrutura inicial.

## Requisitos
- Criar pasta \`langgraph_service/\` na raiz com:
  - \`pyproject.toml\` com dependências:
    \`\`\`toml
    [project]
    name = "multiplai-langgraph"
    version = "0.1.0"
    dependencies = [
        "langgraph>=0.2.0",
        "langchain>=0.3.0",
        "langchain-anthropic>=0.3.0",
        "fastapi>=0.115.0",
        "uvicorn>=0.32.0",
        "pydantic>=2.0",
        "httpx>=0.28.0",
        "python-dotenv>=1.0.0",
    ]
    \`\`\`
  - \`src/multiplai/__init__.py\`
  - \`src/multiplai/schemas.py\` com tipos Pydantic equivalentes aos TS:
    - \`Task\`, \`TaskStatus\`, \`Job\`, \`JobStatus\`, \`ExecutionPlan\`
  - \`src/multiplai/config.py\` com settings via env vars
  - \`README.md\` com instruções de setup
- Criar \`Dockerfile\` para o serviço Python

## Arquivos alvo
- \`langgraph_service/\` (criar toda a estrutura)

## Definition of Done
- [ ] Estrutura de pastas criada conforme especificado
- [ ] \`pyproject.toml\` tem todas as dependências
- [ ] Schemas Pydantic equivalem aos tipos TypeScript
- [ ] \`README.md\` tem instruções de setup com uv/pip
- [ ] Dockerfile builda corretamente

## Complexidade: S (Small) - Boilerplate apenas
`,
  },
  {
    title: "Implementar grafo LangGraph básico com fluxo de issue única",
    wave: 3,
    complexity: "M",
    priority: 2,
    dependencies: ["Criar boilerplate do serviço LangGraph em Python"],
    description: `## Contexto
Criar o grafo LangGraph que replica o fluxo do Orchestrator TypeScript atual.

## Requisitos
- Criar \`langgraph_service/src/multiplai/nodes/\`:
  - \`load_context.py\` - carrega issue e arquivos do repo
  - \`plan_issue.py\` - equivalente ao PlannerAgent
  - \`execute_issue.py\` - equivalente ao CoderAgent (gera diff)
  - \`create_pr.py\` - prepara dados para criação de PR
- Criar \`langgraph_service/src/multiplai/graph.py\`:
  - Definir \`State\` com campos: issue, plan, diff, pr_data, status, error
  - Criar \`StateGraph\` com nós conectados
  - Adicionar conditional edge para retry em caso de erro
  - Compilar com \`MemorySaver\` checkpointer
- Criar teste básico que roda o grafo com mock

## Arquivos alvo
- \`langgraph_service/src/multiplai/nodes/\` (criar)
- \`langgraph_service/src/multiplai/graph.py\` (criar)
- \`langgraph_service/tests/test_graph.py\` (criar)

## Definition of Done
- [ ] Todos os nós implementados como funções async
- [ ] Grafo compila sem erros
- [ ] Fluxo happy path: load → plan → execute → create_pr
- [ ] Estado é passado corretamente entre nós
- [ ] Teste básico passa com dados mock

## Complexidade: M (Medium)
`,
  },
  {
    title: "Expor API REST no serviço LangGraph e integrar com TypeScript",
    wave: 3,
    complexity: "L",
    priority: 2,
    dependencies: [
      "Implementar grafo LangGraph básico com fluxo de issue única",
    ],
    description: `## Contexto
O serviço Python precisa expor endpoints para o TypeScript atual poder delegar execução.

## Requisitos
- Criar \`langgraph_service/src/multiplai/api.py\` com FastAPI:
  - \`POST /jobs\` - cria job e dispara grafo async
  - \`GET /jobs/{id}\` - retorna status do job/grafo
  - \`GET /jobs/{id}/events\` - retorna eventos (JSON array)
  - \`POST /jobs/{id}/cancel\` - cancela execução
- Criar \`src/integrations/langgraph-client.ts\` no projeto TS:
  - Classe \`LangGraphClient\` com métodos: \`createJob\`, \`getStatus\`, \`getEvents\`
  - Usar \`fetch\` para chamar API Python
- Modificar \`src/core/orchestrator.ts\`:
  - Adicionar config \`executor: 'local' | 'langgraph'\`
  - Se \`langgraph\`, delegar para \`LangGraphClient\` em vez de rodar agentes locais
  - Manter fallback para modo local

## Arquivos alvo
- \`langgraph_service/src/multiplai/api.py\` (criar)
- \`src/integrations/langgraph-client.ts\` (criar)
- \`src/core/orchestrator.ts\`
- \`src/core/types.ts\`

## Definition of Done
- [ ] API Python roda em porta configurável (default 8001)
- [ ] LangGraphClient implementado e exportado
- [ ] Orchestrator funciona em ambos os modos
- [ ] Flag \`EXECUTOR=langgraph\` documentada em \`.env.example\`
- [ ] Teste e2e: TS cria job → Python processa → TS recebe resultado

## Complexidade: L (Large) - Integração entre dois sistemas
`,
  },
];

async function main() {
  console.log("🚀 Setting up MultiplAI v2 Project in Linear\n");

  const linear = new LinearService();

  // 1. List teams
  console.log("📋 Listing available teams...");
  const teams = await linear.listTeams();

  if (teams.length === 0) {
    console.error("❌ No teams found. Please check your LINEAR_API_KEY.");
    process.exit(1);
  }

  console.log("\nAvailable teams:");
  teams.forEach((t) => console.log(`  - ${t.key}: ${t.name} (${t.id})`));

  // Use first team or find specific one
  const targetTeamKey = process.env.LINEAR_TEAM_KEY || teams[0].key;
  const team = teams.find((t) => t.key === targetTeamKey) || teams[0];

  console.log(`\n✅ Using team: ${team.name} (${team.key})\n`);

  // 2. Check GitHub integration
  console.log("🔗 Checking GitHub integration...");
  const hasGithub = await linear.hasGitHubIntegration(team.id);
  if (hasGithub) {
    console.log("✅ GitHub integration is active");
    console.log(
      "   Issues created in Linear will sync to GitHub automatically",
    );
  } else {
    console.log("⚠️  GitHub integration not found");
    console.log(
      "   Issues will be created in Linear only. Set up GitHub sync in Linear settings.",
    );
  }

  // 3. Check or create project
  console.log(`\n📁 Checking for existing project "${PROJECT_NAME}"...`);
  let project = await linear.findProjectByName(PROJECT_NAME);

  if (project) {
    console.log(`✅ Project exists: ${project.url}`);

    // List existing issues
    const existingIssues = await linear.listProjectIssues(project.id);
    if (existingIssues.length > 0) {
      console.log(`\n📝 Found ${existingIssues.length} existing issues:`);
      existingIssues.forEach((i) =>
        console.log(`   - ${i.identifier}: ${i.title}`),
      );

      console.log(
        "\n⚠️  Project already has issues. Skipping issue creation to avoid duplicates.",
      );
      console.log("   Delete existing issues or use --force to recreate.");

      if (!process.argv.includes("--force")) {
        process.exit(0);
      }
      console.log("\n--force flag detected. Will create new issues anyway.\n");
    }
  } else {
    console.log("Creating new project...");
    project = await linear.createProject({
      name: PROJECT_NAME,
      description: PROJECT_DESCRIPTION,
      teamIds: [team.id],
    });

    if (!project) {
      console.error("❌ Failed to create project");
      process.exit(1);
    }
    console.log(`✅ Created project: ${project.url}`);
  }

  // 4. Create or find labels
  console.log("\n🏷️  Setting up labels...");
  const waveLabels: Record<number, string> = {};
  const complexityLabels: Record<string, string> = {};

  for (const wave of [1, 2, 3]) {
    const label = await linear.findOrCreateLabel(team.id, `wave-${wave}`);
    if (label) waveLabels[wave] = label.id;
  }

  for (const complexity of ["S", "M", "L"]) {
    const label = await linear.findOrCreateLabel(
      team.id,
      `complexity-${complexity}`,
    );
    if (label) complexityLabels[complexity] = label.id;
  }

  const autoDevLabel = await linear.findOrCreateLabel(team.id, "auto-dev");

  console.log("✅ Labels ready");

  // 5. Create issues
  console.log("\n📝 Creating issues...\n");

  const createdIssues: Array<{ issue: any; definition: IssueDefinition }> = [];

  for (const issueDef of ISSUES) {
    const labelIds: string[] = [];

    if (waveLabels[issueDef.wave]) {
      labelIds.push(waveLabels[issueDef.wave]);
    }
    if (complexityLabels[issueDef.complexity]) {
      labelIds.push(complexityLabels[issueDef.complexity]);
    }
    if (autoDevLabel) {
      labelIds.push(autoDevLabel.id);
    }

    const issue = await linear.createIssue({
      title: issueDef.title,
      description: issueDef.description,
      teamId: team.id,
      projectId: project.id,
      labelIds,
      priority: issueDef.priority,
    });

    if (issue) {
      console.log(
        `✅ [Wave ${issueDef.wave}] ${issue.identifier}: ${issue.title}`,
      );
      createdIssues.push({ issue, definition: issueDef });
    } else {
      console.log(`❌ Failed to create: ${issueDef.title}`);
    }
  }

  // 6. Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  console.log(`\nProject: ${project.url}`);
  console.log(`Team: ${team.name} (${team.key})`);
  console.log(`Issues created: ${createdIssues.length}/${ISSUES.length}`);

  console.log("\n📋 Issues by Wave:");
  for (const wave of [1, 2, 3]) {
    const waveIssues = createdIssues.filter((i) => i.definition.wave === wave);
    console.log(`\n  Wave ${wave}:`);
    waveIssues.forEach((i) => {
      console.log(`    ${i.issue.identifier}: ${i.issue.title}`);
    });
  }

  console.log("\n🎯 Next Steps:");
  console.log("1. Review issues in Linear: " + project.url);
  console.log("2. If GitHub sync is active, issues will appear in GitHub");
  console.log("3. Add 'auto-dev' label in GitHub to trigger MultiplAI");
  console.log("4. Start with Wave 1 issues first");

  console.log("\n✨ Done!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
