# PRD: Accelerate Platform v3.0 - Disk-Backed Physical FSM & Coercive Governance

## 1. Problem Statement & Root Cause
Accelerate v1 and v2 relied on semantic prompt injection and volatile in-memory variables to manage the engineering lifecycle. This approach suffered from four systemic design flaws:
1. **Volatile Memory FSM (Architectural Amnesia)**:
   - `StateMachineService` tracked the active engineering phase in a transient RAM variable (`private currentPhase = "DISCUSSION"`).
   - On SSE reconnects, subagent forks, daemon restarts, or new turns, the state was wiped back to `DISCUSSION`. The plugin had zero persistent awareness of whether PRDs, ADRs, or SDDs had already been authored on disk.
2. **Advisory Prompt Governance vs Coercive Gates**:
   - Governance was communicated as narrative advice in `<PERSONA_GOVERNANCE>`, directly colliding with `Sisyphus - ultraworker`'s autonomous nature.
   - The LLM treated pipeline stages as conversational suggestions rather than rigid state transitions. When asked to evaluate code, it produced lengthy prose without advancing pipeline state or demanding formal deliverables.
3. **Unverified Runtime In-Memory Snapshots**:
   - Engineers and operators could not deterministically verify which version of the plugin bundle was executing inside the Node.js/Bun heap, leading to testing confusion across daemons.
4. **Fragile Client Rebranding**:
   - Session renaming relied on asynchronous calls that were susceptible to network discrepancies and could be ignored by the LLM if not forced at the middleware level.

## 2. Business & Operational Goals
Transform Accelerate into a deterministic, disk-anchored, coercive orchestration engine:
- **Disk-Anchored State Truth**: Derives the canonical engineering state directly from physical artifacts in the project tree (`docs/plans/`, `docs/architecture/adr/`, `docs/architecture/sdd/`, `docs/tasks/`, `.worktrees/`).
- **Coercive Phase Gates**:
  - If no PRD exists on disk ➔ State is `PRD_REQUIRED`. Despatching workers is physically blocked.
  - If PRD exists but no ADR ➔ State is `ADR_REQUIRED`.
  - If PRD & ADR exist but no SDD ➔ State is `SDD_REQUIRED`.
  - If SDD exists with Tasks DAG ➔ State is `READY_FOR_DISPATCH`.
  - If active worktrees exist in `.worktrees/` ➔ State is `EXECUTING_WAVE`.
  - If completion reports exist in `.worktrees/` ➔ State is `READY_FOR_FANIN`.
- **Runtime Introspection Tool (`acc_status`)**:
  - Expose a deterministic diagnostic tool returning running plugin version, active host PID, serverUrl, active project path, and physical FSM phase.
- **Synchronous Middleware Rebranding**:
  - The `chat.message` hook deterministically executes session renaming in the backend on Turn 1 before LLM inference, ensuring zero reliance on the LLM's willingness to invoke tools.
- **Harmonized Sisyphus Master Persona**:
  - Update `skills/acc-master.md` to channel Sisyphus's autonomous work-ethic into the orchestrator role (auditing, formal planning, wave dispatch, and strict fan-in).

## 3. Scope & Acceptance Criteria
1. `StateMachineService.evaluateProjectPhase(projectDir: string): SessionPhase` deterministically scans project directory and returns phase based on physical file existence.
2. `acc_status` tool returns `{ version: "3.0.0", phase, physicalEvidence, serverUrl, pid }`.
3. `acc_dispatch_worker` and `acc_dispatch_wave` check physical disk state and fail-closed if `docs/architecture/sdd/` or `specPath` is absent.
4. `skills/acc-master.md` instructs the agent to display a structured `[ACCELERATE PIPELINE STATE]` status block in every response.
5. 100% test coverage for disk FSM and `acc_status` in Vitest.
