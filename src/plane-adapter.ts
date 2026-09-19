export type PlaneLifecyclePhase = "START" | "PROGRESS" | "BLOCKED" | "REVIEW" | "FINISH";

export interface PlaneProvenanceEnvelope {
  delegationId?: string;
  masterSessionId?: string;
  triggerMessageId?: string;
  workerSessionId?: string;
  timestamp: string;
}

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
  provenance?: PlaneProvenanceEnvelope;
}

export interface PlaneTransitionReceipt {
  status: "pending_human_approval" | "approved_for_dispatch" | "rejected";
  payload: PlaneTransitionPayload;
  formattedReceiptMarkdown: string;
  requiresHumanApproval: boolean;
  provenance?: PlaneProvenanceEnvelope;
  error?: string;
}

export class PlaneApprovalGateService {
  public requiresHumanGate(phase: PlaneLifecyclePhase): boolean {
    return phase === "START" || phase === "FINISH";
  }

  public prepareTransitionReceipt(
    phase: PlaneLifecyclePhase,
    payload: Omit<PlaneTransitionPayload, "isHumanApproved">
  ): PlaneTransitionReceipt {
    const needsApproval = this.requiresHumanGate(phase);

    const receiptLines = [
      `### 🛡️ [PLANE MUTATION GATE] Proposed Transition: ${phase}`,
      `- **Work Item ID**: \`${payload.workItemId}\``,
      `- **Project**: \`${payload.projectId}\``,
      `- **Target State**: \`${payload.targetStateId}\``,
      `- **Requires Human Approval**: \`${needsApproval}\``,
      `- **Idempotency Key**: \`${payload.idempotencyKey}\``,
    ];

    if (payload.provenance) {
      if (payload.provenance.delegationId) receiptLines.push(`- **Delegation ID**: \`${payload.provenance.delegationId}\``);
      if (payload.provenance.masterSessionId) receiptLines.push(`- **Master Session**: \`${payload.provenance.masterSessionId}\``);
      if (payload.provenance.triggerMessageId) receiptLines.push(`- **Trigger Message**: \`${payload.provenance.triggerMessageId}\``);
      if (payload.provenance.workerSessionId) receiptLines.push(`- **Worker Session**: \`${payload.provenance.workerSessionId}\``);
    }

    receiptLines.push(
      `\n**Rendered Lifecycle Comment Preview**:`,
      `> ${payload.commentHtml.replace(/\n/g, "\n> ")}`,
      needsApproval
        ? `\n*Notice: Automated network mutations are blocked by policy. Human operator must approve transmission.*`
        : `\n*Notice: Automated intermediate transition. Dispatched automatically by Master.*`
    );

    const formattedReceiptMarkdown = receiptLines.join("\n");

    if (!needsApproval) {
      return {
        status: "approved_for_dispatch",
        payload: {
          ...payload,
          isHumanApproved: true,
        },
        formattedReceiptMarkdown,
        requiresHumanApproval: false,
        provenance: payload.provenance,
      };
    }

    return {
      status: "pending_human_approval",
      payload: {
        ...payload,
        isHumanApproved: false,
      },
      formattedReceiptMarkdown,
      requiresHumanApproval: true,
      provenance: payload.provenance,
    };
  }

  public authorizeTransition(
    receipt: PlaneTransitionReceipt,
    humanApproved: boolean
  ): PlaneTransitionReceipt {
    if (!receipt.requiresHumanApproval) {
      return {
        ...receipt,
        status: "approved_for_dispatch",
        payload: {
          ...receipt.payload,
          isHumanApproved: true,
        },
      };
    }

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

export interface PlaneExecutionReceipt {
  status: "success" | "rejected" | "error";
  executed: boolean;
  phase: PlaneLifecyclePhase;
  requiresHumanApproval?: boolean;
  error?: string;
  receipt?: PlaneTransitionReceipt;
}

