# Side editor readability and indentation

> **For agentic workers:** Use superpowers:executing-plans to implement the following small continuation of the approved side editor design.

**Goal:** Make Python/R scripts readable in both themes and provide predictable indentation tools beside the existing chat.

**Architecture:** Keep CodeMirror and the window-owned document store. Add semantic syntax tokens, bracket completion, folding, explicit Python 4-space/R 2-space indentation, and a reversible “整理缩进” action for the selection or whole draft. This is syntax-aware indentation, not a full source formatter. Preserve comments, multiline string contents, line endings, drafts, undo, and explicit save/run behavior.

**Tech Stack:** React, CodeMirror 6, existing product tokens and translations.

- [x] Add failing editor interaction tests for indentation, undo, literal preservation and differentiated syntax colors.
- [x] Implement editor extensions, compact indentation action, light/dark syntax tokens and translations; document defaults in DESIGN.md.
- [x] Run focused editor/design/i18n tests, typecheck, UI build and Electron interaction checks in an isolated test profile.
- [x] Preserve any active experience-window draft before updating the running preview. Report verified behavior and limits.

Validation: 151 focused UI tests, typecheck, UI build, and four Electron scenarios passed. The desktop scenarios cover theme colors, indentation/undo, parentheses, folding, real file saves/conflict recovery, conversation drafts and real Python selection execution. Independently compared actual R parser trees before/after indentation for 12 raw-string quote/delimiter variants, including literal whitespace. Both ordinary and raw multiline string contents remain intact.

Bounded behavior: if a whole-document syntax tree cannot be obtained within 100ms, indentation conservatively leaves the draft unchanged. This action normalizes leading indentation; operator spacing and full-source formatting are outside this change.

Preview updated in the existing isolated experience window without restarting its backend. Captured all window documents and pending path/chat input before reload, then restored the original scope, draft, saved baseline, selection and execution record. Verified exact draft/selection equality, 14px code text, distinct syntax colors, and retained Python output; left keyboard focus in the editor. Draft recovery copy is local at `/tmp/dawn-editor-recovery-20261115.json`.
