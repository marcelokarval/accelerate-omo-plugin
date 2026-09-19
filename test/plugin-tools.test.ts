import { describe, it, expect } from "vitest";
import { AccelerateOmoPlugin } from "../src/index.js";

describe("Plugin Registered Tools (acc_dispatch_worker & acc_approve_plane_sync)", () => {
  it("should register tools in the plugin hooks object", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);

    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.acc_dispatch_worker).toBeDefined();
    expect(hooks.tool?.acc_approve_plane_sync).toBeDefined();
  });

  it("should require human approval ONLY for START and FINISH phases", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);
    const planeTool = hooks.tool?.acc_approve_plane_sync;

    const baseArgs = {
      workspaceSlug: "karval",
      projectId: "proj-1",
      workItemId: "issue-1",
      targetStateId: "state-in-progress",
      expectedCurrentStateId: "state-ready",
      expectedUpdatedAt: "2026-09-18T20:00:00Z",
      idempotencyKey: "test-key-1",
      commentHtml: "<p>Status update</p>",
      humanApproved: false,
    };

    // 1. START sem aprovação -> rejected
    const unapprovedStart = await planeTool?.execute({ ...baseArgs, phase: "START" }, {} as any);
    const startData = JSON.parse(unapprovedStart);
    expect(startData.status).toBe("rejected");
    expect(startData.requiresHumanApproval).toBe(true);
    expect(startData.payload.isHumanApproved).toBe(false);

    // 2. START com aprovação -> approved_for_dispatch
    const approvedStart = await planeTool?.execute({ ...baseArgs, phase: "START", humanApproved: true }, {} as any);
    const approvedStartData = JSON.parse(approvedStart);
    expect(approvedStartData.status).toBe("approved_for_dispatch");
    expect(approvedStartData.payload.isHumanApproved).toBe(true);

    // 3. Fases intermediárias (PROGRESS, BLOCKED, REVIEW) não exigem aprovação humana
    const progressOutput = await planeTool?.execute({ ...baseArgs, phase: "PROGRESS", humanApproved: false }, {} as any);
    const progressData = JSON.parse(progressOutput);
    expect(progressData.status).toBe("approved_for_dispatch");
    expect(progressData.requiresHumanApproval).toBe(false);
    expect(progressData.payload.isHumanApproved).toBe(true);

    const reviewOutput = await planeTool?.execute({ ...baseArgs, phase: "REVIEW", humanApproved: false }, {} as any);
    const reviewData = JSON.parse(reviewOutput);
    expect(reviewData.status).toBe("approved_for_dispatch");
    expect(reviewData.requiresHumanApproval).toBe(false);

    // 4. FINISH sem aprovação -> rejected
    const unapprovedFinish = await planeTool?.execute({ ...baseArgs, phase: "FINISH" }, {} as any);
    const finishData = JSON.parse(unapprovedFinish);
    expect(finishData.status).toBe("rejected");
    expect(finishData.requiresHumanApproval).toBe(true);

    const approvedFinish = await planeTool?.execute(
      {
        ...baseArgs,
        phase: "FINISH",
        humanApproved: true,
        delegationId: "del_12345678",
        workerSessionId: "ses_worker_done",
      },
      { sessionID: "ses_master_audit", messageID: "msg_finish_call" } as any
    );
    const approvedFinishData = JSON.parse(approvedFinish);
    expect(approvedFinishData.status).toBe("approved_for_dispatch");
    expect(approvedFinishData.payload.isHumanApproved).toBe(true);
    expect(approvedFinishData.payload.provenance).toBeDefined();
    expect(approvedFinishData.payload.provenance.delegationId).toBe("del_12345678");
    expect(approvedFinishData.payload.provenance.masterSessionId).toBe("ses_master_audit");
    expect(approvedFinishData.payload.provenance.triggerMessageId).toBe("msg_finish_call");
    expect(approvedFinishData.payload.provenance.workerSessionId).toBe("ses_worker_done");
  });

  it("should reject acc_dispatch_worker if specPath does not exist", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);
    const dispatchTool = hooks.tool?.acc_dispatch_worker;

    const resStr = await dispatchTool?.execute(
      {
        taskSlug: "test-task",
        targetDir: "/tmp/worktree-test",
        specPath: "non-existent-file.md",
        prompt: "Do work",
      },
      { sessionID: "ses_master_test", messageID: "msg_dispatch_test" } as any
    );

    const result = JSON.parse(resStr);
    expect(result.status).toBe("error");
    expect(result.error).toContain("[ACCELERATE SPECIFICATION REQUIRED]");
    expect(result.provenance).toBeDefined();
    expect(result.provenance.delegationId).toMatch(/^del_[0-9a-f]{8}$/);
    expect(result.provenance.masterSessionId).toBe("ses_master_test");
    expect(result.provenance.triggerMessageId).toBe("msg_dispatch_test");
  });
});
