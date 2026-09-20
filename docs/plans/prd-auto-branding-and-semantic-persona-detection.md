# PRD: Semantic Persona Detection and Cross-Client Auto-Branding

## 1. Executive Summary & Problem Statement
In OpenCode, a session record is physically instantiated in the daemon's database only upon receiving its first user message. Regardless of client interface (TUI, OpenCode Web, or OpenChamber), users cannot set a custom session title before submitting their initial prompt. Consequently:
1. Every newly initialized session is assigned a generic system title (e.g. `New session - 2026-09-20T...`).
2. If the user's initial prompt does not strictly begin with the bracketed prefix `[MASTER]`, the plugin's `PersonaManager` fails to classify the session as a Master Orchestrator, defaulting to `standard`.
3. In `standard` mode, the critical `<PERSONA_GOVERNANCE>` law is omitted, tool fencing is disabled, and the agent operates as a general-purpose worker without decomposition, PRD/ADR/SDD pipeline rigor, or worktree isolation.
4. Furthermore, natural instructions such as `"Você é a sessão MASTER..."`, `"Atue como Master Orchestrator"`, or `"Inicie a orquestração deste repositório"` are completely ignored by the legacy literal title check.

## 2. Business & Operational Goals
- **Client-Agnostic Governance**: Ensure that whether a user starts a session from the CLI TUI, OpenChamber, or OpenCode Web, the Master persona and governance laws activate deterministically from the very first turn.
- **Multi-Lingual Semantic Intent Recognition**: Detect Master Orchestrator intent from natural language triggers in both English and Portuguese without requiring rigid bracket notation.
- **Autonomous Session Rebranding (Auto-Branding)**: On the initial turn of a generic session, if Master intent is recognized, automatically execute `PATCH /session/:id` to rename the session to `[MASTER] <Concise Objective>` in real time.
- **Instant UI and Database Synchronization**: Reflect the new `[MASTER]` title immediately in OpenChamber's sidebar, Web UI headers, and SQLite persistence.
- **Zero False Positives**: Maintain clean separation for standard tasks, worker tasks, and master orchestration.

## 3. Scope
### In Scope
- Upgrade `PersonaManager.detectPersona` to support both session titles and prompt texts with semantic keyword recognition.
- Multi-lingual semantic patterns:
  - English: `[MASTER]`, `MASTER:`, `MASTER -`, `you are the master`, `act as master`, `master orchestrator`, `master session`, `lead orchestrator`.
  - Portuguese: `você é o master`, `voce e o master`, `atue como master`, `orquestrador master`, `sessão master`, `sessao master`, `governança do ecossistema`.
- Autonomous Title Generator: Extract a clean, concise title summary (e.g. `[MASTER] Limpeza da Raiz do Repositório`) from the initial prompt.
- Auto-Branding in `chat.message`: If a session has a generic title (`New session - ...`, `Untitled`, empty) and is classified as `master`, trigger an asynchronous background update via `openCodeClient.updateSession(sessionID, { title })` and cache it in `PersonaManager`.
- Comprehensive unit tests in Vitest covering multi-lingual triggers, generic title rebranding, and non-generic preservation.

### Out of Scope
- Rebranding worker sessions (`⚡ [W-*]`), which are already deterministically titled by `acc_dispatch_worker` and `acc_dispatch_wave`.

## 4. User Journeys
1. **User opens TUI/OpenChamber**: Clicks new session, types: `"analise a raiz desse repositório e atue como master orchestrator para fazer a limpeza"`.
2. **First message hook execution**:
   - `chat.message` intercepts the message.
   - Detects semantic Master intent from the prompt.
   - Sets session persona to `master`.
   - Injects `<PERSONA_GOVERNANCE>` into the turn.
   - Dispatches `updateSession` to rename title to `[MASTER] Limpeza da raiz desse repositório`.
3. **Outcome**:
   - The UI immediately displays `[MASTER] ...` in the sidebar.
   - The agent responds as a Master Orchestrator, refusing direct code modification and following the engineering pipeline.

## 5. Acceptance Criteria
1. Prompts containing natural Master triggers in English or Portuguese activate the `master` persona on Turn 1.
2. Generic session titles are automatically renamed to `[MASTER] ...` on Turn 1 via `OpenCodeClient.updateSession`.
3. Existing non-generic titles (e.g. an already custom-named session) retain their name unless explicitly overridden.
4. Unit tests mock daemon calls and verify exact regex matching and title generation.
5. All 76+ existing tests continue to pass with 0 regressions and 0 tsc errors.
