# Tasks DAG: Dynamic Server URL Binding & Goal-Driven Title Synthesis

## Task 1: Strict TDD Unit Tests
- In `test/persona-manager.test.ts`:
  - Add tests for typo-tolerant triggers: `"vc agpra é o master"`, `"tu eh o master"`, `"vc é o master"`.
  - Add tests for goal-driven title synthesis:
    - Pure command prompt (`"vc agpra é o master, já renomeie essa sessão e aguarde"`) + directory ➔ `"[MASTER] <Dir> - Governança & Orquestração"`.
    - Task-oriented prompt (`"analise a raiz e monte o plano de limpeza"`) ➔ clean objective.
- In `test/plugin-tools.test.ts`:
  - Add test asserting `AccelerateOmoPlugin` accepts `context.serverUrl` and sets client baseUrl accordingly.

## Task 2: Implement PersonaManager Extensions
- In `src/persona-manager.ts`:
  - Update `detectPersonaFromText` with typo-tolerant regex.
  - Update `generateMasterTitle(promptText: string, directory?: string): string`.

## Task 3: Implement Dynamic Server URL in Plugin Factory
- In `src/index.ts`:
  - Extract `context?.serverUrl` and pass to `OpenCodeClient` constructor.
  - Pass `session?.directory` to `generateMasterTitle` inside `chat.message`.

## Task 4: Verification, Fan-In & Host Daemon Optimization
- Run `npm test && npm run build`.
- Execute fan-in merge into `master`.
- Stop and disable `opencode-web.service`.
- Restart `openchamber.service`.
- Publish tag & release `v2.3.0`.
