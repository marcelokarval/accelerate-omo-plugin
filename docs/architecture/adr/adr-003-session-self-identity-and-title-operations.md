# ADR-003: Session Self-Identity Resolution and Native Title Management

## Status
Accepted

## Date
2026-09-19

## Context
In OpenCode, an AI session lacks built-in environment variables informing it of its own session ID (`ses_...`). When users request operations on the current session (such as updating its title, branding it as `[MASTER]` or `[W-*]`, or querying its execution metadata), agents are prone to:
1. Querying the local SQLite database directly via `bash` or `sqlite3`, which is brittle, non-portable, and risks picking the wrong session ID.
2. Checking process lists or assuming the latest created session is the active one, causing catastrophic crosstalk across workspaces (e.g. updating a parent or sibling session).
3. Declaring that session renaming is impossible because the `openchamber` MCP tool lacks a `session.rename` action.

However, OpenCode tool execution hooks provide a `context` parameter to each tool's `execute(args, context)` function containing `{ sessionID, messageID }`. Furthermore, the OpenCode daemon on port `4096` exposes a REST endpoint `PATCH /session/:id` allowing direct modification of session metadata, specifically `{ title: string }`.

## Decision
1. **Context-Based Deterministic Self-Identity**:
   Every Accelerate tool that operates on a session (including `acc_set_session_title` and `acc_get_session_info`) will accept an optional `sessionId?: string`. When omitted by the caller, the tool implementation must extract `context.sessionID` as the authoritative default. If neither is available, it must fail closed with an informative error.
2. **OpenCodeClient Native Session Mutation**:
   Extend `OpenCodeClient` with `updateSession(sessionId: string, updates: { title?: string }): Promise<SessionInfo>`. The method sends an HTTP `PATCH` request to `http://127.0.0.1:4096/session/:id` (or the configured base URL).
3. **Expose `acc_set_session_title` and `acc_get_session_info`**:
   Register two new native tools in `accelerate-omo-plugin`:
   - `acc_set_session_title`: Updates the title of the target or active session and synchronizes the local `PersonaManager` cache.
   - `acc_get_session_info`: Returns the active session ID, title, directory, active persona, and provenance.
4. **Mini-Skills Update**:
   Update `skills/acc-master.md` and `skills/acc-worker.md` to instruct agents that they have native tools to discover their own identity and adjust their session branding.

## Consequences
### Positive
- Zero guesswork: Agents automatically operate on their own session without SQLite queries or external heuristics.
- Immediate UI synchronization: Renaming triggers real-time updates in OpenCode Web and OpenChamber interfaces.
- Cache consistency: Renaming updates the internal `PersonaManager` cache immediately, ensuring governance rules take effect without waiting for service restarts.
- Strict backward compatibility: Existing tool interfaces remain unchanged.

### Negative / Trade-offs
- The tool depends on OpenCode daemon connectivity (port 4096). If the daemon is unreachable, the call will fail with a connection error.
