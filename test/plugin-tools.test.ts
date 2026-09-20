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
      const hooks = await AccelerateOmoPlugin({} as any);
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

    // In chat.message, if firstPart.text has [MASTER], it injects governance
    const output = { parts: [{ type: "text", text: "[MASTER] Plan project" }] };
    await chatHook({ sessionID: "ses-chat-master" }, output);
    expect(output.parts[0].text).toContain("<PERSONA_GOVERNANCE>");

    // In tool.execute.before, master is blocked from edit
    await expect(
      beforeHook({ sessionID: "ses-chat-master", tool: "edit" }, {})
    ).rejects.toThrow("[ACCELERATE PERMISSION DENIED]");
  });

  describe("acc_set_session_title and acc_get_session_info", () => {
    it("session_rename and session_info operate as universal tools with auto-context resolution", async () => {
      const hooks = await AccelerateOmoPlugin({} as any);
      const renameTool = hooks.tool?.session_rename;
      const infoTool = hooks.tool?.session_info;

      expect(renameTool).toBeDefined();
      expect(infoTool).toBeDefined();

      const renameResStr = await renameTool?.execute(
        { title: "[MASTER] Universal Title" },
        { sessionID: "ses-univ-1" } as any
      );
      const renameRes = JSON.parse(renameResStr);
      expect(renameRes.status).toBe("success");
      expect(renameRes.sessionId).toBe("ses-univ-1");
      expect(renameRes.title).toBe("[MASTER] Universal Title");
      expect(renameRes.persona).toBe("master");

      const infoResStr = await infoTool?.execute(
        {},
        { sessionID: "ses-univ-1" } as any
      );
      const infoRes = JSON.parse(infoResStr);
      expect(infoRes.status).toBe("success");
      expect(infoRes.sessionId).toBe("ses-univ-1");
      expect(infoRes.persona).toBe("master");
    });

    it("acc_set_session_title updates session title and updates persona", async () => {
      const hooks = await AccelerateOmoPlugin({} as any);
      const setTitleTool = hooks.tool?.acc_set_session_title;
      expect(setTitleTool).toBeDefined();

      const resultStr = await setTitleTool?.execute(
        { title: "[MASTER] Orchestration Root", sessionId: "ses-title-1" },
        { sessionID: "ses-caller-1" } as any
      );
      const res = JSON.parse(resultStr);
      expect(res.status).toBe("success");
      expect(res.sessionId).toBe("ses-title-1");
      expect(res.title).toBe("[MASTER] Orchestration Root");
      expect(res.persona).toBe("master");

      const beforeHook = hooks["tool.execute.before"];
      await expect(
        beforeHook?.({ sessionID: "ses-title-1", tool: "edit" }, {})
      ).rejects.toThrow("[ACCELERATE PERMISSION DENIED]");

      const resultStr2 = await setTitleTool?.execute(
        { title: "⚡ [W-test] Worker Task" },
        { sessionID: "ses-title-2" } as any
      );
      const res2 = JSON.parse(resultStr2);
      expect(res2.status).toBe("success");
      expect(res2.sessionId).toBe("ses-title-2");
      expect(res2.title).toBe("⚡ [W-test] Worker Task");
      expect(res2.persona).toBe("worker");

      await expect(
        setTitleTool?.execute({ title: "No session" }, {} as any)
      ).rejects.toThrow();
    });

    it("acc_get_session_info returns session details and resolved persona", async () => {
      const hooks = await AccelerateOmoPlugin({} as any);
      const getInfoTool = hooks.tool?.acc_get_session_info;
      const setTitleTool = hooks.tool?.acc_set_session_title;
      expect(getInfoTool).toBeDefined();

      await setTitleTool?.execute(
        { title: "[MASTER] Architecture", sessionId: "ses-info-1" },
        {} as any
      );

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

  describe("acc_fanin_worker", () => {
    it("should successfully run verification, merge branch, remove worktree, and return success receipt", async () => {
      const mockWorktreeService = {
        runVerification: vi.fn().mockResolvedValue({
          exitCode: 0,
          output: "all tests passed\n",
        }),
        list: vi.fn().mockResolvedValue([
          {
            path: "/tmp/test-fanin-worktree",
            branch: "refs/heads/accelerate/acc-task-test",
          },
        ]),
        mergeBranch: vi.fn().mockResolvedValue({ commitHash: "c0ffee123" }),
        remove: vi.fn().mockResolvedValue({ path: "/tmp/test-fanin-worktree" }),
        quarantine: vi.fn(),
      };

      const hooks = await AccelerateOmoPlugin({} as any, {
        worktreeService: mockWorktreeService as any,
      });
      const faninTool = hooks.tool?.acc_fanin_worker;
      expect(faninTool).toBeDefined();

      const fs = await import("node:fs");
      const targetDir = "/tmp/test-fanin-worktree";
      fs.mkdirSync(targetDir, { recursive: true });

      try {
        const resultStr = await faninTool?.execute({
          targetDir,
          testCommand: "npm test",
          targetBranch: "master",
          report: {
            delegationId: "del_fanin123",
            taskSlug: "fanin-task",
            status: "success",
            touchedFiles: ["src/feature.ts"],
            testResults: {
              command: "npm test",
              passed: 5,
              failed: 0,
              exitCode: 0,
            },
            buildStatus: "clean",
            diffSummary: "1 file changed, 10 insertions(+)",
            invariantsSatisfied: ["TDD Iron Law"],
          },
        }, { sessionID: "ses_master_audit", messageID: "msg_fanin" } as any);

        const result = JSON.parse(resultStr);
        expect(result.status).toBe("success");
        expect(result.targetDir).toBe(targetDir);
        expect(result.mergedBranch).toBe("accelerate/acc-task-test");
        expect(result.targetBranch).toBe("master");
        expect(result.commitHash).toBe("c0ffee123");
        expect(result.testOutput).toContain("all tests passed");

        expect(mockWorktreeService.runVerification).toHaveBeenCalledWith(targetDir, "npm test");
        expect(mockWorktreeService.mergeBranch).toHaveBeenCalledWith("accelerate/acc-task-test", "master");
        expect(mockWorktreeService.remove).toHaveBeenCalledWith({ path: targetDir, force: true });
      } finally {
        if (fs.existsSync(targetDir)) {
          fs.rmdirSync(targetDir);
        }
      }
    });

    it("should quarantine worktree and return error without merging when verification fails", async () => {
      const mockWorktreeService = {
        runVerification: vi.fn().mockResolvedValue({
          exitCode: 1,
          output: "Tests failed with exit code 1",
        }),
        quarantine: vi.fn().mockResolvedValue({
          originalPath: "/tmp/test-fanin-fail",
          quarantinedPath: "/tmp/quarantine/test-fanin-fail",
        }),
        list: vi.fn(),
        mergeBranch: vi.fn(),
        remove: vi.fn(),
      };

      const hooks = await AccelerateOmoPlugin({} as any, {
        worktreeService: mockWorktreeService as any,
      });
      const faninTool = hooks.tool?.acc_fanin_worker;

      const fs = await import("node:fs");
      const targetDir = "/tmp/test-fanin-fail";
      fs.mkdirSync(targetDir, { recursive: true });

      try {
        const resultStr = await faninTool?.execute({
          targetDir,
          testCommand: "npm test",
          targetBranch: "master",
        }, { sessionID: "ses_master_fail", messageID: "msg_fanin_fail" } as any);

        const result = JSON.parse(resultStr);
        expect(result.status).toBe("error");
        expect(result.quarantined).toBe(true);
        expect(result.error).toContain("verification_failed");
        expect(mockWorktreeService.quarantine).toHaveBeenCalledWith({
          path: targetDir,
          reason: "verification_failed",
        });
        expect(mockWorktreeService.mergeBranch).not.toHaveBeenCalled();
      } finally {
        if (fs.existsSync(targetDir)) {
          fs.rmdirSync(targetDir);
        }
      }
    });


    it("should reject invalid worker completion report schema", async () => {
      const hooks = await AccelerateOmoPlugin({} as any);
      const faninTool = hooks.tool?.acc_fanin_worker;

      await expect(
        faninTool?.execute({
          targetDir: "/tmp/non-existent",
          report: {
            invalid: "data",
          } as any,
        }, {} as any)
      ).rejects.toThrow();
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

      it("should return approved live execution receipt when START/FINISH is humanApproved or for PROGRESS/BLOCKED/REVIEW", async () => {
        const hooks = await AccelerateOmoPlugin({} as any);
        const planeTool = hooks.tool?.acc_execute_plane_sync;

        const baseArgs = {
          workspaceSlug: "karval",
          projectId: "proj-1",
          workItemId: "issue-1",
          targetStateId: "state-done",
          expectedCurrentStateId: "state-review",
          expectedUpdatedAt: "2026-09-18T20:00:00Z",
          idempotencyKey: "test-key-sync-2",
          commentHtml: "<p>Wave execution complete</p>",
          humanApproved: true,
          delegationId: "del_wave_done",
          workerSessionId: "ses_wave_worker",
        };

        const resStr = await planeTool?.execute(
          { ...baseArgs, phase: "FINISH" },
          { sessionID: "ses_master", messageID: "msg_finish" } as any
        );
        const result = JSON.parse(resStr);
        expect(result.status).toBe("success");
        expect(result.executed).toBe(true);
        expect(result.phase).toBe("FINISH");
        expect(result.receipt).toBeDefined();
        expect(result.receipt.status).toBe("approved_for_dispatch");
        expect(result.receipt.payload.isHumanApproved).toBe(true);
        expect(result.receipt.provenance.delegationId).toBe("del_wave_done");

        const progResStr = await planeTool?.execute(
          { ...baseArgs, phase: "PROGRESS", humanApproved: false },
          {} as any
        );
        const progResult = JSON.parse(progResStr);
        expect(progResult.status).toBe("success");
        expect(progResult.executed).toBe(true);
        expect(progResult.phase).toBe("PROGRESS");
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

        expect(messageOutput.parts[0].text).toContain("<PERSONA_GOVERNANCE>");
        expect(messageOutput.parts[0].text).toContain("ACCELERATE MASTER ORCHESTRATOR LAW");

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
  });
});
