# SDD: Session Self-Identity Discovery and Native Title Management

## 1. System Overview
This Software Design Document specifies the extension to `accelerate-omo-plugin` providing:
1. `OpenCodeClient.updateSession(sessionId, updates)` method connecting to `PATCH /session/:id`.
2. `acc_set_session_title` tool allowing both explicit and automatic self-session title updates.
3. `acc_get_session_info` tool enabling any session to discover its own session ID, title, directory, and active persona.
4. Auto-synchronization of internal `PersonaManager` cache upon title mutation.

---

## 2. API & Component Design

### 2.1 `OpenCodeClient` Extension (`src/opencode-client.ts`)

```typescript
export interface SessionUpdatePayload {
  title?: string;
  [key: string]: any;
}

export class OpenCodeClient {
  // ... existing methods ...

  /**
   * Updates session metadata (e.g. title) via PATCH /session/:id
   */
  public async updateSession(
    sessionId: string,
    updates: SessionUpdatePayload
  ): Promise<SessionInfo | null> {
    const url = `${this.baseUrl}/session/${encodeURIComponent(sessionId)}`;
    const response = await this.fetchFn(url, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(updates),
    });

    if (!response.ok) {
      const errorText = await response.text().catch(() => "Unknown error");
      throw new Error(`OpenCode API error (PATCH /session/${sessionId}): ${response.status} ${errorText}`);
    }

    return (await response.json()) as SessionInfo;
  }
}
```

### 2.2 Tool Specification: `acc_set_session_title` (`src/index.ts`)

- **Name**: `acc_set_session_title`
- **Description**: "Sets or renames the title of an OpenCode session. If sessionId is omitted, automatically resolves the current session ID from execution context."
- **Parameters Schema**:
  ```typescript
  z.object({
    title: z.string().min(1).describe("The new title for the session (e.g. '[MASTER] My Project')"),
    sessionId: z.string().optional().describe("Target session ID. If omitted, automatically defaults to the caller session ID.")
  })
  ```
- **Execution Logic**:
  1. Determine effective `targetSessionId = args.sessionId || context?.sessionID`.
  2. If `!targetSessionId`, throw error: `"Unable to determine session ID. Please provide sessionId explicitly or ensure execution context is present."`
  3. Call `await openCodeClient.updateSession(targetSessionId, { title: args.title })`.
  4. Detect new persona: `const newPersona = personaManager.detectPersonaFromTitle(args.title)`.
  5. Update cache: `personaManager.registerSessionPersona(targetSessionId, newPersona)`.
  6. Return JSON string:
     ```json
     {
       "status": "success",
       "sessionId": "<targetSessionId>",
       "title": "<args.title>",
       "persona": "<newPersona>"
     }
     ```

### 2.3 Tool Specification: `acc_get_session_info` (`src/index.ts`)

- **Name**: `acc_get_session_info`
- **Description**: "Returns metadata and identity information for the current session, including session ID, title, active persona, and directory."
- **Parameters Schema**:
  ```typescript
  z.object({
    sessionId: z.string().optional().describe("Optional target session ID. Defaults to current session ID.")
  })
  ```
- **Execution Logic**:
  1. Determine effective `targetSessionId = args.sessionId || context?.sessionID`.
  2. If `!targetSessionId`, return `{ status: "unknown", message: "No session ID detected in context" }`.
  3. Query session: `const session = await openCodeClient.getSession(targetSessionId)`.
  4. Query persona: `const persona = await personaManager.resolveSessionPersona(targetSessionId, openCodeClient)`.
  5. Return JSON:
     ```json
     {
       "status": "success",
       "sessionId": targetSessionId,
       "title": session?.title ?? "Untitled",
       "persona": persona,
       "directory": session?.directory ?? process.cwd()
     }
     ```

---

## 3. Mini-Skills Governance Updates

In `skills/acc-master.md`:
Add under Section 1 (Entry Sequence):
```markdown
### 1.1 Self-Identity & Session Branding
- You can inspect your active identity anytime via `acc_get_session_info`.
- When instructed to brand or rename your session to reflect `[MASTER] <Domain>`, call `acc_set_session_title({ title: "[MASTER] <Domain>" })`. Omitting `sessionId` automatically applies to the current session.
```

In `skills/acc-worker.md`:
Add under Section 1 (Identity & Boundary):
```markdown
### 1.1 Worker Identity Discovery
- A Worker session may inspect its identity via `acc_get_session_info`.
```

---

## 4. Test Specifications
1. **Unit Tests for `OpenCodeClient.updateSession`** in `test/opencode-client.test.ts`:
   - Successfully sends `PATCH /session/:id` with JSON payload `{ title: "New Title" }`.
   - Rejects with descriptive error when daemon returns 400, 404, or 500.
2. **Tool Contract Tests** in `test/plugin-tools.test.ts`:
   - `acc_set_session_title` executes with explicit `sessionId`.
   - `acc_set_session_title` executes without `sessionId` and uses `context.sessionID`.
   - `acc_set_session_title` fails closed when neither is provided.
   - `acc_get_session_info` returns caller's session ID and persona.
3. **Loader Contract Test** in `test/plugin-loader-contract.test.ts`:
   - Asserts entrypoint still exports only `AccelerateOmoPlugin` and all tools register cleanly.
