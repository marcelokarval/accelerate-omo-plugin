import { describe, it, expect, beforeEach } from "vitest";
import { PersonaManager } from "../src/persona-manager.js";
import { join } from "node:path";

describe("PersonaManager & Tool Fencing (Task 5)", () => {
  const manager = new PersonaManager({
    skillsDir: join(__dirname, "../skills"),
  });

  it("should detect personas correctly from titles/prefixes", () => {
    expect(manager.detectPersonaFromTitle("[MASTER] Orchestration Phase")).toBe("master");
    expect(manager.detectPersonaFromTitle("⚡ [W-8] Implement Stripe Adapter")).toBe("worker");
    expect(manager.detectPersonaFromTitle("General conversation about code")).toBe("standard");
  });

  it("should block code-editing tools for Master persona", () => {
    manager.registerSessionPersona("session-master-1", "master");

    expect(manager.isToolAllowed("session-master-1", "read")).toBe(true);
    expect(manager.isToolAllowed("session-master-1", "grep")).toBe(true);
    expect(manager.isToolAllowed("session-master-1", "edit")).toBe(false);
    expect(manager.isToolAllowed("session-master-1", "write")).toBe(false);
    expect(manager.isToolAllowed("session-master-1", "apply_patch")).toBe(false);
  });

  it("should allow 'write' and 'edit' when filePath or path is in governance paths", () => {
    manager.registerSessionPersona("session-master-gov", "master");

    const governancePaths = [
      "docs/plans/my-plan.md",
      "docs/architecture/sdd/sdd-v2.md",
      "docs/tasks/task-1.md",
      "docs/reports/wave-1.json",
      ".accelerate/state.json",
      "/root/repo/docs/plans/sub/plan.md",
      "/root/repo/docs/architecture/adr.md",
      "/root/repo/docs/tasks/dag.md",
      "/root/repo/docs/reports/summary.md",
      "/root/repo/.accelerate/cache.json",
      "docs\\plans\\windows-path.md",
      "docs\\architecture\\windows-sdd.md",
    ];

    for (const p of governancePaths) {
      expect(manager.isToolAllowed("session-master-gov", "write", { filePath: p })).toBe(true);
      expect(manager.isToolAllowed("session-master-gov", "edit", { path: p })).toBe(true);
      expect(manager.isToolAllowed("session-master-gov", "apply_patch", { filePath: p })).toBe(true);
    }
  });

  it("should deny 'write' and 'edit' when filePath or path points to production code or is missing", () => {
    manager.registerSessionPersona("session-master-prod", "master");

    const prodPaths = [
      "src/index.ts",
      "backend/main.py",
      "lib/utils.ts",
      "package.json",
      "test/persona-manager.test.ts",
      "/home/repo/src/state-machine.ts",
    ];

    for (const p of prodPaths) {
      expect(manager.isToolAllowed("session-master-prod", "write", { filePath: p })).toBe(false);
      expect(manager.isToolAllowed("session-master-prod", "edit", { path: p })).toBe(false);
      expect(manager.isToolAllowed("session-master-prod", "apply_patch", { filePath: p })).toBe(false);
    }

    expect(manager.isToolAllowed("session-master-prod", "write")).toBe(false);
    expect(manager.isToolAllowed("session-master-prod", "write", {})).toBe(false);
    expect(manager.isToolAllowed("session-master-prod", "edit", { filePath: "" })).toBe(false);
    expect(manager.isToolAllowed("session-master-prod", "apply_patch", { otherArg: "value" })).toBe(false);

    expect(manager.isToolAllowed("session-master-prod", "read", { filePath: "src/index.ts" })).toBe(true);
    expect(manager.isToolAllowed("session-master-prod", "bash", { command: "git status" })).toBe(true);
    expect(manager.isToolAllowed("session-master-prod", "grep", { path: "src" })).toBe(true);
  });

  it("should allow editing tools for Worker persona", () => {
    manager.registerSessionPersona("session-worker-1", "worker");

    expect(manager.isToolAllowed("session-worker-1", "read")).toBe(true);
    expect(manager.isToolAllowed("session-worker-1", "edit")).toBe(true);
    expect(manager.isToolAllowed("session-worker-1", "write")).toBe(true);
    expect(manager.isToolAllowed("session-worker-1", "apply_patch")).toBe(true);
  });

  describe("Path-Aware Fencing (Wave 1)", () => {
    beforeEach(() => {
      manager.registerSessionPersona("session-master-fencing", "master");
    });

    it("allows write and edit when filePath or path is in docs/plans/**, docs/architecture/**, docs/tasks/**, docs/reports/**, or .accelerate/**", () => {
      const allowedPaths = [
        "docs/plans/my-plan.md",
        "docs/architecture/sdd/sdd.md",
        "docs/tasks/task-1.md",
        "docs/reports/report.md",
        ".accelerate/state.json",
        "/root/project/docs/plans/deep/sub/plan.md",
        "/root/project/docs/architecture/adr/adr.md",
        "/root/project/docs/tasks/wave1.md",
        "/root/project/docs/reports/summary.md",
        "/root/project/.accelerate/cache.lock",
        "docs\\plans\\windows-path.md",
      ];

      for (const p of allowedPaths) {
        expect(manager.isToolAllowed("session-master-fencing", "write", { filePath: p })).toBe(true);
        expect(manager.isToolAllowed("session-master-fencing", "edit", { path: p })).toBe(true);
        expect(manager.isToolAllowed("session-master-fencing", "apply_patch", { filePath: p })).toBe(true);
      }
    });

    it("denies write and edit when filePath or path points to production code or when path is missing", () => {
      const blockedPaths = [
        "src/index.ts",
        "backend/main.py",
        "package.json",
        "src/components/App.tsx",
        "/workspace/repo/src/state-machine.ts",
      ];

      for (const p of blockedPaths) {
        expect(manager.isToolAllowed("session-master-fencing", "write", { filePath: p })).toBe(false);
        expect(manager.isToolAllowed("session-master-fencing", "edit", { path: p })).toBe(false);
        expect(manager.isToolAllowed("session-master-fencing", "apply_patch", { filePath: p })).toBe(false);
      }

      expect(manager.isToolAllowed("session-master-fencing", "write")).toBe(false);
      expect(manager.isToolAllowed("session-master-fencing", "write", {})).toBe(false);
      expect(manager.isToolAllowed("session-master-fencing", "edit", { filePath: "" })).toBe(false);
    });

    it("still allows non-mutating tools ('read', 'bash', etc.) for master persona regardless of path", () => {
      expect(manager.isToolAllowed("session-master-fencing", "read", { filePath: "src/index.ts" })).toBe(true);
      expect(manager.isToolAllowed("session-master-fencing", "bash", { command: "npm test" })).toBe(true);
      expect(manager.isToolAllowed("session-master-fencing", "grep", { path: "src" })).toBe(true);
      expect(manager.isToolAllowed("session-master-fencing", "glob")).toBe(true);
    });
  });

  it("should load valid instructions for personas", () => {
    const masterInstr = manager.getPersonaInstructions("master");
    const workerInstr = manager.getPersonaInstructions("worker");

    expect(masterInstr).toContain("ACCELERATE MASTER ORCHESTRATOR LAW");
    expect(workerInstr).toContain("ACCELERATE ATOMIC WORKER LAW");
  });

  it("detects case-insensitive variants in detectPersonaFromTitle", () => {
    expect(manager.detectPersonaFromTitle("[MASTER]")).toBe("master");
    expect(manager.detectPersonaFromTitle("MASTER - Orchestrator")).toBe("master");
    expect(manager.detectPersonaFromTitle("master: Main Task")).toBe("master");
    expect(manager.detectPersonaFromTitle("⚡ [W-1] stripe")).toBe("worker");
    expect(manager.detectPersonaFromTitle("[w-99] worker")).toBe("worker");
    expect(manager.detectPersonaFromTitle("[WORKER] build")).toBe("worker");
    expect(manager.detectPersonaFromTitle("Standard title")).toBe("standard");
  });

  it("resolves session persona dynamically using client.getSession", async () => {
    const mockClient = {
      getSession: async (id: string) => {
        if (id === "ses-master") return { title: "MASTER: Root Orchestration" };
        if (id === "ses-worker") return { title: "⚡ [W-2] Subtask" };
        if (id === "ses-404") return null;
        return { title: "Random Session" };
      },
    } as any;

    const pm = new PersonaManager();
    expect(await pm.resolveSessionPersona("ses-master", mockClient)).toBe("master");
    expect(await pm.resolveSessionPersona("ses-worker", mockClient)).toBe("worker");
    expect(await pm.resolveSessionPersona("ses-404", mockClient)).toBe("standard");
    expect(await pm.resolveSessionPersona("ses-random", mockClient)).toBe("standard");

    // Check cached
    expect(pm.getSessionPersona("ses-master")).toBe("master");
  });

});
