# SDD: Disk-Anchored Engineering FSM, Runtime Introspection & Coercive Gating

## 1. System Overview
This Software Design Document specifies the core engine of Accelerate Platform v3.0:
1. Physical disk state evaluator (`StateMachineService.evaluateProjectPhase(projectDir)`).
2. Physical pre-condition gating on worker dispatch (`acc_dispatch_worker` & `acc_dispatch_wave`).
3. Runtime diagnostic tool `acc_status`.
4. Synchronous first-turn auto-rebranding and state injection in `chat.message`.

---

## 2. Component Design

### 2.1 Disk-Anchored Phase Enumeration & Evaluation (`src/state-machine.ts`)

```typescript
export type PhysicalPipelinePhase =
  | "PRD_REQUIRED"
  | "ADR_REQUIRED"
  | "SDD_REQUIRED"
  | "TASKS_REQUIRED"
  | "READY_FOR_DISPATCH"
  | "EXECUTING_WAVE"
  | "READY_FOR_FANIN"
  | "COMPLETED";

export interface ProjectPhysicalEvidence {
  hasPrd: boolean;
  hasAdr: boolean;
  hasSdd: boolean;
  hasTasks: boolean;
  activeWorktrees: string[];
  quarantinedWorktrees: string[];
}

export class StateMachineService {
  // ...
  public evaluatePhysicalEvidence(projectDir: string = process.cwd()): ProjectPhysicalEvidence {
    const checkAnyExists = (dirNames: string[]): boolean => {
      for (const d of dirNames) {
        const fullPath = path.resolve(projectDir, d);
        if (fs.existsSync(fullPath)) {
          const files = fs.readdirSync(fullPath).filter((f) => f.endsWith(".md") && f !== "README.md");
          if (files.length > 0) return true;
        }
      }
      return false;
    };

    const hasPrd = checkAnyExists(["docs/plans", "planning"]);
    const hasAdr = checkAnyExists(["docs/architecture/adr", "docs/architecture/decisions"]);
    const hasSdd = checkAnyExists(["docs/architecture/sdd", "docs/sdd"]);
    const hasTasks = checkAnyExists(["docs/tasks", "planning/tasks"]);

    const worktreesDir = path.resolve(projectDir, ".worktrees");
    const activeWorktrees = fs.existsSync(worktreesDir)
      ? fs.readdirSync(worktreesDir).filter((d) => !d.startsWith("."))
      : [];

    const quarantineDir = path.resolve(projectDir, ".worktrees-quarantine");
    const quarantinedWorktrees = fs.existsSync(quarantineDir)
      ? fs.readdirSync(quarantineDir).filter((d) => !d.startsWith("."))
      : [];

    return {
      hasPrd,
      hasAdr,
      hasSdd,
      hasTasks,
      activeWorktrees,
      quarantinedWorktrees,
    };
  }

  public getPhysicalPipelinePhase(projectDir: string = process.cwd()): PhysicalPipelinePhase {
    const evidence = this.evaluatePhysicalEvidence(projectDir);

    if (evidence.activeWorktrees.length > 0) {
      return "EXECUTING_WAVE";
    }
    if (!evidence.hasPrd) {
      return "PRD_REQUIRED";
    }
    if (!evidence.hasAdr) {
      return "ADR_REQUIRED";
    }
    if (!evidence.hasSdd) {
      return "SDD_REQUIRED";
    }
    if (!evidence.hasTasks) {
      return "TASKS_REQUIRED";
    }
    return "READY_FOR_DISPATCH";
  }
}
```

### 2.2 Tool Specification: `acc_status` (`src/index.ts`)

- **Name**: `acc_status`
- **Description**: "Returns the active Accelerate platform runtime status, plugin version, disk-evaluated engineering phase, host serverUrl, and physical artifact evidence."
- **Parameters**:
  ```typescript
  z.object({
    directory: z.string().optional().describe("Optional target directory to evaluate (defaults to workspace root)"),
  })
  ```
- **Execution**:
  1. Determine `targetDir = args.directory || process.cwd()`.
  2. Compute `evidence = stateMachine.evaluatePhysicalEvidence(targetDir)`.
  3. Compute `phase = stateMachine.getPhysicalPipelinePhase(targetDir)`.
  4. Return JSON:
     ```json
     {
       "status": "success",
       "version": "3.0.0",
       "phase": "<phase>",
       "evidence": { ... },
       "host": {
         "serverUrl": "<dynamicBaseUrl>",
         "pid": "<process.pid>",
         "cwd": "<process.cwd()>"
       }
     }
     ```

### 2.3 Coercive Pre-Condition Gating on Dispatch (`src/index.ts`)

In `acc_dispatch_worker` and `acc_dispatch_wave`:
```typescript
const physicalPhase = stateMachine.getPhysicalPipelinePhase(process.cwd());
if (physicalPhase === "PRD_REQUIRED" || physicalPhase === "ADR_REQUIRED" || physicalPhase === "SDD_REQUIRED") {
  throw new Error(
    `[ACCELERATE PIPELINE BLOCKED] Cannot dispatch workers in phase '${physicalPhase}'. Master must author specifications first (PRD -> ADR -> SDD).`
  );
}
```

---

## 3. Test Specifications

1. **`test/state-machine.test.ts`**:
   - Evaluates `PRD_REQUIRED` when `docs/plans` is empty.
   - Evaluates `ADR_REQUIRED` when `docs/plans/prd.md` is created.
   - Evaluates `SDD_REQUIRED` when `docs/architecture/adr/adr-001.md` is added.
   - Evaluates `TASKS_REQUIRED` when `docs/architecture/sdd/sdd-001.md` is added.
   - Evaluates `READY_FOR_DISPATCH` when `docs/tasks/tasks.md` is added.
   - Evaluates `EXECUTING_WAVE` when `.worktrees/task-1` exists.
2. **`test/plugin-tools.test.ts`**:
   - Asserts `acc_status` tool returns running version `3.0.0`, phase, host info, and evidence.
   - Asserts `acc_dispatch_worker` rejects execution if physical pipeline is in `PRD_REQUIRED`.
