# ADR-002: Strict Single-Export Entrypoint and Authoritative Session Title Persona Resolution

## Status
Accepted

## Context
In `accelerate-omo-plugin` v1.1.0, the entrypoint `src/index.ts` exported both the plugin factory (`AccelerateOmoPlugin`) and internal service classes (`PersonaManager`, `GitWorktreeService`, `OpenCodeClient`, `StateMachineService`, `PlaneApprovalGateService`).
OpenCode's runtime plugin loader iterates over all exported values of a plugin module (`Object.values(module)`), treating any function value as a plugin initializer. Invoking ES6 class constructors without `new` immediately triggers a `TypeError`, resulting in OpenCode discarding the plugin at startup.

Furthermore, persona identification in the `chat.message` hook checked the user prompt text instead of retrieving the canonical session title from the OpenCode daemon, causing session fencing to fail when user prompts lacked explicit `[MASTER]` tag prefixes.

## Decision
1. **Strict Single Plugin Export**:
   `src/index.ts` must export ONLY the default plugin factory (`AccelerateOmoPlugin`). No helper classes, types, or services may be exported from `src/index.ts`. All service classes remain exportable via a separate module (`src/services.ts` or individual files) for unit testing.
2. **Authoritative Asynchronous Persona Resolution**:
   `PersonaManager` will support an asynchronous method `resolveSessionPersona(sessionId, openCodeClient)` that inspects the in-memory cache first, and upon a cache miss, queries `openCodeClient.getSession(sessionId)` to detect `[MASTER]` or `[W-*]` in `session.title`.
3. **Dual Hook Fencing Integration**:
   Both `chat.message` and `tool.execute.before` must await persona resolution for the incoming `sessionID`.
4. **Runtime Loader Simulation Test**:
   The test suite must implement a runtime loader compatibility test that replicates OpenCode's `Zy(mod)` iteration to guarantee zero non-callable exports in `dist/index.js`.

## Consequences
- **Positive**: `accelerate-omo-plugin` loads cleanly in OpenCode with 0 startup errors.
- **Positive**: Sessions titled `[MASTER]` in OpenChamber/OpenCode are reliably fenced regardless of what text the user inputs in the prompt.
- **Positive**: Prevents regression where new exported utilities break plugin loading.
