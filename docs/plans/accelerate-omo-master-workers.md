---
slug: accelerate-omo-master-workers
status: approved
intent: clear
review_required: true
plan_path: docs/plans/accelerate-omo-master-workers.md
plan_sha256: null
review_round_id: null
pending-action: implemented
review:
  momus:
    status: completed
    workspace_root: null
    runtime_home: null
    target: docs/plans/accelerate-omo-master-workers.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: approved
  independent:
    status: completed
    workspace_root: null
    runtime_home: null
    target: docs/plans/accelerate-omo-master-workers.md
    round_id: null
    plan_sha256: null
    launch_id: null
    session: null
    result: approved
approach: Design an OpenCode-first, self-contained TypeScript plugin without mutating OpenChamber or OMO core. The plugin operates a deterministic state machine (Discussion -> Specification/Topology -> Master/Workers Dispatch -> Fan-In), where the Master is strictly an orchestrator (zero product implementation), dispatching workers in independent sessions and isolated Git Worktrees via native OpenCode APIs, enforcing strict TDD and independent forensic review prior to sequential integration.
---

# Architecture Plan: accelerate-omo-master-workers

## Components (Topology Ledger)
| id | outcome | status | evidence path |
|---|---|---|---|
| C1-Discussion-Engine | Natural dialog without code mutation rules; consensus completion detection | active | `docs/architecture/accelerate-classification-matrix.md` |
| C2-Spec-Topology | Generation of PRD, ADR, SDD, and Task Ledger (DAG) with governed Plane sync | active | `docs/architecture/accelerate-sdd-v1.md` |
| C3-Master-Guard | Tool fencing blocking source code mutations in Master session; centralized merge authority | active | `src/persona-manager.ts` (`tool.execute.before`) |
| C4-Worker-Session-Engine | Independent OpenCode worker session creation in isolated Git Worktree and branch | active | `src/git-worktree.ts`, `src/opencode-client.ts` |
| C5-Worker-TDD-Pair | Strict TDD (RED -> GREEN -> REFACTOR) and clean diff self-review | active | `skills/acc-worker.md` |
| C6-Plane-Gate | Scoped human approval for START and FINISH lifecycle transitions | active | `src/plane-adapter.ts` |

## Open Assumptions (Announced Defaults)
| assumption | adopted default | rationale | reversible? |
|---|---|---|---|
| Primary runtime | Native OpenCode HTTP API | OpenChamber tool prevents recursive self-delegation; OpenCode native endpoints provide direct primitives | Yes |
| Asynchronous dispatch | Native prompt dispatch + SSE streaming | Prevents blocking the Master chat window during long worker runs | Yes |
| Workspace isolation | `git worktree add` prior to worker session creation | Eliminates branch collisions and working tree contamination | Yes |
| Tracker authority | Governed Plane MCP adapter | Enforces human approval for issue lifecycle state transitions | Yes |

## Findings & Reference Contracts
- OpenCode native HTTP routes: `/session` (create), `/session/:id/prompt_async`, `/session/:id/abort`, `/event` (SSE).
- Strict timeout boundary: Dispatched sessions must have bounded deadlines with fail-closed quarantine upon non-terminal state.
- Master authority boundary: Root task writes into assigned executor scopes are prohibited; root owns fan-in, review, and closure.
- Worker execution loop: `test_failing -> implement -> test_passing -> diff_review -> report`.

## Core Architectural Decisions
1. **Self-Contained Plugin**: Standalone package maintaining testable, versioned code decoupled from OMO internal core.
2. **Deterministic Tool Fencing**: Direct tool blocking for Master sessions via `tool.execute.before` intercepting `edit`, `write`, and `apply_patch`.
3. **Fail-Closed Quarantine**: If worker dispatch or execution fails, the physical worktree directory is moved to `.quarantine/` to prevent repository corruption.
4. **Governed Plane Synchronization**: `acc_approve_plane_sync` produces standardized receipts, requiring operator approval on `START` and `FINISH` while allowing autonomous progress reporting.

## Scope Boundaries

### In Scope
- TypeScript plugin implementing OpenCode `Plugin` interface (`@opencode-ai/plugin`).
- State machine: Discussion -> Spec/DAG -> Dispatch/Execution -> Fan-In/Review -> Closure.
- Automated creation, cleanup, and quarantine of Git Worktrees for each worker.
- Asynchronous session dispatch via native OpenCode APIs.
- Non-blocking SSE event streaming for progress observation.
- Persona governance mini-skills (`acc-master`, `acc-worker`).
- Standardized Plane lifecycle receipts and approval gate.

### Out of Scope (Must NOT Have)
- No modifications to installed OMO core package (`oh-my-openagent`).
- No recursion or child worker dispatch from within Worker sessions.
- No code implementation in Worker without a failing test first.
- No remote issue mutations without approval during `START` and `FINISH` phases.
