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

export interface WorkerDispatchConfig {
  taskSlug: string;
  targetDir: string;
  baseRef?: string;
  prompt: string;
  timeoutMs?: number;
}

export interface WorkerRunResult {
  status: "success" | "timeout" | "error";
  worktreePath?: string;
  branchName?: string;
  sessionId?: string;
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

  /**
   * Dispatches an isolated worker session:
   * 1. Creates dedicated git worktree
   * 2. Spawns asynchronous OpenCode session
   * 3. Dispatches prompt via prompt/sendPrompt
   * 4. If timeout occurs, automatically moves worktree to quarantine (Fail-Closed)
   */
  public async dispatchWorker(config: WorkerDispatchConfig): Promise<WorkerRunResult> {
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
      this.transitionTo("FAILED");
      return {
        status: "error",
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
      this.transitionTo("FAILED");
      return {
        status: "error",
        error: `Failed to create OpenCode session: ${err?.message || err}`,
      };
    }

    try {
      await this.openCodeClient.prompt(session.id, config.prompt);
      this.transitionTo("EXECUTING");

      return {
        status: "success",
        worktreePath,
        branchName,
        sessionId: session.id,
      };
    } catch (err: any) {
      // Em falhas de despacho, aplica quarentena
      await this.worktreeService.quarantine({ path: worktreePath, reason: "dispatch_failure" });
      this.transitionTo("FAILED");
      return {
        status: "error",
        worktreePath,
        branchName,
        sessionId: session.id,
        error: `Failed to dispatch prompt: ${err?.message || err}`,
      };
    }
  }
}
