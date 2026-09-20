# Tasks DAG: Accelerate v3.0 Disk-Backed FSM & Coercive Governance

## Task 1: Strict TDD Unit Tests for Disk-Backed FSM
- In `test/state-machine.test.ts`:
  - Add tests for `evaluatePhysicalEvidence(dir)` and `getPhysicalPipelinePhase(dir)`.
  - Assert progression: `PRD_REQUIRED` ➔ `ADR_REQUIRED` ➔ `SDD_REQUIRED` ➔ `TASKS_REQUIRED` ➔ `READY_FOR_DISPATCH` ➔ `EXECUTING_WAVE`.
- In `test/plugin-tools.test.ts`:
  - Add tests for `acc_status` tool verifying running version `3.0.0`, phase, host info, and evidence.
  - Add tests verifying `acc_dispatch_worker` enforces physical pre-conditions.

## Task 2: Implement Physical FSM in StateMachineService
- In `src/state-machine.ts`:
  - Implement `evaluatePhysicalEvidence(projectDir)`.
  - Implement `getPhysicalPipelinePhase(projectDir)`.

## Task 3: Implement acc_status Tool and Pre-Condition Fencing
- In `src/index.ts`:
  - Register `acc_status` tool.
  - Enforce physical phase check in `acc_dispatch_worker` and `acc_dispatch_wave`.
  - In `chat.message`, inject physical phase into the `<PERSONA_GOVERNANCE>` block.

## Task 4: Harmonize Skills & Documentation
- In `skills/acc-master.md`:
  - Add Section 8: "Physical FSM & State Declaration Invariant".
  - Mandate the `[ACCELERATE PIPELINE STATE]` status header.

## Task 5: Verification, Fan-In & Release v3.0.0
- Run `npm test && npm run build`.
- Fan-in merge to `master`.
- Bump version to `3.0.0`, tag, and publish GitHub Release.
