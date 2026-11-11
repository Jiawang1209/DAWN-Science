# Composer consistency implementation plan

**Goal:** Keep complete input cards equal at different widths and restore native text context menus.

**Architecture:** Shared CSS owns fixed text geometry and a two-row footer. A small Electron template builder owns edit-state filtering; the main window owns native menu display. No renderer IPC is needed.

**Tech stack:** React, CSS, Electron Menu roles, Vitest, Playwright Electron.

- [x] Replace auto-growth expectations in `e2e/composer-sizing.spec.ts` and `e2e/side-session.spec.ts` with stable height, multiline scrolling and complete-card equality checks. Exercise actual dock dragging and narrow adapter controls. Run baseline build and verify these tests fail on the current code.
- [x] Add `e2e/text-context-menu.spec.ts`: intercept only native popup display, inspect the real Menu created from a real right click, verify menu roles and their editing behavior (on macOS, hidden tests call the corresponding Chromium command because native role dispatch bypasses MenuItem.click). Verify edit actions, disabled states, selected transcript copy and existing custom menus. Watch baseline fail because no menu is registered.
- [x] Update shared `.composer-field`, footer and narrow controls CSS; keep mirror layer typography and scrolling aligned. Use three visible text lines and two toolbar rows at every width. Run sizing and side-session tests.
- [x] Add `src/electron/text-context-menu.ts` and install it in `src/electron/main.ts` for every main window. Build native role items using Chromium flags; do not show an empty menu. Run native context-menu tests.
- [x] Run `npm run typecheck`, `npm run build`, related composer/clipboard/highlight/IME unit tests and Electron layout/paste/side-session/menu regressions. Inspect light/dark screenshots and record measured heights and limitations in validation notes. Review diff, commit only on the new local branch.
