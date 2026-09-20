# Tasks DAG: Universal Session Tools and Service Protocol

## Task 1: Strict TDD Unit Tests
- In `test/plugin-tools.test.ts`:
  - Add unit tests verifying `session_rename` updates session title via `openCodeClient.updateSession` and resolves `context.sessionID` when `sessionId` is omitted.
  - Add unit tests verifying `session_info` returns metadata via `openCodeClient.getSession` and resolves `context.sessionID`.
  - Add regression assertions verifying that `acc_set_session_title` and `acc_get_session_info` remain functional aliases.

## Task 2: Implement Universal Tool Registrations
- In `src/index.ts`:
  - Factor out `executeSessionRename` and `executeSessionInfo` handlers.
  - Register `session_rename` and `session_info` tools with domain-neutral descriptions.
  - Wire `acc_set_session_title` and `acc_get_session_info` to the same handlers.

## Task 3: Update AGENTS.md
- In `AGENTS.md`:
  - Add Section 5: "Host Service Freshness & Deployment Law" mandating `systemctl --user restart openchamber.service opencode-web.service` on build.

## Task 4: Verification & Loader Contract
- Run `npm test` and `npm run build`.
- Verify `test/plugin-loader-contract.test.ts` passes with clean single export.
- Commit changes and return `WorkerCompletionReport`.
