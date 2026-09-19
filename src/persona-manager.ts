import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export type SessionPersona = "master" | "worker" | "standard";

export interface PersonaManagerOptions {
  skillsDir?: string;
}

export class PersonaManager {
  private skillsDir: string;
  private sessionPersonas: Map<string, SessionPersona> = new Map();

  constructor(options?: PersonaManagerOptions) {
    this.skillsDir = options?.skillsDir ?? join(__dirname, "../skills");
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
   * Loads the strict markdown rules for a given persona
   */
  public getPersonaInstructions(persona: SessionPersona): string {
    if (persona === "master") {
      const file = join(this.skillsDir, "acc-master.md");
      return existsSync(file) ? readFileSync(file, "utf8") : "";
    }
    if (persona === "worker") {
      const file = join(this.skillsDir, "acc-worker.md");
      return existsSync(file) ? readFileSync(file, "utf8") : "";
    }
    return "";
  }

  /**
   * Tool fencing rule: Master cannot edit product code
   */
  public isToolAllowed(sessionId: string, toolName: string): boolean {
    const persona = this.getSessionPersona(sessionId);
    if (persona === "master") {
      // Forbidden mutating tools for Master
      const blockedTools = ["edit", "write", "apply_patch"];
      if (blockedTools.includes(toolName.toLowerCase())) {
        return false;
      }
    }
    return true;
  }
}
