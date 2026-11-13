# Project Information Implementation Plan

> Execute inline in this session as requested by the user.

**Goal:** Show project identity and recent conversations in an accessible sidebar card.

**Architecture:** A focused ProjectInfo component owns delayed hover, explicit opening, positioning and dismissal. SessionSidebar supplies the full workspace task list and the existing navigation callback; ProjectActions exposes an optional information action.

**Tech Stack:** React, TypeScript, CSS tokens, Vitest/Testing Library, Electron Playwright.

- [x] Add failing tests in tests/ui/project-info.test.tsx covering search-independent count, chronological recent five, navigation, unloaded summaries, empty state, and keyboard/outside dismissal. Run `npx vitest run tests/ui/project-info.test.tsx` and confirm the information action is missing.
- [x] Create src/ui/project-info.tsx; add onInfo to src/ui/project-actions.tsx; replace only the active project row wrapper in src/ui/views.tsx. Derive recent entries from all local workspace tasks. Add translated labels in src/ui/i18n/en.ts and themed responsive styles in src/ui/styles.css.
- [x] Run `npx vitest run tests/ui/project-info.test.tsx tests/ui/project-actions.test.tsx tests/ui/sidebar-task-menu.test.tsx tests/ui/i18n.test.ts` and `npm run typecheck`.
- [x] Add e2e/project-info.spec.ts and run `npm run build` followed by focused Electron project/sidebar tests. Inspect screenshots in light/dark and narrow layouts. Review diff and retain work on the requested branch.
