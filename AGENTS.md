# AGENTS.md - Repository Operational Rules & Standards

This document establishes the non-negotiable operational invariants for any AI agent or human engineer working in or maintaining this repository.

## 1. Technical Language Standard: Strict Technical English (en-US)
- **Universal Documentation & Code Standard**: All documentation (`README.md`, `AGENTS.md`, plans, architecture documents), source code comments, variable/function identifiers, git commit messages, and mini-skill definitions MUST be authored strictly in technical English (`en-US`).
- **No Language Contamination**: Portuguese or other non-English languages are forbidden in committed files. Portuguese is permitted strictly for conversational interactions with the human operator in chat windows.

## 2. Path Agnosticism & Packaging Rules
- **No Hardcoded Absolute Paths**: NEVER hardcode machine-specific absolute paths (such as `/home/marcelo-karval/...` or Windows drive letters) in source code, configuration files, test fixtures, or documentation.
- **Dynamic & Relative Path Resolution**:
  - Resolve internal assets (such as `skills/`) dynamically using `import.meta.url` or relative paths (`join(currentDir, "../skills")`).
  - Resolve worktree paths and target project directories using the OpenCode session context (`context.directory` or `context.worktree`) rather than assuming a fixed filesystem root.
- **Plugin Packaging**: Treat this repository as a self-contained, distributable OpenCode plugin package (`accelerate-omo-plugin`). Do not assume it lives perpetually inside a development workspace.

## 3. The Accelerate Governance Law

### Master Orchestrator Sessions (`[MASTER]`)
- **Zero Implementation**: The Master is prohibited from modifying application source code directly (`edit`, `write`, `apply_patch` are blocked by `tool.execute.before`).
- **Pipeline Discipline**: Non-trivial changes must follow the pipeline: PRD ➔ ADR ➔ SDD ➔ Tasks DAG ➔ Worker Dispatch.
- **Physical Dispatch**: Use `acc_dispatch_worker` to spawn independent sessions in physical Git Worktrees (`git worktree add -b`).
- **Plane Tracking**: Human confirmation is strictly required for `START` and `FINISH` transitions (`acc_approve_plane_sync`). Intermediate states (`PROGRESS`, `BLOCKED`, `REVIEW`) flow autonomously.

### Atomic Worker Sessions (`[W-*]`)
- **Strict TDD**: Write failing tests against real local runtimes before writing production code (`RED -> GREEN -> REFACTOR`).
- **Strict Scope**: Modify only declared target files in the task packet. No unsolicited refactors.
- **Anti-Recursion**: Workers MUST NOT spawn sibling workers or re-orchestrate.
- **Forensic Review**: Inspect `git diff HEAD~1` before submitting completion reports. Zero swallowed exceptions (`except: pass` or empty `catch {}`).
- **No Direct Merges**: Workers never merge to the main branch. The Master performs the sequential fan-in after review.

## 4. Verification & Testing Standards
- All changes must be backed by automated tests in Vitest.
- Run `npm test` and `npm run build` before committing.
- Strive for 100% clean builds with zero TypeScript compiler errors (`tsc`).

## 5. Host Service Freshness & Deployment Law
- **Dual Daemon Synchronization**: OpenCode executes through two concurrent user services in this environment:
  1. `opencode-web.service` (Systemd web daemon on port `4096`).
  2. `openchamber.service` (OpenChamber dashboard on port `3030`, running an embedded `opencode serve` child process).
- **Mandatory Reload on Build**: Whenever `accelerate-omo-plugin` is updated, built (`npm run build`), or released, the engineer or agent MUST execute:
  ```bash
  systemctl --user restart openchamber.service opencode-web.service
  ```
  Failing to restart both services leaves stale plugin snapshots in memory, causing silent tool omission and desynchronization across clients.

## 6. Operational Scope & Plugin Boundary Law
- **Decoupled Architecture (ADR-010)**: This repository (`accelerate-omo-plugin`) is an **operational runtime harness** for OpenCode, OpenChamber, and OmO. It is strictly decoupled from the external `accelerate` methodology repository.
- **No Hardcoded FSMs**: The plugin core MUST NOT hardcode arbitrary multi-phase sequences (such as `PHASE_0..PHASE_8`) or mandate fixed documentation paths. Methodological compliance is defined by explicit assignment packets, not rigid plugin-level path checks.
- **Authority vs. Presentation**: Session titles, prefixes (`[MASTER]`), and emojis are human-readable display projections; they are NEVER authority credentials. Authority is governed by explicit session registration and immutable provenance envelopes.
- **Replacement of v3.1.1 Proposal**: The previous proposal to convert the audit of session `ses_f4f3bff61ffe2X80AbmeIXDijH` into an immediate automated release (v3.1.1) is officially superseded by ADR-010 and the C0 Inventory Reconciliation (`docs/architecture/inventory-c0-reconciliation.md`). No release, merge, or production code mutations are authorized until individual slices are reviewed and scheduled.
