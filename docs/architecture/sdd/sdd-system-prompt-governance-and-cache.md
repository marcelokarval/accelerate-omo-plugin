# SDD: System Prompt Governance Transform & Cache Optimization

## 1. System Overview
This Software Design Document specifies:
1. Migration of `<PERSONA_GOVERNANCE>` injection from `chat.message` to `experimental.chat.system.transform`.
2. Removal of user message mutation in `chat.message` to guarantee 100% clean user turns in chat history.
3. Cache-optimized ordering (immutable static law first, dynamic phase/session metadata at the tail).
4. Strict fail-closed gating (no injection when session is `standard`).

---

## 2. Component Design

### 2.1 Hook Refactoring (`src/index.ts`)

```typescript
// 1. chat.message ONLY handles intent detection and first-turn auto-branding:
"chat.message": async (input, output) => {
  const { sessionID } = input;
  let persona = await personaManager.resolveSessionPersona(sessionID, openCodeClient);
  const firstPart = output.parts?.[0];

  if (firstPart && firstPart.type === "text" && typeof firstPart.text === "string") {
    if (persona === "standard") {
      const detected = personaManager.detectPersonaFromText(firstPart.text);
      if (detected !== "standard") {
        personaManager.registerSessionPersona(sessionID, detected);
        persona = detected;

        if (detected === "master") {
          const session = await openCodeClient.getSession(sessionID);
          if (personaManager.isGenericTitle(session?.title)) {
            const autoTitle = personaManager.generateMasterTitle(firstPart.text, session?.directory);
            await openCodeClient.updateSession(sessionID, { title: autoTitle });
          }
        }
      }
    }
  }
  // ZERO mutation of firstPart.text! User message remains pristine.
},

// 2. experimental.chat.system.transform injects governance into the LLM system prompt stream:
"experimental.chat.system.transform": async (input, output) => {
  const sessionID = input.sessionID;
  if (!sessionID) return;

  const persona = await personaManager.resolveSessionPersona(sessionID, openCodeClient);
  if (persona === "standard") {
    return; // Strict fail-closed: standard sessions receive no governance injection
  }

  const instructions = personaManager.getPersonaInstructions(persona);
  if (!instructions) return;

  // Cache-Optimized Injection (Immutable static law first):
  // 1. Static Invariant Block (Maximizes context cache hit rate across LLM providers)
  output.system.push(`<PERSONA_GOVERNANCE>\n${instructions}\n</PERSONA_GOVERNANCE>`);

  // 2. Dynamic Ephemeral Block (Appended at the tail to avoid cache prefix invalidation)
  if (persona === "master") {
    const projectDir = process.cwd();
    const phase = typeof stateMachine.getPhysicalPipelinePhase === "function"
      ? stateMachine.getPhysicalPipelinePhase(projectDir)
      : "READY_FOR_DISPATCH";

    output.system.push(
      `[ACCELERATE RUNTIME CONTEXT]\n• Session: ${sessionID}\n• Physical Phase: ${phase}\n• Directory: ${projectDir}`
    );
  }
},
```

---

## 3. Test Specifications

1. **`test/plugin-tools.test.ts`**:
   - `chat.message` hook: asserts that after processing a user prompt, `output.parts[0].text` is **identical** to the original input without containing `<PERSONA_GOVERNANCE>`.
   - `experimental.chat.system.transform` hook:
     * When session is `master`, `output.system` contains `<PERSONA_GOVERNANCE>` and static instructions.
     * Dynamic runtime context is positioned strictly after static instructions.
     * When session is `standard`, `output.system` is completely unmodified.
2. **Regression Contract**:
   - Tool fencing (`tool.execute.before`) continues to block `edit`/`write` for `master` on production paths.
   - `test/plugin-loader-contract.test.ts` passes with single export isolation.
