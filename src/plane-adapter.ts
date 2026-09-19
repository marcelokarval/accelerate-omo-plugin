export type PlaneLifecyclePhase = "START" | "PROGRESS" | "BLOCKED" | "REVIEW" | "FINISH";

export interface PlaneTransitionPayload {
  workspaceSlug: string;
  projectId: string;
  workItemId: string;
  targetStateId: string;
  expectedCurrentStateId: string;
  expectedUpdatedAt: string;
  idempotencyKey: string;
  commentHtml: string;
  isHumanApproved: boolean;
}

export interface PlaneTransitionReceipt {
  status: "pending_human_approval" | "approved_for_dispatch" | "rejected";
  payload: PlaneTransitionPayload;
  formattedReceiptMarkdown: string;
  error?: string;
}

export class PlaneApprovalGateService {
  /**
   * Prepares a lifecycle transition payload strictly requiring human approval.
   * Fail-Closed: Never performs an automated network request without explicit approval flag.
   */
  public prepareTransitionReceipt(
    phase: PlaneLifecyclePhase,
    payload: Omit<PlaneTransitionPayload, "isHumanApproved">
  ): PlaneTransitionReceipt {
    const receiptMarkdown = [
      `### 🛡️ [PLANE MUTATION GATE] Proposed Transition: ${phase}`,
      `- **Work Item ID**: \`${payload.workItemId}\``,
      `- **Project**: \`${payload.projectId}\``,
      `- **Target State**: \`${payload.targetStateId}\``,
      `- **Idempotency Key**: \`${payload.idempotencyKey}\``,
      `\n**Rendered Lifecycle Comment Preview**:`,
      `> ${payload.commentHtml.replace(/\n/g, "\n> ")}`,
      `\n*Notice: Automated network mutations are blocked by policy. Human operator must approve transmission.*`,
    ].join("\n");

    return {
      status: "pending_human_approval",
      payload: {
        ...payload,
        isHumanApproved: false,
      },
      formattedReceiptMarkdown: receiptMarkdown,
    };
  }

  /**
   * Evaluates if a transition can be sent to the Plane MCP.
   * Returns true ONLY if explicit human authorization is affirmed.
   */
  public authorizeTransition(
    receipt: PlaneTransitionReceipt,
    humanApproved: boolean
  ): PlaneTransitionReceipt {
    if (!humanApproved) {
      return {
        ...receipt,
        status: "rejected",
        error: "Human operator rejected the Plane state transition.",
      };
    }

    return {
      ...receipt,
      status: "approved_for_dispatch",
      payload: {
        ...receipt.payload,
        isHumanApproved: true,
      },
    };
  }
}
