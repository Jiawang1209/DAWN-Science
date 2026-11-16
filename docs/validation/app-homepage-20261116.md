# App homepage validation — 2026-11-16

Branch: codex/app-homepage. Base: 216dcdc0. Implemented the approved home design without the preview tool's adjustment control. No dependency, protocol, credentials, or backend persistence changes.

## Behavior

- A new window starts at home after the four-step guide. Same-window reload retains its page via window-scoped sessionStorage.
- Home reads real projects and recent sessions across projects, limits concurrent session reads to four, filters archived/terminal records, and shows explicit project/session read errors with retry.
- Project cards and native folder selection carry the directory into the first message. New ordinary tasks clear that directory intent.
- Returning home keeps the workbench mounted, preserving conversation input, attachments, side editor state and drafts. Reopening Navigation shows the existing four-step guide and returns to the originating page.
- Page generation guards stop delayed local/remote creation and runtime switching from pulling the user back from home. Existing command/file/review shortcuts can enter the workbench.

## Fresh verification

- `npm run build`: passed.
- `npm run typecheck`: passed.
- `node node_modules/vitest/vitest.mjs run --project ui --maxWorkers=4`: 240 files, 2,327 tests passed.
- `node node_modules/@playwright/test/cli.js test e2e/app-home.spec.ts e2e/setup-wizard.spec.ts e2e/local-tools.spec.ts e2e/setup-entry.spec.ts e2e/session-switch.spec.ts e2e/session-tabs.spec.ts e2e/model-switch.spec.ts`: 33 passed.
- `git diff --check`: passed before commit.
- Independently reviewed and fixed project directory propagation, initial project loading/error presentation, delayed navigation, and directory intent lifetime. Regression tests reproduced the failures before their fixes. Final reviewer reported no further confirmed P1/P2 issues.
- Inspected real Electron light and dark/narrow screenshots. The home content has no horizontal overflow at the tested 700px viewport.

Electron checks used isolated profiles and the shared mock inference server; no real model requests or user credential changes were made. Native R/Python plotting and Windows execution were not rerun for this UI change.
