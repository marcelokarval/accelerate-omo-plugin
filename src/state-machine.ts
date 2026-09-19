import { existsSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { GitWorktreeService } from "./git-worktree.js";
import { OpenCodeClient } from "./opencode-client.js";

export type SessionPhase =
  | "DISCUSSION"
  | "SPEC_READY"
  | "DISPATCHING"
  | "EXECUTING"
  | "FAN_IN"
  | "COMPLETED"
  | "FAILED";

export interface ProvenanceEnvelope {
  delegationId: string;
  masterSessionId: string;
  triggerMessageId: string;
  workerSessionId?: string;
  timestamp: string;
}

export interface WorkerDispatchConfig {
  taskSlug: string;
  targetDir: string;
  specPath: string;
  baseRef?: string;
  prompt: string;
  masterSessionId?: string;
  triggerMessageId?: string;
  timeoutMs?: number;
}

export interface WorkerRunResult {
  status: "success" | "timeout" | "error";
  worktreePath?: string;
  branchName?: string;
  sessionId?: string;
  specPath?: string;
  provenance?: ProvenanceEnvelope;
  error?: string;
}

export class StateMachineService {
  private currentPhase: SessionPhase = "DISCUSSION";
  private worktreeService: GitWorktreeService;
  private openCodeClient: OpenCodeClient;

  constructor(
    worktreeService?: GitWorktreeService,
    openCodeClient?: OpenCodeClient
  ) {
    this.worktreeService = worktreeService ?? new GitWorktreeService();
    this.openCodeClient = openCodeClient ?? new OpenCodeClient();
  }

  public getPhase(): SessionPhase {
    return this.currentPhase;
  }

  public transitionTo(nextPhase: SessionPhase): void {
    if (this.currentPhase === nextPhase) return;

    const validTransitions: Record<SessionPhase, SessionPhase[]> = {
      DISCUSSION: ["SPEC_READY", "FAILED"],
      SPEC_READY: ["DISPATCHING", "DISCUSSION", "FAILED"],
      DISPATCHING: ["EXECUTING", "FAILED"],
      EXECUTING: ["FAN_IN", "FAILED"],
      FAN_IN: ["COMPLETED", "FAILED", "DISCUSSION"],
      COMPLETED: ["DISCUSSION"],
      FAILED: ["DISCUSSION"],
    };

    const allowed = validTransitions[this.currentPhase] || [];
    if (!allowed.includes(nextPhase)) {
      throw new Error(
        `[STATE MACHINE INVALID TRANSITION] Cannot transition from '${this.currentPhase}' to '${nextPhase}'.`
      );
    }

    this.currentPhase = nextPhase;
  }

  public async dispatchWorker(config: WorkerDispatchConfig): Promise<WorkerRunResult> {
    const delegationId = `del_${randomBytes(4).toString("hex")}`;
    const masterSessionId = config.masterSessionId || "ses_unknown";
    const triggerMessageId = config.triggerMessageId || "msg_unknown";

    if (!config.specPath || !existsSync(config.specPath)) {
      if (this.currentPhase !== "FAILED") this.transitionTo("FAILED");
      return {
        status: "error",
        provenance: {
          delegationId,
          masterSessionId,
          triggerMessageId,
          timestamp: new Date().toISOString(),
        },
        error: `[ACCELERATE SPECIFICATION REQUIRED] Specification artifact at '${config.specPath}' does not exist. Master must author PRD/ADR/SDD before dispatching workers.`,
      };
    }

    this.transitionTo("DISPATCHING");

    const branchName = `accelerate/${config.taskSlug}-${Date.now().toString().slice(-4)}`;
    let worktreeResult;

    try {
      worktreeResult = await this.worktreeService.create({
        path: config.targetDir,
        branch: branchName,
        baseRef: config.baseRef || "HEAD",
      });
    } catch (err: any) {
      if (this.currentPhase !== "FAILED") this.transitionTo("FAILED");
      return {
        status: "error",
        provenance: {
          delegationId,
          masterSessionId,
          triggerMessageId,
          timestamp: new Date().toISOString(),
        },
        error: `Failed to provision git worktree: ${err?.message || err}`,
      };
    }

    const worktreePath = worktreeResult.path;

    let session;
    try {
      session = await this.openCodeClient.createSession({
        directory: worktreePath,
        title: `⚡ [W-${config.taskSlug}] Isolated Task Execution`,
      });
    } catch (err: any) {
      await this.worktreeService.remove({ path: worktreePath, force: true });
      if (this.currentPhase !== "FAILED") this.transitionTo("FAILED");
      return {
        status: "error",
        provenance: {
          delegationId,
          masterSessionId,
          triggerMessageId,
          timestamp: new Date().toISOString(),
        },
        error: `Failed to create OpenCode session: ${err?.message || err}`,
      };
    }

    const provenance: ProvenanceEnvelope = {
      delegationId,
      masterSessionId,
      triggerMessageId,
      workerSessionId: session.id,
      timestamp: new Date().toISOString(),
    };

    try {
      await this.openCodeClient.prompt(session.id, config.prompt);
      this.transitionTo("EXECUTING");

      return {
        status: "success",
        worktreePath,
        branchName,
        sessionId: session.id,
        specPath: config.specPath,
        provenance,
      };
    } catch (err: any) {
      await this.worktreeService.quarantine({ path: worktreePath, reason: "dispatch_failure" });
      if (this.currentPhase !== "FAILED") this.transitionTo("FAILED");
      return {
        status: "error",
        worktreePath,
        branchName,
        sessionId: session.id,
        specPath: config.specPath,
        provenance,
        error: `Failed to dispatch prompt: ${err?.message || err}`,
      };
    }
  }
}
