# DAWN Terminal CLI Interaction Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for the independent image viewport task; coordinate dependent CLI integration here. Track each task below.

**Goal:** Build a complete terminal Agent UI with a multiline editor, streaming Markdown, inspectable tools, scrolling and preserved desktop images/Shell handoff.

**Architecture:** A CLI-owned alternate-screen TUI uses the existing Agent controller operations; a separate desktop viewport image renderer uses scoped image IDs and cell coordinates. Keep the noninteractive CLI path and Normal Shell intact.

**Tech Stack:** TypeScript, pi-tui 0.86.0, xterm, Vitest/node-pty, Electron/Playwright.

## Task 1: Viewport image bridge (independent)

Files: src/ui/terminal-image-decorations.ts plus a focused src/ui/terminal-viewport-images.ts helper; tests/ui/terminal-viewport-images.test.ts. Do not touch CLI files.

- [x] Write tests for valid/invalid frames, layout coordinates, alternate-only display, scroll/resize cleanup, late image/cache failure, original re-read, teardown.
- [x] Run failing tests. Contract: OSC777 `dawn-viewport;{"images":[{"id":"UUID","row":0,"col":2,"width":30,"height":7}]}`; all integers, within term rows/cols, at most24; empty frame clears. Legacy dawn-image handler remains.
- [x] Implement DOM overlay mounted inside xterm screen, separate from legacy normal-buffer decorations, with image reads guarded by lifetime and placement; no retained originals.
- [x] Run new and existing terminal-image-decorations tests. Parent handles integrated Electron and final commit.

## Task 2: Presentation components and editor

Files: src/cli/tui.ts, src/cli/tui-transcript.ts, src/cli/presentation.ts, package.json/package-lock.json; tests/cli/tui.test.ts.

- [x] Add failing headless-terminal tests using a fake pi Terminal and @xterm/headless: fixed input, Markdown, streamed content, widths, tool details and waiting questions.
- [x] Add direct pi-tui0.86.0 dependency without changing unrelated dependency versions.
- [x] Implement transcript nodes and alt-screen root: two-line header, primary follow-end ScrollView, Editor, status footer. Editor onSubmit routes through controller, Tab toggles tool expansion, Ctrl-C delegates abort/clear/exit.
- [x] Wrap ProcessTerminal writes to append viewport image frame after synchronized render completion; placements derive from transcript offsets, scrollTop and viewportHeight, never cover editor.
- [x] Use getNativeClipboard().setText for real copy or report unavailable; no fake success. Keep default foreground so bright/dark host remain readable.
- [x] Run component tests including long Chinese/code/table input and resize.

## Task 3: Agent integration and host keys

Files: src/cli/agent.ts, src/ui/terminal.tsx, src/ui/terminal-images.tsx; tests/cli/agent.test.ts; focused terminal key tests.

- [x] Extend actual-PTY fixture for multiline paste, streaming before idle, stop/continue, editor history and stty restoration. Verify red first.
- [x] Replace interactive readline presentation with TUI; retain noninteractive readline lifecycle. Route text/tool/image/notice/question/permission/idle events to presentation; keep transport and native operations.
- [x] Restore raw mode and alternate screen on /exit, SIGTERM, EOF, socket exit and error. Input busy state never silently sends a second turn.
- [x] Only DAWN mode remaps Shift+Enter to CSI13;2u, leaving Normal/external terminals alone. Preserve image paste handling and existing context return.
- [x] Run actual-PTY tests plus desktop CLI, images and state navigation Electron suites.

## Task 4: Review, runtime and records

Files: e2e/terminal-cli-interaction.spec.ts; docs/reviews/2026-10-24-terminal-cli-interaction.md; docs/DEVELOPMENT_HISTORY.md; artifacts/terminal-cli-interaction/.

- [x] Add deterministic Electron cases for new input, streamed transcript, tool expansion, scroll/follow, images in the alternate buffer and mode return.
- [x] Run typecheck, full build, all unit tests and relevant terminal Electron suites; fix failures with reproduced causes.
- [x] Review spec compliance then code quality, including lifecycle cleanup and missing image/cache cases.
- [x] Open isolated real Electron from this branch with existing configured model; verify 900x700 and larger bright/dark views, paste/drop and context return; keep main preview/profile separate.
- [x] Record evidence, normalize logs, scan only added source/docs/logs for credentials and prohibited reference naming. Initial preview stage: commit branch only, without merge/push/package/install. After user acceptance, the user explicitly authorized a verified local-main integration; track that follow-up in docs/reviews/2026-10-24-terminal-cli-main-review.md.
