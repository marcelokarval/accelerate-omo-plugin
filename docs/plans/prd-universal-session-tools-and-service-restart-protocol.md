# PRD: Universal Session Lifecycle Tools and Service Freshness Protocol

## 1. Executive Summary & Problem Statement
Recent operational forensics revealed two fundamental design defects:
1. **Misplaced Tool Ownership**: Session management capabilities (renaming titles, querying current session identity) were named with the proprietary prefix `acc_` (`acc_set_session_title`, `acc_get_session_info`) and described with Accelerate-specific terminology. Because of this, general models (such as `Sisyphus - ultraworker` or standard OpenCode agents) operating in non-Accelerate sessions did not perceive these tools as general harness capabilities. When asked to rename their session, agents erroneously attempted unsupported `openchamber.session.update` calls and failed.
   - Renaming and inspecting sessions are **universal runtime operations**, independent of whether a session is a Master, Worker, Sisyphus, or standard chat.
2. **Service Desynchronization and Stale Memory Snapshots**: The user's system runs multiple long-lived daemon processes that load the OpenCode plugin bundle into memory:
   - `opencode-web.service` (listening on port `4096`).
   - `openchamber.service` (listening on port `3030`, with an internal child process `opencode serve` on port `45607`).
   When `accelerate-omo-plugin` was updated and rebuilt, `opencode-web.service` was restarted, but `openchamber.service` remained running continuously since September 19. As a result, sessions created or operated via OpenChamber were evaluated by a stale plugin in-memory snapshot that lacked recent tools and fixes.

## 2. Business & Operational Goals
- **Universal Session Tools**:
  - Expose universally named tools: `session_rename` and `session_info` with self-explanatory, domain-neutral descriptions that any LLM agent naturally selects.
  - Maintain backward-compatible aliases for `acc_set_session_title` and `acc_get_session_info`.
- **Automatic Persona Promotion on Rename**:
  - If any agent or user renames a session to begin with `[MASTER]`, the `PersonaManager` immediately promotes the session and activates governance gates.
- **Service Freshness Protocol in AGENTS.md**:
  - Formally document in `AGENTS.md` the mandatory operational law: whenever the plugin bundle is rebuilt or updated, ALL running host services (`opencode-web.service` and `openchamber.service`) MUST be restarted to ensure 100% memory synchronization.
- **Fair Verification**:
  - Leave target test session `ses_f4015f5a8ffehv1S5cmRt7r7dC` untouched via direct API PATCH. Validate the live behavior strictly through natural conversation in the session after restarting services.

## 3. Scope
### In Scope
- Register universal tool `session_rename` (alias `acc_set_session_title`).
- Register universal tool `session_info` (alias `acc_get_session_info`).
- Neutral, universal descriptions:
  - `session_rename`: "Renames the current or target OpenCode session title in the database and connected user interfaces."
  - `session_info`: "Returns metadata and identity information for the current session (sessionId, title, directory, persona)."
- Update `AGENTS.md` with Section 5: "Host Service Freshness & Deployment Law".
- Comprehensive unit tests in Vitest for universal tool names and backward-compatible aliases.
- Restart `openchamber.service` and `opencode-web.service`.

### Out of Scope
- Direct programmatic mutation of session `ses_f4015f5a8ffehv1S5cmRt7r7dC`.

## 4. Acceptance Criteria
1. Any agent can call `session_rename({ title: "..." })` without `sessionId` to rename its active session.
2. Any agent can call `session_info()` to discover its own session ID, title, and directory.
3. Existing references to `acc_set_session_title` and `acc_get_session_info` continue to function without breaking changes.
4. `AGENTS.md` explicitly mandates restarting `openchamber.service` and `opencode-web.service` after any plugin build.
5. All tests pass (100% green) and TypeScript compiles cleanly with 0 errors.
