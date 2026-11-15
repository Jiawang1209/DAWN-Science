# Apply conversational AI revisions to the original script

> **For agentic workers:** Use superpowers:subagent-driven-development for the pure request/diff helpers and diff dialog, then independent review. The user explicitly requests `codex/editor-word-wrap`; keep this branch and workspace. No merge or push is authorized for this follow-up.

**Goal:** Carry a selection plus the entire current unsaved script into its owning conversation; review an AI reply as a diff, then apply it to that same draft as one undoable edit.

**Architecture:** Renderer-owned immutable edit requests bind a script snapshot, selection, scope and session to a local request ID. The existing composer receives a readable full-context prompt with a hidden request marker. Completed assistant code blocks are eligible only when their preceding user turn carries a known request for the current scope. A native diff dialog defaults to the requested full-script response and can explicitly treat a fragment as a selection replacement. Apply checks the original draft snapshot and active owner again, dispatches a CodeMirror transaction, and consumes the request; it neither saves nor runs.

**Tech Stack:** React, nanostores, CodeMirror transactions, jsdiff, existing transcript/cache and native dialogs.

## Shared contracts

`ScriptEditRequest`: `id`, `documentId`, `scopeKey`, optional `sessionId`, `language`, `label`, `baseline`, `selection` (CodeSelection), and `prompt`. Selection offsets are CodeMirror positions; helpers convert CRLF offsets when slicing the original bytes. Requests stay in this window, not global preferences.

Pure exports in `src/ui/code-editor-ai.ts`:

```ts
createScriptEditRequest(doc: CodeDocument, label: string, id?: string): ScriptEditRequest
scriptEditForReply(requests: readonly ScriptEditRequest[], items: readonly TranscriptItem[], scopeKey: string, replyId: string): ScriptEditRequest | undefined
scriptEditResult(request: ScriptEditRequest, code: string, mode: 'document' | 'selection'): string
scriptEditDiff(before: string, after: string): ScriptDiffLine[]
// ScriptDiffLine: {kind:'context'|'add'|'del';text:string;oldLine?:number;newLine?:number}
```

Full draft inclusion is explicit and bounded at 128 KiB; oversize is an error, never silent truncation. Use a fence longer than any source backtick run. Put the selected range and exact selection separately from full source; instruct AI to return one complete updated script, keeping unrelated code and using no filesystem/kernel tools. A random request marker is metadata, not a filename to execute. Match a real final assistant reply to the nearest real user turn; never use optimistic echoes, other sessions, older replies or unknown/removed markers. Preserve newline style. Bound diff work with jsdiff timeout; a failed/incomplete diff cannot be applied.

`CodeEditorDiff` props: `{request, code, onApply:(mode:'document'|'selection')=>void, onClose:()=>void, problem?:string}`. It computes and shows the exact candidate/diff, labels the source filename and selection, supports document vs selection mode, and requires an explicit apply. Native dialog provides Escape, focus trapping and focus restoration. Errors/unchanged candidates disable apply.

## Tasks

- [x] Helpers: write failing tests for complete unsaved context, exact selection, CRLF conversion, quote/fence contents, oversize input, real-turn association, unrelated/streaming replies, mode construction and bounded line diffs. Implement and run targeted tests.
- [x] Dialog: write component tests for mandatory diff review, scope choices, unchanged/failed diff and explicit apply/close. Implement native dialog with token-based additions/deletions and line numbers.
- [x] Store and editor: retain request/preview state, detect missing/stale/busy/consumed documents, expose prepare/review/check/complete methods. Apply through the mounted CodeMirror view as one isolated undo step; preserve identity, path, disk baseline/version and kernel association. Revalidate in the apply click, including composition/view text.
- [x] Conversation integration: extend the existing editing context with reply lookup/review; linked completed blocks show “查看差异” instead of creating a new script. Continue to support ordinary standalone code blocks. Send via the original composer; never auto-send or auto-apply. Hide or reject expired/window-lost requests clearly.
- [x] Verification: tests cover user edits during AI generation and while reviewing, repeated apply, request supersession, session switching, full and fragment replies, save conflicts and undo. Run typecheck, build, related unit/UI suites and real Electron E2E for bring/context → AI response → diff → same-file apply → undo/save/selected execution. Inspect narrow/light/dark dialog and preserve existing live drafts before refreshing the experience window.
- [x] Independent specification and quality review; fix findings and record evidence. Commit on this branch only.
