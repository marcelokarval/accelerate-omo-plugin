import { describe, it, expect, vi, beforeEach } from "vitest";
import { StateMachineService } from "../src/state-machine.js";
import { GitWorktreeService } from "../src/git-worktree.js";
import { OpenCodeClient } from "../src/opencode-client.js";

import path from "node:path";
import fs from "node:fs";

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

  it("is idempotent when transitioning to current phase", () => {
    stateMachine.transitionTo("SPEC_READY");
    expect(stateMachine.getPhase()).toBe("SPEC_READY");
    stateMachine.transitionTo("SPEC_READY");
    expect(stateMachine.getPhase()).toBe("SPEC_READY");

    stateMachine.transitionTo("FAILED");
    expect(stateMachine.getPhase()).toBe("FAILED");
    stateMachine.transitionTo("FAILED");
    expect(stateMachine.getPhase()).toBe("FAILED");
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
      repositoryRoot: "/tmp/project-root",
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
      repositoryRoot: "/tmp/project-root",
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
      repositoryRoot: "/tmp/project-root",
    });

    expect(result.status).toBe("error");
    expect(stateMachine.getPhase()).toBe("FAILED");
    expect(worktreeService.quarantine).toHaveBeenCalledWith({
      path: "/tmp/worktree-123",
      reason: "dispatch_failure",
      repositoryRoot: "/tmp/project-root",
    });
  });

  it("uses the operation root when cleaning up a session creation failure", async () => {
    stateMachine.transitionTo("SPEC_READY");
    vi.spyOn(client, "createSession").mockRejectedValue(new Error("Session unavailable"));

    const result = await stateMachine.dispatchWorker({
      taskSlug: "session-failure",
      targetDir: "/tmp/worktree-123",
      specPath: "package.json",
      prompt: "broken",
      repositoryRoot: "/tmp/project-root",
    });

    expect(result.status).toBe("error");
    expect(worktreeService.remove).toHaveBeenCalledWith({
      path: "/tmp/worktree-123",
      force: true,
      repositoryRoot: "/tmp/project-root",
    });
  });
  describe("Physical Disk-Anchored FSM (Accelerate v3.0)", () => {
    it("evaluates physical evidence and phases correctly from disk artifacts", () => {
      const tempDir = path.join(process.cwd(), ".tmp-test-fsm-" + Date.now());
      fs.mkdirSync(tempDir, { recursive: true });

      try {
        expect(stateMachine.getPhysicalPipelinePhase(tempDir)).toBe("PRD_REQUIRED");

        // Create PRD
        fs.mkdirSync(path.join(tempDir, "docs/plans"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "docs/plans/prd-test.md"), "# PRD");
        expect(stateMachine.getPhysicalPipelinePhase(tempDir)).toBe("ADR_REQUIRED");

        // Create ADR
        fs.mkdirSync(path.join(tempDir, "docs/architecture/adr"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "docs/architecture/adr/adr-001.md"), "# ADR");
        expect(stateMachine.getPhysicalPipelinePhase(tempDir)).toBe("SDD_REQUIRED");

        // Create SDD
        fs.mkdirSync(path.join(tempDir, "docs/architecture/sdd"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "docs/architecture/sdd/sdd-001.md"), "# SDD");
        expect(stateMachine.getPhysicalPipelinePhase(tempDir)).toBe("TASKS_REQUIRED");

        // Create Tasks
        fs.mkdirSync(path.join(tempDir, "docs/tasks"), { recursive: true });
        fs.writeFileSync(path.join(tempDir, "docs/tasks/tasks.md"), "# Tasks");
        expect(stateMachine.getPhysicalPipelinePhase(tempDir)).toBe("READY_FOR_DISPATCH");

        // Active worktrees exist
        fs.mkdirSync(path.join(tempDir, ".worktrees/task-1"), { recursive: true });
        expect(stateMachine.getPhysicalPipelinePhase(tempDir)).toBe("EXECUTING_WAVE");
      } finally {
        if (fs.existsSync(tempDir)) {
          fs.rmSync(tempDir, { recursive: true, force: true });
        }
      }
    });
  });

});
