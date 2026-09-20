# ADR-005: Multi-Lingual Semantic Persona Detection and Autonomous Session Rebranding

## Status
Accepted

## Date
2026-09-20

## Context
In OpenCode, an interaction session is only allocated in persistent storage when the first user turn is received. Across all user interfaces (CLI TUI, OpenChamber, OpenCode Web), users cannot edit or configure the session title before this initial turn.
Historically, `PersonaManager` relied solely on `title.includes("[MASTER]")` or `title.includes("MASTER -")`. When a session is initiated with a default name (e.g. `New session - 2026-09-20T...`), if the user's prompt begins conversationally (e.g. `"Você é a sessão master do ecossistema..."` or `"Act as master orchestrator to refactor..."`), the plugin fails to recognize the persona and defaults to `standard`. This disables tool fencing, omits the `<PERSONA_GOVERNANCE>` prompt, and bypasses the engineering pipeline.

## Decisions

### 1. Unified Semantic Detection Engine (`PersonaManager.detectPersona`)
Extend `detectPersona` to inspect both session title and user prompt content using multi-lingual pattern matching:
- **English Triggers**:
  - `\[MASTER\]`, `MASTER\s*[-:]`, `act as master`, `you are the master`, `master orchestrator`, `master session`, `lead orchestrator`.
- **Portuguese Triggers**:
  - `você é o master`, `voce e o master`, `atue como master`, `orquestrador master`, `sessão master`, `sessao master`, `governança do ecossistema`.
- **Worker Triggers**:
  - `⚡?\s*\[W-`, `\[W-\d+\]`, `\[WORKER\]`.

### 2. Autonomous Title Generation (`generateMasterTitle`)
Implement an algorithm in `PersonaManager` to produce a clean, human-readable session title from the user prompt:
- Strips punctuation, boilerplate greeting phrases (`você é o master`, `por favor`, `atue como master`).
- Normalizes length to 50-70 characters.
- Prefixes with canonical `[MASTER] ` tag.
- Example: `"analise a raiz desse repositório e monte o plano de limpeza"` ➔ `"[MASTER] Limpeza e Análise da Raiz do Repositório"`.

### 3. Asynchronous Auto-Branding in `chat.message`
In the `chat.message` hook:
1. Determine active persona using `personaManager.resolveSessionPersona`.
2. If persona is `standard`, evaluate `detectPersona(title, userPrompt)`.
3. If classified as `master`:
   - Register persona in memory (`registerSessionPersona`).
   - Check if current session title is generic (`New session - ...`, `Untitled`, empty).
   - If generic, trigger `openCodeClient.updateSession(sessionID, { title: generatedTitle })` asynchronously without blocking the user response.
   - Inject `<PERSONA_GOVERNANCE>` block into `firstPart.text`.

## Consequences
### Positive
- Universal UX parity: Whether in TUI, OpenChamber, or WebUI, sessions become `[MASTER]` automatically on Turn 1.
- No rigid syntax: Users can speak naturally in English or Portuguese.
- Immediate UI update: The sidebar and title in OpenChamber update automatically on the first message.
- Zero code mutation leakage: Tool fencing is active from the very first tool call in Turn 1.

### Negative / Trade-offs
- An additional `PATCH /session/:id` HTTP call is made on Turn 1 for newly detected Master sessions. This call is non-blocking and executes in <15ms locally.
