# ADR-008: Disk-Anchored Engineering FSM, Synchronous Hook Auto-Branding, and Runtime Introspection

## Status
Accepted

## Date
2026-09-20

## Context
Accelerate's v1 and v2 architectures proved that isolated Git Worktrees and tool fencing effectively block unauthorized code modifications. However, the system remained vulnerable to operational amnesia and compliance drift:
1. State was stored in ephemeral JavaScript variables (`private currentPhase = "DISCUSSION"`). When daemons restarted, connections dropped, or sessions forked, the state machine lost all historical context.
2. The LLM was advised via narrative prompts to follow the pipeline (PRD ➔ ADR ➔ SDD ➔ Tasks ➔ Workers), but had no physical enforcement preventing it from skipping straight from user discussions to premature worker dispatch without validated artifacts on disk.
3. Operators had no programmatic method to verify what version of the plugin was loaded into memory or what port/PID the plugin was bound to.

## Decisions

### 1. Physical Disk-Anchored FSM (`StateMachineService.evaluateProjectPhase`)
Rather than relying on volatile memory, `StateMachineService` will evaluate the canonical pipeline phase by physically inspecting project disk artifacts:
- **`PRD_REQUIRED`**: No documents found in `docs/plans/` or `planning/`.
- **`ADR_REQUIRED`**: PRD present, but no ADR found in `docs/architecture/adr/` or `docs/architecture/decisions/`.
- **`SDD_REQUIRED`**: PRD and ADR present, but no SDD found in `docs/architecture/sdd/` or `docs/sdd/`.
- **`TASKS_REQUIRED`**: SDD present, but no Tasks DAG ledger found in `docs/tasks/`.
- **`READY_FOR_DISPATCH`**: Complete specification chain (PRD + ADR + SDD + Tasks) physically exists on disk.
- **`EXECUTING_WAVE`**: One or more active Git Worktrees exist in `.worktrees/`.
- **`READY_FOR_FANIN`**: Worktree contains completion evidence (`git log` or report).

### 2. Physical Pre-condition Fencing
`acc_dispatch_worker` and `acc_dispatch_wave` MUST call `evaluateProjectPhase()` and fail-closed with descriptive errors if the required artifacts do not physically exist on disk before any worktree is created.

### 3. Runtime Diagnostic & Introspection Tool (`acc_status`)
Register tool `acc_status`:
- Returns `{ version: "3.0.0", phase: SessionPhase, physicalEvidence: Record<string, boolean>, hostInfo: { serverUrl, pid, cwd } }`.
- Enables operators and agents to inspect live runtime parameters instantaneously.

### 4. Sisyphus / Accelerate Alignment Header
Update `skills/acc-master.md` to require the Master Orchestrator to emit an invariant header at the start of non-trivial responses:
```markdown
[ACCELERATE PIPELINE STATE]
• Phase: <Disk-Evaluated Phase>
• Artifacts: PRD: [✓/✗] | ADR: [✓/✗] | SDD: [✓/✗] | Tasks: [✓/✗]
• Next Allowed Action: <Explicit Next Pipeline Stage>
```

## Consequences
### Positive
- Zero amnesia: State survives daemon restarts, connection drops, and subagent forks because it is anchored in the git repository itself.
- Deterministic gating: Workers cannot be dispatched without actual specifications on disk.
- Instant debugging: `acc_status` reveals running version, port, and PID immediately.
