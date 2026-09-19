# accelerate-omo-plugin - Work Plan

## TL;DR (For humans)
Construção do plugin `accelerate-omo` para OpenCode, implementando a verdadeira separação estrutural de Master/Workers do ecossistema Accelerate de forma nativa e sem alucinações de contexto.

**What you'll get:** Um plugin TypeScript isolado que intercepta a inicialização de sessões do OpenCode. Se a sessão for o `[MASTER]`, bloqueia mutações de código e libera comandos de orquestração. O Master poderá criar workers assíncronos (`[W-*]`) em diretórios físicos separados (Git Worktrees), respeitando o limite de concorrência e aguardando resultados via stream de eventos SSE.
**Why this approach:** Atualmente, a limitação de rodar tudo numa mesma sessão ("subagents" do OMO) polui o contexto (48.000+ tokens de lixo), causa colisões de git, e trava a interface. Usar APIs nativas do OpenCode resolve o isolamento e protege o repositório principal de workers que falham.
**What it will NOT do:** Não aplicará mutações de estado no Plane sem aprovação explícita do operador humano (Fail-Closed). Não tentará usar ferramentas deprecadas ou não-nativas (`session.cancel`).
**Effort:** Large
**Risk:** Medium - Requer tratamento cuidadoso do ciclo de vida dos worktrees e conexões SSE órfãs em caso de timeout.
**Decisions to sanity-check:** Uso exclusivo das APIs V1/V2 nativas do OpenCode (e não da tool openchamber) e política de quarentena para worktrees abandonados por timeout.

## Scope
### Must have
- Repositório próprio (`/home/marcelo-karval/Backup/Projetos/accelerate-omo-plugin`).
- Injetor dinâmico de personas via hooks do OpenCode (`chat.messages.transform`).
- Interceptador de segurança (`tool.execute.before`) para blindar o Master contra edição de arquivos.
- `GitWorktreeService`: Provisionamento e quarentena de isolamento.
- `OpenCodeClient`: Wrapper seguro para `POST /api/session`, `POST /api/session/:id/prompt` (com `resume: true`) e `GET /event` (SSE).
- Interface de aprovação manual para sincronização de estado com o Plane.

### Must NOT have (guardrails, anti-slop, scope boundaries)
- Não modificar ou depender de forks não oficiais do pacote `oh-my-openagent`.
- Não utilizar o `openchamber-plugin.js` como ponte de delegação (self-delegation is forbidden).
- Não criar tickets ou alterar status no Plane automaticamente.

## Verification strategy
> Zero human intervention - all verification is agent-executed.
- Test decision: TDD + Vitest + Mocks da API Local.
- Evidence: `<attemptDir>/task-<N>-accelerate-omo-plugin.json`

## Execution strategy
### Parallel execution waves
> Target 5-8 todos per wave. Fewer than 3 (except the final) means you under-split.

### Dependency matrix
| Todo | Depends on | Blocks | Can parallelize with |
| --- | --- | --- | --- |
| 1, 2, 3 | None | 4, 5, 6 | Each other |
| 4, 5 | 1, 2, 3 | 6, 7 | Each other |
| 6 | 4, 5 | 7 | None |
| 7 | 6 | 8 | None |
| 8 | 7 | F1, F2 | None |

## Todos
<!-- APPEND TASK BATCHES BELOW THIS LINE WITH edit/apply_patch - never rewrite the headers above. -->

- [ ] 1. Scaffold do Repositório do Plugin
  What to do / Must NOT do: Criar `/home/marcelo-karval/Backup/Projetos/accelerate-omo-plugin` com TS, `package.json`, `tsconfig.json` e Vitest. Nenhuma lógica, apenas fundação.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 4, 5, 6
  References: Tipagens de `@opencode-ai/plugin`.
  Acceptance criteria: `npm run test` com teste dummy executa com sucesso.
  QA scenarios: happy (teste ok) + failure (erro de tipo), Evidence <attemptDir>/task-1.json
  Commit: Y | build(repo): inicializa repositorio do plugin accelerate-omo
  Recommended task executor category: quick

- [ ] 2. Implementar `GitWorktreeService`
  What to do / Must NOT do: Serviço em `src/git-worktree.ts` com métodos `create`, `remove` e `quarantine` utilizando `git worktree add`. Não deve mutar a branch principal.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 4, 5, 6
  References: Lógica inspirada em `team-worktree.mjs` do OMO.
  Acceptance criteria: Testes unitários com `child_process.exec` mockado cobrindo todos os caminhos.
  QA scenarios: happy (criação isolada) + failure (branch já existente), Evidence <attemptDir>/task-2.json
  Commit: Y | feat(worktree): implementa servico de gerenciamento de worktrees isolados
  Recommended task executor category: unspecified-high

- [ ] 3. Implementar `OpenCodeClient` (Native API Wrapper)
  What to do / Must NOT do: Serviço em `src/opencode-api.ts` cobrindo `POST /api/session`, `POST /api/session/:id/prompt` e consumo do SSE (`/event`). NÃO usar as APIs V1 legadas sem fallback adequado.
  Parallelization: Wave 1 | Blocked by: None | Blocks: 4, 5, 6
  References: Endpoints documentados em `http://127.0.0.1:4096/doc`.
  Acceptance criteria: Testes garantem que o cliente anexa auth headers e não bloqueia na chamada async do prompt.
  QA scenarios: happy (dispatch 200 OK) + failure (timeout de evento), Evidence <attemptDir>/task-3.json
  Commit: Y | feat(api): implementa cliente para api nativa do opencode
  Recommended task executor category: unspecified-high

