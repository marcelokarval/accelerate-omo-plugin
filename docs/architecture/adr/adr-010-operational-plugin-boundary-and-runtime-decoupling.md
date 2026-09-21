# ADR-010: Operational Plugin Boundary, Architectural Decoupling, and Native Runtime Harmonization

## Status
Accepted (Direction requested by operator; technical proposal subject to review)

## Date
2026-09-21

## Context & Operational Problem
During previous execution cycles, `accelerate-omo-plugin` experienced boundary drift and architectural overreach:
1. **Methodology Conflation**: The plugin began attempting to reimplement the entire governance methodology of the external `accelerate` project (hardcoding PRD/ADR/SDD directory paths, asserting rigid 5-phase or 9-phase FSM state machines in runtime TypeScript, and confusing session presence with methodological verification).
2. **Authority vs. Presentation Conflation**: Titles (`[MASTER]`, emojis, prefixes) and user prompt text were treated as security and authority tokens, rather than purely visual presentation attributes.
3. **Loop & Ownership Contention**: The plugin attempted to coordinate subagents and continuation mechanisms without recognizing that OpenCode is the host runtime, OpenChamber is the operator UI/surface, and `oh-my-openagent` (OmO) is the established task and continuation orchestrator.
4. **Tool Sprawl & Misplaced Ownership**: Universal session tools (`session_rename`, `session_info`) were tangled with Accelerate-branded personas.

## Operator Decisions

### 1. Strict Project Decoupling
- **`accelerate` (Independent Project)**: Retains sole ownership of engineering methodology, doctrine, contracts, validators, proportional planning, evidence graphs, independent review, acceptance criteria, and cross-harness adapters. It is an active engineering doctrine, not passive documentation.
- **`accelerate-omo-plugin` (This Repository)**: Operates strictly as a complementary **runtime operations harness** within OpenCode. Its responsibilities are strictly bounded to:
  - Session lifecycle and identity management.
  - Hierarchical role boundaries (Principal/Orchestrator → Worker sessions → native subagents).
  - Physical Git Worktree lifecycle (provisioning, isolated runs, safe quarantine, clean removal).
  - Observation, polling, and structured handoff capture.
  - Controlled integration boundaries (fan-in pre-flight checks).
- **Non-Goal**: This plugin MUST NOT reimplement, duplicate, or dictate the internal engineering methodology of `accelerate`.

### 2. Rejection of Hardcoded Phase FSMs in Plugin Core
The 9-phase sequence observed in previous mission prompts (`PHASE_0` through `PHASE_8`) was a specific delivery work plan for a single release, NOT a universal law of software engineering.
- The plugin core MUST NOT hardcode `PHASE_0..PHASE_8` or rigid directory structures (`docs/plans`, `docs/architecture/adr`, etc.) into its runtime FSM.
- Methodological requirements (such as requiring a PRD before implementation) belong to the active methodology adapter/doctrine, not hardcoded into generic worktree dispatch tools.

### 3. Separation of Presentation from Authority
- Session titles, emojis (`📝`, `🔬`, `🛠️`, `🧐`), and prompt strings are display projections for human readability in OpenChamber and CLI TUIs.
- Titles are NEVER authority credentials.
- Authority is established explicitly at session creation or through governed tool execution bindings, with immutable records stored in the session envelope.

### 4. Role Hierarchy & Delegation Model
- Target Topology: **Principal Session → Worker Sessions → Native Subagents inside Workers**.
- A Worker is a distinct OpenCode session with its own workspace/worktree, context, and permissions. It is NOT merely a renamed subagent.
- Workers coordinate their assigned slice and may dispatch native subagents (e.g. explore, librarian, oracle); workers are strictly barred from global mission closure, PR merging, or spawning sibling workers.
- Work profile (`contract`, `test`, `implementation`, `review`) is selectable per task packet, not a rigid 4-worker mandate for every task.

### 5. Clear Ownership of Runtime State
| Dimension | Single Authoritative Owner |
|---|---|
| **Session Lifecycle & Execution** | OpenCode Runtime |
| **User Interface & Interaction Surface** | OpenChamber |
| **Task DAG, Teams & Continuation Loops** | OmO (Oh-My-OpenAgent) |
| **Isolated Filesystem Workspaces** | Git Worktrees |
| **Engineering Doctrine & Review Gates** | Accelerate (via explicit assignment packets) |
| **Operation Results & Audit Trace** | Immutable Receipts / Provenance Envelopes |

### 6. Universal Assignment Packet Contract
Operational dispatch receives an explicit Assignment Packet containing:
- `assignment_id` / `correlation_id`
- `objective` and `non_goals`
- `authorization_basis`
- `read_scope` and `write_scope`
- `inputs` (canonical refs or briefs; no mandatory document paths)
- `deliverables` and `acceptance_criteria`
- `budget` / `resource_limits` / `stop_rules`
- `return_contract` (structured completion evidence)

## Consequences
### Positive
- Zero duplication of OmO or OpenCode host capabilities.
- True path-agnostic operation: works in any repository regardless of directory naming conventions.
- Eliminates brittle string-parsing gates and UI desynchronizations.
- Establishes clean, auditable interfaces between the harness, the methodology, and the UI.

### Negative / Trade-offs
- Requires refactoring existing hardcoded path checks in `state-machine.ts` into a pluggable doctrine validator interface.
