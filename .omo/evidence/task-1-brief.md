# Task 1: Initialize plugin repository

**What to do**: 
Configure the plugin repository at `/home/marcelo-karval/Backup/Projetos/accelerate-omo-plugin` with `package.json`, `tsconfig.json`, and an initial `src/index.ts`. 
Set up `vitest` for testing and install `@opencode-ai/plugin` as a dev dependency to get the types.
The plugin must export a default function satisfying the `Plugin` interface (returning an empty hooks object for now).
Create a dummy test in `src/index.test.ts` to verify the test runner works.

**Must NOT do**: 
Do not write the actual logic for GitWorktree or OpenCode API yet. Just scaffold the basic plugin structure.

**Acceptance criteria**: 
`npm run test` (or `bun run test`) passes with the dummy test. 

**Commit**: 
Yes. `build(repo): scaffold plugin repository`
