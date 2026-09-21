# Tasks DAG: Clean System Prompt Governance & Cache Optimization

## Task 1: Strict TDD Unit Tests
- In `test/plugin-tools.test.ts`:
  - Update `chat.message` test: assert `output.parts[0].text` remains untouched and does NOT contain `<PERSONA_GOVERNANCE>`.
  - Add `experimental.chat.system.transform` tests:
    - Asserts that for `master` persona, `output.system` receives `<PERSONA_GOVERNANCE>` static block first, followed by dynamic runtime context at the tail.
    - Asserts that for `standard` persona, `output.system` is untouched.

## Task 2: Refactor Hooks in src/index.ts
- In `src/index.ts`:
  - Remove user text mutation from `chat.message` (keep intent detection and auto-branding).
  - Implement `"experimental.chat.system.transform"`:
    - Check session persona.
    - If non-standard, push static governance law first to `output.system`.
    - Push dynamic runtime context block at the tail.

## Task 3: Verification & Loader Contract Compliance
- Run `npm test` and `npm run build`.
- Verify `test/plugin-loader-contract.test.ts` passes with single export isolation.
- Commit changes and return `WorkerCompletionReport`.
