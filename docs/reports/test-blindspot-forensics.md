# Forensic Report: Test Suite Blindspots & Production Runtime Failure

## 1. Executive Summary
During the release of `accelerate-omo-plugin` v1.1.0, the automated test suite reported **100% test pass rate (43/43 passing across 9 test files)** and the TypeScript compiler reported **zero errors (`tsc` exit code 0)**. However, when deployed into the production OpenCode daemon, the plugin suffered from:
1. **Total startup crash and discard**: OpenCode failed to load the plugin due to `TypeError: Cannot call a class constructor GitWorktreeService without |new|`.
2. **Complete fencing bypass**: The Master session ran unconstrained, mutating code with direct file writes instead of dispatching workers.

This document answers the fundamental architectural question: **Why did all tests pass 100% while production runtime failed completely?**

---

## 2. The Four Blindspots of the Previous Test Suite

### Blindspot #1: Unit Test Invocations vs. OpenCode Runtime Loader Protocol
- **What the Unit Tests Did**:
  In `test/index.test.ts` and `test/plugin-tools.test.ts`:
  ```ts
  import plugin from "../src/index.js";
  const hooks = await plugin({});
  ```
  The tests imported `plugin` (the `default` export function) and invoked it directly. This was testing only *what the author intended the consumer to call*.
- **What OpenCode's Real Runtime Loader Does**:
  As discovered by inspecting the OpenCode runtime binary (`chunk-brb77zmz.js`):
  ```js
  function Zy(moduleExports) {
    let result = [];
    for (let exportedVal of Object.values(moduleExports)) {
      if (typeof exportedVal === "function") {
        result.push(exportedVal);
      }
    }
    return result;
  }
  for (let pluginFactory of Zy(module.mod)) {
    hooks.push(await pluginFactory(context, options));
  }
  ```
  OpenCode does not simply invoke the default export. It iterates over `Object.values(moduleExports)`. Any exported symbol where `typeof exportedVal === "function"` is invoked without `new` as a plugin factory.
- **The Blindspot**:
  `src/index.ts` had:
  ```ts
  export { PersonaManager, GitWorktreeService, OpenCodeClient, StateMachineService, PlaneApprovalGateService };
  ```
  Because ES6 classes are functions (`typeof GitWorktreeService === "function"`), OpenCode invoked `await GitWorktreeService(context, options)`, triggering `TypeError: Cannot call a class constructor without |new|`. Because the unit tests only tested `plugin()`, this error was **100% invisible to Vitest**.

---

### Blindspot #2: Synthetic Context Mocking vs. Real Daemon Network RPC
- **What the Unit Tests Did**:
  In `test/plugin-tools.test.ts`, the hook test passed synthetic objects:
  ```ts
  await chatHook({ sessionID: "test-session" }, { parts: [{ text: "[MASTER] test" }] });
  ```
  This tested the happy path where the user prompt literally begins with `"[MASTER]"`.
- **What Real Production Execution Did**:
  In a real session created via OpenChamber or OpenCode CLI:
  1. The session title (`"[MASTER] - Multiagentes Operacionais..."`) is assigned to the session record in SQLite / OpenCode daemon.
  2. The human user's prompt was:
     > *"Você é o agente MASTER desta sessão de continuidade. Leia o arquivo MASTER-SESSION-REPORT.md..."*
     The prompt contained `MASTER`, but **not** `[MASTER]`.
  3. The hook `chat.message` only inspected `output.parts[0].text`. It never queried the daemon's `/session/:id` endpoint for `session.title`.
- **The Blindspot**:
  The unit tests assumed that session title and message prompt were interchangeable concepts. They never tested a scenario where the prompt text diverged from the session title, nor did they test dynamic lookup against a running daemon.

---

### Blindspot #3: Static In-Memory State vs. Ephemeral Daemon Lifecycles
- **What the Unit Tests Did**:
  Each test created a fresh instance of `PersonaManager` and tested it within a single synchronous tick or single event loop pass.
- **What Real Production Execution Did**:
  The OpenCode daemon is a long-lived service that restarts across updates, crashes, or user systemctl restarts. State stored solely in `new Map()` inside Node.js heap memory is lost on restart. Without querying OpenCode's persistent session store (`GET /session/:id`), any resumed or reconnected session is permanently treated as `"standard"`.

---

### Blindspot #4: Absence of "Loader Contract" Integration Tests
- **The Core Flaw**:
  A plugin project cannot consider itself fully tested if its test suite does not simulate the **host application's plugin loader contract**.
  Testing internal class methods (`GitWorktreeService.create`, `StateMachineService.transitionTo`) proves algorithmic correctness of isolated units, but proves **zero** about runtime host compatibility.

---

## 3. The Structural Fixes Implemented

1. **Strict Single-Export Isolation (`src/index.ts`)**:
   `src/index.ts` now exports ONLY `AccelerateOmoPlugin` (as default and named export). All classes have been relocated to a dedicated barrel (`src/services.ts`), guaranteeing that `Object.values(entrypoint)` contains zero class constructors.
2. **Host Loader Contract Test (`test/plugin-loader-contract.test.ts`)**:
   A dedicated regression test now dynamically loads `dist/index.js`, iterates `Object.values(mod)`, and asserts that every function can be called without `new`, and that zero non-plugin classes are exposed.
3. **Dynamic Authoritative Session Title Resolution (`src/persona-manager.ts`)**:
   `resolveSessionPersona(sessionId, openCodeClient)` dynamically queries `GET /session/:id` on cache misses. It parses `session.title` case-insensitively for `[MASTER]`, `MASTER -`, `MASTER:`, `⚡ [W-`, `[W-`, `[WORKER]`.
4. **Resilient Fallback Fencing**:
   `tool.execute.before` and `chat.message` both await `resolveSessionPersona` before evaluating tool permissions or injecting `<PERSONA_GOVERNANCE>`.

---

## 4. Policy Standard for Future Development
To prevent this failure pattern from ever recurring:
- **Contract Testing Law**: Any plugin interface must be validated against the exact reflection/loader algorithm of the host runtime.
- **No Classes in Plugin Entrypoints**: Plugin entrypoints must remain pure factory functions. Internal architecture must be imported from submodules or dedicated service files.
- **Never Rely Exclusively on Prompt String Content**: Governance policies must anchor to immutable session metadata provided by the host daemon, using prompt text strictly as a secondary fallback.
