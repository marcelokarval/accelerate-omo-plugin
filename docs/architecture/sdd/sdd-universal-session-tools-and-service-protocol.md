# SDD: Universal Session Tools and Host Service Protocol Specification

## 1. System Overview
This Software Design Document specifies:
1. Registration of universal, domain-agnostic tools:
   - `session_rename` (aliasing `acc_set_session_title`)
   - `session_info` (aliasing `acc_get_session_info`)
2. Domain-neutral descriptions ensuring any LLM (Sisyphus, general, subagents) recognizes them for session management.
3. Documentation of Section 5 in `AGENTS.md` mandating simultaneous restart of `openchamber.service` and `opencode-web.service` upon plugin deployment.

---

## 2. API & Component Design

### 2.1 Tool Registration (`src/index.ts`)

```typescript
// Define shared execution functions to avoid code duplication
const executeSessionRename = async (args: { title: string; sessionId?: string }, context?: any) => {
  const targetSessionId = args.sessionId || context?.sessionID;
  if (!targetSessionId) {
    throw new Error("[ACCELERATE ERROR] Missing sessionId for session_rename.");
  }

  await openCodeClient.updateSession(targetSessionId, { title: args.title });
  const newPersona = personaManager.detectPersonaFromTitle(args.title);
  personaManager.registerSessionPersona(targetSessionId, newPersona);

  return JSON.stringify(
    {
      status: "success",
      sessionId: targetSessionId,
      title: args.title,
      persona: newPersona,
    },
    null,
    2
  );
};

const executeSessionInfo = async (args: { sessionId?: string }, context?: any) => {
  const targetSessionId = args.sessionId || context?.sessionID;
  if (!targetSessionId) {
    throw new Error("[ACCELERATE ERROR] Missing sessionId for session_info.");
  }

  const session = await openCodeClient.getSession(targetSessionId);
  const persona = await personaManager.resolveSessionPersona(targetSessionId, openCodeClient);

  const directory = session?.location?.directory || session?.directory || undefined;
  const title = session?.title || undefined;

  return JSON.stringify(
    {
      status: "success",
      sessionId: targetSessionId,
      title,
      persona,
      directory,
    },
    null,
    2
  );
};

// Register in tools dictionary:
session_rename: tool({
  description: "Renames the current OpenCode session title in the database and web UI. Defaults to the active session if sessionId is omitted.",
  args: {
    title: z.string().min(1).describe("The new title for the session"),
    sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
  },
  execute: executeSessionRename,
}),

session_info: tool({
  description: "Retrieves metadata and identity for the current session, including session ID, title, directory, and active persona.",
  args: {
    sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
  },
  execute: executeSessionInfo,
}),

// Aliases for backward compatibility:
acc_set_session_title: tool({
  description: "Updates an OpenCode session title and registers the corresponding Accelerate persona (alias of session_rename).",
  args: {
    title: z.string().min(1).describe("The new title for the session"),
    sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
  },
  execute: executeSessionRename,
}),

acc_get_session_info: tool({
  description: "Retrieves metadata and resolved Accelerate persona for an OpenCode session (alias of session_info).",
  args: {
    sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
  },
  execute: executeSessionInfo,
}),
```

---

### 2.2 `AGENTS.md` Host Service Freshness Law

Add to `AGENTS.md`:

```markdown
## 5. Host Service Freshness & Deployment Law
- **Dual Daemon Synchronization**: OpenCode executes through two concurrent user services in this environment:
  1. `opencode-web.service` (Systemd web daemon on port `4096`).
  2. `openchamber.service` (OpenChamber dashboard on port `3030`, running an embedded `opencode serve` child process).
- **Mandatory Reload on Build**: Whenever `accelerate-omo-plugin` is updated, built (`npm run build`), or released, the engineer or agent MUST execute:
  ```bash
  systemctl --user restart openchamber.service opencode-web.service
  ```
  Failing to restart both services leaves stale plugin snapshots in memory, causing silent tool omission and desynchronization across clients.
```

---

## 3. Test Specifications

1. **`test/plugin-tools.test.ts`**:
   - Asserts `session_rename` is registered and functions identically to `acc_set_session_title`.
   - Asserts `session_info` is registered and functions identically to `acc_get_session_info`.
   - Verifies auto-resolution of `context.sessionID`.
2. **`test/plugin-loader-contract.test.ts`**:
   - Asserts single export isolation (`AccelerateOmoPlugin` only).
   - Verifies all tools in `tools` dictionary instantiate and execute without error.
