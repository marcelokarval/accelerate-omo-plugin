# ADR-009: Native System Prompt Governance Injection and Prompt Caching Optimization

## Status
Accepted

## Date
2026-09-20

## Context
In previous versions of `accelerate-omo-plugin`, persona governance instructions were injected by modifying `output.parts[0].text` inside the `chat.message` hook.
This caused the governance markdown to be permanently stored in OpenCode's SQLite database as part of the user's message, polluting the chat UI across OpenChamber, Web, and TUI interfaces.
Furthermore, modern LLM architectures (Anthropic Claude, Google Gemini, OpenAI) enforce prefix-based prompt caching. Injecting variable metadata at arbitrary positions or inside the user message body invalidates cache prefixes on every turn, driving up latency and token consumption.
OpenCode exposes the `"experimental.chat.system.transform"` hook, which allows plugins to append strings directly to `output.system` (the LLM's system prompt stream) without touching the user's message.

## Decisions

### 1. Separation of Responsibilities Between Hooks
- **`chat.message`**:
  - Exclusively responsible for session intent detection (`detectPersonaFromText`) and first-turn auto-branding (`updateSession`).
  - MUST NOT mutate or prepend any text to `output.parts`. The user's input remains 100% clean.
- **`"experimental.chat.system.transform"`**:
  - Exclusively responsible for delivering the `<PERSONA_GOVERNANCE>` system prompt to the LLM.

### 2. Strict Fail-Closed Gating
If the session persona evaluates to `standard` (or if `sessionID` is missing/unregistered), the hook exits immediately without appending anything to `output.system`.

### 3. Context Cache Prefix Preservation (Immutable-First Ordering)
To guarantee high cache hit rates (>90%) across consecutive turns:
1. **Static / Immutable Section (Cache Prefix)**:
   The raw law markdown (`skills/acc-master.md` or `skills/acc-worker.md`) is constant and byte-identical across turns. It is pushed first into `output.system`.
2. **Dynamic / Volatile Section (Cache Tail)**:
   Per-turn metadata (such as active physical phase from `stateMachine.getPhysicalPipelinePhase()` or dynamic session IDs) is formatted as an auxiliary block and appended strictly after the static law, or at the tail of `output.system`.

## Consequences
### Positive
- Clean UI: The user's chat bubble contains only what the user actually typed.
- Higher Authority: System prompt placement gives governance rules maximum weight in LLM attention.
- Cache Performance: Byte-identical static system prompt prefix maximizes provider prompt caching.
- Zero Regressions: Tool fencing and session renaming remain fully operational.

### Negative / Trade-offs
- Uses OpenCode's `experimental.chat.system.transform` hook. This hook is well-established across standard OpenCode plugins (e.g. `oh-my-openagent`).
