import { describe, it, expect } from "vitest";
import plugin from "../src/index.js";

describe("plugin skeleton", () => {
  it("should export a plugin function returning hooks", async () => {
    expect(typeof plugin).toBe("function");
    const hooks = await plugin({} as any);
    expect(hooks).toBeDefined();
    expect(typeof hooks).toBe("object");
  });
});
