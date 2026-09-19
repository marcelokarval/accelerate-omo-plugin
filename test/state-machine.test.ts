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
      path: "/tmp/worktree-123",
      branch: "accelerate/task-1-123",
      baseRef: "HEAD",
    });
    vi.spyOn(worktreeService, "remove").mockResolvedValue({ path: "/tmp/worktree-123" });
    vi.spyOn(worktreeService, "quarantine").mockResolvedValue({
      originalPath: "/tmp/worktree-123",
      quarantinedPath: "/tmp/quarantine/worktree-123",
    });

    vi.spyOn(client, "createSession").mockResolvedValue({
      id: "ses_test_123",
      directory: "/tmp/worktree-123",
    });
    vi.spyOn(client, "prompt").mockResolvedValue({ success: true });

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
      targetDir: "/tmp/worktree-123",
      specPath: "package.json",
      baseRef: "HEAD",
      prompt: "Implement adapter",
      masterSessionId: "ses_master_test",
      triggerMessageId: "msg_trigger_test",
    });

    expect(result.status).toBe("success");
    expect(result.sessionId).toBe("ses_test_123");
    expect(result.worktreePath).toBe("/tmp/worktree-123");
    expect(result.provenance).toBeDefined();
    expect(result.provenance?.delegationId).toMatch(/^del_[0-9a-f]{8}$/);
    expect(result.provenance?.masterSessionId).toBe("ses_master_test");
    expect(result.provenance?.triggerMessageId).toBe("msg_trigger_test");
    expect(result.provenance?.workerSessionId).toBe("ses_test_123");
    expect(stateMachine.getPhase()).toBe("EXECUTING");

    expect(worktreeService.create).toHaveBeenCalledWith({
      path: "/tmp/worktree-123",
      branch: expect.stringContaining("accelerate/stripe-adapter-"),
      baseRef: "HEAD",
    });
    expect(client.createSession).toHaveBeenCalled();
    expect(client.prompt).toHaveBeenCalledWith("ses_test_123", "Implement adapter");
  });

  it("should reject worker dispatch if specPath does not exist on disk", async () => {
    stateMachine.transitionTo("SPEC_READY");

    const result = await stateMachine.dispatchWorker({
      taskSlug: "stripe-adapter",
      targetDir: "/tmp/worktree-123",
      specPath: "non-existent-spec.md",
      prompt: "Implement adapter",
    });

    expect(result.status).toBe("error");
    expect(result.error).toContain("[ACCELERATE SPECIFICATION REQUIRED]");
    expect(stateMachine.getPhase()).toBe("FAILED");
  });

  it("should fail-closed and quarantine worktree if prompt dispatch fails", async () => {
    stateMachine.transitionTo("SPEC_READY");
    vi.spyOn(client, "prompt").mockRejectedValue(new Error("Network timeout"));

    const result = await stateMachine.dispatchWorker({
      taskSlug: "broken-task",
      targetDir: "/tmp/worktree-123",
      specPath: "package.json",
      baseRef: "HEAD",
      prompt: "broken",
    });

    expect(result.status).toBe("error");
    expect(stateMachine.getPhase()).toBe("FAILED");
    expect(worktreeService.quarantine).toHaveBeenCalledWith({
      path: "/tmp/worktree-123",
      reason: "dispatch_failure",
    });
  });
});
