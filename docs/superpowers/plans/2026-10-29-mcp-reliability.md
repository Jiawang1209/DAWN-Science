# MCP reliability implementation plan

**Goal:** Preserve MCP facts and failures, support cancellable long calls, and recover broken connections without replaying an operation.

**Architecture:** Keep the official SDK for transports, initialization, discovery and tool-result validation. Route only ordinary `tools/call` requests through a small transport multiplexer with no execution deadline; do not modify SDK private timers. Connections remain application-owned and shared by logical server/directory, with configuration/credential identity and initialization generations. Cancellation belongs to a request, never to the shared server.

**Tech stack:** TypeScript, official MCP SDK, Vitest, local stdio/HTTP/SSE fixtures and the existing native Agent runtime.

## Accepted behavior

- Preserve text, structured facts, supported images, resource links and embedded resource text. Keep raw results within the MCP layer; never expose App-only `_meta`, user-only content or embedded binary blobs to the model. Do not fetch resource links automatically.
- Bound and validate image input; report omitted/unsupported content and image normalization. A successful image cannot erase an error flag.
- Preserve `isError` through the tool, runtime events, history and restored conversation.
- Pass the Agent abort signal through approval, initialization wait and the actual call. Cancellation before dispatch sends nothing. Cancellation after dispatch sends a best-effort notification and reports an unknown external outcome. Other requests and shared initialization remain usable.
- Ordinary tool execution has no default deadline. Initialization/discovery and shutdown remain bounded. An optional request-level deadline is explicit and cancels only that request.
- Evict closed/broken connections and reconnect on a later use. Coalesce concurrent initialization. Never automatically repeat a sent tool call, including HTTP session loss.
- Replacing configuration/credentials or explicitly closing a connection invalidates pending initialization. A stale completion/close callback cannot replace or erase a newer connection. Application shutdown cannot leave a late initialized process cached.
- Settings report actual cached connection state without starting a process. Normalize remote connection keys consistently.
- Keep existing transport choices, trust and read-only policy. No OAuth, plugin installer or MCP Apps in this change.

## Tasks and checks

- [x] Result projection: add `tests/mcp/results.test.ts` for structured-only results, mixed text/images/error, audience restrictions, malformed/oversized images and resource fidelity; observe failures; implement `src/mcp/results.ts`.
- [x] Request lifecycle: add `tests/mcp/requests.test.ts` against paired SDK transports for calls beyond 60 seconds (virtual time), cancellation/late replies, concurrent requests, explicit deadlines and disconnect. Implement `src/mcp/requests.ts` through public transport/request contracts and retain SDK `callTool` validation.
- [x] Connection recovery: extend the shared fixture and add real transport tests for rich results, cancellation, process exit, HTTP session loss, no replay, replacement, shutdown during initialization and stale callbacks. Update `src/mcp/客户端.ts` and verify existing client tests.
- [x] Tool/runtime integration: change the obsolete success-on-error assertion, add abort/approval tests, and verify a real MCP failure and rich result through native Agent events, model context and history. Update `src/tools/mcp-tool.ts` and the runtime approval callback.
- [x] Settings/docs: cover remote status keys and failed/disconnected state in workbench tests; update the MCP user documentation.
- [x] Run focused MCP/tool/workbench/runtime checks and `npm run typecheck`; inspect the complete diff. Run relevant policy/provenance regressions after integration. Record commands and limitations for the local commit on `codex/mcp-reliability`.

## Validation commands

```sh
npx vitest run tests/mcp tests/tools/mcp-tool.test.ts tests/workbench/mcp-ops.test.ts tests/runtime/mcp-reliability.test.ts
npm run typecheck
npx vitest run tests/runtime/terminal-tool-error-history.test.ts tests/runtime/外部工具溯源.test.ts tests/runtime/analysis-route-evidence.test.ts tests/policy
git diff --check
```

All protocol fixtures use temporary files, subprocesses or loopback servers, with no credentials or external service calls. Passing these checks establishes the tested local behavior; it does not establish real-provider or installed Windows/Linux acceptance.

## Review additions

Independent source review identified and regression tests reproduced streaming POST lifetime, truncated response liveness, replacement generation ordering, discovery-close liveness and SDK-owned shared GET resumption. The final request adapter preserves explicit server-event-ID response resumption through GET, isolates its cancellation, rejects response streams that terminate without a result or a resumable event ID, and bounds repeated resumes with no new event ID. No `tools/call` is automatically replayed.

The workbench removal regression also exposed an existing last-server YAML bug when `mcp:` precedes another top-level section. Its bounded section scan is corrected with a dedicated config-writer regression.
