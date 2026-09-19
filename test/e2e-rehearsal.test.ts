import { describe, it, expect, vi } from "vitest";
import { StateMachineService } from "../src/state-machine.js";
import { GitWorktreeService } from "../src/git-worktree.js";
import { OpenCodeClient } from "../src/opencode-client.js";
import { PersonaManager } from "../src/persona-manager.js";
import { PlaneApprovalGateService } from "../src/plane-adapter.js";
import { join } from "node:path";

describe("Task 8: End-to-End Orchestration Rehearsal (P4Y-74 Task 8 Simulation)", () => {
  it("should complete full workflow: Discussion -> Spec -> Worker Worktree Dispatch -> Plane Gate -> Fan-in", async () => {
    // 1. Setup services
    const personaManager = new PersonaManager({
      skillsDir: join(__dirname, "../skills"),
    });
    const worktreeService = new GitWorktreeService();
    const client = new OpenCodeClient({ baseUrl: "http://127.0.0.1:4096" });
    const planeGate = new PlaneApprovalGateService();
    const stateMachine = new StateMachineService(worktreeService, client);

    // Mocks do runtime para execução determinística
    vi.spyOn(worktreeService, "create").mockResolvedValue({
      path: "/tmp/rehearsal-worktree-p4y-w8",
      branch: "accelerate/p4y-74-w1-task-8",
      baseRef: "HEAD",
    });
    vi.spyOn(worktreeService, "remove").mockResolvedValue();
    vi.spyOn(client, "createSession").mockResolvedValue({
      id: "ses_worker_rehearsal_8",
      directory: "/tmp/rehearsal-worktree-p4y-w8",
    });
    vi.spyOn(client, "prompt").mockResolvedValue({ success: true });

    // 2. Fase de Discussion (Sessão Master)
    expect(stateMachine.getPhase()).toBe("DISCUSSION");
    expect(personaManager.detectPersonaFromTitle("[MASTER] P4Y-74 Master Session")).toBe("master");
    personaManager.registerSessionPersona("session-master-main", "master");

    // Master tenta usar ferramenta de edição de código -> DEVE SER BLOQUEADO
    expect(personaManager.isToolAllowed("session-master-main", "edit")).toBe(false);
    expect(personaManager.isToolAllowed("session-master-main", "write")).toBe(false);
    expect(personaManager.isToolAllowed("session-master-main", "read")).toBe(true); // leitura é permitida

    // 3. Fase de Especificação (Spec & Plan aprovados)
    stateMachine.transitionTo("SPEC_READY");
    expect(stateMachine.getPhase()).toBe("SPEC_READY");

    // 4. Disparo do Worker W-8 (Task 8: Stripe Adapter)
    const dispatchResult = await stateMachine.dispatchWorker({
      taskSlug: "p4y-w8-stripe-adapter",
      repoPath: "/home/marcelo-karval/Backup/Projetos/prop4you/prop4you-v2",
      baseRef: "HEAD",
      prompt: "Implement dj-stripe 2.11 adapter following strict TDD against PG18.",
    });

    expect(dispatchResult.status).toBe("success");
    expect(dispatchResult.sessionId).toBe("ses_worker_rehearsal_8");
    expect(dispatchResult.worktreePath).toBe("/tmp/rehearsal-worktree-p4y-w8");
    expect(stateMachine.getPhase()).toBe("EXECUTING");

    // 5. Worker atua no seu próprio ambiente
    personaManager.registerSessionPersona("ses_worker_rehearsal_8", "worker");
    // Worker DEVE ter permissão de edição
    expect(personaManager.isToolAllowed("ses_worker_rehearsal_8", "edit")).toBe(true);
    expect(personaManager.isToolAllowed("ses_worker_rehearsal_8", "write")).toBe(true);

    // 6. Conclusão do Worker e Gating no Plane
    stateMachine.transitionTo("FAN_IN");
    expect(stateMachine.getPhase()).toBe("FAN_IN");

    const receipt = planeGate.prepareTransitionReceipt("FINISH", {
      workspaceSlug: "karval",
      projectId: "ca3ecef1-d8e4-49f0-b7db-b728be4fbf2a",
      workItemId: "6c5506d0-c776-4916-9b27-93722d429222",
      targetStateId: "state-done",
      expectedCurrentStateId: "state-in-progress",
      expectedUpdatedAt: "2026-09-18T22:00:00Z",
      idempotencyKey: "p4y-74-w8-finish",
      commentHtml: "<p>Worker W-8 completed dj-stripe adapter with 100% tests passing.</p>",
    });

    expect(receipt.status).toBe("pending_human_approval");
    expect(receipt.payload.isHumanApproved).toBe(false);

    // Operador humano aprova a sincronização
    const approvedReceipt = planeGate.authorizeTransition(receipt, true);
    expect(approvedReceipt.status).toBe("approved_for_dispatch");
    expect(approvedReceipt.payload.isHumanApproved).toBe(true);

    // 7. Encerramento do ciclo
    stateMachine.transitionTo("COMPLETED");
    expect(stateMachine.getPhase()).toBe("COMPLETED");
  });
});
