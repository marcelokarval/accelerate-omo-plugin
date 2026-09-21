# PRD: Clean System Prompt Governance & Prompt Caching Optimization

## 1. Problem Statement & Background
Currently, `accelerate-omo-plugin` injects the `<PERSONA_GOVERNANCE>` law by mutating the user's initial message part (`output.parts[0].text`) inside the `chat.message` hook.
This architecture introduces three severe defects:
1. **User Message Contamination**: The governance text is prepended to the actual `UserMessage` object. The OpenCode daemon stores this modified string in the SQLite `part` table, causing the UI (OpenChamber, Web, TUI) to render the entire multi-paragraph governance contract inside the user's chat bubble as if the user typed it.
2. **Cognitive Role Ambiguity**: Modern LLMs treat instructions in the user message channel with lower authority than system prompts. When governance rules reside in the user turn, models are more prone to treating them as conversational requests rather than inviolable system invariants.
3. **Context Cache Invalidation (Broken Prompt Caching)**: Providers such as Anthropic (Prompt Caching) and Google (Gemini Context Caching) match cache prefixes starting from the root system prompt downward. When dynamic session information or timestamps are injected at arbitrary points or inside the user message, the static cache prefix is invalidated on every turn, causing higher latency and token waste.

In contrast, `oh-my-openagent` (OmO) uses OpenCode's native `"experimental.chat.system.transform"` hook to inject system instructions cleanly into `output.system` without modifying the user's message.

## 2. Business & Operational Goals
- **Zero User-Message Contamination**: Ensure the user message in chat interfaces remains 100% clean, identical to what the user typed.
- **Native System Prompt Placement**: Inject `<PERSONA_GOVERNANCE>` directly into the LLM's system prompt stream via `"experimental.chat.system.transform"`.
- **Fail-Closed Plugin Gating**: If the plugin is inactive, disabled, or if the session is `standard`, absolutely nothing must be injected.
- **Prompt Cache Prefix Preservation (Immutable-First Ordering)**:
  - **Static / Immutable Block (Top of Cache)**: The canonical law markdown (`skills/acc-master.md` or `skills/acc-worker.md`) is byte-identical across all turns and must be pushed first to maximize context cache hits (>90% cache efficiency).
  - **Dynamic / Volatile Block (Tail of Cache)**: Dynamic runtime metadata (such as session ID, current physical FSM phase, or timestamps) must be positioned strictly at the end of the system block so that volatile changes do not invalidate the static cache prefix.

## 3. Scope & Acceptance Criteria
1. `chat.message` hook NO LONGER mutates `output.parts[0].text` with governance text. It handles only session intent detection and title auto-branding.
2. The `"experimental.chat.system.transform"` hook is implemented:
   - Resolves persona via `personaManager.resolveSessionPersona(sessionID, openCodeClient)`.
   - If persona is `master` or `worker`, pushes the immutable governance instructions to `output.system`.
   - Injects dynamic session state at the tail of the block.
   - If persona is `standard`, does not push anything to `output.system`.
3. Vitest unit tests verify:
   - `chat.message` leaves user text unmodified.
   - `experimental.chat.system.transform` populates `output.system` with static-first ordering.
   - `standard` persona leaves `output.system` untouched.
4. All existing tests pass with 0 regressions and 0 tsc errors.
