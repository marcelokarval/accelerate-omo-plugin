# Accelerate OMO Plugin - Engineering & Implementation Plan

## TL;DR (Executive Summary)
Implementation of the `accelerate-omo-plugin` for OpenCode, establishing sovereign Master/Worker structural separation, physical Git Worktree isolation, zero-mutation governance for Master sessions, and fail-closed human gates for Plane issue tracking.

- **What you get**: A TypeScript OpenCode plugin registering strict runtime hooks (`chat.message`, `tool.execute.before`) and native orchestration tools (`acc_dispatch_worker`, `acc_approve_plane_sync`). Master sessions are fenced from direct source code edits. Workers execute in dedicated ephemeral Git Worktrees (`git worktree add -b`) spawned through native OpenCode session APIs.
- **Why this approach**: Operating within a single session or relying on unconstrained subagents causes massive input context pollution (48,000+ tokens of cumulative history), git branch collisions, and interface blocking. Native worker dispatch in isolated directories protects root integrity, drops worker input context to <1,500 tokens, and enables deterministic verification.
- **What it will NOT do**: It will not execute unattended mutations on remote Plane items during `START` or `FINISH` phases. It will not allow Workers to spawn child sub-workers (anti-recursion enforcement).
- **Effort**: Large
- **Risk**: Medium (Managed via strict timeouts, fail-closed state transitions, and automatic worktree quarantine).

## Architectural Scope

### Must Have
- Sovereign plugin module exporting standard OpenCode hooks and custom tools.
- Dynamic persona detection (`[MASTER]` vs `[W-*]`) with automated injection of governance mini-skills (`skills/acc-master.md` and `skills/acc-worker.md`).
- Active tool fencing (`tool.execute.before`) preventing Master sessions from invoking mutating tools (`edit`, `write`, `apply_patch`).
- `GitWorktreeService`: Deterministic creation, cleanup, and `.quarantine/` isolation for worktrees.
- `OpenCodeClient`: Resilient HTTP and SSE wrapper supporting native V1 and V2 session endpoints.
- `PlaneApprovalGateService`: Standardized transition receipts enforcing explicit human approval for `START` and `FINISH` lifecycle transitions, while permitting autonomous dispatch for intermediate progress (`PROGRESS`, `BLOCKED`, `REVIEW`).

### Must NOT Have (Guardrails & Invariants)
- No absolute filesystem paths hardcoded in codebase or documentation.
- No reliance on deprecated or non-standard tools.
- No direct source code modifications within Master sessions.
- No unapproved network mutations to external trackers.

## Engineering Pipeline (PRD ➔ ADR ➔ SDD ➔ Tasks ➔ TDD ➔ Review)

Every non-trivial engineering workflow governed by this plugin follows the canonical Accelerate sequence:
1. **PRD (Product Requirements Document)**: Define user objectives, problem statements, and boundary constraints.
2. **ADR (Architectural Decision Record)**: Record technical choices, trade-offs, and invariants.
3. **SDD (Software Design Document)**: Specify contracts, interface types, and system integration seams.
4. **Tasks DAG (Decomposition into Waves)**: Partition the work into independent, atomic assignment packets.
5. **Physical Worker Dispatch (acc_dispatch_worker)**: Provision Git Worktree and launch Worker with isolated context.
6. **Strict TDD Implementation (Iron Law)**: RED ➔ GREEN ➔ REFACTOR cycle in real local runtimes.
7. **Forensic Review & Fan-In**: Master inspects `git diff HEAD~1`, runs regression tests, executes sequential merge, and removes worktree.
8. **Plane Synchronization (acc_approve_plane_sync)**: Request operator confirmation and close work items.

## Tasks Breakdown & Status

- [x] 1. Plugin Repository Scaffolding & Setup
  - Initialize project with TypeScript, Vitest, and `@opencode-ai/plugin` dependencies.
  - Commit: `build(repo): initialize accelerate-omo-plugin repository`

- [x] 2. Implement GitWorktreeService
  - Implement `create`, `remove`, and `quarantine` methods via child process git commands.
  - Unit tests verifying isolated worktree allocation and directory protection.
  - Commit: `feat(worktree): implement isolated git worktree lifecycle service`

- [x] 3. Implement OpenCodeClient (Native API Wrapper)
  - Implement session creation (`POST /session`), prompt dispatch (`POST /session/:id/prompt_async`), and event stream reader (`GET /event`).
  - Unit tests verifying resilient headers, serialization, and SSE chunk parsing.
  - Commit: `feat(client): implement resilient native opencode api client`

- [x] 4. Define Persona Policies & Mini-Skills
  - Author canonical governance markdown specifications in `skills/acc-master.md` and `skills/acc-worker.md`.
  - Commit: `docs(skills): define master and worker governance laws`

- [x] 5. Implement Hook Interceptors & Tool Fencing
  - Wire `chat.message` for persona detection and `tool.execute.before` for Master tool fencing.
  - Unit tests verifying denied edits on Master sessions and unrestricted edits on Worker sessions.
  - Commit: `feat(hooks): wire persona detection and master tool fencing`

- [x] 6. Implement StateMachineService & Fail-Closed Quarantine
  - Orchestrate transitions from `DISCUSSION` to `SPEC_READY` and `DISPATCHED`.
  - Automate worktree quarantine on dispatch failure or unresponsive workers.
  - Commit: `feat(state): implement orchestration state machine with fail-closed quarantine`

- [x] 7. Implement PlaneApprovalGateService
  - Generate canonical markdown receipts for Plane lifecycle transitions.
  - Enforce human approval for `START` and `FINISH` while keeping intermediate phases autonomous.
  - Commit: `feat(plane): implement plane approval gate service with scoped human authorization`

- [x] 8. End-to-End Orchestration Verification
  - Wire custom tools `acc_dispatch_worker` and `acc_approve_plane_sync` into plugin export.
  - Execute end-to-end integration tests confirming worker dispatch, worktree creation, and gate compliance.
  - Commit: `test(e2e): verify master-worker orchestration pipeline`

## Verification Strategy
- 100% automated test coverage using Vitest.
- Clean TypeScript compilation (`tsc`) with zero errors.
- Verification in live OpenCode runtime with loaded plugin manifest.
