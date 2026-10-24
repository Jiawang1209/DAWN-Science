# Terminal question presentation — 2026-10-25

Branch: `codex/terminal-plan-mode`, following `29ea5f97`. No merge, push or installed application replacement.

## Problem and scope

The terminal previously printed question titles, every choice and descriptions through the generic yellow notice renderer. Replies were deliberately excluded from normal user messages, but no structured answer summary replaced that omission. Consecutive questions therefore ran together and the user's selections disappeared from view. Restored native question records were also ignored by the terminal renderer.

Reuse the existing `QuestionRecord`, `QuestionAnswer`, native answer operation and persisted history. This change only improves the terminal presentation/controller; it adds no parallel agent engine, question store, backend operation or dependency.

- One transcript block per request, updated in place. Visited questions retain their full original text and numbered choices, followed by the user's chosen-answer line. Future unanswered questions are not shown early.
- Preserve the original yellow numbered inline choice/description layout and tool name. Add blank-line separation between choices and question blocks, plus a normal-text selected-answer line. No added progress heading, checkbox/radio decorations or compact replacement of earlier questions. Narrow CJK wrapping remains bounded by terminal width. Existing numeric/comma-separated and custom-text entry is retained.
- Confirmed choices and custom text remain visible. Pending submission is distinguished from accepted answers; cancellation/interruption is not reported as acceptance. Failed submission restores the final input without overwriting a later draft.
- Duplicate pending events keep partial answers and current progress. History restores the original native question and accepted selections. Choices remain tool answers and never become new user-model prompts.

## Verification

- RED: new presentation/controller tests failed on missing structured rendering and missing answer visibility.
- GREEN: `npx vitest run tests/cli/question-presentation.test.ts tests/cli/agent-state.test.ts tests/cli/tui.test.ts` — **75 passed**.
- `npm run typecheck`, `npm run build`, `git diff --check` — passed. Build retains existing bundle-size/eval warnings.
- Existing Electron `user-questions` and `terminal-plan` suites — **9 passed**.
- New `e2e/terminal-questions.spec.ts` — **2 passed**, covering visible separation, single/multiple/custom answers, returning to the same GUI record, close/reopen/history restoration, and GUI cancellation reflected in terminal.
- The first Electron spacing assertion failed because DOM `innerText` collapses empty xterm rows. The test now inspects actual row children, retaining the required blank-row assertion. No product code, guards, timeouts or snapshots were relaxed for that test correction.
- Local review checked exact request identity, answer acknowledgement, late failure/cancellation, ANSI sanitization, bounded width, history compatibility and no extra model prompts from answer entry.

## Initial preview (superseded after user feedback)

Reused the running isolated branch Electron profile and retained the user's original research terminal/session. CLI code loads from the updated branch build in the newly opened **terminal 2**; the existing backend already provides the unchanged question operations.

Created `终端提问 · 交互试用` using configured `deepseek/deepseek-flash`. The real model was asked only to call the question tool with a single-choice question, a multiple-choice question and a text question, without reading/writing files or running code. Selected the first demonstration choice and left **question 2/3 pending** for user trial, with the first choice visible above it. The original analysis remains in terminal 1. Native window/process and isolated profile are unchanged.

Session: `5b404d13-d89a-4a24-8446-96c32c9b20d4`; terminal: `edde3979-261a-4340-834d-c8d2517cff7a`.

Evidence root: `/Volumes/RPython/DAWN-previews/terminal-plan-20261025-8xyFk9`. Inspected `questions-first.png` and `questions-multiselect.png` at the actual 1512×852 window size. Logs retain the red run, related tests, typecheck, build, existing Electron regressions and corrected new Electron regressions.

## Accepted scope correction: preserve the earlier overall appearance

The user rejected the first presentation and requested only small improvements on the original layout. Restored yellow text, numeric options with inline descriptions, the original tool label and input hint. Earlier questions retain their complete choices instead of being replaced by summaries. Only spacing and visible selected/custom answers remain as the presentation additions; history, acknowledgement and retry protections are retained.

Updated regression assertions first failed against the rejected layout, then passed with the restored layout: 75 related tests, typecheck, CLI build, two Electron question cases and diff check. The tests explicitly require original inline options to remain visible after advancing and prohibit the added progress heading.

Actual preview is now **terminal 3**, session `f4126ea4-cf38-44e1-8fa6-ece534a01015`, terminal `6127a45d-4e61-4c9d-9aa5-78ff8a101792`, titled `终端排版 · 对比试用`. The configured real model asked two choices without executing analysis. The first demonstration choice was selected so the retained complete options and selected-answer line can be compared; the second question remains pending. Inspected `questions-original-style.png` in the same evidence root. The original research terminal and terminal 2's unsent user draft remain untouched. Product direction changes are deferred at the user's request.

## Final spacing adjustment

User approved adjacent option lines within a question, exactly one blank line between question blocks, and retained selected results. Removed only the per-option blank line and reduced the two-blank question separator to one. Original colors, labels, inline descriptions and selected-answer behavior remain intact.

Added exact row-sequence assertions before implementation; they failed with the previous spacing. Final results: 75 related tests, typecheck, CLI build, two real Electron question regressions, and diff check passed. Tests check adjacency after wrapped descriptions and exactly one empty row before the next question, as well as return/history behavior.

Actual preview reused **terminal 3 and the same `f4126ea4` session**, with no new preview window or additional terminal. Completed the demonstration answers without analysis execution, then reopened its saved history using the new CLI build. Inspected `questions-tight-spacing.png`: both choice pairs are consecutive lines, selected results are retained, and question blocks are separated by one empty row. Original analysis and the unsent draft in terminal 2 remain untouched. No product entry changes, merge, push or installed application replacement.

## Product direction discussed, not implemented

The user clarified that people generally use **one** presentation style, rather than needing synchronized side-by-side panels. Recommended positioning is one DAWN product with conversation and terminal work styles, selectable as primary entry points and remembering the user's preference. This is a future entry/layout decision; this patch does not redesign the home page or add forced switching.
