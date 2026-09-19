# Tasks DAG: Accelerate Platform v2.0 Execution Waves

## Wave 1: Path-Aware Tool Fencing & Config Portability
- **Task 1.1**: Update `PersonaManager.isToolAllowed` to inspect file paths, whitelisting `docs/**` and `.accelerate/**` while strictly blocking source code paths (`src/**`, etc.).
- **Task 1.2**: Update `tool.execute.before` hook to pass tool input arguments (`input.args`) to `isToolAllowed`.
- **Task 1.3**: Update `OpenCodeClient` to read `process.env.OPENCODE_BASE_URL` and `process.env.OPENCODE_API_KEY` / `process.env.OPENCODE_SERVER_PASSWORD`.
- **Task 1.4**: Author unit tests for path-aware fencing and portable client config in `test/persona-manager.test.ts` and `test/opencode-client.test.ts`.

## Wave 2: Worker Completion Report Schema & Automated Fan-In (`acc_fanin_worker`)
- **Task 2.1**: Implement `WorkerCompletionReportSchema` Zod contract in `src/types/worker-report.ts` (re-exported in `src/services.ts`).
- **Task 2.2**: Extend `GitWorktreeService` with `mergeBranch(branch, targetBranch)` and `runVerification(targetDir, command)`.
- **Task 2.3**: Implement `acc_fanin_worker` tool in `src/index.ts` with automated test execution, diff check, merge, and cleanup.
- **Task 2.4**: Author unit tests in `test/git-worktree.test.ts` and `test/plugin-tools.test.ts`.

## Wave 3: Wave Dispatch, Polling & Plane Execution
- **Task 3.1**: Implement `acc_dispatch_wave` and `acc_poll_workers` tools in `src/index.ts`.
- **Task 3.2**: Implement `acc_execute_plane_sync` tool with simulated/live Plane HTTP lifecycle mutation and comment emission.
- **Task 3.3**: Author integration tests in `test/plugin-tools.test.ts` and verify plugin loader contract in `test/plugin-loader-contract.test.ts`.
- **Task 3.4**: Update `skills/acc-master.md` and `skills/acc-worker.md` with complete documentation on waves, fan-in, and report contracts.
