# PRD: Plugin Loader Hardening & Test Suite Realism

## 1. Problem Statement
The `accelerate-omo-plugin` v1.1.0 exhibited complete runtime failure in production despite a 100% test pass rate (43/43 tests passing in Vitest). The OpenCode daemon failed to load the plugin on startup with the error:
`Cannot call a class constructor GitWorktreeService without |new|`

Furthermore, the persona detection hook (`chat.message`) failed to detect the `master` persona in session `ses_f459b50a5ffeRChL0jDXdkc4y8` because it inspected only the first user message string (`output.parts[0].text`) instead of resolving the actual session metadata from the daemon (`session.title`).

## 2. Root Cause Analysis
1. **OpenCode Plugin Loader Invariant Violation**:
   OpenCode's internal module loader iterates over `Object.values(module)`. Every exported function is invoked without `new` as a plugin factory (`await J(context, options)`). Exporting ES6 classes (`GitWorktreeService`, `OpenCodeClient`, `PersonaManager`, etc.) from `src/index.ts` causes immediate `TypeError` crashes upon daemon boot, causing OpenCode to discard the plugin in its entirety.
2. **Test Suite Blindspot**:
   The existing test suite tested `import plugin from "../src/index.js"` by calling `plugin({})` directly. It never simulated OpenCode's loader algorithm (`for (const fn of Object.values(mod)) await fn(...)`), creating a catastrophic false sense of 100% test coverage.
3. **Fragile Persona Detection**:
   `chat.message` and `tool.execute.before` relied on in-memory persona caches and checked user prompt strings rather than querying the authoritative session entity via `GET /session/:id`.

## 3. Scope & Requirements
1. **Single Plugin Export Invariant**:
   `src/index.ts` must export ONLY the default plugin factory (`AccelerateOmoPlugin`). All internal service classes must be moved to dedicated modules or a separate non-plugin barrel (`src/services.ts`), ensuring `Object.values(indexModule)` contains zero class constructors.
2. **Authoritative Session Title Resolution**:
   `PersonaManager` and the hooks must be able to asynchronously resolve session metadata from `OpenCodeClient.getSession(sessionID)` when an incoming session is not yet registered in cache.
3. **Loader Contract Regression Test**:
   The test suite must include a test that mirrors OpenCode's exact loader mechanism (`Zy(mod)` / `Object.values(mod)`) to verify that no exported symbol throws when called as a plugin factory.
4. **Post-Mortem Forensic Report**:
   A detailed forensic document explaining the test failure paradigm must be produced in `docs/reports/test-blindspot-forensics.md`.
