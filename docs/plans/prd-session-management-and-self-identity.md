# PRD: Session Self-Identity Discovery and Title Management

## 1. Problem Statement & Background
In recent operational turns, two critical friction points emerged when agents attempted to manage their own sessions:
1. **Self-Session-ID Blindness**: Agents operating in OpenCode do not automatically know their own `sessionId`. When instructed to operate on "this session" (e.g. rename it, query its state), agents resorted to clumsy SQLite queries or guessed IDs from other active sessions, leading to accidents where the wrong session was altered (e.g. modifying a parent session in another workspace).
2. **Missing Official Session Operations Tool**: Although OpenCode's HTTP daemon on port `4096` natively supports `PATCH /session/:id` to rename session titles, `accelerate-omo-plugin` did not provide an operational tool for it. When asked to rename its session to `[MASTER] ...`, the agent inspected only the `openchamber` MCP tool, found no `session.rename` action, and falsely declared that renaming was impossible in OpenCode.

## 2. Business & Operational Goals
- **Deterministic Self-Identity**: Every session must be able to resolve its own `sessionId` deterministically without guessing or executing external bash/sqlite heuristics.
- **Native Title Management**: Provide an official tool (`acc_set_session_title`) registered in OpenCode via `accelerate-omo-plugin` that calls `PATCH /session/:id` to update the title in SQLite and broadcast it to connected clients (OpenChamber, Web UI).
- **Auto-Discovery by Default**: The title update tool must make `sessionId` **optional**. When omitted, the plugin automatically resolves the calling session's ID from the tool execution context (`context.sessionID`).
- **Self-Inspection Tool**: Provide `acc_get_session_info` returning the caller's session ID, title, directory, active persona, and available tools.
- **Governance Alignment**: When a Master or Worker sets its title, the `PersonaManager` and OpenCode runtime metadata must stay synchronized.

## 3. Scope
### In Scope
- Add `updateSession(sessionId: string, updates: { title?: string })` method to `OpenCodeClient`.
- Add `acc_set_session_title` tool to `accelerate-omo-plugin` with `title: string` (required) and `sessionId?: string` (optional, auto-resolved via context).
- Add `acc_get_session_info` tool to inspect calling session metadata.
- Expose tools in `src/index.ts` and test suite.
- Update `skills/acc-master.md` and `skills/acc-worker.md` with instructions on session self-identity and renaming.
- Comprehensive unit tests in Vitest covering `OpenCodeClient.updateSession`, tool execution with explicit ID, and tool execution with context-resolved ID.

### Out of Scope
- Modifying OpenCode daemon core binary.
- Arbitrary session deletion from Master window without user confirmation.

## 4. User Journeys
1. **User requests rename**: User prompts: `"renomeie esta sessão para '[MASTER] Reversa no Projeto local'"`.
2. **Tool invocation**: Agent invokes `acc_set_session_title({ title: "[MASTER] Reversa no Projeto local" })` without passing `sessionId`.
3. **Context resolution**: The plugin resolves `context.sessionID` (`ses_...`), calls `PATCH /session/:id` on the OpenCode daemon, updates its internal `PersonaManager` cache, and returns `{ status: "success", sessionId: "ses_...", title: "[MASTER] Reversa no Projeto local" }`.
4. **Immediate feedback**: The UI updates in real-time, and the next turn already operates with full `[MASTER]` governance without manual workarounds.

## 5. Acceptance Criteria
1. Calling `acc_set_session_title({ title: "..." })` without `sessionId` successfully resolves the active session's ID and updates OpenCode's title via `PATCH /session/:id`.
2. Calling `acc_set_session_title({ sessionId: "ses_explicit", title: "..." })` updates the specified session.
3. Calling `acc_get_session_info()` returns `{ sessionId: "...", title: "...", directory: "...", persona: "..." }`.
4. Unit tests mock HTTP `PATCH /session/:id` and verify exact payload and response handling.
5. Plugin loader contract test continues to pass with 100% compliance.
