# MCP reliability verification — 2026-10-29

Branch: `codex/mcp-reliability`, based on local `main` at `83f0bf91`.

## Delivered behavior

- The MCP layer preserves the original server envelope. Model projection retains text, structured facts, validated PNG/JPEG/GIF/WebP images, resource links and embedded text. It excludes App-only metadata, explicitly user-only content and embedded binary blobs, and reports unsupported/omitted content.
- Server errors remain errors in live native Agent events, model context, persisted receipts and resumed conversation history. Native Stop cancellation also leaves an error receipt with the unknown-outcome explanation.
- Ordinary tool execution has no default SDK deadline. Initialization, discovery and shutdown remain bounded. A caller can cancel before approval/dispatch, during shared initialization, during a tool wait or during HTTP response resumption without closing another caller's shared connection.
- Dead connections and incomplete response streams no longer remain cached as ready. Concurrent initialization is coalesced; configuration/credential changes replace stale connections. Generation ownership prevents late initialization or old-close callbacks from taking over a replacement or resurrecting a closed connection.
- Recovery never repeats an already sent tool operation. Explicit SSE event IDs retain response-only GET resumption, including the SDK's shared GET stream used for HTTP 202 responses. A pending response can be cancelled independently. Repeated resumption with no new event ID is bounded; missing results produce an unknown-outcome error.
- Workbench connection state uses consistent remote keys and exposes failed/disconnected state. Disable, removal and credential edits close existing scopes; stale sessions cannot resurrect removed/changed configuration. Reconnected tools with changed input schemas/read-only declarations require a newly loaded session.
- The last-server YAML removal path correctly stops scanning at the next top-level section.

## Automated evidence

Final targeted regression command:

```sh
npx vitest run tests/mcp tests/tools/mcp-tool.test.ts tests/workbench/mcp-ops.test.ts tests/config/mcp-writer.test.ts tests/runtime/mcp-reliability.test.ts tests/runtime/terminal-tool-error-history.test.ts tests/runtime/外部工具溯源.test.ts tests/runtime/analysis-route-evidence.test.ts tests/runtime/execution-boundary.test.ts tests/runtime/plan-mode.test.ts tests/policy
```

Result: **21 files, 411 tests passed**, exit 0.

Additional final checks:

```sh
npm run typecheck
npm run build
git diff --check
```

Type checking and the full Electron/CLI/UI build exited 0. The build reports direct-eval warnings in the untouched browser tool and a UI chunk-size warning. They did not fail the build. No package/version changes were made.

Tests use the official SDK, real local stdio processes and stateful loopback HTTP/SSE services. The no-default-deadline regression advances virtual time beyond 60 seconds; it does not wait minutes in real time. The native runtime tests drive actual tool dispatch with an offline model stream substitute rather than contacting a model provider.

Independent code review was read-only. Its concrete findings were checked against the installed SDK and covered with red/green regressions, including flushed SSE headers, EOF versus abrupt disconnect, stale replacement shutdown, immediate discovery closure, mixed-case media types, response-only resumption, shared HTTP 202 delivery, and JSON-RPC error tokens that must not trigger a later response-resume GET.

## Acceptance limits

This is local source/build acceptance, not a run against a real external MCP service or API account. At the initial branch verification, no external writes, publication, deployment, installed-app replacement, merge or push were performed. The subsequent local merge is recorded below. Native Windows/Linux installation and real-provider authentication were not exercised. MCP OAuth, a plugin installer, MCP Apps, and independent resources/prompts browsing remain outside this change.

Cancellation and a lost response never establish that an external operation stopped or rolled back. Check the server's state/receipt before issuing another write.

## Pre-merge review and local main acceptance

A second independent review of `61898078` identified concrete stream and configuration gaps. Follow-up commit `9177ef6b` fixes them and the additional large-image validation defect:

- A shared HTTP 202 response stream that ends after returning only some results now settles remaining calls as unknown instead of leaving them waiting indefinitely. A later call establishes a new connection; no tool operation is replayed.
- Abrupt socket failure on a token-bearing POST stream or an SDK-owned shared GET stream now reaches safe GET resumption. Regressions distinguish actual socket failure from clean EOF.
- Initialization checks the original workspace's current configuration before caching. Dispatch checks it again after awaiting initialization, preventing an externally removed or changed project server from being invoked.
- A valid image near the 5 MiB limit no longer triggers a stack overflow in grouped base64 validation. Image decoding, dimensions, MIME checks and byte limits remain enforced.

The new regressions failed before their fixes. Independent read-only follow-up review found no remaining blocking issue.

Local `main` was fast-forwarded from `83f0bf91` to `9177ef6b`. The same regression command above was then repeated on merged `main`: **21 files, 416 tests passed**, exit 0. `npm run typecheck`, `npm run build` and `git diff --check` also passed. The build retained the existing direct-eval and UI chunk-size warnings described above.

No push or other remote mutation was performed. External-service, real-provider and native-platform acceptance limits above still apply.
