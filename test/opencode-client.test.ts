import { describe, it, expect, vi } from "vitest";
import { OpenCodeClient } from "../src/opencode-client.js";

function createReadableStream(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    },
  });
}

describe("OpenCodeClient", () => {
  describe("Authentication & headers", () => {
    it("should set basic auth header when username and password are provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "ses_123" }),
      });

      const client = new OpenCodeClient({
        username: "user",
        password: "secretpassword",
        fetch: mockFetch,
      });

      await client.createSession({ directory: "/test/dir" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      const headers = init.headers;
      const expectedToken = Buffer.from("user:secretpassword").toString("base64");
      expect(headers["Authorization"]).toBe(`Basic ${expectedToken}`);
    });

    it("should read baseUrl from process.env.OPENCODE_BASE_URL when baseUrl option is omitted", async () => {
      const prevEnv = process.env.OPENCODE_BASE_URL;
      process.env.OPENCODE_BASE_URL = "http://env-host:5000";

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "ses_env" }),
      });

      try {
        const client = new OpenCodeClient({
          fetch: mockFetch,
          apiVersion: "v2",
        });

        await client.createSession({ directory: "/test/dir" });
        expect(mockFetch).toHaveBeenCalledTimes(1);
        const [url] = mockFetch.mock.calls[0];
        expect(url).toBe("http://env-host:5000/api/session");
      } finally {
        if (prevEnv !== undefined) {
          process.env.OPENCODE_BASE_URL = prevEnv;
        } else {
          delete process.env.OPENCODE_BASE_URL;
        }
      }
    });

    it("should attach Bearer Authorization header when apiKey option or OPENCODE_API_KEY is provided", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "ses_key" }),
      });

      const clientWithOpt = new OpenCodeClient({
        apiKey: "custom-api-key",
        fetch: mockFetch,
      });

      await clientWithOpt.createSession({ directory: "/test/dir" });
      let [, init] = mockFetch.mock.calls[0];
      expect(init.headers["Authorization"]).toBe("Bearer custom-api-key");

      mockFetch.mockClear();

      const prevKey = process.env.OPENCODE_API_KEY;
      process.env.OPENCODE_API_KEY = "env-api-key";
      try {
        const clientWithEnv = new OpenCodeClient({
          fetch: mockFetch,
        });
        await clientWithEnv.createSession({ directory: "/test/dir" });
        [, init] = mockFetch.mock.calls[0];
        expect(init.headers["Authorization"]).toBe("Bearer env-api-key");
      } finally {
        if (prevKey !== undefined) {
          process.env.OPENCODE_API_KEY = prevKey;
        } else {
          delete process.env.OPENCODE_API_KEY;
        }
      }
    });

    it("should attach Basic Authorization header when OPENCODE_SERVER_PASSWORD is set and username/password omitted", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "ses_pwd" }),
      });

      const prevPwd = process.env.OPENCODE_SERVER_PASSWORD;
      process.env.OPENCODE_SERVER_PASSWORD = "server-password";
      try {
        const client = new OpenCodeClient({
          fetch: mockFetch,
        });
        await client.createSession({ directory: "/test/dir" });
        const [, init] = mockFetch.mock.calls[0];
        const expectedToken = Buffer.from(":server-password").toString("base64");
        expect(init.headers["Authorization"]).toBe(`Basic ${expectedToken}`);
      } finally {
        if (prevPwd !== undefined) {
          process.env.OPENCODE_SERVER_PASSWORD = prevPwd;
        } else {
          delete process.env.OPENCODE_SERVER_PASSWORD;
        }
      }
    });

    it("should pass custom headers", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "ses_123" }),
      });

      const client = new OpenCodeClient({
        headers: { "X-Custom-Header": "my-value" },
        fetch: mockFetch,
      });

      await client.createSession({ directory: "/test/dir" });

      const [, init] = mockFetch.mock.calls[0];
      expect(init.headers["X-Custom-Header"]).toBe("my-value");
    });
  });

  describe("Session creation (V2 and V1)", () => {
    it("V2: should call POST /api/session with location directory and parse data", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: "ses_v2_123",
            title: "Test Session",
            location: { directory: "/worktree/test" },
          },
        }),
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const res = await client.createSession({ directory: "/worktree/test", agent: "oracle" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        location: { directory: "/worktree/test" },
        agent: "oracle",
      });
      expect(res.id).toBe("ses_v2_123");
    });

    it("V1: should call POST /session?directory=... with body", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          id: "ses_v1_123",
          title: "V1 Session",
        }),
      });

      const client = new OpenCodeClient({ apiVersion: "v1", fetch: mockFetch });
      const res = await client.createSession({ directory: "/worktree/v1", title: "My Session" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/session?directory=%2Fworktree%2Fv1");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        title: "My Session",
      });
      expect(res.id).toBe("ses_v1_123");
    });

    it("should throw error if session creation response is not ok", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        text: async () => "Bad Request",
      });

      const client = new OpenCodeClient({ fetch: mockFetch });
      await expect(client.createSession()).rejects.toThrow("Failed to create session (HTTP 400): Bad Request");
    });
  });

  describe("Sending prompt (V2 and V1)", () => {
    it("V2: should call POST /api/session/:id/prompt with resume: true and delivery", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: "msg_v2_123",
            delivery: "queue",
          },
        }),
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const res = await client.sendPrompt("ses_123", "Hello AI", { delivery: "steer", resume: true });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session/ses_123/prompt");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        prompt: { text: "Hello AI" },
        resume: true,
        delivery: "steer",
      });
      expect(res.id).toBe("msg_v2_123");
    });

    it("V2: should support client.prompt alias with string prompt", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: "msg_v2_prompt_alias",
          },
        }),
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const res = await client.prompt("ses_123", "Hello via prompt()", { delivery: "queue" });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session/ses_123/prompt");
      expect(JSON.parse(init.body)).toEqual({
        prompt: { text: "Hello via prompt()" },
        resume: true,
        delivery: "queue",
      });
      expect(res.id).toBe("msg_v2_prompt_alias");
    });

    it("V2: should support client.prompt alias with object options", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: {
            id: "msg_v2_prompt_obj",
          },
        }),
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const res = await client.prompt("ses_123", { prompt: "Object prompt text", resume: false });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session/ses_123/prompt");
      expect(JSON.parse(init.body)).toEqual({
        prompt: { text: "Object prompt text" },
        resume: false,
      });
      expect(res.id).toBe("msg_v2_prompt_obj");
    });

    it("V1: should call POST /session/:id/prompt_async with parts", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });

      const client = new OpenCodeClient({ apiVersion: "v1", fetch: mockFetch });
      const res = await client.sendPrompt("ses_456", "Async prompt text");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/session/ses_456/prompt_async");
      expect(init.method).toBe("POST");
      expect(JSON.parse(init.body)).toEqual({
        parts: [{ type: "text", text: "Async prompt text" }],
      });
      expect(res.success).toBe(true);
    });

    it("should throw error if prompt sending fails", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Session Not Found",
      });

      const client = new OpenCodeClient({ fetch: mockFetch });
      await expect(client.sendPrompt("ses_999", "Hello")).rejects.toThrow(
        "Failed to send prompt (HTTP 404): Session Not Found"
      );
    });
  });

  describe("Interrupting session (V2 and V1)", () => {
    it("V2: should call POST /api/session/:id/interrupt", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const res = await client.interrupt("ses_123");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session/ses_123/interrupt");
      expect(init.method).toBe("POST");
      expect(res.success).toBe(true);
    });

    it("should support client.abort alias", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const res = await client.abort("ses_abort");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session/ses_abort/interrupt");
      expect(res.success).toBe(true);
    });

    it("V1: should call POST /session/:id/abort", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => true,
      });

      const client = new OpenCodeClient({ apiVersion: "v1", fetch: mockFetch });
      const res = await client.interrupt("ses_123");

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/session/ses_123/abort");
      expect(init.method).toBe("POST");
      expect(res).toBe(true);
    });
  });

  describe("SSE Events streaming", () => {
    it("should parse SSE messages from response body readable stream", async () => {
      const ssePayload = [
        ": heartbeat\n\n",
        "id: evt_1\nevent: message.updated\ndata: {\"foo\":\"bar\"}\n\n",
        "event: session.idle\ndata: {\"sessionID\":\"ses_123\"}\n\n",
      ];

      const stream = createReadableStream(ssePayload);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      });

      const client = new OpenCodeClient({ apiVersion: "v2", fetch: mockFetch });
      const collected: any[] = [];

      for await (const evt of client.events("ses_123")) {
        collected.push(evt);
      }

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/api/session/ses_123/event");

      expect(collected).toHaveLength(2);
      expect(collected[0]).toEqual({
        id: "evt_1",
        event: "message.updated",
        data: '{"foo":"bar"}',
      });
      expect(collected[1]).toEqual({
        id: undefined,
        event: "session.idle",
        data: '{"sessionID":"ses_123"}',
      });
    });

    it("V1: should query /event with directory", async () => {
      const ssePayload = ["data: {\"type\":\"test\"}\n\n"];
      const stream = createReadableStream(ssePayload);
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: stream,
      });

      const client = new OpenCodeClient({ apiVersion: "v1", fetch: mockFetch });
      const collected: any[] = [];

      for await (const evt of client.events("ses_123", { directory: "/my/dir" })) {
        collected.push(evt);
      }

      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe("http://127.0.0.1:4096/event?directory=%2Fmy%2Fdir");
      expect(collected).toEqual([
        {
          id: undefined,
          event: undefined,
          data: '{"type":"test"}',
        },
      ]);
    });
  });

  it("getSession returns session json when response is ok, null when 404 or error", async () => {
    let requestedUrl = "";
    const customFetch = async (url: any) => {
      requestedUrl = String(url);
      if (requestedUrl.includes("valid-ses")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: "valid-ses", title: "[MASTER] Main" }),
        };
      }
      if (requestedUrl.includes("error-ses")) {
        throw new Error("Network explosion");
      }
      return {
        ok: false,
        status: 404,
        text: async () => "Not found",
      };
    };

    const client = new OpenCodeClient({ baseUrl: "http://test-server:4096", fetch: customFetch as any, apiVersion: "v2" });
    const res = await client.getSession("valid-ses");
    expect(res).toEqual({ id: "valid-ses", title: "[MASTER] Main" });
    expect(requestedUrl).toBe("http://test-server:4096/api/session/valid-ses");

    const notFound = await client.getSession("missing-ses");
    expect(notFound).toBeNull();

    const err = await client.getSession("error-ses");
    expect(err).toBeNull();
  });

  describe("updateSession", () => {
    it("sends HTTP PATCH to /session/:id (or /api/session/:id for v2) with JSON body and returns session data", async () => {
      let requestedUrl = "";
      let requestedMethod = "";
      let requestedBody = "";
      const customFetch = async (url: any, init: any) => {
        requestedUrl = String(url);
        requestedMethod = init.method;
        requestedBody = init.body;
        if (requestedUrl.includes("valid-ses")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ id: "valid-ses", title: "[MASTER] New Title" }),
          };
        }
        return {
          ok: false,
          status: 404,
          text: async () => "Not found",
        };
      };

      const client = new OpenCodeClient({ baseUrl: "http://127.0.0.1:4096", fetch: customFetch as any });
      const res = await client.updateSession("valid-ses", { title: "[MASTER] New Title" });

      expect(requestedMethod).toBe("PATCH");
      expect(requestedUrl).toBe("http://127.0.0.1:4096/session/valid-ses");
      expect(JSON.parse(requestedBody)).toEqual({ title: "[MASTER] New Title" });
      expect(res).toEqual({ id: "valid-ses", title: "[MASTER] New Title" });

      const notFound = await client.updateSession("missing-ses", { title: "foo" });
      expect(notFound).toBeNull();
    });
  });

});
