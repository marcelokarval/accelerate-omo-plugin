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

  public isGenericTitle(title?: string): boolean {
    if (!title) return true;
    const trimmed = title.trim();
    if (trimmed === "" || trimmed.toLowerCase() === "untitled") return true;
    if (/^new session/i.test(trimmed)) return true;
    if (/^nova sess[ãa]o/i.test(trimmed)) return true;
    return false;
  }

  public detectPersonaFromText(text: string): SessionPersona {
    if (!text) return "standard";
    const trimmed = text.trim();
    const upper = trimmed.toUpperCase();

    if (
      /⚡?\s*\[W-/i.test(trimmed) ||
      /\[W-\d+\]/i.test(trimmed) ||
      upper.includes("[WORKER]")
    ) {
      return "worker";
    }

    if (
      upper.includes("[MASTER]") ||
      upper.includes("MASTER -") ||
      upper.includes("MASTER:")
    ) {
      return "master";
    }

    const masterSemanticRegex = new RegExp(
      [
        "\\b(you are the master|act as master|master orchestrator|master session|lead orchestrator)\\b",
        "\\b(v[ocêe|c]|tu)\\s+(ag[op]ra\\s+)?(e|é|eh)\\s+(o|a)?\\s*master\\b",
        "\\b(voc[êe] [ée] o master|voce e o master|atue como master|orquestrador master|sess[ãa]o master|guardi[ãa]o supremo)\\b",
        "\\b(governan[çc]a do ecossistema|assuma a governan[çc]a)\\b"
      ].join("|"),
      "i"
    );

    if (masterSemanticRegex.test(trimmed)) {
      return "master";
    }

    return "standard";
  }

  public generateMasterTitle(promptText: string, directory?: string): string {
    if (!promptText) {
      return this.fallbackDomainTitle(directory);
    }

    let cleaned = promptText
      .replace(/\[MASTER\]/gi, "")
      .replace(/\b(v[ocêe|c]|tu)\s+(ag[op]ra\s+)?(e|é|eh)\s+(o|a)?\s*master\b/gi, "")
      .replace(/\b(voc[êe] [ée] o master|voce e o master|atue como master|master orchestrator|por favor|please)\b/gi, "")
      .replace(/\b(j[áa]\s+)?renomeie(\s+essa|\s+esta)?\s+sess[ãa]o(\s+e\s+aguarde)?\b/gi, "")
      .replace(/\b(aguarde|espere|standby)\b/gi, "")
      .replace(/[\r\n\t]+/g, " ")
      .replace(/[^\w\s\u00C0-\u00FF-]/g, "")
      .trim();

    const words = cleaned.split(/\s+/).filter((w) => w.length > 2);
    if (words.length < 2) {
      return this.fallbackDomainTitle(directory);
    }

    const summary = words.slice(0, 6).join(" ");
    const capitalized = summary.charAt(0).toUpperCase() + summary.slice(1);
    return `[MASTER] ${capitalized}`.slice(0, 70).trim();
  }

  private fallbackDomainTitle(directory?: string): string {
    if (directory) {
      const parts = directory.replace(/\\/g, "/").split("/").filter(Boolean);
      const baseName = parts[parts.length - 1];
      if (baseName && baseName !== "." && baseName !== "undefined") {
        const cleanBase = baseName.replace(/[-_]/g, " ").replace(/[^\w\s]/g, "");
        const cap = cleanBase.charAt(0).toUpperCase() + cleanBase.slice(1);
        return `[MASTER] ${cap} - Governança & Orquestração`.slice(0, 70);
      }
    }
    return "[MASTER] Orquestração & Governança";
  }

  public detectPersonaFromTitle(title: string): SessionPersona {
    return this.detectPersonaFromText(title);
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
