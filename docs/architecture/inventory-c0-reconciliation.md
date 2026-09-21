# Inventory C0 Reconciliation & Forensic Audit Matrix

## 1. Runtime Fact Inventory (Observed Environment)

| Dimension | Real Value / Property | Evidence / Command Source |
|---|---|---|
| **Host System & OS** | Linux x86_64 (Ubuntu) | `uname -a` |
| **Node.js Runtime** | `v24.20.0` | `node --version` |
| **OpenCode Daemon** | `1.18.31` | `opencode --version` |
| **OpenChamber Web** | `@openchamber/web@1.24.2` | Global pnpm package directory |
| **Oh-My-OpenAgent (OmO)** | `oh-my-openagent@5.0.0-beta.74` | Local cache package.json |
| **This Plugin** | `accelerate-omo-plugin@3.1.0` (ESM module) | `package.json` |
| **Host Services Active** | `openchamber.service` (Active, PID 1031773) | `systemctl --user is-active` |
| **Host Services Inactive** | `opencode-web.service` (Disabled/Stopped) | `systemctl --user is-active` |
| **OpenCode Dynamic Port** | Loopback dynamic port (e.g. `35113` / `36847`) | `openchamber` startup logs |
| **Loaded OpenCode Plugins** | `@anthonyhaussman/opencode-agy-auth`, `accelerate-omo-plugin`, `oh-my-openagent` | `~/.config/opencode/opencode.json` |
| **Available Native Tools** | `team_*` (Team Mode available in OmO), `task`, `openchamber`, `codebase_memory_*`, `plane_*` | Tool registry audit |

---

## 2. Forensic Audit Matrix (Correction of Prior Claims)

| Alegação Anterior | Fonte da Alegação | Realidade Observada | Limite Técnico | Decisão de Engenharia |
|---|---|---|---|---|
| **"Sessões e chamadas provam qualidade e aceite"** | Transcrição de sessões anteriores (`ses_f4f3...`) | A existência de chamadas de API (`session.create`, `session.send`) registra apenas despacho e tráfego de mensagens. | Tráfego de mensagens não prova validade técnica, ausência de regressão, aderência arquitetural ou aceite formal. | **NUNCA inferir qualidade ou aceite a partir de logs de atividade.** Aceite exige oráculos executáveis independentes e inspeção forense de artefatos. |
| **"8/8 GREEN comprova ausência de GAPs"** | Relatório de testes de sessão anterior | O harness executou 8 testes em script dedicado com exit code 0. | Um teste só é válido se o oráculo for adversarial, os testes cobrirem condições de contorno e o candidato testado for o código de produção real. | **Exigir prova de oráculos e isolamento.** Testes devem rodar contra o runtime distribuível instalado, sem mocks complacentes. |
| **"Master sem código significa Master impedido de escrever specs"** | Falha de execução de `write` na sessão Master | O hook `tool.execute.before` bloqueava `edit`/`write` sem inspecionar argumentos de caminho (`filePath`). | O contrato do hook fornece `input.args` com o caminho do arquivo. | **Fencing contextual por caminho (`isGovernancePath`).** Master tem permissão explícita para escrever em `docs/**` e `.accelerate/**`, permanecendo estritamente bloqueado em `src/**`. |
| **"Perfil `contract` é bypass geral de prontidão"** | Discussão de paradoxo do `specPath` | O despacho falhou porque `specPath` não existia antes de ser redigido. | Uma tarefa cuja missão é redigir o documento não pode exigir o documento pronto como entrada. | **Entradas flexíveis por tipo de tarefa.** Uma tarefa de contrato recebe um briefing autorizado como entrada; não exige PRD pré-existente no disco. |
| **"Falta contrato de retorno estruturado"** | Discussão de ausência de padrão | Já existia `WorkerCompletionReportSchema` e seções em `skills/acc-worker.md`. | A falha não era ausência de contrato, mas falta de injeção determinística do template no worker e validação no fan-in. | **Padronizar e automatizar.** Injetar o template estruturado no worker e validar via schema Zod no `acc_fanin_worker`. |
| **"Número de fases e de chamadas prova maturidade"** | Avaliação da FSM de 9 fases | A sessão executou 9 etapas por ordem explícita do prompt do operador. | O número de passos em um prompt representa o plano daquela missão específica, não uma FSM universal de produto. | **Rejeitar 9 fases no core do plugin.** O plugin mantém FSM operacional enxuta; planos complexos vivem nos ledgers de tarefas do projeto. |
| **"Retorno telegráfico substitui registro e provas"** | Adoção do Caveman Return v1 | O worker emitiu resumo conciso em Markdown. | Uma mensagem curta na UI é apresentação ergonômica; não substitui o relatório estruturado de proveniência nem o commit Git. | **Dualidade de retorno.** Exibição concisa na UI para ergonomia + envelope de proveniência estruturado e auditável no backend. |

---

## 3. Matriz de Reaproveitamento de Capacidades

