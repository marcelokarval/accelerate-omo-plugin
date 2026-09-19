import { describe, it, expect, vi } from "vitest";
import { AccelerateOmoPlugin } from "../src/index.js";

describe("Plugin Registered Tools (acc_dispatch_worker & acc_approve_plane_sync)", () => {
  it("should register tools in the plugin hooks object", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);

    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.acc_dispatch_worker).toBeDefined();
    expect(hooks.tool?.acc_approve_plane_sync).toBeDefined();
  });

  it("should enforce Plane transition approval gate in tool execution", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);
    const planeTool = hooks.tool?.acc_approve_plane_sync;

    const baseArgs = {
      phase: "START",
      workspaceSlug: "karval",
      projectId: "proj-1",
      workItemId: "issue-1",
      targetStateId: "state-in-progress",
      expectedCurrentStateId: "state-ready",
      expectedUpdatedAt: "2026-09-18T20:00:00Z",
      idempotencyKey: "test-key-1",
      commentHtml: "<p>Starting task</p>",
      humanApproved: false,
    };

    // Sem aprovação humana explícita -> rejected
    const unapprovedOutput = await planeTool?.execute(baseArgs, {} as any);
    const unapprovedData = JSON.parse(unapprovedOutput);
    expect(unapprovedData.status).toBe("rejected");
    expect(unapprovedData.payload.isHumanApproved).toBe(false);

    // Com aprovação humana explícita -> approved_for_dispatch
    const approvedOutput = await planeTool?.execute({ ...baseArgs, humanApproved: true }, {} as any);
    const approvedData = JSON.parse(approvedOutput);
    expect(approvedData.status).toBe("approved_for_dispatch");
    expect(approvedData.payload.isHumanApproved).toBe(true);
  });
});
