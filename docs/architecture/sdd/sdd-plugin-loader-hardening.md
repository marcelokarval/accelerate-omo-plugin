# SDD: Plugin Loader Hardening & Dynamic Session Title Resolution

## 1. System Architecture & Boundaries

### 1.1 Entrypoint Isolation (`src/index.ts`)
The plugin entrypoint `src/index.ts` must export ONLY:
- Default export: `AccelerateOmoPlugin: Plugin`
- Named export: `AccelerateOmoPlugin: Plugin` (identical reference to default)
- **Zero other exports** (no classes, interfaces, or helper functions).

All service classes (`PersonaManager`, `GitWorktreeService`, `OpenCodeClient`, `StateMachineService`, `PlaneApprovalGateService`) are re-exported through a dedicated barrel `src/services.ts` to allow testing and internal imports without polluting the plugin entrypoint.

### 1.2 OpenCode Client Session Retrieval
In `src/opencode-client.ts`, ensure `getSession(sessionId: string): Promise<any>` exists:
- Sends `GET ${this.baseUrl}/session/${sessionId}`
- Returns the parsed JSON payload with `title`, `directory`, `agent`, etc.
- Gracefully returns `null` on 404 or network errors rather than throwing unhandled exceptions.

### 1.3 Asynchronous Persona Resolution (`src/persona-manager.ts`)
Add `resolveSessionPersona(sessionId: string, client?: OpenCodeClient): Promise<SessionPersona>`:
1. If `this.sessionPersonas.has(sessionId)`, return cached persona.
2. If `client` is provided and `sessionId` is non-empty:
   - Call `await client.getSession(sessionId)`.
   - If session object exists and has `title` (string):
     - `detected = this.detectPersonaFromTitle(session.title)`.
     - If `detected !== "standard"`, call `this.registerSessionPersona(sessionId, detected)` and return `detected`.
3. Return `"standard"`.

Update `detectPersonaFromTitle`:
- Tolerates case-insensitive variations: `[MASTER]`, `MASTER -`, `MASTER:`, `⚡ [W-`, `[W-`, `[WORKER]`.

### 1.4 Hook Upgrades (`src/index.ts`)
1. **`tool.execute.before`**:
   - Asynchronously resolves persona:
     `await personaManager.resolveSessionPersona(sessionID, openCodeClient)`
   - Checks `isToolAllowed(sessionID, toolName)`.
   - If disallowed, throws `[ACCELERATE PERMISSION DENIED]`.
2. **`chat.message`**:
   - Asynchronously resolves persona from session title if not already registered:
     `let persona = await personaManager.resolveSessionPersona(sessionID, openCodeClient)`
   - If still `"standard"` and `firstPart.text` exists:
     - Check `detectPersonaFromTitle(firstPart.text)` as a fallback.
     - If detected, `registerSessionPersona(sessionID, detected)`.
     - Update `persona = detected`.
   - If `persona !== "standard"`:
     - Prepend `<PERSONA_GOVERNANCE>` instructions if not already present.

### 1.5 Realism Test Suite Addition (`test/plugin-loader-contract.test.ts`)
Implement an automated Vitest test that reproduces OpenCode's runtime loader:
```ts
const mod = await import("../src/index.js");
for (const val of Object.values(mod)) {
  if (typeof val === "function") {
    // Calling without 'new' must NOT throw a class constructor error
    const hooks = await (val as any)({});
    expect(hooks).toBeDefined();
    expect(hooks.tool).toBeDefined();
  }
}
```
