import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

describe("Mini-Skills Definitions (Task 4)", () => {
  const skillsDir = join(__dirname, "../skills");

  it("should have acc-master.md defined with strict master invariants", () => {
    const masterPath = join(skillsDir, "acc-master.md");
    expect(existsSync(masterPath)).toBe(true);

    const content = readFileSync(masterPath, "utf8");
    expect(content).toContain("ACCELERATE MASTER ORCHESTRATOR LAW");
    expect(content).toContain("ZERO IMPLEMENTATION IN THIS WINDOW");
    expect(content).toContain("DELEGATION MANDATE (MASTER -> WORKERS)");
    expect(content).toContain("PLANE SYNCHRONIZATION GATE");
    expect(content).toContain("FAN-IN & FORENSIC REVIEW");
  });

  it("should have acc-worker.md defined with strict worker invariants", () => {
    const workerPath = join(skillsDir, "acc-worker.md");
    expect(existsSync(workerPath)).toBe(true);

    const content = readFileSync(workerPath, "utf8");
    expect(content).toContain("ACCELERATE ATOMIC WORKER LAW");
    expect(content).toContain("STRICT TEST-DRIVEN DEVELOPMENT (THE IRON LAW)");
    expect(content).toContain("SCOPE BOUNDARY");
    expect(content).toContain("INDEPENDENT REVIEW BEFORE REPORTING");
    expect(content).toContain("COMPLETION CONTRACT");
  });
});
