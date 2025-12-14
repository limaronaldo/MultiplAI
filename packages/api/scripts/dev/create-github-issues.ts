#!/usr/bin/env bun
/**
 * Script para criar issues no GitHub para o projeto MultiplAI v2
 * Essas issues serão processadas pelo próprio MultiplAI
 *
 * Uso: bun run scripts/create-github-issues.ts
 */

import { Octokit } from "octokit";

const REPO_OWNER = "limaronaldo";
const REPO_NAME = "MultiplAI";

interface IssueDefinition {
  title: string;
  body: string;
  labels: string[];
  wave: number;
}

const ISSUES: IssueDefinition[] = [
  // WAVE 1 - Hardening
  {
    title: "[Wave 1] Refatorar tipos de Task/TaskEvent e documentar state machine",
    wave: 1,
    labels: ["auto-dev", "wave-1", "complexity-S"],
    body: `## Contexto
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

## Linear Issue
RML-78
`,
  },
  {
    title: "[Wave 1] Melhorar estrutura de logs e tracking de eventos",
    wave: 1,
    labels: ["auto-dev", "wave-1", "complexity-S"],
    body: `## Contexto
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

## Linear Issue
RML-79
`,
  },
  {
    title: "[Wave 1] Hardening do Orchestrator: validações e error handling",
    wave: 1,
    labels: ["auto-dev", "wave-1", "complexity-M"],
    body: `## Contexto
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

## Linear Issue
RML-80

## Dependencies
- RML-78 (Refatorar tipos)
`,
  },

  // WAVE 2 - Job/Batch Layer
  {
    title: "[Wave 2] Adicionar entidade Job e endpoints /jobs para batch processing",
    wave: 2,
    labels: ["wave-2", "complexity-M"],
    body: `## Contexto
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

## Linear Issue
RML-81

## Dependencies
- Wave 1 completed (RML-78, RML-79, RML-80)
`,
  },
  {
    title: "[Wave 2] Criar JobRunner para processar batch de tasks em paralelo",
    wave: 2,
    labels: ["wave-2", "complexity-M"],
    body: `## Contexto
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

## Linear Issue
RML-82

## Dependencies
- RML-81 (Entidade Job)
`,
  },
  {
    title: "[Wave 2] Webhook GitHub para criar Jobs automaticamente por label/milestone",
    wave: 2,
    labels: ["wave-2", "complexity-M"],
    body: `## Contexto
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

## Linear Issue
RML-83

## Dependencies
- RML-81, RML-82 (Job Layer)
`,
  },

  // WAVE 3 - LangGraph Backend
  {
    title: "[Wave 3] Criar boilerplate do serviço LangGraph em Python",
    wave: 3,
    labels: ["wave-3", "complexity-S"],
    body: `## Contexto
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

## Linear Issue
RML-84
`,
  },
  {
    title: "[Wave 3] Implementar grafo LangGraph básico com fluxo de issue única",
    wave: 3,
    labels: ["wave-3", "complexity-M"],
    body: `## Contexto
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

## Linear Issue
RML-85

## Dependencies
- RML-84 (Boilerplate)
`,
  },
  {
    title: "[Wave 3] Expor API REST no serviço LangGraph e integrar com TypeScript",
    wave: 3,
    labels: ["wave-3", "complexity-L"],
    body: `## Contexto
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

## Linear Issue
RML-86

## Dependencies
- RML-85 (Grafo LangGraph)
`,
  },
];

async function main() {
  console.log("🚀 Creating GitHub Issues for MultiplAI v2\n");

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("❌ GITHUB_TOKEN not set");
    process.exit(1);
  }

  const octokit = new Octokit({ auth: token });

  // Check existing issues
  console.log("📋 Checking existing issues...");
  const { data: existingIssues } = await octokit.rest.issues.listForRepo({
    owner: REPO_OWNER,
    repo: REPO_NAME,
    state: "all",
    per_page: 100,
  });

  const existingTitles = new Set(existingIssues.map((i) => i.title));
  console.log(`Found ${existingIssues.length} existing issues\n`);

  // Ensure labels exist
  console.log("🏷️  Ensuring labels exist...");
  const labelsToCreate = [
    { name: "auto-dev", color: "0E8A16", description: "Issue to be processed by MultiplAI" },
    { name: "wave-1", color: "1D76DB", description: "Wave 1: Hardening" },
    { name: "wave-2", color: "5319E7", description: "Wave 2: Job/Batch Layer" },
    { name: "wave-3", color: "D93F0B", description: "Wave 3: LangGraph Backend" },
    { name: "complexity-S", color: "C2E0C6", description: "Small complexity" },
    { name: "complexity-M", color: "FEF2C0", description: "Medium complexity" },
    { name: "complexity-L", color: "F9D0C4", description: "Large complexity" },
  ];

  for (const label of labelsToCreate) {
    try {
      await octokit.rest.issues.createLabel({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        name: label.name,
        color: label.color,
        description: label.description,
      });
      console.log(`  ✅ Created label: ${label.name}`);
    } catch (error: any) {
      if (error.status === 422) {
        console.log(`  ⏭️  Label exists: ${label.name}`);
      } else {
        console.log(`  ❌ Error creating ${label.name}: ${error.message}`);
      }
    }
  }

  // Create issues
  console.log("\n📝 Creating issues...\n");

  const createdIssues: Array<{ number: number; title: string; wave: number }> = [];
  const skippedIssues: string[] = [];

  for (const issueDef of ISSUES) {
    // Check if already exists
    if (existingTitles.has(issueDef.title)) {
      console.log(`⏭️  Skipping (exists): ${issueDef.title}`);
      skippedIssues.push(issueDef.title);
      continue;
    }

    try {
      const { data: issue } = await octokit.rest.issues.create({
        owner: REPO_OWNER,
        repo: REPO_NAME,
        title: issueDef.title,
        body: issueDef.body,
        labels: issueDef.labels,
      });

      console.log(`✅ [Wave ${issueDef.wave}] #${issue.number}: ${issue.title}`);
      createdIssues.push({ number: issue.number, title: issue.title, wave: issueDef.wave });
    } catch (error: any) {
      console.log(`❌ Failed to create: ${issueDef.title} - ${error.message}`);
    }

    // Small delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 500));
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  console.log("📊 SUMMARY");
  console.log("=".repeat(60));
  console.log(`\nRepository: https://github.com/${REPO_OWNER}/${REPO_NAME}`);
  console.log(`Issues created: ${createdIssues.length}`);
  console.log(`Issues skipped: ${skippedIssues.length}`);

  if (createdIssues.length > 0) {
    console.log("\n📋 Created Issues by Wave:");
    for (const wave of [1, 2, 3]) {
      const waveIssues = createdIssues.filter((i) => i.wave === wave);
      if (waveIssues.length > 0) {
        console.log(`\n  Wave ${wave}:`);
        waveIssues.forEach((i) => {
          console.log(`    #${i.number}: ${i.title}`);
        });
      }
    }
  }

  console.log("\n🎯 Next Steps:");
  console.log("1. Wave 1 issues have 'auto-dev' label - MultiplAI will process them");
  console.log("2. Wave 2 and 3 issues don't have 'auto-dev' label yet");
  console.log("3. After Wave 1 is complete, add 'auto-dev' to Wave 2 issues");
  console.log("4. Monitor progress at: https://github.com/" + REPO_OWNER + "/" + REPO_NAME + "/issues");

  console.log("\n✨ Done!");
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
