# PRD: Accelerate Platform v2.0 - End-to-End Autonomous Orchestration Pipeline

## 1. Executive Summary & Problem Statement
`accelerate-omo-plugin` successfully established the foundational separation between the Master Orchestrator (`[MASTER]`) and isolated Atomic Workers (`⚡ [W-*]`). However, operating the current release (v1.1.0) still imposes significant manual toil and presents several operational limitations:
1. **Blind Tool Fencing**: The `tool.execute.before` hook indiscriminately blocks `edit` and `write` for any `master` session. This prevents the Master from authoring required governance artifacts (`docs/plans/`, `docs/architecture/`) via standard tools, forcing clumsy `cat` bash workarounds.
2. **Manual Fan-In Overhead**: When a Worker completes its task, the Master must manually inspect diffs, switch into the worktree directory, execute test suites, run `git merge --no-ff`, and delete worktrees via bash. This consumes precious context tokens and is prone to human error.
3. **Unstructured Completion Reports**: Workers report back in unstructured Markdown, preventing automated programmatic validation of test results, touched files, and coverage.
4. **Sequential Dispatch Bottleneck**: Multi-task waves require serial dispatch calls instead of dispatching a parallel DAG wave of 3-5 workers.
5. **Disconnected Issue Tracking**: `acc_approve_plane_sync` produces signed receipts and enforces human gates, but does not perform the live HTTP/MCP mutation against Plane.
6. **Environment Rigidity**: `OpenCodeClient` hardcodes default daemon coordinates to `http://127.0.0.1:4096` without honoring standard environment variables (`OPENCODE_BASE_URL`, auth tokens).

## 2. Business & Operational Goals
Transform `accelerate-omo-plugin` into a complete, self-contained, enterprise-grade autonomous engineering harness:
- **Zero-Friction Governance**: Enable Master to freely author specifications in `docs/**` and `.accelerate/**` while guaranteeing zero code mutation in production paths (`src/**`, `app/**`, `backend/**`, `frontend/**`, etc.).
- **Atomic One-Click Fan-In**: Provide `acc_fanin_worker` to run automated verification, diff auditing, branch merging, and worktree cleanup in a single programmatic call.
- **Contract-Driven Verification**: Enforce a strict Zod schema (`WorkerCompletionReport`) for worker handoffs.
- **High-Throughput Wave Orchestration**: Enable parallel execution of independent tasks via `acc_dispatch_wave` and active progress tracking via `acc_poll_workers`.
- **Live Plane Synchronization**: Perform live, verified state transitions and comment publishing to Plane when human-approved.
- **Universal Portability**: Support configurable daemon URLs and authentication headers.

## 3. Detailed Requirements by Capability Front

### Front 1: Path-Aware Tool Fencing
- Modify `PersonaManager.isToolAllowed(sessionId, toolName, args)` to inspect target file paths for `edit`, `write`, and `apply_patch`.
- Allowed for Master: File paths starting with `docs/plans/`, `docs/architecture/`, `docs/tasks/`, `docs/reports/`, `.accelerate/`, or ending in `.md`/`.json` within governance directories.
- Blocked for Master: Source code trees (`src/`, `backend/`, `frontend/`, `lib/`, `core/`, `components/`, etc.).

### Front 2: Config Portability & Authentication
- Extend `OpenCodeClient` to read `process.env.OPENCODE_BASE_URL` (defaulting to `http://127.0.0.1:4096`).
- Support optional `process.env.OPENCODE_API_KEY` or `process.env.OPENCODE_SERVER_PASSWORD` via HTTP authorization headers.

### Front 3: Structured Worker Completion Report Schema
- Define a canonical `WorkerCompletionReport` Zod schema and TypeScript interface:
  - `delegationId`: string (`del_<hex8>`)
  - `taskSlug`: string
  - `status`: `"success"` | `"failed"`
  - `touchedFiles`: string[]
  - `testResults`: `{ command: string, passed: number, failed: number, exitCode: number }`
  - `buildStatus`: `"clean"` | `"failed"`
  - `diffSummary`: string
  - `invariantsSatisfied`: string[]
- Register validation helper so workers and orchestrators validate reports before fan-in.

### Front 4: Automated Fan-In Tool (`acc_fanin_worker`)
- Provide tool `acc_fanin_worker`:
  - Input: `targetDir: string`, `testCommand?: string`, `targetBranch?: string` (default: `"master"`), `allowDirty?: boolean`.
  - Process:
    1. Validates clean working state in target worktree.
    2. Executes `testCommand` (e.g. `npm test` or `pytest`) inside target worktree.
    3. Audits candidate diff against base branch for scope containment.
    4. Executes sequential `git merge --no-ff <branch>` into the active repository.
    5. Cleans up the worktree on success via `GitWorktreeService.remove()`.
    6. Quarantines to `.worktrees-quarantine/` upon test failure without merging.
  - Returns: Structured fan-in receipt with commit SHA, merge status, and cleanup confirmation.

### Front 5: Parallel Wave Dispatch & Polling
- Provide `acc_dispatch_wave`:
  - Accepts an array of task packets: `tasks: Array<{ taskSlug, targetDir, specPath, prompt, baseRef? }>`.
  - Spawns isolated Git worktrees and OpenCode worker sessions in parallel.
  - Returns array of `WorkerRunResult` envelopes with unified wave ID.
- Provide `acc_poll_workers`:
  - Accepts `workerSessionIds: string[]`.
  - Queries session statuses and messages via `OpenCodeClient`.
  - Returns current execution status (`running`, `idle`, `completed`, `interrupted`) for each worker.

### Front 6: Live Plane MCP Integration (`acc_execute_plane_sync`)
- Extend Plane adapter to connect with configured Plane MCP endpoints or REST APIs.
- When `humanApproved: true` for `START` or `FINISH`, execute state transition and comment posting in one call, returning direct provider readback.

## 4. Success Criteria & Verification Gates
1. 100% test coverage for all new tools and services in Vitest.
2. Zero TypeScript errors (`npm run build` exits 0).
3. The plugin loader contract (`test/plugin-loader-contract.test.ts`) verifies all tools register cleanly and export boundaries remain isolated.
4. E2E rehearsal test verifying: Master authors PRD/SDD directly -> Dispatches Worker Wave -> Workers report structured completion -> Master executes `acc_fanin_worker` atomically.
