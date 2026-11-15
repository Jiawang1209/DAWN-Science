# Continuous script association implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task.

**Goal:** Automatically associate a chat with the script opened in its editor, snapshot its latest unsaved text on subsequent composer submissions, and retain review/apply before any save or run.

**Architecture:** Window-lifetime association lives in the editor store, keyed by the full editor scope (session, workspace and connection). Entering a script editor automatically follows that document; read-only file previews do not change the target. Ending script connection unlinks and closes the editor. The composer prepares context synchronously before clearing input or optimistic echo; both echo and wire receive the same payload. Each linked submission records an independent baseline; responses are matched to their actual preceding user turn. No automatic filesystem or kernel action.

**Tech Stack:** React, nanostores, CodeMirror, Vitest, Playwright/Electron; no new dependencies.

### Task 1: Store and context generation
Files: `src/ui/state/code-editor.ts`, `src/ui/code-editor-ai.ts`, their existing unit tests.
- [x] RED: link without selection, apply then edit then prepare another submission, latest text/path, scope isolation, switch visible file without retargeting, unlink, stale baseline, oversized draft failure, explicit one-shot precedence, independent queued requests.
- [x] GREEN: `$linkedScripts` record; `linkScript(id,label)`, `unlinkScript(scopeKey)`, `linkedScript(scopeKey)`, `openLinkedScript(scopeKey)`, `prepareLinkedEdit(scopeKey,text):string`. Association stores documentId and fallback label. Reject unsupported scope/commands at integration boundary; never silently lose context on failure. Whole-script context supports empty drafts, LF/CRLF, safe fences and 128KiB cap. Preserve request association and manual preview/apply.
- [x] Verify with `npx vitest run tests/ui/code-editor-state.test.ts tests/ui/code-editor-ai.test.ts`.

### Task 2: Chat-first UI and send integration
Files: `src/ui/code-editor.tsx`, `src/ui/App.tsx`, `src/ui/views.tsx`, a focused linked-script UI component, styles, `src/ui/i18n/en.ts`, focused UI tests.
- [x] RED: editor opening links without a selection; visible composer association can reopen/unlink; ordinary submit context appears identically in echo/send; failure preserves original user input and attachments; queue uses prepared payload; slash/Bot commands and other-session composers remain unchanged.
- [x] GREEN: automatic editor activation and compact composer chip. Optional synchronous `prepareMessage` prop invoked after command handling, before optimistic clearing/echo. App guards current scope/session and native main conversation. Closing editor preserves link; opening another script editor retargets it, preserving the old draft. A linked request includes user instruction separately from full source so transcript can show instruction with a collapsed exact snapshot.
- [x] Verify targeted editor/composer/i18n/design-contract tests and typecheck.

### Task 3: Integration review and usable preview
Files: `e2e/code-editor-ai.spec.ts` or a new focused spec, `docs/DESIGN.md`, `docs/reviews/2026-11-15-linked-script.md`.
- [x] E2E: two linked rounds without reselection, manual edits between rounds, review/apply into original draft, stale refusal, detach returns to ordinary chat, close/reopen and session boundaries.
- [x] Independent spec review then quality review; resolve concrete findings.
- [x] Full build, node/UI tests and serial focused editor/composer/plot E2Es. Record actual validation and limits.
- [ ] Preserve all live dirty drafts/composer text before any preview restart. **Main remains untouched and five drafts were backed up; the isolated preview process is launched but awaits the user's macOS keychain authorization.** Keep real-model profile/credential source. Never auto-save user files. Launch verified branch only if state can be safely preserved; no merge or push in this task.

## Accepted UX refinement

The user explicitly preferred and approved “打开哪个，关联哪个”. There is no extra association button. `followEditorScript` runs at guarded editor entry points (source, selected file read, review and return); plain file previews do not retarget. The compact composer strip shows the current filename as a reopen button and `结束脚本联动` to stop. Closing only the editor preserves the association; ending connection clears it and closes the editor. Each session/workspace/connection has its own window-lifetime association.

## QA inventory

- Automatic editor activation, file switch and saved filename: unit/UI tests plus linked-script E2E.
- Latest draft across two turns and post-send stale refusal: state tests plus linked-script E2E.
- Identical snapshot used for echo/queue/send: composer tests; attachment path substitutions affect only instruction, never source. Reply binding compares exact immutable envelope.
- End connection, reopen, new chat isolation: UI/state tests and linked-script E2E.
- Diff/apply, word wrap, syntax/completion, keyboard undo, saved file protection and real R/Python kernels: existing focused E2Es.
- Literal markers, malformed/copied contexts, oversized drafts, removed attachment tokens and pasted `@` text: helper/composer regression tests.
- Visual QA: compact composer strip, collapsed per-turn source, full diff modal, light/dark and narrow editor screenshots. No reference snapshots updated.
