# ADR-006: Universal Session Tools Decoupling and Host Service Freshness Protocol

## Status
Accepted

## Date
2026-09-20

## Context
In previous iterations, session title management and identity discovery were introduced with the proprietary prefix `acc_` (`acc_set_session_title` and `acc_get_session_info`) and described with Accelerate-specific vocabulary. Consequently:
1. Standard AI models operating in non-Accelerate contexts (e.g. Sisyphus, general chat, or subagents) did not recognize these tools as general harness features, erroneously concluding that session renaming was impossible and falling back to unsupported OpenChamber actions.
2. Renaming a session and inspecting active identity are **fundamental runtime capabilities** applicable to all sessions, whether standard, master, worker, or third-party.
3. Furthermore, multiple host daemons execute concurrently (`opencode-web.service` on port 4096 and `openchamber.service` on port 3030 with an embedded `opencode serve` process). Rebuilding the plugin bundle without restarting both services leaves one host running stale code in memory.

## Decisions

### 1. Universal Tool Namespace
Register canonical, domain-agnostic tools:
- **`session_rename`**:
  - Description: "Renames the current OpenCode session title in the database and web UI. Defaults to active session if sessionId is omitted."
  - Accepts `title: string` (required) and `sessionId?: string` (optional, auto-resolved via context).
- **`session_info`**:
  - Description: "Retrieves identity and metadata for the current session, including session ID, title, directory, and active persona."
  - Accepts `sessionId?: string` (optional, auto-resolved via context).

### 2. Backward-Compatible Aliases
Retain `acc_set_session_title` and `acc_get_session_info` as direct aliases pointing to the identical implementation functions, ensuring zero regressions for existing Master/Worker workflows.

### 3. Host Service Freshness Law in AGENTS.md
Add Section 5 to `AGENTS.md`:
Whenever the plugin is compiled or released, engineers or orchestrators MUST execute:
```bash
systemctl --user restart openchamber.service opencode-web.service
```
to ensure 100% synchronized in-memory plugin instances across all user interfaces.

## Consequences
### Positive
- Any model (Sisyphus, Master, Worker, or vanilla OpenCode) naturally discovers and calls `session_rename` and `session_info`.
- Both OpenChamber and OpenCode Web reflect updated plugin capabilities synchronously.
- Eliminates reliance on `openchamber.session.update`.
- Zero breaking changes for existing code calling `acc_set_session_title`.

### Negative / Trade-offs
- Two additional tool aliases registered in the plugin export. Mitigated by minimal footprint (<5 lines of wrapper code).
