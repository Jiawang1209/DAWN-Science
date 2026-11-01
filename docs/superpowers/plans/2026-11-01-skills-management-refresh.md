# Skills Management and Refresh Implementation Plan

**Goal:** Complete installed Skill inspection, tags, bulk mode controls, live session refresh and dock refresh controls.

**Architecture:** Extend the existing workbench protocol/backend and React settings surface. Use bounded read-only package access and local tag overrides. Refresh the native Skill resource index without recreating sessions or changing tools.

**Tech Stack:** TypeScript, React, Zod, pi agent SDK, SQLite settings, Vitest, Electron.

1. [x] Add failing temporary-package tests in `tests/skills/installed.test.ts` and backend checks in `tests/workbench/skill-ops.test.ts`. Implement `src/skills/installed.ts`, `src/protocol/skill-management.ts` and backend operations. Verify nested text, binary/size notices, traversal/symlink rejection, tag inheritance/reset and partial bulk results.
2. [x] Add failing offline native/session refresh tests. Extend `src/runtime/types.ts`, `src/runtime/native.ts`, `src/session/manager.ts` and backend wiring. Prove newly added/disabled/deleted skills update the current prompt without losing history, tools or session identity; reject busy and unsupported runtimes.
3. [x] Add failing installed Skill UI tests. Implement detail and file views, tags/search/filter, checkbox bulk management, catalog refresh and current-session refresh. Wire through `src/ui/App.tsx`, add scoped styles and English strings. Check stale asynchronous replies and navigation.
4. [x] Add regression tests for dock refresh, implement visible file and artifact refresh actions including the delivery wrapper, and verify loading/errors without dropping preview/navigation.
5. [x] Update `docs/skills.md`, run focused tests, i18n checks, typecheck and build; perform visual verification and review the complete diff. Keep work on `codex/skills-management-refresh`; do not publish, release or replace the installed application.
