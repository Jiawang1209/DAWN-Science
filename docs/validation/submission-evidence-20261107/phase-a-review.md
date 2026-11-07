# Phase A review and evidence

Implementation: task tool results append a separate `[task_tool_evidence]` text block with host call ID, tool name, status, observed execution, input path and up to two written paths. Pi child and managed Native Bot use the same helper. The host evidence record is captured before appending metadata; actual source text, execution observations and effect gates are preserved.

Rejected submissions return JSON with `recorded:false`, a bounded error, up to 12 Zod field issues, frozen access/result/review requirements, inputs/outputs/read requirements (first 16), and the latest eight actual task evidence records. Omitted counts and truncated fields are explicit. String limits budget JSON-escaped UTF-8 bytes, so control characters and Chinese paths cannot inflate the projection indefinitely. No command or full result is included. IDs come from host calls; model fields cannot add records. Older complete IDs remain valid even when absent from the latest catalog.

TDD evidence:
- `phase-a-red.txt`: six feature tests fail before implementation (23 existing tests pass).
- `phase-a-native-red.txt`: Native host-visible label test fails before wrapper update.
- `phase-a-bounds-red.txt`: escaped/control-character fixture exceeds 32 KiB before byte-aware clipping (91,153 bytes).
- `phase-a-regression.txt`: final nine-file targeted run, 112 tests pass.

The regression command covers task submission/contract/tools, Native orchestration and route gates/evidence, child task and executor, and legacy Team contract integration. Existing cancellation, pending-tool drain, acceptance validation, committed freeze, authoritative cloning and attempt counts remain covered.

`phase-a-example.ts` generates `phase-a-tool-feedback-example.json` using a real Pi read tool directly, without any inference. `e2e/submission-feedback.spec.ts` is the actual Electron/Pi-child fixture for the unified root run: invalid forged review ID, visible host feedback, corrected actual ID, accepted durable receipt, input bytes preserved. Its resolver accepts one untruncated host label only, cross-checking the tool result ID; missing/ambiguous references fail loudly. The e2e writes `phase-a-model-visible-example.json` only after it passes.

Scope limits: actual scientific correctness is not established by tool completion or these software fixtures. No real inference request, commit, push, release, installed-app replacement or formal app data change was performed by this phase. The latest catalog is a bounded display; truncation never creates scientific evidence.

## First desktop fixture failure and correction

The initial real desktop run ended with a failed child: `duringTask` only accepted string user content while Pi also sends arrays of text blocks. The shared fixture therefore skipped all child tool calls and supplied its canned final reply without a formal submission. The original screenshot, trace, error context and exit diagnostics are copied to `phase-a-first-desktop-failure/` before any rerun. This was a fixture defect; production evidence and policy code did not require a change.

The correction reuses the existing fixture text normalizer for the latest user message. `phase-a-fixture-shape-red.json` reproduces the mismatch, and `phase-a-fixture-shape-green.json` verifies equivalent string and text-array instructions across tool-result turns. Two Playwright regressions also cover content shapes and rejection of missing, forged or ambiguous evidence references. Actual desktop rerun remains owned by the root task after its unified rebuild.

## Second desktop assertion failure

The second run passed the child completion assertion and durable host receipt assertions, including `accepted`, two submission attempts and one invalid submission. The remaining assertion could not find the model-visible feedback because the test read `request.messages`; the shared mock server stores each request as `{url, body}` (`scripts/mock-inference-server.mjs:500`). The test now reads `request.body.messages`. A local envelope regression is preserved in `phase-a-request-shape-regression.json`; the second desktop error context, screenshot and trace are saved as `phase-a-second-desktop-*`. This is an assertion-only fixture correction; no production code or wait budget changed.
