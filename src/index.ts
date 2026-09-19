import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { PersonaManager } from "./persona-manager.js";
import { GitWorktreeService } from "./git-worktree.js";
import { OpenCodeClient } from "./opencode-client.js";
import { StateMachineService } from "./state-machine.js";
import { PlaneApprovalGateService } from "./plane-adapter.js";

export {
  PersonaManager,
  GitWorktreeService,
  OpenCodeClient,
  StateMachineService,
  PlaneApprovalGateService,
};

export const AccelerateOmoPlugin: Plugin = async (_context) => {
  const personaManager = new PersonaManager();
  const worktreeService = new GitWorktreeService();
  const openCodeClient = new OpenCodeClient();
  const stateMachine = new StateMachineService(worktreeService, openCodeClient);
  const planeGate = new PlaneApprovalGateService();

  const hooks: Hooks = {
    /**
     * Tool Fencing: Blocks code mutation tools for sessions running under the [MASTER] persona.
     */
    "tool.execute.before": async (input, _output) => {
      const { tool, sessionID } = input;
      if (!personaManager.isToolAllowed(sessionID, tool)) {
        throw new Error(
          `[ACCELERATE PERMISSION DENIED] Session is registered as [MASTER]. Direct code modification tool '${tool}' is blocked by policy. You must dispatch an isolated Worker session.`
        );
      }
    },

    /**
     * Persona Injection: Intercepts incoming messages to detect [MASTER] vs [W-*] prefixes
     * and prepends the corresponding strict Mini-Skill instructions.
     */
    "chat.message": async (input, output) => {
      const { sessionID } = input;
      const firstPart = output.parts?.[0];
      if (firstPart && firstPart.type === "text" && typeof firstPart.text === "string") {
        const detected = personaManager.detectPersonaFromTitle(firstPart.text);
        if (detected !== "standard") {
          personaManager.registerSessionPersona(sessionID, detected);
          const instructions = personaManager.getPersonaInstructions(detected);
          if (instructions && !firstPart.text.includes(instructions)) {
            firstPart.text = `<PERSONA_GOVERNANCE>\n${instructions}\n</PERSONA_GOVERNANCE>\n\n${firstPart.text}`;
          }
        }
      }
    },
  };

  return hooks;
};

export default AccelerateOmoPlugin;
