import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { OpenCodeClient } from "./opencode-client.js";

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
  /**
   * Identifies persona from session title or metadata string.
   * Tolerates leading emojis, spaces, and brackets.
   * Supports case-insensitive matches for: [MASTER], MASTER -, MASTER:, ⚡ [W-, [W-, [WORKER].
   */
  public detectPersonaFromTitle(title: string): SessionPersona {
    const trimmed = title.trim();
    const upper = trimmed.toUpperCase();

    if (
      upper.includes("[MASTER]") ||
      upper.includes("MASTER -") ||
      upper.includes("MASTER:")
    ) {
      return "master";
    }

    if (
      /⚡?\s*\[W-/i.test(trimmed) ||
      /\[W-\d+\]/i.test(trimmed) ||
      upper.includes("[WORKER]")
    ) {
      return "worker";
    }

    return "standard";
  }

  /**
   * Resolves persona asynchronously for a session, consulting OpenCodeClient if needed.
   */
  public async resolveSessionPersona(
    sessionId: string,
    client?: OpenCodeClient
  ): Promise<SessionPersona> {
    const cached = this.sessionPersonas.get(sessionId);
    if (cached && cached !== "standard") {
      return cached;
    }

    if (client && sessionId) {
      const session = await client.getSession(sessionId);
      if (session?.title && typeof session.title === "string") {
        const detected = this.detectPersonaFromTitle(session.title);
        if (detected !== "standard") {
          this.registerSessionPersona(sessionId, detected);
          return detected;
        }
      }
    }

    return this.getSessionPersona(sessionId);
  }

  public registerSessionPersona(sessionId: string, persona: SessionPersona): void {
    this.sessionPersonas.set(sessionId, persona);
  }

  public getSessionPersona(sessionId: string): SessionPersona {
    return this.sessionPersonas.get(sessionId) ?? "standard";
  }

  public isGovernancePath(filePath: string): boolean {
    if (!filePath) return false;
    const normalized = filePath.replace(/\\/g, "/");
    return (
      normalized.startsWith("docs/plans/") ||
      normalized.startsWith("docs/architecture/") ||
      normalized.startsWith("docs/tasks/") ||
      normalized.startsWith("docs/reports/") ||
      normalized.startsWith(".accelerate/") ||
      normalized.includes("/docs/plans/") ||
      normalized.includes("/docs/architecture/") ||
      normalized.includes("/docs/tasks/") ||
      normalized.includes("/docs/reports/") ||
      normalized.includes("/.accelerate/")
    );
  }

  public isToolAllowed(
    sessionId: string,
    toolName: string,
    args?: Record<string, any>
  ): boolean {
    const persona = this.getSessionPersona(sessionId);
    if (persona === "master") {
      const mutatingTools = ["edit", "write", "apply_patch"];
      if (mutatingTools.includes(toolName)) {
        const targetPath = args?.filePath || args?.path || "";
        if (this.isGovernancePath(targetPath)) {
          return true;
        }
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