- [ ] 4. Criar as `Mini-Skills` e Políticas (Acc-Master e Acc-Worker)
  What to do / Must NOT do: Criar os artefatos textuais em `src/skills/` que conterão as regras atômicas de cada persona. Master foca em DAG/Plane/Dispatch. Worker foca em TDD/RED-GREEN.
  Parallelization: Wave 2 | Blocked by: 1 | Blocks: 5
  References: `/home/marcelo-karval/Backup/Projetos/accelerate/adapters/runtime/openchamber/delegation-contract.md`.
  Acceptance criteria: Textos exportados como constantes ou lidos em runtime.
  QA scenarios: happy (textos carregados), Evidence <attemptDir>/task-4.json
  Commit: Y | docs(personas): define politicas estritas de master e worker
  Recommended task executor category: writing

- [ ] 5. Implementar Injector Hook e Security Gate
  What to do / Must NOT do: No `src/index.ts`, implementar `chat.messages.transform` para injetar as Mini-Skills baseadas no título e `tool.execute.before` para negar `edit`/`write`/`bash` ao `[MASTER]`.
  Parallelization: Wave 2 | Blocked by: 1, 4 | Blocks: 6, 7
  References: Handlers de plugin do OpenCode.
  Acceptance criteria: Tentativa mockada de uso de `edit` por Master retorna erro ou joga exceção no hook.
  QA scenarios: happy (bloqueio de tool no master) + failure (fuga de privilégio), Evidence <attemptDir>/task-5.json
  Commit: Y | feat(hooks): adiciona interceptadores de prompt e ferramentas
  Recommended task executor category: ultrabrain

- [ ] 6. Implementar `StateMachineService` (Orquestração Segura)
  What to do / Must NOT do: Gerencia as fases do Master (Discussion -> Spec -> Dispatch -> Fan-in). Aplica a regra de Fail-Closed e Quarentena para workers em timeout. Não inventar API de `cancel`.
  Parallelization: Wave 3 | Blocked by: 2, 3, 5 | Blocks: 7
  References: Regras de timeout no Delegation Contract do Accelerate.
  Acceptance criteria: Transição para `Dispatch` gera UUID de log e aguarda sinal via SSE. Timeout aciona `GitWorktreeService.quarantine`.
  QA scenarios: happy (fan-in natural) + failure (worker entra em loop e sofre quarentena), Evidence <attemptDir>/task-6.json
  Commit: Y | feat(state): implementa maquina de estados de orquestracao e fail-closed
  Recommended task executor category: deep

- [ ] 7. Implementar `PlaneApprovalGateService`
  What to do / Must NOT do: Renderiza o payload do MCP Plane (`plane_operator_lifecycle_transition`) como um recibo e retorna ao usuário. Exige `/acc-sync` explícito para acionar a API real.
  Parallelization: Wave 3 | Blocked by: 1 | Blocks: 8
  References: `/home/marcelo-karval/.hermes/skills/productivity/plane/references/work-item-lifecycle-contract.md`
  Acceptance criteria: Mock de transição de estado não faz requisição de rede antes de validação afirmativa.
  QA scenarios: happy (payload gerado e aprovado) + failure (payload sem aprovação bloqueado), Evidence <attemptDir>/task-7.json
  Commit: Y | feat(plane): adiciona servico de gate manual para lifecycle do plane
  Recommended task executor category: unspecified-high

- [ ] 8. Rehearsal End-to-End Isolado (Task 8 do P4Y)
  What to do / Must NOT do: Carregar o plugin e simular localmente a orquestração do Master despachando o Worker `[W-8]` para a task Stripe Adapter.
  Parallelization: Wave 4 | Blocked by: 6, 7 | Blocks: F1
  References: DAG P4Y-74.
  Acceptance criteria: Worker executa no worktree, eventos SSE são recebidos pelo Master, Quarentena/Merge operam sem crashar o processo principal.
  QA scenarios: happy (rehearsal conclui), Evidence <attemptDir>/task-8.json
  Commit: Y | test(e2e): valida pipeline master/worker no cenario stripe adapter
  Recommended task executor category: deep

## Final verification wave
> Runs in parallel after ALL todos. ALL must APPROVE. Surface results and wait for the user's explicit okay before declaring complete.
- [ ] F1. Plan compliance & Security Audit: Verificar se as chamadas de rede da tool de edição estão perfeitamente blindadas na persona Master.
- [ ] F2. Artifact Verification: Confirmar que a integração de eventos SSE não vaza memória durante sessões longas.

## Commit strategy
Commits atômicos e estruturados (`feat`, `fix`, `test`, `build`), atrelados estritamente à execução TDD.

## Success criteria
O plugin pode ser carregado no OpenCode (`plugin: ["./path/to/accelerate-omo-plugin.ts"]`). Sessões Master não podem alterar arquivos locais; sessões Worker iniciadas pelo Master fluem em diretórios Git clonados via worktree, com reporte completo do ciclo de vida, sem a necessidade de interferência humana até a autorização explícita do Plane.
