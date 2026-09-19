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
  requiresHumanApproval: boolean;
  error?: string;
}

export class PlaneApprovalGateService {
  /**
   * Determina se uma fase exige aprovação humana explícita.
   * Regra Prática: Apenas START (início da tarefa) e FINISH (conclusão/done pós-review) exigem aprovação humana.
   * Fases intermediárias (PROGRESS, BLOCKED, REVIEW) fluem automaticamente pelo Master sem parar o fluxo.
   */
  public requiresHumanGate(phase: PlaneLifecyclePhase): boolean {
    return phase === "START" || phase === "FINISH";
  }

  /**
   * Prepares a lifecycle transition payload.
   * Se for START ou FINISH, entra em pending_human_approval.
   * Se for fase intermediária (PROGRESS, BLOCKED, REVIEW), é auto-aprovada para despacho.
   */
  public prepareTransitionReceipt(
    phase: PlaneLifecyclePhase,
    payload: Omit<PlaneTransitionPayload, "isHumanApproved">
  ): PlaneTransitionReceipt {
    const needsApproval = this.requiresHumanGate(phase);

    const receiptMarkdown = [
      `### 🛡️ [PLANE MUTATION GATE] Proposed Transition: ${phase}`,
      `- **Work Item ID**: \`${payload.workItemId}\``,
      `- **Project**: \`${payload.projectId}\``,
      `- **Target State**: \`${payload.targetStateId}\``,
      `- **Requires Human Approval**: \`${needsApproval}\``,
      `- **Idempotency Key**: \`${payload.idempotencyKey}\``,
      `\n**Rendered Lifecycle Comment Preview**:`,
      `> ${payload.commentHtml.replace(/\n/g, "\n> ")}`,
      needsApproval
        ? `\n*Notice: Automated network mutations are blocked by policy. Human operator must approve transmission.*`
        : `\n*Notice: Automated intermediate transition. Dispatched automatically by Master.*`,
    ].join("\n");

    if (!needsApproval) {
      return {
        status: "approved_for_dispatch",
        payload: {
          ...payload,
          isHumanApproved: true,
        },
        formattedReceiptMarkdown: receiptMarkdown,
        requiresHumanApproval: false,
      };
    }

    return {
      status: "pending_human_approval",
      payload: {
        ...payload,
        isHumanApproved: false,
      },
      formattedReceiptMarkdown: receiptMarkdown,
      requiresHumanApproval: true,
    };
  }

  /**
   * Avalia a transição para despacho ao Plane.
   * Se a fase não exigir aprovação humana, libera direto.
   * Se exigir (START ou FINISH), valida o flag humanApproved.
   */
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
