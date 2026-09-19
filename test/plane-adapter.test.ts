import { describe, it, expect } from "vitest";
import { PlaneApprovalGateService } from "../src/plane-adapter.js";

describe("PlaneApprovalGateService & Human Gate (Task 7)", () => {
  const service = new PlaneApprovalGateService();

  const basePayload = {
    workspaceSlug: "karval",
    projectId: "ca3ecef1-d8e4-49f0-b7db-b728be4fbf2a",
    workItemId: "6c5506d0-c776-4916-9b27-93722d429222",
    targetStateId: "state-in-progress",
    expectedCurrentStateId: "state-ready",
    expectedUpdatedAt: "2026-09-18T20:00:00Z",
    idempotencyKey: "idemp-test-123",
    commentHtml: "<p>START: Worker W-8 initiated execution</p>",
  };

  it("should format receipt and require human approval by default (Fail-Closed)", () => {
    const receipt = service.prepareTransitionReceipt("START", basePayload);

    expect(receipt.status).toBe("pending_human_approval");
    expect(receipt.payload.isHumanApproved).toBe(false);
    expect(receipt.formattedReceiptMarkdown).toContain("Proposed Transition: START");
    expect(receipt.formattedReceiptMarkdown).toContain("Automated network mutations are blocked by policy");
  });

  it("should reject transition if human approval is false", () => {
    const receipt = service.prepareTransitionReceipt("START", basePayload);
    const authorized = service.authorizeTransition(receipt, false);

    expect(authorized.status).toBe("rejected");
    expect(authorized.payload.isHumanApproved).toBe(false);
    expect(authorized.error).toContain("Human operator rejected");
  });

  it("should approve transition only when explicitly confirmed", () => {
    const receipt = service.prepareTransitionReceipt("FINISH", {
      ...basePayload,
      targetStateId: "state-done",
      commentHtml: "<p>FINISH: Worker W-8 completed verification</p>",
    });

    const authorized = service.authorizeTransition(receipt, true);

    expect(authorized.status).toBe("approved_for_dispatch");
    expect(authorized.payload.isHumanApproved).toBe(true);
    expect(authorized.error).toBeUndefined();
  });
});
