# Terminal question presentation — 2026-10-25

Branch: `codex/terminal-plan-mode`, following `29ea5f97`. No merge, push or installed application replacement.

## Problem and scope

The terminal previously printed question titles, every choice and descriptions through the generic yellow notice renderer. Replies were deliberately excluded from normal user messages, but no structured answer summary replaced that omission. Consecutive questions therefore ran together and the user's selections disappeared from view. Restored native question records were also ignored by the terminal renderer.

Reuse the existing `QuestionRecord`, `QuestionAnswer`, native answer operation and persisted history. This change only improves the terminal presentation/controller; it adds no parallel agent engine, question store, backend operation or dependency.

- One transcript block per request, updated in place. Only the current question shows choices; earlier questions retain compact chosen-answer summaries. The block shows current question number and single/multiple/text input type.
- Choice labels use normal emphasized text, descriptions are dim and indented, and choices/questions have blank-line separation. Narrow CJK wrapping remains bounded by terminal width. Existing numeric/comma-separated and custom-text entry is retained.
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

## Actual preview

Reused the running isolated branch Electron profile and retained the user's original research terminal/session. CLI code loads from the updated branch build in the newly opened **terminal 2**; the existing backend already provides the unchanged question operations.

Created `终端提问 · 交互试用` using configured `deepseek/deepseek-flash`. The real model was asked only to call the question tool with a single-choice question, a multiple-choice question and a text question, without reading/writing files or running code. Selected the first demonstration choice and left **question 2/3 pending** for user trial, with the first choice visible above it. The original analysis remains in terminal 1. Native window/process and isolated profile are unchanged.

Session: `5b404d13-d89a-4a24-8446-96c32c9b20d4`; terminal: `edde3979-261a-4340-834d-c8d2517cff7a`.

Evidence root: `/Volumes/RPython/DAWN-previews/terminal-plan-20261025-8xyFk9`. Inspected `questions-first.png` and `questions-multiselect.png` at the actual 1512×852 window size. Logs retain the red run, related tests, typecheck, build, existing Electron regressions and corrected new Electron regressions.

## Product direction discussed, not implemented

The user clarified that people generally use **one** presentation style, rather than needing synchronized side-by-side panels. Recommended positioning is one DAWN product with conversation and terminal work styles, selectable as primary entry points and remembering the user's preference. This is a future entry/layout decision; this patch does not redesign the home page or add forced switching.
