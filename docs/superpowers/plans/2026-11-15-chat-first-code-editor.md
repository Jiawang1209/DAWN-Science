# Chat-first Side Code Editor Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the bounded filesystem task and review; execute UI integration in this session. User explicitly requests the existing `codex/ide-capability-research` branch, so keep its clean working directory rather than creating a different branch/worktree.

**Goal:** Open editable scripts beside the current conversation on demand, save files with conflict detection, and run the selection or entire draft through the existing session kernel.

**Architecture:** A renderer-owned document store retains drafts across closing the panel and switching sessions. A small React context offers conversation code blocks and script previews an editor-open callback without another chat renderer. A dedicated editor component owns selection and exposes collapsed run output; backend document operations read full UTF-8 files and save against content versions. Keep other right-dock tenants intact and never auto-execute code.

**Tech Stack:** React, nanostores, existing protocol and local/remote filesystem executors, CodeMirror 6, existing R/Python `runInKernel` and notebook output records.

## Accepted scope

- Default remains the existing chat. A code block button or script-preview button opens the side editor.
- Current conversation is not duplicated or replaced. Closing only hides the editor; drafts remain for this application window, including across session switches.
- Files have path, saved text/version, draft text, language, selection, and execution snapshot. Conversation code starts as an unsaved document; save requires a workspace-relative path and must not overwrite an existing file without a version.
- Save verifies the original version, rejects binary/truncated/oversized content, preserves the draft on failure and reports conflicts. Local and remote targets remain explicit.
- Run uses selected text if nonempty, otherwise the full draft. Support Python/R in native sessions using the existing kernel operation; show an explanation for unsupported languages or session kinds. Record the returned cell ID and display its real outputs; errors and interruption remain visible. Editing after running marks previous results stale. No implicit save/run.
- No permanent file tree, variables dashboard, separate AI modification form or global code mode.

## Task 1: Versioned document protocol and filesystem behavior

Files: document operations in `src/protocol/file-browser.ts`, new `src/files/code-document.ts`, registration in `src/protocol/operations.ts`, handlers in `src/workbench/backend.ts`, protocol-version update as required; targeted protocol/files/backend tests.

Contract:
```ts
type Owner = { projectId?: string; sessionId?: string; connectionId?: string }
// Exactly one owner. Paths resolve using the authoritative owner/executor.
type ReadRequest = Owner & { path: string }
type ReadResult = { path: string; text: string; version: string }
type SaveRequest = ReadRequest & { text: string; expectedVersion: string | null }
type SaveResult = { path: string; version: string; bytes: number }
// readCodeDocument, saveCodeDocument; null version means create-only.
```

- [x] First add failing behavior tests: read exact UTF-8 bytes and hash, save with matching version, reject stale version without changing disk, create-only collision, oversized/binary input, explicit owner, remote conflict/failure.
- [x] Run targeted Vitest tests and confirm failures are missing capability.
- [x] Implement bounded reads, checked writes and error reporting, following existing browser-owner and remote executor conventions; avoid agent tool registration.
- [x] Run targeted tests and review protocol/backend changes before committing.

## Task 2: Document lifecycle and editor component

Files: new `src/ui/state/code-editor.ts`, new `src/ui/code-editor.tsx`, new context module, dependencies/lockfile, focused UI tests.

- [x] Add failing state tests: opening the same source preserves edits; closing/reopening preserves draft; independent owner/session scoping; a save completing after newer edits updates only the saved baseline; a late open/save/run cannot update a different document.
- [x] Implement immutable store transitions and capture the full document ID for async operations.
- [x] Add failing component tests for full/selected execution, save/new-path errors, collapsed output, unsaved draft, unsupported session/language, stale result and shortcut behavior.
- [x] Implement CodeMirror editor using product tokens and primitives, file path/save input for unnamed drafts, Save/Run/Close controls and conditional output. Respect IME composition and use the same save/run functions for buttons and shortcuts.
- [x] Verify targeted tests and typecheck.

## Task 3: Conversation and file entry points, actual backend wiring

Files: `src/ui/markdown.tsx`, `src/ui/script-preview.tsx`, `src/ui/App.tsx`, right-dock component/state and `src/ui/styles.css` as appropriate; integration tests.

- [x] Add failing tests verifying completed code blocks expose the editor action, incomplete blocks do not open partial code, script previews open with file identity, and the chat remains mounted while the editor opens/closes.
- [x] Provide the active owner/session context; use source identity so repeated opening never replaces modified drafts.
- [x] Add a code-editor right-dock tenant, opened only by explicit actions. Preserve all other tenant state; editor close returns to existing chat. Bind file read/save to document operations and run to the original session's `runInKernel`.
- [x] Use real transcript cell records/outputs and kernel status, including errors and interruption; avoid displaying previous-session outputs.
- [x] Verify related markdown, files, dock and notebook tests.

## Task 4: End-to-end verification, review and branch delivery

Files: focused Electron E2E test and `docs/reviews/2026-11-15-code-editor-verification.md`.

- [x] Run typecheck, UI/backend build and relevant Vitest suites.
- [x] Exercise actual Electron: open code from chat and preview, edit/save/read back from disk, selected execution and actual Python output, close/reopen without lost draft, stale-save conflict and session switching. Use mock model infrastructure; no cloud calls.
- [x] Inspect actual light/dark and narrow-layout screenshots. Fix regressions with tests before declaring completion.
- [x] Complete independent spec and quality reviews, resolve findings, run final checks and commit on the requested branch. Do not merge or push without user instruction.
