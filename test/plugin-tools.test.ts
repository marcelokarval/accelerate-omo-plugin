import fsPromises from "node:fs/promises";
import fsSync from "node:fs";
import childProcess from "node:child_process";
import { describe, it, expect, vi } from "vitest";
import { AccelerateOmoPlugin } from "../src/index.js";

describe("Plugin Registered Tools (acc_dispatch_worker & acc_approve_plane_sync)", () => {
  it("should register tools in the plugin hooks object", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);

    expect(hooks.tool).toBeDefined();
    expect(hooks.tool?.acc_dispatch_worker).toBeDefined();
    expect(hooks.tool?.acc_approve_plane_sync).toBeDefined();
    expect(hooks.tool?.acc_fanin_worker).toBeDefined();
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

  it("resolves relative specPath in acc_dispatch_worker", async () => {
    const fs = await import("node:fs");
    const tempSpec = "test-spec-relative.md";
    fs.writeFileSync(tempSpec, "# Test Spec");

    try {
      const mockClient = {
        createSession: vi.fn().mockResolvedValue({ id: "ses_mock_dispatch" }),
        prompt: vi.fn().mockResolvedValue({ ok: true }),
        sendPrompt: vi.fn().mockResolvedValue({ ok: true }),
        getSession: vi.fn().mockResolvedValue({ id: "ses_mock_dispatch", title: "Test" }),
        updateSession: vi.fn().mockResolvedValue({ id: "ses_mock_dispatch" }),
      };
      const hooks = await AccelerateOmoPlugin({} as any, {
        openCodeClient: mockClient as any,
      });
      const dispatchTool = hooks?.tool?.acc_dispatch_worker;
      expect(dispatchTool).toBeDefined();

      const result = await dispatchTool.execute({
        taskSlug: "test-slug",
        targetDir: "/tmp/test-target-dir-" + Date.now(),
        specPath: tempSpec,
        prompt: "Do work",
      }, { sessionID: "master-session-1", messageID: "msg-1" });

      expect(result).toBeDefined();
      const parsed = JSON.parse(result);
            expect(parsed.status).toBe("success");
      expect(parsed.provenance?.delegationId).toBeDefined();
    } finally {
      if (fs.existsSync(tempSpec)) fs.unlinkSync(tempSpec);
    }
  });

  it("resolves session persona dynamically in tool.execute.before and chat.message hooks", async () => {
    const hooks = await AccelerateOmoPlugin({} as any);
    const beforeHook = hooks["tool.execute.before"];
    const chatHook = hooks["chat.message"];

    expect(beforeHook).toBeDefined();
    expect(chatHook).toBeDefined();

    // In chat.message, user text remains 100% clean and pristine
    const output = { parts: [{ type: "text", text: "[MASTER] Plan project" }] };
    await chatHook({ sessionID: "ses-chat-master" }, output);
    expect(output.parts[0].text).toBe("[MASTER] Plan project");
    expect(output.parts[0].text).not.toContain("<PERSONA_GOVERNANCE>");

    // In experimental.chat.system.transform, governance is cleanly injected into system prompt
    const systemHook = hooks["experimental.chat.system.transform"];
    expect(systemHook).toBeDefined();
    const systemOutput = { system: [] as string[] };
    await systemHook({ sessionID: "ses-chat-master" }, systemOutput);
    expect(systemOutput.system.length).toBeGreaterThanOrEqual(1);
    expect(systemOutput.system[0]).toContain("<PERSONA_GOVERNANCE>");
    expect(systemOutput.system[0]).toContain("ACCELERATE MASTER ORCHESTRATOR LAW");

    // In tool.execute.before, master is blocked from edit
    await expect(
      beforeHook({ sessionID: "ses-chat-master", tool: "edit" }, {})
    ).rejects.toThrow("[ACCELERATE PERMISSION DENIED]");
  });

  describe("tool.execute.before SDK contract & argument forwarding (P3-A)", () => {
    it("forwards output.args strictly to policy and enforces boundary decisions", async () => {
      const { PersonaManager } = await import("../src/persona-manager.js");
      const pm = new PersonaManager();
      pm.registerSessionPersona("ses-master-p3a", "master");
      pm.registerSessionPersona("ses-worker-p3a", "worker");

      let receivedArgs: any = undefined;
      let receivedTool: string = "";
      let receivedSession: string = "";

      const origIsToolAllowed = pm.isToolAllowed.bind(pm);
      pm.isToolAllowed = (sessionId: string, toolName: string, args?: Record<string, any>) => {
        receivedSession = sessionId;
        receivedTool = toolName;
        receivedArgs = args;
        return origIsToolAllowed(sessionId, toolName, args);
      };

      const hooks = await AccelerateOmoPlugin({} as any, {
        personaManager: pm,
      });
      const beforeHook = hooks["tool.execute.before"];
      expect(beforeHook).toBeDefined();

      // 1 & 4. Correct forwarding & argument preservation from output.args
      const docArgs = { filePath: "docs/plans/2026-09-20-prd.md", content: "# PRD" };
      const outputDoc = { args: docArgs };
      const inputDoc = {
        tool: "write",
        sessionID: "ses-master-p3a",
        callID: "call-doc-1",
      };

      await expect(beforeHook!(inputDoc as any, outputDoc as any)).resolves.not.toThrow();

      expect(receivedSession).toBe("ses-master-p3a");
      expect(receivedTool).toBe("write");
      expect(receivedArgs).toBe(docArgs);
      expect(receivedArgs.filePath).toBe("docs/plans/2026-09-20-prd.md");
      expect(receivedArgs.content).toBe("# PRD");

      // 2 & 6. Permitted decision: Master writing to allowed documentation path does not block
      const archArgs = { path: "docs/architecture/adr/adr-001.md" };
      await expect(
        beforeHook!({ tool: "edit", sessionID: "ses-master-p3a", callID: "call-arch-1" } as any, { args: archArgs } as any)
      ).resolves.not.toThrow();

      // 3 & 6. Denied decision: Master writing to production code path is blocked
      const prodArgs = { filePath: "src/index.ts", content: "// hacked" };
      await expect(
        beforeHook!({ tool: "write", sessionID: "ses-master-p3a", callID: "call-prod-1" } as any, { args: prodArgs } as any)
      ).rejects.toThrow("[ACCELERATE PERMISSION DENIED]");

      // 5. Argument source: accidental args on input must NOT override or substitute output.args
      const inputWithDistraction = {
        tool: "write",
        sessionID: "ses-master-p3a",
        callID: "call-distract-1",
        args: { filePath: "src/production.ts" }, // decoy on input
      };
      // Real SDK contract passes arguments on output:
      const outputLegit = {
        args: { filePath: "docs/tasks/tasks.md" },
      };
      await expect(beforeHook!(inputWithDistraction as any, outputLegit as any)).resolves.not.toThrow();
      expect(receivedArgs.filePath).toBe("docs/tasks/tasks.md");

      // When output.args points to production code, it must be denied even if input has no args
      await expect(
        beforeHook!(
          { tool: "write", sessionID: "ses-master-p3a", callID: "call-prod-2" } as any,
          { args: { filePath: "src/services.ts" } } as any
        )
      ).rejects.toThrow("[ACCELERATE PERMISSION DENIED]");

      // Worker persona is allowed to edit code per policy
      await expect(
        beforeHook!(
          { tool: "write", sessionID: "ses-worker-p3a", callID: "call-worker-1" } as any,
          { args: { filePath: "src/index.ts" } } as any
        )
      ).resolves.not.toThrow();
    });
  });

  describe("session_rename & acc_set_session_title persona preservation (P3-B1)", () => {
    const renamingTools = ["session_rename", "acc_set_session_title"] as const;

    for (const toolName of renamingTools) {
      describe(`Tool: ${toolName}`, () => {
        it("1. Worker registered renamed with title containing [MASTER] remains Worker", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          pm.registerSessionPersona("ses-worker-registered", "worker");

          const mockClient = {
            updateSession: vi.fn().mockResolvedValue({ id: "ses-worker-registered", title: "[MASTER] Sneaky Worker" }),
            getSession: vi.fn().mockResolvedValue({ id: "ses-worker-registered", title: "[MASTER] Sneaky Worker" }),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];
          expect(renameTool).toBeDefined();

          const resStr = await renameTool?.execute({
            sessionId: "ses-worker-registered",
            title: "[MASTER] Sneaky Worker",
          }, { sessionID: "ses-caller" } as any);

          const res = JSON.parse(resStr);
          expect(res.status).toBe("success");
          expect(res.sessionId).toBe("ses-worker-registered");
          expect(res.title).toBe("[MASTER] Sneaky Worker");
          expect(res.persona).toBe("worker"); // MUST NOT be reclassified to master

          // Invariant: PersonaManager registration remains Worker
          expect(pm.getSessionPersona("ses-worker-registered")).toBe("worker");
          expect(mockClient.updateSession).toHaveBeenCalledWith("ses-worker-registered", { title: "[MASTER] Sneaky Worker" });
        });

        it("2. Master registered renamed with plain title remains Master", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          pm.registerSessionPersona("ses-master-registered", "master");

          const mockClient = {
            updateSession: vi.fn().mockResolvedValue({ id: "ses-master-registered", title: "Plain Discussion Topic" }),
            getSession: vi.fn().mockResolvedValue({ id: "ses-master-registered", title: "Plain Discussion Topic" }),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];
          const resStr = await renameTool?.execute({
            sessionId: "ses-master-registered",
            title: "Plain Discussion Topic",
          }, { sessionID: "ses-caller" } as any);

          const res = JSON.parse(resStr);
          expect(res.status).toBe("success");
          expect(res.persona).toBe("master"); // MUST NOT drop master to standard
          expect(pm.getSessionPersona("ses-master-registered")).toBe("master");
        });

        it("3. Master registered renamed with title containing [W-TEST] remains Master", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          pm.registerSessionPersona("ses-master-registered-2", "master");

          const mockClient = {
            updateSession: vi.fn().mockResolvedValue({ id: "ses-master-registered-2", title: "⚡ [W-TEST] Not Really A Worker" }),
            getSession: vi.fn().mockResolvedValue({ id: "ses-master-registered-2", title: "⚡ [W-TEST] Not Really A Worker" }),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];
          const resStr = await renameTool?.execute({
            sessionId: "ses-master-registered-2",
            title: "⚡ [W-TEST] Not Really A Worker",
          }, { sessionID: "ses-caller" } as any);

          const res = JSON.parse(resStr);
          expect(res.status).toBe("success");
          expect(res.persona).toBe("master"); // MUST NOT be demoted to worker
          expect(pm.getSessionPersona("ses-master-registered-2")).toBe("master");
        });

        it("4. Unregistered session does not receive direct assignment from rename handler", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          // ses-unregistered has NO registration in pm

          const mockClient = {
            updateSession: vi.fn().mockResolvedValue({ id: "ses-unregistered", title: "[MASTER] Attempted Self-Promotion" }),
            getSession: vi.fn().mockResolvedValue({ id: "ses-unregistered", title: "[MASTER] Attempted Self-Promotion" }),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];
          const resStr = await renameTool?.execute({
            sessionId: "ses-unregistered",
            title: "[MASTER] Attempted Self-Promotion",
          }, { sessionID: "ses-caller" } as any);

          const res = JSON.parse(resStr);
          expect(res.status).toBe("success");
          expect(res.persona).toBe("standard"); // Handler must NOT register it as master!
          expect(pm.getSessionPersona("ses-unregistered")).toBe("standard");
        });

        it("5. updateSession failure does not alter persona and propagates error without returning success", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          pm.registerSessionPersona("ses-fail-test", "master");

          const mockClient = {
            updateSession: vi.fn().mockRejectedValue(new Error("Network update failed")),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];
          await expect(
            renameTool?.execute({
              sessionId: "ses-fail-test",
              title: "Any Title",
            }, { sessionID: "ses-caller" } as any)
          ).rejects.toThrow("Network update failed");

          // Persona must remain untouched
          expect(pm.getSessionPersona("ses-fail-test")).toBe("master");
        });

        it("6. Omitted sessionId resolves context.sessionID; explicit sessionId maintains selection", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          pm.registerSessionPersona("ses-context", "master");
          pm.registerSessionPersona("ses-explicit", "worker");

          const mockClient = {
            updateSession: vi.fn().mockResolvedValue({ id: "ok" }),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];

          // Omitted sessionId
          const resCtxStr = await renameTool?.execute({
            title: "Title From Context",
          }, { sessionID: "ses-context" } as any);
          const resCtx = JSON.parse(resCtxStr);
          expect(resCtx.sessionId).toBe("ses-context");
          expect(mockClient.updateSession).toHaveBeenCalledWith("ses-context", { title: "Title From Context" });

          // Explicit sessionId
          const resExpStr = await renameTool?.execute({
            sessionId: "ses-explicit",
            title: "Title Explicit",
          }, { sessionID: "ses-context" } as any);
          const resExp = JSON.parse(resExpStr);
          expect(resExp.sessionId).toBe("ses-explicit");
          expect(mockClient.updateSession).toHaveBeenCalledWith("ses-explicit", { title: "Title Explicit" });

          // Missing both
          await expect(
            renameTool?.execute({ title: "No Session Anywhere" }, {} as any)
          ).rejects.toThrow(/Missing sessionId/);
        });

        it("7. Repeated calls on same instance preserve registered personas without cumulative reclassification", async () => {
          const { PersonaManager } = await import("../src/persona-manager.js");
          const pm = new PersonaManager();
          pm.registerSessionPersona("ses-stable", "worker");

          const mockClient = {
            updateSession: vi.fn().mockResolvedValue({ id: "ses-stable" }),
          };

          const hooks = await AccelerateOmoPlugin({} as any, {
            personaManager: pm,
            openCodeClient: mockClient as any,
          });

          const renameTool = hooks.tool?.[toolName];
          const titles = ["[MASTER] 1", "⚡ [W-test] 2", "Plain 3", "[MASTER] 4"];

          for (const title of titles) {
            const resStr = await renameTool?.execute({
              sessionId: "ses-stable",
              title,
            }, { sessionID: "ses-caller" } as any);
            const res = JSON.parse(resStr);
            expect(res.persona).toBe("worker"); // MUST stay worker across all iterations
            expect(pm.getSessionPersona("ses-stable")).toBe("worker");
          }
        });
      });
    }
  });

  describe("acc_get_session_info", () => {
        it("acc_get_session_info returns session details and resolved persona", async () => {
      const { PersonaManager } = await import("../src/persona-manager.js");
      const pm = new PersonaManager();
      pm.registerSessionPersona("ses-info-1", "master");

      const mockClient = {
        getSession: vi.fn().mockResolvedValue({ id: "ses-info-1", title: "Architecture" }),
        updateSession: vi.fn().mockResolvedValue({ id: "ses-info-1" }),
      };

      const hooks = await AccelerateOmoPlugin({} as any, {
        personaManager: pm,
        openCodeClient: mockClient as any,
      });
      const getInfoTool = hooks.tool?.acc_get_session_info;
      expect(getInfoTool).toBeDefined();

      const infoStr = await getInfoTool?.execute(
        { sessionId: "ses-info-1" },
        { sessionID: "ses-caller" } as any
      );
      const info = JSON.parse(infoStr);
      expect(info.status).toBe("success");
      expect(info.sessionId).toBe("ses-info-1");
      expect(info.persona).toBe("master");

      const infoStr2 = await getInfoTool?.execute(
        {},
        { sessionID: "ses-info-1" } as any
      );
      const info2 = JSON.parse(infoStr2);
      expect(info2.status).toBe("success");
      expect(info2.sessionId).toBe("ses-info-1");
      expect(info2.persona).toBe("master");

      await expect(
        getInfoTool?.execute({}, {} as any)
      ).rejects.toThrow();
    });
  });

  describe("acc_fanin_worker (P2-A-R1 containment & isolation)", () => {
    const validReport = {
      delegationId: "del_valid123",
      taskSlug: "fanin-task",
      status: "success" as const,
      touchedFiles: ["src/feature.ts"],
      testResults: {
        command: "npm test",
        passed: 5,
        failed: 0,
        exitCode: 0,
      },
      buildStatus: "clean" as const,
      diffSummary: "1 file changed, 10 insertions(+)",
      invariantsSatisfied: ["TDD Iron Law"],
    };

    const runContainmentCheck = async (
      args: { targetDir: string; testCommand?: string; targetBranch?: string; report?: any },
      messageId: string
    ) => {
      // 1. Double/Spy on Worktree Service: must fail immediately if invoked
      const mockWorktreeService = {
        runVerification: vi.fn().mockImplementation(() => { throw new Error("UNEXPECTED: runVerification was called!"); }),
        list: vi.fn().mockImplementation(() => { throw new Error("UNEXPECTED: list was called!"); }),
        mergeBranch: vi.fn().mockImplementation(() => { throw new Error("UNEXPECTED: mergeBranch was called!"); }),
        remove: vi.fn().mockImplementation(() => { throw new Error("UNEXPECTED: remove was called!"); }),
        quarantine: vi.fn().mockImplementation(() => { throw new Error("UNEXPECTED: quarantine was called!"); }),
      };

      // 2. Instrument operational filesystem access, process spawning, and network transport
      const accessSpy = vi.spyOn(fsPromises, "access").mockImplementation(async () => {
        throw new Error("UNEXPECTED: fsPromises.access was called!");
      });
      const statSpy = vi.spyOn(fsPromises, "stat").mockImplementation(async () => {
        throw new Error("UNEXPECTED: fsPromises.stat was called!");
      });
      const existsSpy = vi.spyOn(fsSync, "existsSync").mockImplementation(() => {
        throw new Error("UNEXPECTED: fsSync.existsSync was called!");
      });
      const execSpy = vi.spyOn(childProcess, "exec").mockImplementation((() => {
        throw new Error("UNEXPECTED: childProcess.exec was called!");
      }) as any);
      const execSyncSpy = vi.spyOn(childProcess, "execSync").mockImplementation((() => {
        throw new Error("UNEXPECTED: childProcess.execSync was called!");
      }) as any);
      const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
        throw new Error("UNEXPECTED: globalThis.fetch was called!");
      });

      try {
        const hooks = await AccelerateOmoPlugin({} as any, {
          worktreeService: mockWorktreeService as any,
        });
        const faninTool = hooks.tool?.acc_fanin_worker;
        expect(faninTool).toBeDefined();

        const resStr = await faninTool?.execute(args, {
          sessionID: "ses_master_p2a_r1",
          messageID: messageId,
        } as any);

        const res = JSON.parse(resStr);

        // Verification of containment contract
        expect(res.status).toBe("blocked");
        expect(res.reason).toBe("fanin_not_qualified");
        expect(res.executed).toBe(false);
        expect(res.message).toContain("Automatic integration is temporarily unavailable");

        // Zero service calls
        expect(mockWorktreeService.runVerification).not.toHaveBeenCalled();
        expect(mockWorktreeService.list).not.toHaveBeenCalled();
        expect(mockWorktreeService.mergeBranch).not.toHaveBeenCalled();
        expect(mockWorktreeService.remove).not.toHaveBeenCalled();
        expect(mockWorktreeService.quarantine).not.toHaveBeenCalled();

        // Zero operational filesystem queries on targetDir
        expect(accessSpy).not.toHaveBeenCalled();
        expect(statSpy).not.toHaveBeenCalled();
        expect(existsSpy).not.toHaveBeenCalled();

        // Zero process execution attempts
        expect(execSpy).not.toHaveBeenCalled();
        expect(execSyncSpy).not.toHaveBeenCalled();

        // Zero network transport calls
        expect(fetchSpy).not.toHaveBeenCalled();

        return res;
      } finally {
        accessSpy.mockRestore();
        statSpy.mockRestore();
        existsSpy.mockRestore();
        execSpy.mockRestore();
        execSyncSpy.mockRestore();
        fetchSpy.mockRestore();
      }
    };

    it("1. Scenario without report: returns blocked with zero side-effects and zero operational queries", async () => {
      await runContainmentCheck({
        targetDir: "/unqualified/candidate/worktree",
      }, "msg_p2a_1");
    });

    it("2. Scenario with structurally valid report: returns blocked with zero side-effects", async () => {
      await runContainmentCheck({
        targetDir: "/unqualified/candidate/worktree",
        report: validReport,
      }, "msg_p2a_2");
    });

    it("3. Scenario with explicit testCommand: returns blocked with zero side-effects and no command execution", async () => {
      await runContainmentCheck({
        targetDir: "/unqualified/candidate/worktree",
        testCommand: "pytest tests/suite -v",
        targetBranch: "main",
      }, "msg_p2a_3");
    });

    it("4. Repeated calls: consistently returns blocked without mutation, leak or side-effects", async () => {
      for (let i = 0; i < 3; i++) {
        await runContainmentCheck({
          targetDir: "/unqualified/candidate/worktree",
        }, "msg_p2a_repeat_" + i);
      }
    });
  });

      describe("Wave 3: acc_dispatch_wave, acc_poll_workers, and acc_execute_plane_sync", () => {
    describe("acc_dispatch_wave", () => {
      it("should register acc_dispatch_wave tool", async () => {
        const hooks = await AccelerateOmoPlugin({} as any);
        expect(hooks.tool?.acc_dispatch_wave).toBeDefined();
      });

      it("should validate tasks array and dispatch tasks in parallel across worktrees and sessions", async () => {
        const mockStateMachine = {
          getPhase: vi.fn().mockReturnValue("SPEC_READY"),
          transitionTo: vi.fn(),
          dispatchWorker: vi.fn().mockImplementation(async (config: any) => {
            return {
              status: "success",
              worktreePath: config.targetDir,
              branchName: `accelerate/${config.taskSlug}`,
              sessionId: `ses_${config.taskSlug}`,
              provenance: {
                delegationId: `del_${config.taskSlug}`,
                masterSessionId: config.masterSessionId,
                triggerMessageId: config.triggerMessageId,
                timestamp: new Date().toISOString(),
              },
            };
          }),
        };

        const hooks = await AccelerateOmoPlugin({} as any, {
          stateMachine: mockStateMachine as any,
        });
        const dispatchWaveTool = hooks.tool?.acc_dispatch_wave;

        const resStr = await dispatchWaveTool?.execute(
          {
            waveSlug: "wave-1-core",
            tasks: [
              {
                taskSlug: "task-1",
                targetDir: "/tmp/wt-task-1",
                specPath: "docs/spec1.md",
                prompt: "Implement task 1",
              },
              {
                taskSlug: "task-2",
                targetDir: "/tmp/wt-task-2",
                specPath: "docs/spec2.md",
                prompt: "Implement task 2",
                baseRef: "HEAD",
              },
            ],
          },
          { sessionID: "ses_master_wave", messageID: "msg_wave" } as any
        );

        const result = JSON.parse(resStr);
        expect(result.status).toBe("success");
        expect(result.waveSlug).toBe("wave-1-core");
        expect(result.waveId).toMatch(/^wave_\d+_/);
        expect(result.dispatchedCount).toBe(2);
        expect(result.workers).toHaveLength(2);
        expect(result.workers[0].taskSlug).toBe("task-1");
        expect(result.workers[0].sessionId).toBe("ses_task-1");
        expect(result.workers[0].worktreePath).toBe("/tmp/wt-task-1");
        expect(result.workers[1].taskSlug).toBe("task-2");
        expect(result.workers[1].sessionId).toBe("ses_task-2");

        expect(mockStateMachine.dispatchWorker).toHaveBeenCalledTimes(2);
      });

      it("should reject acc_dispatch_wave if called from worker session (anti-recursion)", async () => {
        const mockPersonaManager = {
          getSessionPersona: vi.fn().mockReturnValue("worker"),
          resolveSessionPersona: vi.fn().mockResolvedValue("worker"),
        };
        const hooks = await AccelerateOmoPlugin({} as any, {
          personaManager: mockPersonaManager as any,
        });
        const dispatchWaveTool = hooks.tool?.acc_dispatch_wave;

        await expect(
          dispatchWaveTool?.execute(
            {
              waveSlug: "wave-recursion",
              tasks: [
                {
                  taskSlug: "task-rec",
                  targetDir: "/tmp/wt-rec",
                  specPath: "docs/spec.md",
                  prompt: "Do work",
                },
              ],
            },
            { sessionID: "ses_worker_child" } as any
          )
        ).rejects.toThrow("[ACCELERATE RECURSION DENIED]");
      });
    });

    describe("acc_poll_workers", () => {
      it("should register acc_poll_workers tool", async () => {
        const hooks = await AccelerateOmoPlugin({} as any);
        expect(hooks.tool?.acc_poll_workers).toBeDefined();
      });

      it("should query openCodeClient.getSession for each session ID and return worker status summaries", async () => {
        const mockOpenCodeClient = {
          getSession: vi.fn().mockImplementation(async (sessionId: string) => {
            if (sessionId === "ses_active_1") {
              return {
                id: "ses_active_1",
                title: "⚡ [W-task1] Working",
                status: "busy",
                messages: [{ id: "m1" }, { id: "m2" }],
              };
            }
            if (sessionId === "ses_done_2") {
              return {
                id: "ses_done_2",
                title: "⚡ [W-task2] Finished",
                status: "idle",
                messages: [{ id: "m1" }, { id: "m2" }, { id: "m3" }],
              };
            }
            return null;
          }),
        };

        const hooks = await AccelerateOmoPlugin({} as any, {
          openCodeClient: mockOpenCodeClient as any,
        });
        const pollTool = hooks.tool?.acc_poll_workers;

        const resStr = await pollTool?.execute({
          sessionIds: ["ses_active_1", "ses_done_2", "ses_non_existent"],
        }, {} as any);

        const result = JSON.parse(resStr);
        expect(result.status).toBe("success");
        expect(result.pollResults).toHaveLength(3);

        expect(result.pollResults[0]).toEqual({
          sessionId: "ses_active_1",
          status: "busy",
          title: "⚡ [W-task1] Working",
          messageCount: 2,
          exists: true,
        });

        expect(result.pollResults[1]).toEqual({
          sessionId: "ses_done_2",
          status: "idle",
          title: "⚡ [W-task2] Finished",
          messageCount: 3,
          exists: true,
        });

        expect(result.pollResults[2]).toEqual({
          sessionId: "ses_non_existent",
          status: "unknown",
          title: undefined,
          messageCount: 0,
          exists: false,
        });
      });
    });

    describe("acc_execute_plane_sync", () => {
      it("should register acc_execute_plane_sync tool", async () => {
        const hooks = await AccelerateOmoPlugin({} as any);
        expect(hooks.tool?.acc_execute_plane_sync).toBeDefined();
      });

      it("should reject START or FINISH if not humanApproved", async () => {
        const hooks = await AccelerateOmoPlugin({} as any);
        const planeTool = hooks.tool?.acc_execute_plane_sync;

        const baseArgs = {
          workspaceSlug: "karval",
          projectId: "proj-1",
          workItemId: "issue-1",
          targetStateId: "state-in-progress",
          expectedCurrentStateId: "state-ready",
          expectedUpdatedAt: "2026-09-18T20:00:00Z",
          idempotencyKey: "test-key-sync-1",
          commentHtml: "<p>Starting wave execution</p>",
          humanApproved: false,
        };

        const startResStr = await planeTool?.execute({ ...baseArgs, phase: "START" }, {} as any);
        const startResult = JSON.parse(startResStr);
        expect(startResult.status).toBe("rejected");
        expect(startResult.requiresHumanApproval).toBe(true);
        expect(startResult.error).toContain("Human operator rejected");

        const finishResStr = await planeTool?.execute({ ...baseArgs, phase: "FINISH" }, {} as any);
        const finishResult = JSON.parse(finishResStr);
        expect(finishResult.status).toBe("rejected");
        expect(finishResult.requiresHumanApproval).toBe(true);
      });

      it("does NOT claim executed: true or remote success when transport is unavailable across all phases (P1-R1 contract)", async () => {
        const fetchSpy = vi.spyOn(globalThis, "fetch");

        try {
          const hooks = await AccelerateOmoPlugin({} as any);
          const planeTool = hooks.tool?.acc_execute_plane_sync;
          expect(planeTool).toBeDefined();

          const baseArgs = {
            workspaceSlug: "karval",
            projectId: "proj-1",
            workItemId: "issue-1",
            targetStateId: "state-done",
            expectedCurrentStateId: "state-review",
            expectedUpdatedAt: "2026-09-18T20:00:00Z",
            idempotencyKey: "test-key-sync-truth",
            commentHtml: "<p>Status update mentioning dispatched automatically in user prose</p>",
            delegationId: "del_truth_test",
            workerSessionId: "ses_truth_worker",
          };

          const phases = ["START", "PROGRESS", "BLOCKED", "REVIEW", "FINISH"] as const;

          for (const phase of phases) {
            // Case A: humanApproved = true
            const approvedResStr = await planeTool?.execute(
              { ...baseArgs, phase, humanApproved: true },
              { sessionID: "ses_master", messageID: "msg_truth" } as any
            );
            const approvedRes = JSON.parse(approvedResStr);

            // Invariant (a) & (c): Without remote transport, executed MUST be false and status MUST be not_executed with transport_unavailable
            expect(approvedRes.executed).toBe(false);
            expect(approvedRes.status).toBe("not_executed");
            expect(approvedRes.reason).toBe("transport_unavailable");
            expect(approvedRes.receipt).toBeDefined();
            expect(approvedRes.phase).toBe(phase);

            // Invariant (d): The receipt generated by the service must NOT claim dispatch or remote transmission
            expect(approvedRes.receipt.formattedReceiptMarkdown).not.toContain("Dispatched automatically by Master");
            expect(approvedRes.receipt.formattedReceiptMarkdown).not.toMatch(/\*Notice:[^\n]*\b(dispatched automatically|remote transmission confirmed)\b/i);

            // Invariant (e): Identity, provenance and user comment are strictly preserved
            expect(approvedRes.receipt.payload.commentHtml).toBe(baseArgs.commentHtml);
            expect(approvedRes.receipt.payload.workItemId).toBe("issue-1");
            expect(approvedRes.receipt.payload.projectId).toBe("proj-1");
            expect(approvedRes.receipt.payload.targetStateId).toBe("state-done");
            expect(approvedRes.receipt.payload.idempotencyKey).toBe("test-key-sync-truth");
            expect(approvedRes.receipt.provenance?.delegationId).toBe("del_truth_test");
            expect(approvedRes.receipt.provenance?.masterSessionId).toBe("ses_master");
            expect(approvedRes.receipt.provenance?.triggerMessageId).toBe("msg_truth");
            expect(approvedRes.receipt.provenance?.workerSessionId).toBe("ses_truth_worker");

            // Case B: humanApproved = false
            const unapprovedResStr = await planeTool?.execute(
              { ...baseArgs, phase, humanApproved: false },
              { sessionID: "ses_master", messageID: "msg_truth_unapp" } as any
            );
            const unapprovedRes = JSON.parse(unapprovedResStr);

            // Invariant (a): executed MUST remain false regardless of humanApproved
            expect(unapprovedRes.executed).toBe(false);

            // Invariant (b) & (c): START/FINISH without approval remain rejected with reason human_approval_required
            if (phase === "START" || phase === "FINISH") {
              expect(unapprovedRes.status).toBe("rejected");
              expect(unapprovedRes.reason).toBe("human_approval_required");
              expect(unapprovedRes.requiresHumanApproval).toBe(true);
            } else {
              expect(unapprovedRes.status).toBe("not_executed");
              expect(unapprovedRes.reason).toBe("transport_unavailable");
            }
          }

          // Invariant (f): Zero network transport calls occurred during tool execution
          expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
          fetchSpy.mockRestore();
        }
      });
    });
    describe("context.serverUrl dynamic binding", () => {
      it("binds openCodeClient to context.serverUrl when provided", async () => {
        const customUrl = new URL("http://127.0.0.1:45607");
        const hooks = await AccelerateOmoPlugin({
          serverUrl: customUrl,
        } as any);

        expect(hooks).toBeDefined();
        expect(hooks.tool?.session_rename).toBeDefined();
      });
    });

    describe("chat.message semantic auto-branding", () => {
      it("auto-rebrands generic session to [MASTER] when semantic trigger is present in initial prompt", async () => {
        let updatedTitle = "";
        const mockOpenCodeClient = {
          getSession: vi.fn().mockResolvedValue({
            id: "ses_generic_test",
            title: "New session - 2026-09-20T17:43:01.463Z",
          }),
          updateSession: vi.fn().mockImplementation(async (id, body) => {
            updatedTitle = body.title;
            return { id, title: body.title };
          }),
        };

        const hooks = await AccelerateOmoPlugin({} as any, {
          openCodeClient: mockOpenCodeClient as any,
        });

        const chatHook = hooks["chat.message"];
        expect(chatHook).toBeDefined();

        const messageOutput = {
          parts: [{
            type: "text",
            text: "Você é o master desta sessão de continuidade. Leia o relatório e planeje a limpeza da raiz."
          }]
        };

        await chatHook?.({ sessionID: "ses_generic_test" }, messageOutput as any);

        // User message remains 100% clean and pristine
        expect(messageOutput.parts[0].text).toBe("Você é o master desta sessão de continuidade. Leia o relatório e planeje a limpeza da raiz.");
        expect(messageOutput.parts[0].text).not.toContain("<PERSONA_GOVERNANCE>");

        // System prompt hook delivers the governance law with immutable static prefix
        const systemHook = hooks["experimental.chat.system.transform"];
        const systemOutput = { system: [] as string[] };
        await systemHook?.({ sessionID: "ses_generic_test" }, systemOutput);
        expect(systemOutput.system[0]).toContain("<PERSONA_GOVERNANCE>");
        expect(systemOutput.system[0]).toContain("ACCELERATE MASTER ORCHESTRATOR LAW");
        expect(systemOutput.system[1]).toContain("[ACCELERATE RUNTIME CONTEXT]");

        expect(mockOpenCodeClient.updateSession).toHaveBeenCalled();
        expect(updatedTitle).toMatch(/^\[MASTER\] /);
        expect(updatedTitle).not.toContain("Você é o master");

        // Verify tool fencing is now active for this session
        const beforeHook = hooks["tool.execute.before"];
        await expect(
          beforeHook?.({ sessionID: "ses_generic_test", tool: "edit", args: { filePath: "src/index.ts" } }, {})
        ).rejects.toThrow("[ACCELERATE PERMISSION DENIED]");
      });
    });
    describe("acc_status runtime introspection and pre-condition gating (v3.0)", () => {
      it("acc_status returns running version, physical phase, evidence, and host info", async () => {
        const hooks = await AccelerateOmoPlugin({
          serverUrl: new URL("http://127.0.0.1:35113"),
        } as any);

        const statusTool = hooks.tool?.acc_status;
        expect(statusTool).toBeDefined();

        const resStr = await statusTool?.execute({}, { sessionID: "ses-test" } as any);
        const res = JSON.parse(resStr);

        expect(res.status).toBe("success");
        expect(res.version).toBe("3.0.0");
        expect(res.phase).toBeDefined();
        expect(res.evidence).toBeDefined();
        expect(res.evidence.hasPrd).toBe(true);
        expect(res.host.serverUrl).toBe("http://127.0.0.1:35113");
        expect(res.host.pid).toBeDefined();
      });

      it("acc_dispatch_worker rejects execution if physical pipeline is in PRD_REQUIRED", async () => {
        const mockStateMachine = {
          getPhysicalPipelinePhase: vi.fn().mockReturnValue("PRD_REQUIRED"),
          getPhase: vi.fn().mockReturnValue("SPEC_READY"),
          dispatchWorker: vi.fn(),
        };

        const hooks = await AccelerateOmoPlugin({} as any, {
          stateMachine: mockStateMachine as any,
        });

        const dispatchTool = hooks.tool?.acc_dispatch_worker;
        expect(dispatchTool).toBeDefined();

        await expect(
          dispatchTool?.execute({
            taskSlug: "test",
            targetDir: "/tmp/test",
            specPath: "test.md",
            prompt: "do work",
          }, { sessionID: "ses_master" } as any)
        ).rejects.toThrow(/Cannot dispatch workers in phase/);
      });
    });
    describe("experimental.chat.system.transform cache optimization and fail-closed isolation", () => {
      it("leaves output.system completely untouched when session persona is standard", async () => {
        const hooks = await AccelerateOmoPlugin({} as any);
        const systemHook = hooks["experimental.chat.system.transform"];
        const systemOutput = { system: ["Base system prompt"] };

        await systemHook?.({ sessionID: "ses-standard-user" }, systemOutput);
        expect(systemOutput.system).toEqual(["Base system prompt"]);
      });
    });

  });
});