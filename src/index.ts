import path from "node:path";
import fs from "node:fs/promises";
import { tool, type Plugin, type Hooks, type ToolDefinition } from "@opencode-ai/plugin";
import { z } from "zod";
import { PersonaManager } from "./persona-manager.js";
import { GitWorktreeService } from "./git-worktree.js";
import { OpenCodeClient } from "./opencode-client.js";
import { StateMachineService } from "./state-machine.js";
import { PlaneApprovalGateService, type PlaneExecutionReceipt } from "./plane-adapter.js";
import { WorkerCompletionReportSchema } from "./types/worker-report.js";

export interface AcceleratePluginOptions {
  personaManager?: PersonaManager;
  worktreeService?: GitWorktreeService;
  openCodeClient?: OpenCodeClient;
  stateMachine?: StateMachineService;
  planeGate?: PlaneApprovalGateService;
}

export const AccelerateOmoPlugin: Plugin = async (context, options?: AcceleratePluginOptions) => {
  const dynamicBaseUrl = context?.serverUrl
    ? context.serverUrl.toString().replace(/\/+$/, "")
    : (process.env.OPENCODE_BASE_URL ?? "http://127.0.0.1:4096");

  const personaManager = options?.personaManager ?? new PersonaManager();
  const worktreeService = options?.worktreeService ?? new GitWorktreeService();
  const openCodeClient = options?.openCodeClient ?? new OpenCodeClient({ baseUrl: dynamicBaseUrl });
  const stateMachine = options?.stateMachine ?? new StateMachineService(worktreeService, openCodeClient);
  const planeGate = options?.planeGate ?? new PlaneApprovalGateService();

  const tools: Record<string, ToolDefinition> = {
    acc_status: tool({
      description: "Returns active Accelerate platform runtime status, plugin version, disk-evaluated engineering phase, host serverUrl, and physical artifact evidence.",
      args: {
        directory: z.string().optional().describe("Optional target directory to evaluate (defaults to workspace root)"),
      },
      execute: async (args, context) => {
        const targetDir = args.directory ? path.resolve(process.cwd(), args.directory) : process.cwd();
        const evidence = stateMachine.evaluatePhysicalEvidence(targetDir);
        const phase = stateMachine.getPhysicalPipelinePhase(targetDir);

        return JSON.stringify(
          {
            status: "success",
            version: "3.0.0",
            phase,
            evidence,
            host: {
              serverUrl: dynamicBaseUrl,
              pid: process.pid,
              cwd: process.cwd(),
            },
          },
          null,
          2
        );
      },
    }),

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

        const physicalPhase = typeof stateMachine.getPhysicalPipelinePhase === "function" ? stateMachine.getPhysicalPipelinePhase(process.cwd()) : "READY_FOR_DISPATCH";
        if (physicalPhase === "PRD_REQUIRED" || physicalPhase === "ADR_REQUIRED" || physicalPhase === "SDD_REQUIRED") {
          throw new Error(
            `[ACCELERATE PIPELINE BLOCKED] Cannot dispatch workers in phase '${physicalPhase}'. Master must author specifications first (PRD -> ADR -> SDD).`
          );
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

    session_rename: tool({
      description: "Renames the current OpenCode session title in the database and web UI. Defaults to active session if sessionId is omitted.",
      args: {
        title: z.string().min(1).describe("The new title for the session"),
        sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
      },
      execute: async (args, context) => {
        const targetSessionId = args.sessionId || context?.sessionID;
        if (!targetSessionId) {
          throw new Error("[ACCELERATE ERROR] Missing sessionId for session_rename.");
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

    session_info: tool({
      description: "Retrieves metadata and identity for the current session, including session ID, title, directory, and active persona.",
      args: {
        sessionId: z.string().optional().describe("Optional target session ID; defaults to current session ID"),
      },
      execute: async (args, context) => {
        const targetSessionId = args.sessionId || context?.sessionID;
        if (!targetSessionId) {
          throw new Error("[ACCELERATE ERROR] Missing sessionId for session_info.");
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

    acc_set_session_title: tool({
      description: "Updates an OpenCode session title and registers the corresponding Accelerate persona (alias of session_rename).",
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
      description: "Retrieves metadata and resolved Accelerate persona for an OpenCode session (alias of session_info).",
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

    acc_fanin_worker: tool({
      description: "Worker fan-in tool (temporarily blocked in this development version). Returns a blocked status pending candidate-bound verification and independent review qualification.",
      args: {
        targetDir: z.string().describe("Path to target worktree"),
        testCommand: z.string().optional().default("npm test").describe("Verification command to execute in worktree"),
        targetBranch: z.string().optional().default("master").describe("Target branch to merge into"),
        report: WorkerCompletionReportSchema.optional().describe("Optional structured Worker completion report"),
      },
      execute: async (args, context) => {
        return JSON.stringify(
          {
            status: "blocked",
            reason: "fanin_not_qualified",
            executed: false,
            message: "Automatic integration is temporarily unavailable pending candidate-bound verification and independent review. No verification command, checkout, merge, quarantine or cleanup was performed.",
          },
          null,
          2
        );
      },
    }),

    acc_dispatch_wave: tool({
      description: "Dispatches a parallel wave of atomic workers across independent Git worktrees.",
      args: {
        waveSlug: z.string().describe("Slug for the wave (e.g. 'wave-1-core')"),
        tasks: z.array(
          z.object({
            taskSlug: z.string(),
            targetDir: z.string(),
            specPath: z.string(),
            prompt: z.string(),
            baseRef: z.string().optional(),
          })
        ).min(1).describe("List of atomic tasks to dispatch in parallel"),
      },
      execute: async (args, context) => {
        const masterSessionId = context?.sessionID || "";
        const triggerMessageId = context?.messageID || "";
        const persona = personaManager.getSessionPersona(masterSessionId);
        if (persona === "worker") {
          throw new Error("[ACCELERATE RECURSION DENIED] Workers are forbidden from dispatching child workers.");
        }

        const physicalPhase = typeof stateMachine.getPhysicalPipelinePhase === "function" ? stateMachine.getPhysicalPipelinePhase(process.cwd()) : "READY_FOR_DISPATCH";
        if (physicalPhase === "PRD_REQUIRED" || physicalPhase === "ADR_REQUIRED" || physicalPhase === "SDD_REQUIRED") {
          throw new Error(
            `[ACCELERATE PIPELINE BLOCKED] Cannot dispatch workers in phase '${physicalPhase}'. Master must author specifications first (PRD -> ADR -> SDD).`
          );
        }

        const waveId = `wave_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

        const dispatchPromises = args.tasks.map(async (task) => {
          const resolvedSpecPath = path.isAbsolute(task.specPath)
            ? task.specPath
            : path.resolve(process.cwd(), task.specPath);

          const result = await stateMachine.dispatchWorker({
            taskSlug: task.taskSlug,
            targetDir: task.targetDir,
            specPath: resolvedSpecPath,
            baseRef: task.baseRef || "HEAD",
            prompt: task.prompt,
            masterSessionId,
            triggerMessageId,
          });

          return {
            taskSlug: task.taskSlug,
            targetDir: task.targetDir,
            sessionId: result.sessionId,
            worktreePath: result.worktreePath,
            branchName: result.branchName,
            status: result.status,
            error: result.error,
            provenance: result.provenance,
          };
        });

        const workers = await Promise.all(dispatchPromises);

        return JSON.stringify(
          {
            status: "success",
            waveId,
            waveSlug: args.waveSlug,
            dispatchedCount: workers.length,
            workers,
          },
          null,
          2
        );
      },
    }),

    acc_poll_workers: tool({
      description: "Polls active execution status of dispatched worker sessions.",
      args: {
        sessionIds: z.array(z.string()).min(1).describe("List of worker session IDs to check"),
      },
      execute: async (args) => {
        const pollPromises = args.sessionIds.map(async (sessionId) => {
          try {
            const session = await openCodeClient.getSession(sessionId);
            if (!session) {
              return {
                sessionId,
                status: "unknown",
                title: undefined,
                messageCount: 0,
                exists: false,
              };
            }

            const messages = Array.isArray(session.messages) ? session.messages : [];
            const rawStatus = session.status || (messages.length > 0 ? "idle" : "unknown");

            return {
              sessionId,
              status: rawStatus,
              title: session.title,
              messageCount: messages.length,
              exists: true,
            };
          } catch {
            return {
              sessionId,
              status: "unknown",
              title: undefined,
              messageCount: 0,
              exists: false,
            };
          }
        });

        const pollResults = await Promise.all(pollPromises);

        return JSON.stringify(
          {
            status: "success",
            pollResults,
          },
          null,
          2
        );
      },
    }),

    acc_execute_plane_sync: tool({
      description: "Validates and authorizes a Plane state transition receipt. Enforces human approval for START and FINISH phases, returning receipt authorization status without remote network mutation.",
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

        if (decision.status === "rejected") {
          const rejectedReceipt: PlaneExecutionReceipt = {
            ...decision,
            status: "rejected",
            executed: false,
            reason: "human_approval_required",
            phase: args.phase,
          };
          return JSON.stringify(rejectedReceipt, null, 2);
        }

        const notExecutedReceipt: PlaneExecutionReceipt = {
          status: "not_executed",
          executed: false,
          reason: "transport_unavailable",
          phase: args.phase,
          receipt: decision,
        };

        return JSON.stringify(notExecutedReceipt, null, 2);
      },
    }),
  };

  const hooks: Hooks = {
    tool: tools,

    /**
     * Tool Fencing: Blocks code mutation tools for sessions running under the [MASTER] persona.
     */
    "tool.execute.before": async (input, output) => {
      const { tool: toolName, sessionID } = input;
      const toolArgs = output?.args;
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
/**
     * System Prompt Transform: Injects <PERSONA_GOVERNANCE> directly into the LLM system prompt stream.
     * Zero user message contamination; strictly ordered with immutable static law first for cache efficiency.
     */
    "experimental.chat.system.transform": async (input, output) => {
      const sessionID = input.sessionID;
      if (!sessionID) return;

      const persona = await personaManager.resolveSessionPersona(sessionID, openCodeClient);
      if (persona === "standard") {
        return; // Fail-closed: standard sessions receive no governance injection
      }

      const instructions = personaManager.getPersonaInstructions(persona);
      if (!instructions) return;

      // 1. Immutable static law first (preserves cache prefix across turns)
      output.system.push(`<PERSONA_GOVERNANCE>\n${instructions}\n</PERSONA_GOVERNANCE>`);

      // 2. Dynamic runtime context appended at the tail (does not invalidate prefix cache)
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
    },
  };

  return hooks;
};

export default AccelerateOmoPlugin;
