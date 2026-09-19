export interface OpenCodeClientOptions {
  baseUrl?: string;
  headers?: Record<string, string>;
  username?: string;
  password?: string;
  apiVersion?: "v1" | "v2";
  fetch?: typeof fetch;
}

export interface CreateSessionOptions {
  directory?: string;
  workspaceID?: string;
  agent?: string;
  title?: string;
  model?: any;
  [key: string]: any;
}

export interface PromptOptions {
  resume?: boolean;
  delivery?: "steer" | "queue";
  agent?: string;
  model?: any;
  parts?: any[];
  [key: string]: any;
}

export interface SessionInfo {
  id: string;
  title?: string;
  directory?: string;
  [key: string]: any;
}

export interface SSEEvent {
  id?: string;
  event?: string;
  data: string;
}

export class OpenCodeClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private apiVersion: "v1" | "v2";
  private fetchImpl: typeof fetch;

  constructor(options: OpenCodeClientOptions = {}) {
    this.baseUrl = (options.baseUrl || "http://127.0.0.1:4096").replace(/\/+$/, "");
    this.apiVersion = options.apiVersion || "v2";
    this.fetchImpl = options.fetch || (globalThis.fetch ? globalThis.fetch.bind(globalThis) : (fetch as any));
    this.headers = { ...(options.headers || {}) };

    if (options.username !== undefined || options.password !== undefined) {
      const u = options.username || "";
      const p = options.password || "";
      const encoded = typeof Buffer !== "undefined"
        ? Buffer.from(`${u}:${p}`).toString("base64")
        : btoa(`${u}:${p}`);
      this.headers["Authorization"] = `Basic ${encoded}`;
    }
  }

  private getHeaders(contentTypeJson = true): Record<string, string> {
    const h: Record<string, string> = { ...this.headers };
    if (contentTypeJson && !h["Content-Type"]) {
      h["Content-Type"] = "application/json";
    }
    return h;
  }

  /**
   * Create a session.
   * In V2: POST /api/session with body { location: { directory }, agent, model }
   * In V1: POST /session?directory=... with body { agent, title, ... }
   */
  /**
   * Get session metadata.
   * Sends GET /session/:id (V1) or GET /session/:id (or /api/session/:id for V2).
   * Gracefully returns null on 404 or network errors rather than throwing unhandled exceptions.
   */
  async getSession(sessionId: string): Promise<any> {
    try {
      const endpoint = this.apiVersion === "v2"
        ? `${this.baseUrl}/api/session/${encodeURIComponent(sessionId)}`
        : `${this.baseUrl}/session/${encodeURIComponent(sessionId)}`;

      const res = await this.fetchImpl(endpoint, {
        method: "GET",
        headers: this.getHeaders(false),
      });

      if (!res.ok) {
        return null;
      }

      const json = await res.json() as any;
      return json?.data ?? json;
    } catch {
      return null;
    }
  }

  async updateSession(
    sessionId: string,
    updates: { title?: string; [key: string]: any }
  ): Promise<any> {
    try {
      const endpoint = `${this.baseUrl}/session/${encodeURIComponent(sessionId)}`;

      const res = await this.fetchImpl(endpoint, {
        method: "PATCH",
        headers: this.getHeaders(true),
        body: JSON.stringify(updates),
      });

      if (!res.ok) {
        return null;
      }

      const json = (await res.json()) as any;
      return json?.data ?? json;
    } catch {
      return null;
    }
  }

  async createSession(options: CreateSessionOptions = {}): Promise<any> {
    if (this.apiVersion === "v2") {
      const body: Record<string, any> = {};
      if (options.directory) {
        body.location = {
          directory: options.directory,
          ...(options.workspaceID ? { workspaceID: options.workspaceID } : {}),
        };
      } else if (options.workspaceID) {
        body.location = {
          directory: "",
          workspaceID: options.workspaceID,
        };
      }
      if (options.agent) body.agent = options.agent;
      if (options.model) body.model = options.model;
      if (options.id) body.id = options.id;

      const url = `${this.baseUrl}/api/session`;
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create session (HTTP ${res.status}): ${errorText}`);
      }

      const json = (await res.json()) as any;
      return json?.data ?? json;
    } else {
      const queryParams = new URLSearchParams();
      if (options.directory) queryParams.set("directory", options.directory);
      if (options.workspaceID) queryParams.set("workspace", options.workspaceID);

      const qs = queryParams.toString();
      const url = `${this.baseUrl}/session${qs ? `?${qs}` : ""}`;

      const { directory, ...bodyPayload } = options;
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(bodyPayload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to create session (HTTP ${res.status}): ${errorText}`);
      }

      return await res.json();
    }
  }

  /**
   * Send a prompt to a session.
   * In V2: POST /api/session/:id/prompt with { prompt: { text }, resume: true, delivery }
   * In V1: POST /session/:id/prompt_async with { parts: [{ type: "text", text }] }
   */
  async sendPrompt(sessionId: string, promptText: string, options: PromptOptions = {}): Promise<any> {
    if (this.apiVersion === "v2") {
      const url = `${this.baseUrl}/api/session/${encodeURIComponent(sessionId)}/prompt`;
      const body: Record<string, any> = {
        prompt: {
          text: promptText,
          ...(options.files ? { files: options.files } : {}),
          ...(options.agents ? { agents: options.agents } : {}),
        },
        resume: options.resume !== undefined ? options.resume : true,
      };
      if (options.delivery) body.delivery = options.delivery;
      if (options.id) body.id = options.id;

      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to send prompt (HTTP ${res.status}): ${errorText}`);
      }

      const json = (await res.json()) as any;
      return json?.data ?? json;
    } else {
      const url = `${this.baseUrl}/session/${encodeURIComponent(sessionId)}/prompt_async`;
      const body: Record<string, any> = {
        parts: options.parts || [{ type: "text", text: promptText }],
      };
      if (options.agent) body.agent = options.agent;
      if (options.model) body.model = options.model;
      if (options.system) body.system = options.system;
      if (options.variant) body.variant = options.variant;

      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to send async prompt (HTTP ${res.status}): ${errorText}`);
      }

      if (res.status === 204) {
        return { success: true };
      }
      return await res.json();
    }
  }

  /**
   * Alias for sendPrompt matching task specification: prompt(sessionId, options | text).
   */
  async prompt(
    sessionId: string,
    promptOrOptions: string | ({ prompt?: string; text?: string } & PromptOptions),
    options: PromptOptions = {}
  ): Promise<any> {
    if (typeof promptOrOptions === "string") {
      return this.sendPrompt(sessionId, promptOrOptions, options);
    }
    const text = promptOrOptions.prompt || promptOrOptions.text || "";
    const opts = { ...promptOrOptions, ...options };
    return this.sendPrompt(sessionId, text, opts);
  }

  /**
   * Alias for interrupt matching abort naming.
   */
  async abort(sessionId: string): Promise<any> {
    return this.interrupt(sessionId);
  }

  /**
   * Interrupt a session.
   * In V2: POST /api/session/:id/interrupt
   * In V1: POST /session/:id/abort
   */
  async interrupt(sessionId: string): Promise<any> {
    if (this.apiVersion === "v2") {
      const url = `${this.baseUrl}/api/session/${encodeURIComponent(sessionId)}/interrupt`;
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.getHeaders(false),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to interrupt session (HTTP ${res.status}): ${errorText}`);
      }

      if (res.status === 204) {
        return { success: true };
      }
      const text = await res.text();
      return text ? JSON.parse(text) : { success: true };
    } else {
      const url = `${this.baseUrl}/session/${encodeURIComponent(sessionId)}/abort`;
      const res = await this.fetchImpl(url, {
        method: "POST",
        headers: this.getHeaders(true),
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Failed to abort session (HTTP ${res.status}): ${errorText}`);
      }

      return await res.json();
    }
  }

  /**
   * Connect to an SSE event stream.
   * If sessionId is provided:
   *   V2: GET /api/session/:id/event
   *   V1: GET /event (or filtered global event stream)
   * If no sessionId:
   *   V2: GET /api/event (or /event)
   *   V1: GET /event
   *
   * Yields parsed SSEEvent objects: { id?, event?, data }
   */
  async *events(
    sessionId?: string,
    eventOptions: { signal?: AbortSignal; after?: string; directory?: string } = {}
  ): AsyncGenerator<SSEEvent, void, unknown> {
    let url: string;
    if (sessionId) {
      if (this.apiVersion === "v2") {
        url = `${this.baseUrl}/api/session/${encodeURIComponent(sessionId)}/event`;
        if (eventOptions.after) {
          url += `?after=${encodeURIComponent(eventOptions.after)}`;
        }
      } else {
        const params = new URLSearchParams();
        if (eventOptions.directory) params.set("directory", eventOptions.directory);
        const qs = params.toString();
        url = `${this.baseUrl}/event${qs ? `?${qs}` : ""}`;
      }
    } else {
      if (this.apiVersion === "v2") {
        url = `${this.baseUrl}/api/event`;
      } else {
        const params = new URLSearchParams();
        if (eventOptions.directory) params.set("directory", eventOptions.directory);
        const qs = params.toString();
        url = `${this.baseUrl}/event${qs ? `?${qs}` : ""}`;
      }
    }

    const headers: Record<string, string> = {
      ...this.getHeaders(false),
      Accept: "text/event-stream",
    };

    const res = await this.fetchImpl(url, {
      method: "GET",
      headers,
      signal: eventOptions.signal,
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Failed to connect to event stream (HTTP ${res.status}): ${errorText}`);
    }

    if (!res.body) {
      throw new Error("Event stream response body is null");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        let currentId: string | undefined;
        let currentEvent: string | undefined;
        const currentDataLines: string[] = [];

        for (const line of lines) {
          if (line.trim() === "") {
            if (currentDataLines.length > 0 || currentEvent !== undefined || currentId !== undefined) {
              yield {
                id: currentId,
                event: currentEvent,
                data: currentDataLines.join("\n"),
              };
              currentId = undefined;
              currentEvent = undefined;
              currentDataLines.length = 0;
            }
            continue;
          }

          if (line.startsWith(":")) {
            // SSE comment
            continue;
          }

          const colonIndex = line.indexOf(":");
          let field = line;
          let val = "";
          if (colonIndex !== -1) {
            field = line.slice(0, colonIndex);
            val = line.slice(colonIndex + 1);
            if (val.startsWith(" ")) {
              val = val.slice(1);
            }
          }

          if (field === "id") {
            currentId = val;
          } else if (field === "event") {
            currentEvent = val;
          } else if (field === "data") {
            currentDataLines.push(val);
          }
        }

        if (currentDataLines.length > 0 || currentEvent !== undefined || currentId !== undefined) {
          yield {
            id: currentId,
            event: currentEvent,
            data: currentDataLines.join("\n"),
          };
        }
      }

      // Flush remainder if any
      if (buffer.trim().length > 0) {
        const lines = buffer.split(/\r?\n/);
        let currentId: string | undefined;
        let currentEvent: string | undefined;
        const currentDataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith(":")) continue;
          const colonIndex = line.indexOf(":");
          let field = line;
          let val = "";
          if (colonIndex !== -1) {
            field = line.slice(0, colonIndex);
            val = line.slice(colonIndex + 1);
            if (val.startsWith(" ")) val = val.slice(1);
          }
          if (field === "id") currentId = val;
          else if (field === "event") currentEvent = val;
          else if (field === "data") currentDataLines.push(val);
        }

        if (currentDataLines.length > 0 || currentEvent !== undefined || currentId !== undefined) {
          yield {
            id: currentId,
            event: currentEvent,
            data: currentDataLines.join("\n"),
          };
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
