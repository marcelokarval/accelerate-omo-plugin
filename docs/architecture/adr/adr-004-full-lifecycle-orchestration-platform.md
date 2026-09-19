# ADR-004: Accelerate Platform v2.0 - Full Lifecycle Autonomous Orchestration

## Status
Accepted

## Date
2026-09-19

## Context
Accelerate's v1 architecture proved the viability of Master/Worker isolation via Git Worktrees and OpenCode session hooks. However, operational gaps remain:
1. **Blind Fencing**: Master cannot edit governance files (`docs/`, `.accelerate/`) using standard tools.
2. **Manual Fan-In**: Merging, verifying, and removing worktrees requires manual bash commands.
3. **Unstructured Handoffs**: Workers produce free-form Markdown reports that cannot be verified programmatically.
4. **Serial Dispatch**: Tasks in the same wave must be dispatched one by one.
5. **Static Config**: Default coordinates (`http://127.0.0.1:4096`) are inflexible for distributed/containerized environments.

## Decisions

### 1. Path-Aware Fencing (`PersonaManager.isToolAllowed`)
- Evaluate `args.filePath` or `args.path` in `tool.execute.before`.
- For `master` persona:
  - Whitelist: Any path matching `^docs/(plans|architecture|tasks|reports)/` or `^\.accelerate/`.
  - Blacklist: Any production code path (`src/`, `backend/`, `frontend/`, `lib/`, `app/`, etc.).
- Non-matching or missing path arguments for code mutation tools (`edit`, `write`, `apply_patch`) fail-closed.

### 2. Standardized Worker Completion Report Schema (`src/types/worker-report.ts`)
- Define a canonical Zod schema `WorkerCompletionReportSchema`.
- Validate reports programmatically during fan-in to guarantee that test suites ran and exit code was 0 before merging.

### 3. Native Fan-In Automation (`acc_fanin_worker`)
- Introduce `acc_fanin_worker` in `src/index.ts` backed by `GitWorktreeService` and `execRunner`.
- Steps:
  1. Inspect status of worktree branch.
  2. Execute test command inside worktree (`execRunner(testCommand, { cwd: targetDir })`).
  3. If tests fail: Quarantine worktree to `.worktrees-quarantine/` and throw error.
  4. If tests pass: Merge branch into target branch with `--no-ff`.
  5. Remove worktree and delete branch cleanly.

### 4. Parallel Wave Dispatch (`acc_dispatch_wave`) & Polling (`acc_poll_workers`)
- `acc_dispatch_wave`: Accepts array of task configs; uses `Promise.all` to provision worktrees and OpenCode sessions concurrently; returns array of delegation receipts with shared `waveId`.
- `acc_poll_workers`: Queries daemon `/session/:id` endpoint for an array of session IDs, evaluating token activity and message count to report live state.

### 5. Config Portability (`OpenCodeClient`)
- Honor `process.env.OPENCODE_BASE_URL` with fallback to `http://127.0.0.1:4096`.
- Read `process.env.OPENCODE_SERVER_PASSWORD` or `process.env.OPENCODE_API_KEY` to attach Bearer or Basic authentication headers when present.

## Consequences
### Positive
- Fully automated loop: Master specifies -> Wave dispatches -> Workers execute TDD -> Master runs one-click fan-in.
- Master can write PRD/ADR/SDD directly via `write` and `edit` without permission denial.
- Zero manual worktree cleanup: All worktrees are either cleanly merged or safely quarantined on failure.
- Backward compatibility: Existing `acc_dispatch_worker` and `acc_approve_plane_sync` contracts remain intact.

### Negative / Trade-offs
- Increased surface area in plugin: More tools and schemas to maintain and test. Mitigated by modular service architecture in `src/services.ts`.