| Componente / Recurso | Status de Decisão | Dono Autoritativo | Ação Arquitetural |
|---|---|---|---|
| **`acc_dispatch_worker`** | **ADAPTAR** | Git (Worktree) + OpenCode (Session) | Desacoplar da checagem rígida de `specPath`. Aceitar briefs e tipos de tarefas (`contract`, `test`, `impl`, `review`). |
| **`acc_fanin_worker`** | **ADAPTAR** | Git Worktree Service | Conter fan-in até haver prova de testes limpos, diff auditado e ausência de processos concorrentes escrevendo na worktree. |
| **`acc_dispatch_wave`** | **ADAPTAR** | Plugin + Git | Usar para paralelismo de worktrees independentes com IDs correlacionados. |
| **`session_rename` / `session_info`** | **MANTER** | OpenCode Runtime (API) | Manter como ferramentas universais de utilidade de sessão. |
| **`acc_status`** | **MANTER** | Plugin Runtime | Retornar versão do plugin, serverUrl, PID e evidências físicas do workspace. |
| **`acc_approve_plane_sync`** | **ADAPTAR** | Plane MCP / Workflow Authority | Separar preparação de recibo de execução de rede. |
| **`acc_execute_plane_sync`** | **ISOLAR** | Plane MCP | Bloquear alegação de execução de transição no Plane sem transporte HTTP/MCP real e readback confirmado do provedor. |
| **`Team Mode` (`team_*`)** | **INVESTIGAR** | OmO (Oh-My-OpenAgent) | Avaliar se as primitivas nativas de equipe do OmO atendem aos requisitos de subagentes dentro de workers, sem duplicar orquestradores. |
| **`Loop de Continuação`** | **SUBSTITUIR POR NATIVO** | OmO / OpenChamber | Não implementar engine própria de continuação; usar os mecanismos nativos do OmO (`ralph loop`, `continuation`). |
| **`FSM de 9 Fases`** | **ISOLAR** | Projeto de Metodologia (`accelerate`) | Remover do núcleo do plugin. A FSM do plugin cuida do ciclo da worktree/sessão. |

---

## 4. Definição dos Próximos Slices de Trabalho (Apenas Planejamento — Não Autorizados para Execução)

Os seguintes slices foram identificados e delimitados. **Nenhum destes slices está autorizado para implementação nesta rodada**:

### Slice P1: Contenção do Plane MCP e Readback Verdadeiro
- **Problema**: `acc_execute_plane_sync` não pode alegar execução bem-sucedida sem transporte HTTP/MCP real com o Plane.
- **Arquivos-alvo**: `src/plane-adapter.ts`, `src/index.ts`, `test/plane-adapter.test.ts`.
- **Critério de Saída**: Falha fechada e marcação explícita de `transport: "unconnected"` quando o MCP não estiver conectado.

### Slice P2: Blindagem do Fan-In e Quarentena Preventiva
- **Problema**: `acc_fanin_worker` precisa verificar se a worktree está congelada e se não há subagentes ou processos zumbis escrevendo antes de iniciar o merge.
- **Arquivos-alvo**: `src/git-worktree.ts`, `src/index.ts`, `test/git-worktree.test.ts`.
- **Critério de Saída**: Testes negativos cobrindo worktree dirty, processo em escrita ativa e merge com conflito.

### Slice P3: Desacoplamento da Validação de Specs para Tarefas de Documentação
- **Problema**: `acc_dispatch_worker` bloqueia workers de documentação porque o `specPath` ainda não existe.
- **Arquivos-alvo**: `src/state-machine.ts`, `src/index.ts`, `test/state-machine.test.ts`.
- **Critério de Saída**: Permite `taskType: "contract"` ou `briefingText` sem exigir arquivo físico pré-existente.

### Slice P4: Prova de Conceito de Worker com Subagente Nativo
- **Problema**: Comprovar a viabilidade técnica de uma sessão Worker invocar subagentes nativos do OmO/OpenCode sem recursão ilimitada.
- **Arquivos-alvo**: Test harness isolado em ambiente descartável (`test/worker-subagent-poc.test.ts`).
- **Critério de Saída**: Prova documentada em ambiente efêmero antes de qualquer alteração no código de produção.

### Slice P5: Observação e Polling Confiáveis sem Inferência de "Idle"
- **Problema**: `acc_poll_workers` não pode inferir que uma sessão terminou pelo simples fato de ela estar "idle".
- **Arquivos-alvo**: `src/index.ts`, `src/opencode-client.ts`, `test/plugin-tools.test.ts`.
- **Critério de Saída**: Distinção explícita entre `idle` (aguardando input), `running` (processando) e `completed` (report emitido).

### Slice P6: Integração Metodológica via Adapter Plugável
- **Problema**: Separar o plugin operacional de qualquer metodologia específica através de um contrato de validação plugável.
- **Arquivos-alvo**: `src/doctrine-adapter.ts`, `src/services.ts`.
- **Critério de Saída**: O plugin funciona em qualquer repositório, com ou sem a doutrina do Accelerate.
