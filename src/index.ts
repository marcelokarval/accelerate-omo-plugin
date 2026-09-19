import { tool, type Plugin, type Hooks, type ToolDefinition } from "@opencode-ai/plugin";
import { z } from "zod";
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

  const tools: Record<string, ToolDefinition> = {
    acc_dispatch_worker: tool({
      description: "Dispatches an atomic task to an isolated Worker in a dedicated Git Worktree via native OpenCode async APIs. Use ONLY when operating as Master Orchestrator.",
      args: {
        taskSlug: z.string().describe("Short slug identifying the task (e.g. 'stripe-adapter', 'p4y-w8')"),
        targetDir: z.string().describe("Absolute or relative path where the isolated Git Worktree will be created"),
        baseRef: z.string().optional().describe("Git base commit/branch to branch off (default: 'HEAD')"),
        prompt: z.string().describe("Strict, self-contained implementation task prompt for the Worker"),
      },
      execute: async (args, context) => {
        const sessionId = context?.sessionID || "";
        const persona = personaManager.getSessionPersona(sessionId);
        if (persona === "worker") {
          throw new Error("[ACCELERATE RECURSION DENIED] Workers are forbidden from dispatching child workers.");
        }

        // Garante transição para SPEC_READY caso esteja em DISCUSSION
        if (stateMachine.getPhase() === "DISCUSSION") {
          stateMachine.transitionTo("SPEC_READY");
        }

        const result = await stateMachine.dispatchWorker({
          taskSlug: args.taskSlug,
          targetDir: args.targetDir,
          baseRef: args.baseRef || "HEAD",
          prompt: args.prompt,
        });

        return JSON.stringify(result, null, 2);
      },
    }),

    acc_approve_plane_sync: tool({
      description: "Generates or approves a Plane state transition receipt. Requires human approval before network transmission.",
      args: {
        phase: z.enum(["START", "PROGRESS", "BLOCKED", "REVIEW", "FINISH"]).describe("Lifecycle phase to transition to"),
        workspaceSlug: z.string(),
        projectId: z.string(),
        workItemId: z.string(),
        targetStateId: z.string(),
        expectedCurrentStateId: z.string(),
        expectedUpdatedAt: z.string(),
        idempotencyKey: z.string(),
        commentHtml: z.string(),
        humanApproved: z.boolean().describe("Set to true ONLY if the human operator explicitly confirmed the Plane transition"),
      },
      execute: async (args) => {
        const receipt = planeGate.prepareTransitionReceipt(args.phase, {
          workspaceSlug: args.workspaceSlug,
          projectId: args.projectId,
          workItemId: args.workItemId,
          targetStateId: args.targetStateId,
          expectedCurrentStateId: args.expectedCurrentStateId,
          expectedUpdatedAt: args.expectedUpdatedAt,
          idempotencyKey: args.idempotencyKey,
          commentHtml: args.commentHtml,
        });

        const decision = planeGate.authorizeTransition(receipt, Boolean(args.humanApproved));
        return JSON.stringify(decision, null, 2);
      },
    }),
  };

  const hooks: Hooks = {
    tool: tools,

    /**
     * Tool Fencing: Blocks code mutation tools for sessions running under the [MASTER] persona.
     */
    "tool.execute.before": async (input, _output) => {
      const { tool: toolName, sessionID } = input;
      if (!personaManager.isToolAllowed(sessionID, toolName)) {
        throw new Error(
          `[ACCELERATE PERMISSION DENIED] Session is registered as [MASTER]. Direct code modification tool '${toolName}' is blocked by policy. You must dispatch an isolated Worker session.`
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
