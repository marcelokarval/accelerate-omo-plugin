---
slug: accelerate-omo-master-workers
status: approved
intent: clear
review_required: true
plan_path: .omo/plans/accelerate-omo-master-workers.md
plan_sha256: null
review_round_id: null
pending-action: write and review .omo/plans/accelerate-omo-master-workers.md
review:
  momus:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/accelerate-omo-master-workers.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
  independent:
    status: pending
    workspace_root: null
    runtime_home: null
    target: .omo/plans/accelerate-omo-master-workers.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: null
approach: Desenhar o plugin OpenCode-first em TypeScript com autocontenção, sem depender de mutações no OpenChamber ou OMO core. O plugin opera com máquina de estados de 3 fases (Discussion -> Specification/Topology -> Master/Workers), onde o Master é estritamente orquestrador (sem edição de produto), despacha workers em sessões independentes e worktrees git isolados via API nativa do OpenCode (e OpenChamber opcional), impondo TDD e revisão independente antes de qualquer integração.
---

# Draft: accelerate-omo-master-workers

## Components (topology ledger)
| id | outcome | status | evidence path |
|---|---|---|---|
| C1-Discussion-Engine | Diálogo natural sem injeção de regras de código; detecta encerramento consensual | active | `~/.cache/.../oh-my-openagent/dist/skills/ulw-plan/references/intent-clear.md` |
| C2-Spec-Topology | Geração de ADR, SDD, Task Ledger (DAG) e sincronização formal com Plane | active | `/home/marcelo-karval/Backup/Projetos/accelerate/core/review/one-shot-side-by-side-protocol.md` |
| C3-Master-Guard | Bloqueio de ferramentas de edição no Master durante execução; autoridade central de merge | active | `/home/marcelo-karval/Backup/Projetos/accelerate/core/control-plane/post-spec-delegation-dispatch-gate.md` |
| C4-Worker-Session-Engine | Criação de sessões OpenCode independentes com worktree git e branch isolados | active | `http://127.0.0.1:4096/doc` (`/session`, `/session/prompt_async`, `/event`) |
| C5-Worker-TDD-Pair | Dupla interna do Worker (Implementador Hephaestus/Astra + Revisor Oracle/Momus) | active | `/home/marcelo-karval/Backup/Projetos/accelerate/core/review/active-correction-loop.md` |
| C6-OpenChamber-Adapter | Autodetecção do OpenChamber para espelhar sessões no UI sem violar tool restrictions | active | `/home/marcelo-karval/.config/openchamber/agent-tool/openchamber-plugin.js` |

## Open assumptions (announced defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Runtime primário | OpenCode HTTP API nativa (port 4096) | OpenChamber tool proíbe self-delegation no prompt instalado; OpenCode nativo tem rotas completas | Sim |
| Despacho assíncrono | `POST /session/:id/prompt_async` + SSE em `/event` | Evita bloqueio da janela do Master durante execução longa de workers | Sim |
| Isolamento de código | `git worktree add` antes de `session.create` | Evita colisões no working tree da branch de integração | Sim |
| Autoridade Plane | Plane MCP local via tools governadas | OMO e OpenSpec upstream não têm cliente nativo do Plane; MCP local já testado | Sim |

## Findings (cited - path:lines)
- `http://127.0.0.1:4096/doc`: rotas nativas `/session` (create), `/session/:id/prompt_async`, `/session/:id/abort`, `/session/:id` (patch title/archive), `/event` (SSE).
- `~/.config/openchamber/agent-tool/openchamber-plugin.js:4`: "never use this tool to delegate parts of your own current task... session dispatches return immediately by default and you receive no notification".
- `Backup/Projetos/accelerate/adapters/runtime/openchamber/delegation-contract.md:29`: gap formal documentado sobre falta de session.cancel e necessidade de timeout estrito.
- `Backup/Projetos/accelerate/core/control-plane/post-spec-delegation-dispatch-gate.md:31`: "root task writes into assigned executor scopes are prohibited; the root only owns fan-in, review-of-review, and closure".
- `Backup/Projetos/accelerate/core/review/active-correction-loop.md:20`: ciclo `capture -> inspect -> register -> assign -> fix -> reprobe -> compare -> promote`.

## Decisions (with rationale)
1. **Novo Repositório Dedicado**: `/home/marcelo-karval/Backup/Projetos/accelerate-omo-plugin` para manter o código testável, versionado e desacoplado do core do OMO.
2. **Dupla Camada de Sessão**: O core do plugin gerencia sessões chamando o OpenCode nativo; se detectar variáveis de ambiente do OpenChamber, emite sincronização visual.
3. **Sem Permissão Mágica por Título**: A máquina de estados controla o que o agente pode fazer com base em tokens de estado assinados em disco (`.accelerate/session-state.json`), não apenas lendo a string do título da sessão.
4. **Plane como Destino de Registro**: Master cria issues após aprovação do SDD usando o `plane-mcp-karval`, vinculando os IDs das tasks ao DAG local.

## Scope IN
- Plugin TypeScript compatível com OpenCode (`Plugin` interface de `@opencode-ai/plugin`).
- Máquina de estados: Discussion -> Spec/DAG -> Dispatch/Execution -> Fan-In/Review -> Closure.
- Criação e desmontagem de git worktrees para cada worker.
- Despacho assíncrono de sessões via OpenCode API nativa.
- Monitoramento de eventos SSE dos workers sem travar o Master.
- Enxerto de Mini-Skills (`acc-master`, `acc-worker`).
- Integração Plane via MCP para criar e atualizar tarefas.

## Scope OUT (Must NOT have)
- Nenhuma modificação no pacote instalado do OMO (`oh-my-openagent`).
- Nenhuma violação das restrições da tool do OpenChamber (não usar a tool `openchamber` para automação recursiva proibida).
- Nenhuma execução cega sem teste no Worker.
- Nenhuma criação de issues no Plane antes da aprovação humana do SDD.

## Approval gate
status: awaiting-approval
approach: Desenvolver o plugin `accelerate-omo` no repositório dedicado `/home/marcelo-karval/Backup/Projetos/accelerate-omo-plugin`. O plano de implementação segue TDD estrito com testes automatizados para cada transição de estado, despacho de worktrees e integração Plane, culminando em validação end-to-end com a Task 8 do P4Y-74.
pending-action: write .omo/plans/accelerate-omo-master-workers.md
