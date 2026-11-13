# Project information validation — 2026-11-13

Branch: `codex/project-info-popover`, based on local main `504b804b`.

Implemented delayed project hover card plus “项目信息” in the existing project menu. Shows full workspace path, all unarchived local task conversations for that workspace, and the latest five by available activity date. Current session summaries supply titles/dates when loaded; unloaded summaries fall back to task title/creation date. Conversation selection uses the existing task navigation route. Project editing is omitted.

## Verification

- Red/green: four initial UI tests failed for missing information action/card, then passed. A further regression reproduced two simultaneous project dialogs, then passed after coordination was added.
- `npx vitest run tests/ui/project-info.test.tsx tests/ui/project-actions.test.tsx tests/ui/sidebar-task-menu.test.tsx tests/ui/sidebar-groups-persist.test.ts tests/ui/session-rehome.test.tsx tests/ui/i18n.test.ts tests/ui/session-row-context.test.tsx tests/ui/design-contract.test.ts`: **8 files, 137 tests passed**.
- `npm run typecheck`: passed.
- `npm run build`: passed. After final UI fixes, `npm run build:ui`: passed. Existing direct-eval and bundle-size warnings remain.
- `npx playwright test e2e/project-info.spec.ts e2e/delete-project.spec.ts e2e/sidebar-task-menu.spec.ts --output=output/playwright/project-info-final`: **5 passed**. Covers hover/pointer entry, keyboard explicit opening/focus restoration, viewport bounds, navigation, reload, outside dismissal, and existing project removal/sidebar actions.
- `git diff --check`: passed.
- Read-only code review reproduced and rechecked the single-card fix; no remaining confirmed issue reported.

Screenshots: [light](project-info-light.png), [dark](project-info-dark.png), [800×560 viewport](project-info-narrow.png). At widths ≤768px the existing application CSS hides the sidebar, so narrow-sidebar verification uses 800px. This feature does not change that breakpoint.

Complete local test artifacts, including the initial failed narrow-viewport attempt and its trace, are retained in the ignored `tmp/project-info-20261113/` directory. The initial test attempted sidebar actions at 720px; it was corrected after confirming the existing sidebar breakpoint.

This validation uses isolated Electron fixture data and mock providers; no production user data or external model calls are involved.

## Pre-merge recheck

The additional review reproduced and fixed three interaction issues:

1. A longer session title could increase card height without correcting its position. Positioning now observes card dimensions and visible content changes.
2. Changing the conversation count refocused the card, moving keyboard focus off its buttons. Initial focus is now independent of data and positioning updates.
3. Opening the project action menu, or re-entering the project row while that menu stayed open, could also display a hover card. Focus cancels the pending timer, and hover opening checks whether the project menu is expanded.

All three failures were reproduced in regression tests before their fixes. The focused UI suite now has **140 passing tests**. Type checking, whitespace checks, the full pre-review build, and the final UI rebuild passed. Independent review rechecked the menu re-entry, explicit opening, positioning, and focus fixes.

The new desktop data-update test distinguishes request/response renaming from background title events: it persists the title through `renameSession`, injects a mock model title push through the actual Electron preload channel, and creates a task through the real application operation. It checks the updated card's viewport bounds and preserved keyboard focus.

Final pre-merge desktop command: `npx playwright test e2e/project-info.spec.ts e2e/delete-project.spec.ts e2e/sidebar-task-menu.spec.ts e2e/sidebar-folds-persist.spec.ts --output=tmp/project-info-premerge-pass-20261113` — **7 passed**. Local artifacts from the review runs remain in ignored `tmp/project-info-premerge*-20261113/` directories.
