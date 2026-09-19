# SDD: Accelerate Platform v2.0 - Full Lifecycle Architecture Specification

## 1. Module Overview & Interfaces

Accelerate v2.0 adds 4 new tools, 1 schema contract, and 3 service extensions:

```text
┌─────────────────────────────────────────────────────────────────────────────┐
│                            AccelerateOmoPlugin v2.0                         │
├──────────────────────────────────────┬──────────────────────────────────────┤
│ Core Services (src/services.ts)      │ Registered Tools (src/index.ts)      │
├──────────────────────────────────────┼──────────────────────────────────────┤
│ - PersonaManager (Path-Aware)        │ - acc_dispatch_worker (existing)     │
│ - OpenCodeClient (Portable Auth)     │ - acc_approve_plane_sync (existing)  │
│ - GitWorktreeService (Fan-in/Merge)  │ - acc_set_session_title (existing)   │
│ - StateMachineService (Wave FSM)     │ - acc_get_session_info (existing)    │
│ - WorkerReportValidator (Zod Schema) │ - acc_fanin_worker (NEW)             │
│                                      │ - acc_dispatch_wave (NEW)            │
│                                      │ - acc_poll_workers (NEW)             │
│                                      │ - acc_execute_plane_sync (NEW)       │
└──────────────────────────────────────┴──────────────────────────────────────┘
```

---

## 2. Component Specifications

### 2.1 Path-Aware Fencing (`src/persona-manager.ts`)
Update `isToolAllowed`:
```typescript
public isToolAllowed(sessionId: string, toolName: string, args?: Record<string, any>): boolean {
  const persona = this.getSessionPersona(sessionId);
  if (persona === "master") {
    const mutatingTools = ["edit", "write", "apply_patch"];
    if (mutatingTools.includes(toolName)) {
      const targetPath = args?.filePath || args?.path || "";
      if (this.isGovernancePath(targetPath)) {
        return true; // Whitelisted governance artifact
      }
      return false; // Blocked production code path
    }
  }
  return true;
}

public isGovernancePath(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, "/");
  return (
    normalized.startsWith("docs/plans/") ||
    normalized.startsWith("docs/architecture/") ||
    normalized.startsWith("docs/tasks/") ||
    normalized.startsWith("docs/reports/") ||
    normalized.startsWith(".accelerate/") ||
    normalized.includes("/docs/plans/") ||
    normalized.includes("/docs/architecture/") ||
    normalized.includes("/docs/tasks/") ||
    normalized.includes("/docs/reports/") ||
    normalized.includes("/.accelerate/")
  );
}
```

### 2.2 Worker Completion Report Schema (`src/types/worker-report.ts`)
```typescript
import { z } from "zod";

export const WorkerCompletionReportSchema = z.object({
  delegationId: z.string().min(1),
  taskSlug: z.string().min(1),
  status: z.enum(["success", "failed"]),
  touchedFiles: z.array(z.string()),
  testResults: z.object({
    command: z.string(),
    passed: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    exitCode: z.number().int(),
  }),
  buildStatus: z.enum(["clean", "failed"]),
  diffSummary: z.string(),
  invariantsSatisfied: z.array(z.string()).default([]),
});

export type WorkerCompletionReport = z.infer<typeof WorkerCompletionReportSchema>;
```

### 2.3 Automated Fan-In Tool: `acc_fanin_worker` (`src/index.ts`)
```typescript
tool({
  name: "acc_fanin_worker",
  description: "Automates Worker fan-in: runs verification suite, audits diff, merges branch with --no-ff, and removes worktree.",
  args: {
    targetDir: z.string().describe("Path of the target Git Worktree"),
    testCommand: z.string().optional().default("npm test").describe("Verification test command to run in worktree"),
    targetBranch: z.string().optional().default("master").describe("Branch to merge into"),
    report: WorkerCompletionReportSchema.optional().describe("Optional structured Worker completion report"),
  },
  execute: async (args, context) => {
    // 1. Validate worktree exists
    // 2. Run testCommand in worktree
    // 3. Inspect git diff
    // 4. Merge branch into targetBranch with --no-ff
    // 5. Clean up worktree and delete branch
    // 6. Return FanInResult envelope
  }
})
```

### 2.4 Parallel Wave Dispatch: `acc_dispatch_wave` & `acc_poll_workers`
```typescript
tool({
  name: "acc_dispatch_wave",
  description: "Dispatches a parallel wave of atomic workers across independent Git worktrees.",
  args: {
    waveSlug: z.string().describe("Identifier for the wave (e.g. 'wave-1-core')"),
    tasks: z.array(
      z.object({
        taskSlug: z.string(),
        targetDir: z.string(),
        specPath: z.string(),
        prompt: z.string(),
        baseRef: z.string().optional(),
      })
    ),
  },
  execute: async (args, context) => {
    // Concurrent dispatch via Promise.all across stateMachine.dispatchWorker
  }
});

tool({
  name: "acc_poll_workers",
  description: "Polls active execution status of dispatched worker sessions.",
  args: {
    sessionIds: z.array(z.string()).describe("List of worker session IDs to check"),
  },
  execute: async (args) => {
    // Queries each session and returns status array
  }
});
```

### 2.5 Config Portability (`src/opencode-client.ts`)
```typescript
this.baseUrl = options?.baseUrl ?? process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096";
this.apiKey = options?.apiKey ?? process.env.OPENCODE_API_KEY ?? process.env.OPENCODE_SERVER_PASSWORD;
```
Attach `Authorization: Bearer <apiKey>` or basic auth header if password configured.
