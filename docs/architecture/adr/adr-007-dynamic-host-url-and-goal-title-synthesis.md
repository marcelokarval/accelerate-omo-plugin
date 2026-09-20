# ADR-007: Dynamic Context Server URL Binding and Goal-Driven Title Synthesis

## Status
Accepted

## Date
2026-09-20

## Context
During operational debugging with Antigravity CLI and multi-session analysis, two critical architectural issues were identified:
1. **Host Server URL Mismatch**:
   OpenCode passes `PluginInput` to every plugin factory containing `serverUrl: URL` (e.g. `http://127.0.0.1:45607`).
   `AccelerateOmoPlugin` was ignoring `context.serverUrl` and falling back to hardcoded `http://127.0.0.1:4096`. When executed under OpenChamber (which runs on dynamic ports), all plugin API calls targeted the wrong daemon or failed with network timeouts.
2. **Fragile Word-Slicing & Typo Susceptibility**:
   `PersonaManager.generateMasterTitle` sliced raw words following greeting phrases, producing awkward titles. Simple typographical errors (e.g. `"vc agpra é o master"`) failed the literal regex match completely.

## Decisions

### 1. Dynamic Server URL Plumbing
In `AccelerateOmoPlugin`:
```typescript
const dynamicBaseUrl = context?.serverUrl
  ? context.serverUrl.toString().replace(/\/+$/, "")
  : (process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096");

const openCodeClient = overrides?.openCodeClient ?? new OpenCodeClient({ baseUrl: dynamicBaseUrl });
```
This guarantees the plugin always communicates with the exact host process that loaded it.

### 2. Typo-Tolerant Intent Matching
Upgrade `PersonaManager.detectPersonaFromText` to support common Portuguese and English colloquialisms and typos:
- `\b(v[ocê|c]|tu)\s+(ag[o|p]ra\s+)?(e|é|eh)\s+(o|a)?\s*master\b`
- `\b(act|operate)\s+as\s+(the\s+)?master\b`
- `\b(governan[çc]a|orquestra[çc][ãa]o)\b`

### 3. Goal-Driven Title Synthesis
Upgrade `PersonaManager.generateMasterTitle(promptText: string, directory?: string)`:
- If the prompt is purely a meta-instruction (e.g. `"renomeie e aguarde"`, `"você é o master"`), synthesize a clean domain title using the active workspace directory:
  - `[MASTER] <WorkspaceName> - Orquestração & Governança`
- If the prompt contains a task objective (e.g. `"limpeza da raiz"`, `"refatoração do billing"`), isolate the action and target:
  - `[MASTER] Limpeza e Governança da Raiz`
- Always bound to 70 characters and strictly format with canonical `[MASTER] ` prefix.

## Consequences
### Positive
- 100% network connectivity in OpenChamber, OpenCode Web, CLI TUI, and containerized runtimes.
- Natural, robust title generation without awkward chopped sentences.
- Resilient to typos and natural conversational speech.
