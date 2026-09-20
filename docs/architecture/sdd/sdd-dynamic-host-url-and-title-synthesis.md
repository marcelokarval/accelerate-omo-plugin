# SDD: Dynamic Host Server URL Plumbing and Goal-Driven Title Synthesis

## 1. System Overview
This Software Design Document specifies:
1. Dynamic host `serverUrl` binding in `AccelerateOmoPlugin` using OpenCode's `PluginInput.serverUrl`.
2. Typo-tolerant and colloquial regex pattern matching for Master persona triggers in `PersonaManager`.
3. Goal-driven, context-aware title synthesis in `generateMasterTitle(promptText, directory?)`.

---

## 2. API & Component Design

### 2.1 Dynamic `serverUrl` Plumbing (`src/index.ts`)

```typescript
export const AccelerateOmoPlugin: Plugin = async (context, overrides?: PluginOverrides) => {
  const dynamicBaseUrl = context?.serverUrl
    ? context.serverUrl.toString().replace(/\/+$/, "")
    : (process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096");

  const openCodeClient = overrides?.openCodeClient ?? new OpenCodeClient({ baseUrl: dynamicBaseUrl });
  const personaManager = overrides?.personaManager ?? new PersonaManager();
  const worktreeService = overrides?.worktreeService ?? new GitWorktreeService();
  const stateMachine = overrides?.stateMachine ?? new StateMachineService(worktreeService, openCodeClient);
  const planeGate = overrides?.planeGate ?? new PlaneApprovalGateService();
  // ...
```

### 2.2 Typo-Tolerant Semantic Regex (`src/persona-manager.ts`)

```typescript
public detectPersonaFromText(text: string): SessionPersona {
  if (!text) return "standard";
  const trimmed = text.trim();
  const upper = trimmed.toUpperCase();

  // Check explicit Worker tags first
  if (
    /⚡?\s*\[W-/i.test(trimmed) ||
    /\[W-\d+\]/i.test(trimmed) ||
    upper.includes("[WORKER]")
  ) {
    return "worker";
  }

  // Check explicit Master tags
  if (
    upper.includes("[MASTER]") ||
    upper.includes("MASTER -") ||
    upper.includes("MASTER:")
  ) {
    return "master";
  }

  // Typo-tolerant semantic patterns (English & Portuguese)
  const masterSemanticRegex = new RegExp(
    [
      "\\b(you are the master|act as master|master orchestrator|master session|lead orchestrator)\\b",
      "\\b(v[ocêe|c]|tu)\\s+(ag[op]ra\\s+)?(e|é|eh)\\s+(o|a)?\\s*master\\b",
      "\\b(atue como master|orquestrador master|sess[ãa]o master|guardi[ãa]o supremo)\\b",
      "\\b(governan[çc]a do ecossistema|assuma a governan[çc]a)\\b"
    ].join("|"),
    "i"
  );

  if (masterSemanticRegex.test(trimmed)) {
    return "master";
  }

  return "standard";
}
```

### 2.3 Goal-Driven Title Synthesis (`src/persona-manager.ts`)

```typescript
public generateMasterTitle(promptText: string, directory?: string): string {
  if (!promptText) {
    return this.fallbackDomainTitle(directory);
  }

  // Remove meta-commands and noise
  let cleaned = promptText
    .replace(/\[MASTER\]/gi, "")
    .replace(/\b(v[ocêe|c]|tu)\s+(ag[op]ra\s+)?(e|é|eh)\s+(o|a)?\s*master\b/gi, "")
    .replace(/\b(voc[êe] [ée] o master|voce e o master|atue como master|master orchestrator|por favor|please)\b/gi, "")
    .replace(/\b(j[áa]\s+)?renomeie(\s+essa|\s+esta)?\s+sess[ãa]o(\s+e\s+aguarde)?\b/gi, "")
    .replace(/\b(aguarde|espere|standby)\b/gi, "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/[^\w\s\u00C0-\u00FF-]/g, "")
    .trim();

  // If nothing meaningful remains after removing meta-commands, synthesize from directory
  const words = cleaned.split(/\s+/).filter(w => w.length > 2);
  if (words.length < 2) {
    return this.fallbackDomainTitle(directory);
  }

  // Capitalize and bound
  const summary = words.slice(0, 6).join(" ");
  const capitalized = summary.charAt(0).toUpperCase() + summary.slice(1);
  return `[MASTER] ${capitalized}`.slice(0, 70).trim();
}

private fallbackDomainTitle(directory?: string): string {
  if (directory) {
    const baseName = path.basename(directory);
    if (baseName && baseName !== "/" && baseName !== ".") {
      const cleanBase = baseName.replace(/[-_]/g, " ").replace(/[^\w\s]/g, "");
      const cap = cleanBase.charAt(0).toUpperCase() + cleanBase.slice(1);
      return `[MASTER] ${cap} - Governança & Orquestração`.slice(0, 70);
    }
  }
  return "[MASTER] Orquestração & Governança";
}
```

---

## 3. Test Specifications

1. **`test/persona-manager.test.ts`**:
   - Matches typo `"vc agpra é o master"` as `master`.
   - Matches `"tu eh o master"` as `master`.
   - Formats `"vc agpra é o master, já renomeie essa sessão e aguarde"` with directory `prop4you-inertia` as `"[MASTER] Prop4you inertia - Governança & Orquestração"`.
   - Formats concrete goal `"analise a raiz e monte o plano de limpeza"` as `"[MASTER] Analise raiz monte plano limpeza"`.
2. **`test/plugin-tools.test.ts`**:
   - Asserts `AccelerateOmoPlugin` uses `context.serverUrl` when provided, configuring `openCodeClient.baseUrl`.
