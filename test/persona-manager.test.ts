import { describe, it, expect } from "vitest";
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

  it("should allow editing tools for Worker persona", () => {
    manager.registerSessionPersona("session-worker-1", "worker");

    expect(manager.isToolAllowed("session-worker-1", "read")).toBe(true);
    expect(manager.isToolAllowed("session-worker-1", "edit")).toBe(true);
    expect(manager.isToolAllowed("session-worker-1", "write")).toBe(true);
    expect(manager.isToolAllowed("session-worker-1", "apply_patch")).toBe(true);
  });

  it("should load valid instructions for personas", () => {
    const masterInstr = manager.getPersonaInstructions("master");
    const workerInstr = manager.getPersonaInstructions("worker");

    expect(masterInstr).toContain("ACCELERATE MASTER ORCHESTRATOR LAW");
    expect(workerInstr).toContain("ACCELERATE ATOMIC WORKER LAW");
  });
});
