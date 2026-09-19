import type { Plugin, Hooks } from "@opencode-ai/plugin";
import { PersonaManager } from "./persona-manager.js";
import { GitWorktreeService } from "./git-worktree.js";
import { OpenCodeClient } from "./opencode-client.js";

export { PersonaManager, GitWorktreeService, OpenCodeClient };

export const AccelerateOmoPlugin: Plugin = async (_context) => {
  const personaManager = new PersonaManager();

  const hooks: Hooks = {
    /**
     * Intercepts tool execution: Enforces tool fencing (Master cannot write code)
     */
    "tool.execute.before": async (input, output) => {
      const { tool, sessionID } = input;
      if (!personaManager.isToolAllowed(sessionID, tool)) {
        throw new Error(
          `[ACCELERATE PERMISSION DENIED] Session is registered as [MASTER]. Direct code modification tool '${tool}' is blocked by policy. You must dispatch an isolated Worker session.`
        );
      }
    },

    /**
     * Intercepts incoming chat messages: Detects title tags and injects persona rules
     */
    "chat.message": async (input, output) => {
      const { sessionID } = input;
      // Se a primeira mensagem tiver tag [MASTER] ou [W-*], registrar e injetar
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
    }
  };

  return hooks;
};

export default AccelerateOmoPlugin;
