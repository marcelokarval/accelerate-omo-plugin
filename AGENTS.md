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
