# Dock File Navigation Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task in the user-authorized `codex/dock-file-navigation` branch.

**Goal:** Implement the approved interactive design: navigate within and outside the project, preview files, retain navigation state, and copy the current absolute directory path.

**Architecture:** Add distinct filesystem-browser operations without changing existing workspace-relative operations. Reuse `FilesView`, directory trees and preview renderers, with a controlled navigation model held above width-dependent mounts. Identify browser locations by owner and absolute path; convert back to workspace-relative paths only for existing project operations.

**Tech Stack:** TypeScript, React, Nanostores, Zod, Vitest, Electron Playwright.

## Task 1 — Browser data access

- [x] Add filesystem tests in `tests/files/browser.test.ts`: list a sibling directory, preview its file, search recursively with existing limits, reject missing/nonregular files, and preserve `resolveInWorkspace` rejection for external paths.
- [x] Run `npx vitest run tests/files/browser.test.ts` before implementing.
- [x] Implement `src/files/browser.ts`: canonicalize browser paths relative to an initial workspace; list with `path` and `parentPath`; reuse bounded previews and filename search.
- [x] Add `src/protocol/file-browser.ts` schemas for owner (`projectId`, `sessionId` or `connectionId`), listing metadata and browser operations. Register these in `src/protocol/operations.ts` and bump the protocol minor version.
- [x] Implement backend operations `browseDirectory`, `readBrowserFile`, `searchBrowserFiles`, `openBrowserFile`. Resolve the initial workspace on the backend; adapt remote SFTP paths separately.

## Task 2 — Path semantics and memory

- [x] Add path tests for POSIX, Windows drive and UNC paths in `tests/ui/file-navigation.test.ts`; check absolute joins, ancestor paths and workspace-relative conversion.
- [x] Add memory tests for current directory persistence, invalid records and owner isolation.
- [x] Implement pure path helpers in `src/ui/file-navigation.ts` without Node dependencies. Persist `directory` in `src/ui/state/files-memory.ts`.
- [x] Add a navigation hook in `src/ui/state/file-navigation.ts`: validate target directory before changing location, preserve history on failed requests, ignore stale completions, reset on owner changes and keep history on width changes.

## Task 3 — Navigation UI

- [x] Add component tests in `tests/ui/file-navigation-bar.test.tsx` for breadcrumb navigation, editing/Enter/Escape, absolute path copying, rejected clipboard writes and copy feedback reset after navigation.
- [x] Implement `src/ui/file-navigation-bar.tsx` with back, forward, parent, editable breadcrumbs, visible copy-path button and project shortcut.
- [x] Connect controlled navigation to `src/ui/files.tsx`. Preserve directory expansion; add explicit directory-browse actions, preview-location action and source-aware operation availability.
- [x] Extend `src/ui/styles.css` using existing theme tokens and adapt long paths and narrow docks. Add English translations for new UI strings.

## Task 4 — Application integration

- [x] Connect browser operations in `src/ui/App.tsx`, preserving existing citation/artifact reads.
- [x] Scope stored navigation to project/session workspace/remote connection; use the session workspace for temporary sessions.
- [x] Convert browser selections and existing relative file selections consistently. Keep external files out of project-relative delete/reference operations. Keep remote upload/download semantics.
- [x] Test controlled `FilesView` navigation, nested folders and failed target requests; verify Markdown relative resources and root handling.

## Task 5 — Desktop acceptance

- [x] Add `e2e/file-navigation.spec.ts`: project child → parent → sibling → preview → copy → project; verify backend workspace unchanged and legacy workspace operation rejects the external file.
- [x] Verify location after widening/restoring, search, failed path entry and clipboard feedback. Capture light/dark desktop evidence in `output/playwright/file-navigation/`.
- [x] Run `npm run typecheck`, focused Vitest tests (filesystem, protocol, UI navigation/memory/preview/i18n), `npm run build`, and focused Electron navigation/preview regressions.
- [x] Review the final diff, update the proposal with implementation and verification status, and commit the completed branch locally. Do not push or merge without a request.
