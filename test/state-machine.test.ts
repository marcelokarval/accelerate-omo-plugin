import { describe, it, expect, vi, beforeEach } from "vitest";
import { StateMachineService } from "../src/state-machine.js";
import { GitWorktreeService } from "../src/git-worktree.js";
import { OpenCodeClient } from "../src/opencode-client.js";

describe("StateMachineService & Fail-Closed Dispatch (Task 6)", () => {
  let worktreeService: GitWorktreeService;
  let client: OpenCodeClient;
  let stateMachine: StateMachineService;

  beforeEach(() => {
    worktreeService = new GitWorktreeService();
    client = new OpenCodeClient({ baseUrl: "http://localhost:4096" });

    vi.spyOn(worktreeService, "create").mockResolvedValue({
      worktreePath: "/tmp/worktree-123",
      branchName: "accelerate/task-1-123",
    });
    vi.spyOn(worktreeService, "remove").mockResolvedValue();
    vi.spyOn(worktreeService, "quarantine").mockResolvedValue("/tmp/quarantine/worktree-123");

    vi.spyOn(client, "createSession").mockResolvedValue({
      id: "ses_test_123",
      directory: "/tmp/worktree-123",
    });
    vi.spyOn(client, "promptAsync").mockResolvedValue();

    stateMachine = new StateMachineService(worktreeService, client);
  });

  it("should initialize in DISCUSSION phase", () => {
    expect(stateMachine.getPhase()).toBe("DISCUSSION");
  });

  it("should enforce valid phase transitions", () => {
    stateMachine.transitionTo("SPEC_READY");
    expect(stateMachine.getPhase()).toBe("SPEC_READY");

    expect(() => {
      stateMachine.transitionTo("COMPLETED");
    }).toThrow(/INVALID TRANSITION/);
  });

  it("should successfully orchestrate a worker dispatch", async () => {
    stateMachine.transitionTo("SPEC_READY");

    const result = await stateMachine.dispatchWorker({
      taskSlug: "stripe-adapter",
      repoPath: "/repo",
      baseRef: "HEAD",
      prompt: "Implement adapter",
    });

    expect(result.status).toBe("success");
    expect(result.sessionId).toBe("ses_test_123");
    expect(result.worktreePath).toBe("/tmp/worktree-123");
    expect(stateMachine.getPhase()).toBe("EXECUTING");

    expect(worktreeService.create).toHaveBeenCalled();
    expect(client.createSession).toHaveBeenCalled();
    expect(client.promptAsync).toHaveBeenCalledWith("ses_test_123", "Implement adapter");
  });

  it("should fail-closed and quarantine worktree if prompt dispatch fails", async () => {
    stateMachine.transitionTo("SPEC_READY");
    vi.spyOn(client, "promptAsync").mockRejectedValue(new Error("Network timeout"));

    const result = await stateMachine.dispatchWorker({
      taskSlug: "broken-task",
      repoPath: "/repo",
      baseRef: "HEAD",
      prompt: "broken",
    });

    expect(result.status).toBe("error");
    expect(stateMachine.getPhase()).toBe("FAILED");
    expect(worktreeService.quarantine).toHaveBeenCalledWith("/tmp/worktree-123");
  });
});
