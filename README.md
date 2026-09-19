# accelerate-omo-plugin

Accelerate sovereign Master/Worker orchestration and runtime governance plugin for OpenCode.

## Overview

The `accelerate-omo-plugin` enforces structural separation of concerns within the OpenCode ecosystem:
- **Master Orchestrator (`[MASTER]`)**: Governs architecture, task topology (DAG), engineering specifications (PRD/ADR/SDD/Tasks), and root branch integration. Prevented from performing direct code mutations on production files (`ZERO IMPLEMENTATION IN MASTER`).
- **Atomic Workers (`[W-*]`)**: Execute bounded, independent slices within dedicated physical Git Worktrees (`git worktree add -b`) under strict Test-Driven Development (`RED -> GREEN -> REFACTOR`).
- **Plane MCP Synchronization Gate**: Guarantees fail-closed human confirmation for `START` and `FINISH` transitions while allowing autonomous progress reports (`PROGRESS`, `BLOCKED`, `REVIEW`).

## Architecture & Canonical Engineering Pipeline

Every non-trivial engineering workflow adheres to the standard Accelerate lifecycle:

```text
[User Request]
       │
       ▼
1. Semantic Implication Gate (Micro vs Full Hardening)
       │
       ▼
2. PRD (Product Requirements Document) ── What to build and why
       │
       ▼
3. ADR (Architectural Decision Record) ── Design choices & trade-offs
       │
       ▼
4. SDD (Software Design Document) ──────── Contracts, types & schemas
       │
       ▼
5. Tasks DAG (Decomposition into Waves) ── Atomic assignment packets
       │
       ▼ (acc_dispatch_worker)
6. Worker Execution (Strict TDD) ───────── Real local runtimes in isolated worktree
       │
       ▼ (Worker Completion Report)
7. Forensic Review & Fan-in Integration ── Diff audit, regression suite, sequential merge
       │
       ▼ (acc_approve_plane_sync)
8. Plane Work Item Closure (FINISH) ────── Verified receipt & Done transition
```

## Tools Registered

### `acc_dispatch_worker`
Provisions an ephemeral Git Worktree, establishes an isolated OpenCode session, and dispatches the task prompt with minimal input context footprint (<1,500 tokens).
- **Parameters**: `taskSlug`, `targetDir`, `baseRef`, `prompt`.
- **Anti-Recursion**: Denies execution if invoked from within a Worker session.

### `acc_approve_plane_sync`
Prepares and signs canonical Plane lifecycle receipts with optimistic concurrency checks (`expectedCurrentStateId`, `expectedUpdatedAt`).
- **Scoped Human Approval**: Strictly enforces operator confirmation on `START` and `FINISH`. Fails closed if unconfirmed.

## Installation & Runtime Distribution

This plugin is designed to run agnostically within OpenCode without environment-specific absolute paths.

### 1. Global Plugin Registration
Register the compiled bundle in your OpenCode configuration (`~/.config/opencode/opencode.json`):

```json
{
  "plugin": [
    "file:///absolute/or/relative/path/to/accelerate-omo-plugin/dist/index.js"
  ]
}
```

*Note: For production deployments, install into `~/.config/opencode/plugins/accelerate-omo-plugin` or distribute via npm package.*

### 2. Development & Build

```bash
npm install
npm test
npm run build
```
