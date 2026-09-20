# SDD: Semantic Persona Detection and Cross-Client Auto-Branding Specification

## 1. System Overview
This Software Design Document specifies the extension to `accelerate-omo-plugin` providing:
1. Multi-lingual semantic intent recognition in `PersonaManager` (`detectPersona(title?: string, promptText?: string)`).
2. Autonomous Master title formatting (`generateMasterTitle(promptText: string)`).
3. First-turn auto-rebranding via `OpenCodeClient.updateSession` inside `chat.message` hook.
4. Fallback verification and cache coherence.

---

## 2. API & Component Design

### 2.1 Multi-Lingual Pattern Matching (`src/persona-manager.ts`)

```typescript
export class PersonaManager {
  // Existing methods ...

  public isGenericTitle(title?: string): boolean {
    if (!title) return true;
    const trimmed = title.trim();
    return (
      trimmed === "" ||
      trimmed === "Untitled" ||
      trimmed.startsWith("New session") ||
      trimmed.startsWith("Nova sessão") ||
      trimmed.startsWith("Nova sessao")
    );
  }

  public detectPersonaFromText(text: string): SessionPersona {
    const trimmed = text.trim();
    const upper = trimmed.toUpperCase();

    // Check for Worker tags first
    if (
      /⚡?\s*\[W-/i.test(trimmed) ||
      /\[W-\d+\]/i.test(trimmed) ||
      upper.includes("[WORKER]")
    ) {
      return "worker";
    }

    // Check for explicit Master tags
    if (
      upper.includes("[MASTER]") ||
      upper.includes("MASTER -") ||
      upper.includes("MASTER:")
    ) {
      return "master";
    }

    // Semantic Master patterns (English & Portuguese)
    const masterSemanticRegex = new RegExp(
      [
        "\\b(you are the master|act as master|master orchestrator|master session|lead orchestrator)\\b",
        "\\b(voc[êe] [ée] o master|atue como master|orquestrador master|sess[ãa]o master|guardi[ãa]o supremo)\\b",
        "\\b(governan[çc]a do ecossistema)\\b"
      ].join("|"),
      "i"
    );

    if (masterSemanticRegex.test(trimmed)) {
      return "master";
    }

    return "standard";
  }

  public generateMasterTitle(promptText: string): string {
    const cleaned = promptText
      .replace(/\[MASTER\]/gi, "")
      .replace(/\b(voc[êe] [ée] o master|atue como master|master orchestrator|por favor|analise|please)\b/gi, "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^\w\s\u00C0-\u00FF-]/g, "")
      .trim();

    const words = cleaned.split(/\s+/).filter(Boolean);
    const summary = words.slice(0, 7).join(" ");
    const capitalized = summary ? summary.charAt(0).toUpperCase() + summary.slice(1) : "Orchestration Root";

    return `[MASTER] ${capitalized}`.slice(0, 70);
  }
}
```

### 2.2 Hook Integration (`src/index.ts`)

In `chat.message`:
```typescript
"chat.message": async (input, output) => {
  const { sessionID } = input;
  const session = await openCodeClient.getSession(sessionID);
  const sessionTitle = session?.title;

  let persona = await personaManager.resolveSessionPersona(sessionID, openCodeClient);
  const firstPart = output.parts?.[0];

  if (firstPart && firstPart.type === "text" && typeof firstPart.text === "string") {
    if (persona === "standard") {
      // 1. Check title, 2. Check prompt text
      let detected = personaManager.detectPersonaFromText(sessionTitle || "");
      if (detected === "standard") {
        detected = personaManager.detectPersonaFromText(firstPart.text);
      }

      if (detected !== "standard") {
        personaManager.registerSessionPersona(sessionID, detected);
        persona = detected;

        // Auto-Branding on Turn 1 if title is generic
        if (detected === "master" && personaManager.isGenericTitle(sessionTitle)) {
          const newTitle = personaManager.generateMasterTitle(firstPart.text);
          openCodeClient.updateSession(sessionID, { title: newTitle }).catch(() => {});
        }
      }
    }

    if (persona !== "standard") {
      const instructions = personaManager.getPersonaInstructions(persona);
      if (instructions && !firstPart.text.includes(instructions)) {
        firstPart.text = `<PERSONA_GOVERNANCE>\n${instructions}\n</PERSONA_GOVERNANCE>\n\n${firstPart.text}`;
      }
    }
  }
}
```

---

## 3. Test Specifications

1. **`test/persona-manager.test.ts`**:
   - Asserts `detectPersonaFromText` returns `master` for:
     - `"[MASTER] Test"`
     - `"Você é a sessão master do ecossistema"`
     - `"Atue como Master Orchestrator para planejar"`
     - `"You are the master of this repository"`
     - `"Inicie a governança do ecossistema"`
   - Asserts `isGenericTitle` returns `true` for `"New session - 2026-..."`, `"Untitled"`, `""`, and `false` for `"[MASTER] Custom"`.
   - Asserts `generateMasterTitle` formats clean titles prefixed with `[MASTER]`.
2. **`test/plugin-tools.test.ts`**:
   - Asserts that sending a prompt with `"Você é o master..."` in `chat.message` triggers `updateSession` with `[MASTER] ...` and registers `master` persona.
   - Asserts that subsequent tool call to `edit` on `src/index.ts` is blocked.
3. **Loader Contract**:
   - Verifies `test/plugin-loader-contract.test.ts` passes with single export isolation.
