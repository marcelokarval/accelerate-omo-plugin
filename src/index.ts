import path from "node:path";
import { tool, type Plugin, type Hooks, type ToolDefinition } from "@opencode-ai/plugin";
import { z } from "zod";
import { PersonaManager } from "./persona-manager.js";
import { GitWorktreeService } from "./git-worktree.js";
import { OpenCodeClient } from "./opencode-client.js";
import { StateMachineService } from "./state-machine.js";
import { PlaneApprovalGateService } from "./plane-adapter.js";

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
        specPath: z.string().describe("Path to the specification artifact (PRD/ADR/SDD/Plan). The file MUST exist on disk."),
        baseRef: z.string().optional().describe("Git base commit/branch to branch off (default: 'HEAD')"),
        prompt: z.string().describe("Strict, self-contained implementation task prompt for the Worker"),
      },
      execute: async (args, context) => {
        const sessionId = context?.sessionID || "";
        const messageId = context?.messageID || "";
        const persona = personaManager.getSessionPersona(sessionId);
        if (persona === "worker") {
          throw new Error("[ACCELERATE RECURSION DENIED] Workers are forbidden from dispatching child workers.");
        }

        const currentPhase = stateMachine.getPhase();
        if (currentPhase === "FAILED") {
          stateMachine.transitionTo("DISCUSSION");
          stateMachine.transitionTo("SPEC_READY");
        } else if (currentPhase === "DISCUSSION") {
          stateMachine.transitionTo("SPEC_READY");
        }

        const resolvedSpecPath = path.isAbsolute(args.specPath)
          ? args.specPath
          : path.resolve(process.cwd(), args.specPath);

        const result = await stateMachine.dispatchWorker({
          taskSlug: args.taskSlug,
          targetDir: args.targetDir,
          specPath: resolvedSpecPath,
          baseRef: args.baseRef || "HEAD",
          prompt: args.prompt,
          masterSessionId: sessionId,
          triggerMessageId: messageId,
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
        delegationId: z.string().optional().describe("Optional delegation id (del_...) associated with the execution"),
        workerSessionId: z.string().optional().describe("Optional worker session id (ses_...) that completed the task"),
      },
      execute: async (args, context) => {
        const masterSessionId = context?.sessionID;
        const triggerMessageId = context?.messageID;

        const provenance = {
          delegationId: args.delegationId,
          masterSessionId,
          triggerMessageId,
          workerSessionId: args.workerSessionId,
          timestamp: new Date().toISOString(),
        };

        const receipt = planeGate.prepareTransitionReceipt(args.phase, {
          workspaceSlug: args.workspaceSlug,
          projectId: args.projectId,
          workItemId: args.workItemId,
          targetStateId: args.targetStateId,
          expectedCurrentStateId: args.expectedCurrentStateId,
          expectedUpdatedAt: args.expectedUpdatedAt,
          idempotencyKey: args.idempotencyKey,
          commentHtml: args.commentHtml,
          provenance,
        });

        const decision = planeGate.authorizeTransition(receipt, Boolean(args.humanApproved));
        return JSON.stringify(decision, null, 2);
      },
    }),

    acc_set_session_title: tool({
      description: "Updates an OpenCode session title and registers the corresponding Accelerate persona.",
      args: {
        title: z.string().min(1).describe("The new title for the session"),
        sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
      },
      execute: async (args, context) => {
        const targetSessionId = args.sessionId || context?.sessionID;
        if (!targetSessionId) {
          throw new Error("[ACCELERATE ERROR] Missing sessionId for acc_set_session_title.");
        }

        await openCodeClient.updateSession(targetSessionId, { title: args.title });
        const newPersona = personaManager.detectPersonaFromTitle(args.title);
        personaManager.registerSessionPersona(targetSessionId, newPersona);

        return JSON.stringify(
          {
            status: "success",
            sessionId: targetSessionId,
            title: args.title,
            persona: newPersona,
          },
          null,
          2
        );
      },
    }),

    acc_get_session_info: tool({
      description: "Retrieves metadata and resolved Accelerate persona for an OpenCode session.",
      args: {
        sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
      },
      execute: async (args, context) => {
        const targetSessionId = args.sessionId || context?.sessionID;
        if (!targetSessionId) {
          throw new Error("[ACCELERATE ERROR] Missing sessionId for acc_get_session_info.");
        }

        const session = await openCodeClient.getSession(targetSessionId);
        const persona = await personaManager.resolveSessionPersona(targetSessionId, openCodeClient);

        const directory = session?.location?.directory || session?.directory || undefined;
        const title = session?.title || undefined;

        return JSON.stringify(
          {
            status: "success",
            sessionId: targetSessionId,
            title,
            persona,
            directory,
          },
          null,
          2
        );
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
      const toolArgs = (input as any).args ?? (input as any).parameters;
      await personaManager.resolveSessionPersona(sessionID, openCodeClient);
      if (!personaManager.isToolAllowed(sessionID, toolName, toolArgs)) {
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
      let persona = await personaManager.resolveSessionPersona(sessionID, openCodeClient);
      const firstPart = output.parts?.[0];
      if (firstPart && firstPart.type === "text" && typeof firstPart.text === "string") {
        if (persona === "standard") {
          const detected = personaManager.detectPersonaFromTitle(firstPart.text);
          if (detected !== "standard") {
            personaManager.registerSessionPersona(sessionID, detected);
            persona = detected;
          }
        }

        if (persona !== "standard") {
          const instructions = personaManager.getPersonaInstructions(persona);
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
