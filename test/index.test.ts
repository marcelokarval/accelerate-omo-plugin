import { describe, it, expect } from "vitest";
import { isMaster } from "../src/index.js";

describe("dummy test", () => {
  it("should assert isMaster", () => {
    expect(isMaster).toBe(true);
  });
});
