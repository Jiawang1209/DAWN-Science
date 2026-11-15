# Side editor completion

**Goal:** Continue the approved chat-first editor with local Python/R completion, without adding a permanent panel.

**Design:** Use CodeMirror's native Python scope/builtin/snippet sources. For R, combine its existing keyword/builtin list with parsed identifiers in the current document, excluding comments and strings (including raw literals). Automatic popup while typing; Ctrl+Space manually requests candidates; arrows navigate, Enter or Tab accepts, Escape closes. Tab retains indentation when no candidate is selected. No kernel execution, network call, or implicit save. Package/member inference and AI generation remain separate future capabilities.

- [x] Add failing interaction tests for Python/R builtins and document identifiers, string/comment suppression, acceptance/undo and Tab fallback.
- [x] Enable completion with a bounded R identifier source and themed popup; preserve editor lifecycle and IME handling.
- [x] Verify UI tests/typecheck/build and actual Electron keyboard interaction; review changes.
- [x] Preserve and restore the active experience-window drafts while updating its renderer; commit on the current branch.

Validation: 166 focused UI tests, typecheck and UI build passed. Two new Electron scenarios cover automatic/manual candidates, Tab/Enter acceptance, undo, indentation fallback, Python snippet field navigation, simulated composing Chinese text, comment suppression, and light/dark popup screenshots. All four existing editor Electron scenarios passed, including real file conflict recovery and real Python selection execution. A focused review found an incomplete-parse edge case; a regression failed before the fix and now passes. R candidate lookup conservatively returns no result when its bounded 20ms parse cannot classify the cursor.

Updated the existing isolated experience renderer, restoring every document, active scope, save path and chat input. Verified all draft text remained identical, prior Python output was retained, and manual completion displayed candidates in the actual window. Recovery copy is local at `/tmp/dawn-completion-recovery-20261115.json`.
