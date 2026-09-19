import { describe, it, expect } from "vitest";

describe("OpenCode Plugin Loader Contract", () => {
  it("exports only AccelerateOmoPlugin and functions callable as plugin factory without new", async () => {
    const mod = await import("../src/index.js");

    expect(mod.default).toBeDefined();
    expect(mod.AccelerateOmoPlugin).toBeDefined();
    expect(mod.default).toBe(mod.AccelerateOmoPlugin);

    for (const [key, val] of Object.entries(mod)) {
      if (typeof val === "function") {
        const hooks = await (val as any)({});
        expect(hooks).toBeDefined();
        expect(hooks.tool).toBeDefined();
      }
    }

    const exportedKeys = Object.keys(mod);
    expect(exportedKeys).not.toContain("PersonaManager");
    expect(exportedKeys).not.toContain("GitWorktreeService");
    expect(exportedKeys).not.toContain("OpenCodeClient");
    expect(exportedKeys).not.toContain("StateMachineService");
    expect(exportedKeys).not.toContain("PlaneApprovalGateService");
  });
});
