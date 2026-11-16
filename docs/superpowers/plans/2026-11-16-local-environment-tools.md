# Local environment tools implementation plan

Approved scope: R then Python first, preserve their current picker/save mechanism. Add optional uv, pixi, Conda, Mamba, Node.js, npm, Git with automatic discovery, candidate selection, manual full paths, validation and local persistence. Existing selections survive detection. Missing tools never prevent startup or chat. Homepage remains a design discussion, not an approved implementation.

Architecture: share a protocol-level tool registry and result schemas. Backend probes settings/PATH/common locations with bounded version checks, saves per-tool settings, and applies configured paths to local subprocess execution. Bundled Electron/Node adapter semantics remain intact. UI has interpreters first and separate compact environment/development tool groups with one consistent save model. First mount detects once; refresh does not discard drafts. No installation or environment creation.

## Tasks
- [x] Shared protocol: `src/protocol/local-tools.ts`, operations `getLocalTools`, `probeLocalTools`, `setLocalTool`; mock handlers in the same change.
- [x] Backend: registry-backed probing, valid executable path persistence/clear, truthful missing/failed statuses, settings integration and effective local execution environment. Tests first for invalid paths, saved precedence, timeout, per-tool isolation and real configured invocation.
- [x] UI: `src/ui/local-tools.tsx`, R before Python in settings and wizard; preserve InterpreterPicker. Automatic probe and tool choices/save/error states. Race/unmount/draft preservation tests. English translations.
- [x] Verify: related tests, typecheck, full build, isolated Electron settings interaction, narrow layout and restart persistence. Prepare branch experience without changing main or user data. Review spec and code quality before delivery.

## Protocol contract
`LocalToolId` = uv | pixi | conda | mamba | node | npm | git.
`LocalToolCandidate` = {path:string, source:settings|PATH|common, version?:string, problem?:string}.
`LocalToolResult` = {id:LocalToolId, candidates:LocalToolCandidate[]}.
`LocalToolState` = {paths:Partial<Record<LocalToolId,string>>, tools:LocalToolResult[]}.
`getLocalTools({})` returns `{paths}` only, without executing tools.
`probeLocalTools({})` returns `LocalToolState`; probe never changes persisted choices.
`setLocalTool({tool:LocalToolId,path:string})` returns `{paths}` after validation and save. Empty path clears. Error is surfaced; valid stale stored path is shown by probe as failed candidate.

Registry `LOCAL_TOOLS` entries = {id,label,group:environment|development,description:string}; R/Python are separate and unchanged.

## Approved first-run refinement (2026-11-16)
The user prefers a compact path overview and selected the small anchored popover. R/Python remain first; the settings picker stays unchanged. Only one tool editor opens at a time. Existing interpreter selection callbacks and all tool read/probe/save operations are reused. Detection never silently replaces saved choices. A failed save leaves the popover and draft open. File browsing uses the existing native picker; cancellation keeps the old value. Empty paths clear the selection. Escape/outside dismissal restores focus without ending onboarding.

- [x] Add `src/ui/local-environment-overview.tsx` with overview rows and one native top-layer popover; reuse InterpreterPicker inside R/Python popovers, with native browse and manual entry below.
- [x] Before implementation, add `tests/ui/local-environment-overview.test.tsx` for compact R/Python order, readonly detection, candidate save/close, failed-save preservation and native picker cancellation.
- [x] Replace the expanded fourth-step contents in `src/ui/setup-wizard.tsx`; retain its existing save/error and optional-enter semantics. Add token-based styles and translated labels.
- [x] Update existing wizard tests/E2E to open the Python popover before choosing. Verify typecheck, UI contracts, related tests, build and Electron first-run use. The prior frozen baseline passed all 766 Node/UI test files (7585 passed, 10 skipped), plus 13 Electron E2E cases.

## Workbench entry and horizontal fit (approved 2026-11-16)
- The workbench button returns to the four-step guide, not the App homepage (explicit user reply). Reuse `打开首次引导`; do not reset credentials, interpreter/tool selections or conversations.
- Keep all four guide pages free of horizontal scrollbars. Correct Row margin/width overflow at its source; keep full paths in the popover and truncate only the compact overview. Restore focus with preventScroll.
- First reproduce both in Electron: missing guide button, and environment page scrollWidth greater than clientWidth. Then verify guide revisit preserves read-only credential metadata and all environment choices, and row/popup focus never scrolls the page horizontally.

- User placement correction: the guide button belongs in the bottom status row immediately before the version. A reproduced E2E also showed revisiting the guide discarded unsent text; render the guide as an independent overlay while keeping the workbench subtree mounted, including active sessions.

- Final button label is exactly “导航栏”. Remove the whole-shell language key and the guide opener's view switch: reopening and changing guide language must not remount the background editor or lose an unsaved schedule form. Both preservation failures were reproduced in Electron before the fix.

## Final verification
Final UI run: 239 files / 2317 tests passed. Final real Electron run: 15 cases passed. Full build and final typecheck passed; independent final reviews reported no remaining actionable P1/P2 findings. Validation details: `docs/validation/local-environment-tools-20261116.md`. Main is unchanged; the feature remains on its isolated branch.
