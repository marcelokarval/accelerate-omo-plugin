# PRD: Dynamic Host Server URL Binding and Goal-Driven Title Synthesis

## 1. Problem Statement & Root Cause
Two foundational architectural defects were uncovered during production forensics:
1. **Static Host Server Port Assumption**:
   - `accelerate-omo-plugin` initialized its `OpenCodeClient` with a hardcoded fallback of `http://127.0.0.1:4096`.
   - When running under OpenChamber (`openchamber.service`), OpenChamber does not communicate over port `4096`; instead, it spawns its own internal `opencode serve --port <ephemeral>` instance on a dynamic port (e.g. `45607`).
   - The OpenCode plugin contract specifically provides `PluginInput.serverUrl: URL` representing the exact local address and port of the hosting process. Because the plugin ignored `context.serverUrl`, all HTTP calls from the plugin (`GET /session/:id`, `PATCH /session/:id`, `acc_set_session_title`) targeted port `4096`, leading to timeouts, connection hangs, and silent failure of persona resolution.
2. **Naive Word-Slicing Title Synthesis & Typo Fragility**:
   - `PersonaManager.generateMasterTitle` implemented a naive word-slicing heuristic that simply extracted the first few words following `[MASTER]`. When a user provided natural or conversational instructions (e.g. `"vc agpra é o master, já renomeie essa sessão e aguarde"`), the algorithm produced absurd titles such as `[MASTER] Desta Sessão De Continuidade...`.
   - Furthermore, simple typos (such as `vc agpra é o master` with `agpra` instead of `agora`) caused strict regex patterns to fail completely, preventing persona promotion.
3. **Host Daemon Redundancy & SQLite Contention**:
   - Running `opencode-web.service` concurrently with `openchamber.service` caused severe SQLite WAL database lock contention, memory bloat (15+ GB RAM), and accumulated 1,146 orphan subprocesses that eventually froze the SSE stream.

## 2. Business & Operational Goals
- **Dynamic Host Binding**:
  - `AccelerateOmoPlugin` MUST read `context.serverUrl` passed by OpenCode's plugin loader and bind `OpenCodeClient` to that exact server instance.
  - Guarantees 100% network compatibility whether running under OpenChamber (dynamic port), OpenCode Web (`4096`), CLI TUI, or remote Docker containers.
- **Goal-Driven Title Synthesis**:
  - If the user prompt is an imperative assignment (e.g. `"vc é o master renomeie e aguarde"`), the title must synthesize the project/workspace context: `[MASTER] <Project/Directory> - Orquestração`.
  - If the user prompt specifies a concrete engineering objective (e.g. `"analise a raiz e monte o plano de limpeza"`), the title must cleanly extract the domain goal: `[MASTER] Limpeza e Governança da Raiz do Repositório`.
- **Fuzzy & Typo-Tolerant Intent Matching**:
  - Match common abbreviations and typos in Portuguese and English: `vc`, `agpra`, `agora`, `eh`, `é`, `o master`, `a master`.
- **Single Master Daemon Deployment**:
  - Stop and disable the redundant `opencode-web.service` to recover system RAM, eliminate orphan MCPs, and prevent SQLite contention.

## 3. Scope & Acceptance Criteria
1. `AccelerateOmoPlugin` extracts `context?.serverUrl` and configures `OpenCodeClient` with the dynamic host URL.
2. `PersonaManager.detectPersonaFromText` matches typos like `"vc agpra é o master"`.
3. `PersonaManager.generateMasterTitle` generates intelligent, context-aware titles based on directory/domain when prompts are purely command-oriented.
4. Unit tests in Vitest verify dynamic `serverUrl` propagation and goal-driven title synthesis with 100% pass rate.
5. All 81+ existing tests pass with 0 regressions.
