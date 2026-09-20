# Tasks DAG: Semantic Persona Detection and Cross-Client Auto-Branding

## Task 1: Strict TDD Test Suite Setup
- In `test/persona-manager.test.ts`:
  - Add unit tests for `isGenericTitle`.
  - Add unit tests for `detectPersonaFromText` covering Portuguese (`você é o master`, `atue como master`, `governança do ecossistema`), English (`you are the master`, `master orchestrator`), and legacy tag formats.
  - Add unit tests for `generateMasterTitle` (formatting, length bounding, cleanup).
- In `test/plugin-tools.test.ts`:
  - Add test verifying that a first-turn message with natural master prompt automatically calls `updateSession` with generated `[MASTER] ...` title and locks tool fencing.

## Task 2: Implement PersonaManager Extensions
- Implement `isGenericTitle(title?: string): boolean` in `src/persona-manager.ts`.
- Implement `detectPersonaFromText(text: string): SessionPersona` in `src/persona-manager.ts` and keep `detectPersonaFromTitle` backward-compatible.
- Implement `generateMasterTitle(promptText: string): string` in `src/persona-manager.ts`.

## Task 3: Hook Integration & Auto-Branding in `chat.message`
- In `src/index.ts`:
  - Query `openCodeClient.getSession(sessionID)` to inspect current session title.
  - Evaluate persona from session title and prompt text.
  - If classified as `master` and title `isGenericTitle`, call `openCodeClient.updateSession(sessionID, { title: generatedTitle })`.
  - Update `personaManager.registerSessionPersona(sessionID, "master")`.
  - Inject `<PERSONA_GOVERNANCE>` instructions block.

## Task 4: Verification & Loader Contract Compliance
- Verify all tests pass with `npm test`.
- Verify TypeScript builds cleanly with `npm run build`.
- Verify `test/plugin-loader-contract.test.ts` to guarantee `src/index.ts` exports only `AccelerateOmoPlugin`.
- Output structured `WorkerCompletionReport`.
