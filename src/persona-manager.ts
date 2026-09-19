import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type SessionPersona = "master" | "worker" | "standard";

export interface PersonaManagerOptions {
  skillsDir?: string;
}

const currentDir = typeof __dirname !== "undefined"
  ? __dirname
  : dirname(fileURLToPath(import.meta.url));

export class PersonaManager {
  private skillsDir: string;
  private sessionPersonas: Map<string, SessionPersona> = new Map();

  constructor(options?: PersonaManagerOptions) {
    this.skillsDir = options?.skillsDir ?? join(currentDir, "../skills");
  }

  /**
   * Identifies persona from session title or metadata string.
   * Tolerates leading emojis, spaces, and brackets.
   */
  public detectPersonaFromTitle(title: string): SessionPersona {
    const upper = title.trim().toUpperCase();
    if (upper.includes("[MASTER]")) {
      return "master";
    }
    // Suporta "[W-", "[WORKER]" e prefixos com emoji como "⚡ [W-8]"
    if (/\[W-\d+\]/i.test(title) || upper.includes("[WORKER]") || /\[W-/i.test(title)) {
      return "worker";
    }
    return "standard";
  }

  public registerSessionPersona(sessionId: string, persona: SessionPersona): void {
    this.sessionPersonas.set(sessionId, persona);
  }

  public getSessionPersona(sessionId: string): SessionPersona {
    return this.sessionPersonas.get(sessionId) ?? "standard";
  }

  /**
   * Evaluates if a given tool can be executed by the session's active persona.
   * Master sessions are blocked from directly mutating source code files.
   */
  public isToolAllowed(sessionId: string, toolName: string): boolean {
    const persona = this.getSessionPersona(sessionId);
    if (persona === "master") {
      const blockedForMaster = ["edit", "write", "apply_patch"];
      if (blockedForMaster.includes(toolName)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Reads the governance Markdown instructions for the designated persona.
   */
  public getPersonaInstructions(persona: SessionPersona): string {
    if (persona === "standard") return "";
    const fileName = persona === "master" ? "acc-master.md" : "acc-worker.md";
    const filePath = join(this.skillsDir, fileName);

    if (!existsSync(filePath)) {
      return "";
    }

    return readFileSync(filePath, "utf-8");
  }
}
