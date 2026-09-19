# Task 2: Implement GitWorktreeService

**What to do**: 
Create `src/git-worktree.ts` exposing `create`, `remove`, and `quarantine` methods.
It must use `git worktree add -b <branch> <path> <baseRef>`.
For quarantine, it should rename/move the worktree to a quarantine directory if a process times out, rather than cleanly removing it.
Write comprehensive unit tests in `test/git-worktree.test.ts` mocking `child_process.exec` or similar.

**Must NOT do**: 
Do not mutate the main branch or execute actual git commands against the host in unit tests (use mocks).
Do not implement the State Machine yet.

**Reference**:
Look at `~/.cache/opencode/packages/oh-my-openagent@5.0.0-beta.74/node_modules/oh-my-openagent/packages/omo-codex/plugin/skills/teammode/scripts/team-worktree.mjs:76` for how OMO currently handles this if needed.

**Acceptance criteria**: 
`npm run test` passes with full coverage on the new service.

**Commit**: 
Yes. `feat(worktree): implement isolated git worktree manager`
