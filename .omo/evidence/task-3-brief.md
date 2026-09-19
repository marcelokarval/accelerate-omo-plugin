# Task 3: Implement OpenCodeClient wrapper

**What to do**: 
Create `src/opencode-client.ts` to wrap OpenCode's native V1/V2 HTTP APIs.
Expose methods to:
1. Create a session: `POST /api/session` (or `POST /session` if V1) with `{ directory: worktreePath }`
2. Send a prompt asynchronously: `POST /api/session/:id/prompt` (with `resume: true`) or `POST /session/:id/prompt_async`.
3. Interrupt a session: `POST /api/session/:id/interrupt` or `POST /session/:id/abort`.
4. Handle SSE events: Connect to `GET /event` or `GET /api/session/:id/event` to read streaming output.

Write unit tests in `test/opencode-client.test.ts` mocking the global `fetch` API and `EventSource` (or readable streams).

**Must NOT do**: 
Do not use the deprecated OpenChamber `/session/dispatch` endpoints. This must be pure OpenCode API.
Do not implement the business logic of the persona injection yet.

**Reference**:
`http://127.0.0.1:4096/doc` for OpenAPI definitions.
OpenCode typically expects `Authorization: Basic ...` if protected, allow passing options for headers.

**Acceptance criteria**: 
Unit tests pass using mocked fetch for session creation and prompting.

**Commit**: 
Yes. `feat(api): implement OpenCode HTTP API wrapper`
