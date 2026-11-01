# Skills management and dock refresh verification

Date: 2026-11-01 (Asia/Shanghai)

Branch: `codex/skills-management-refresh`, based on `ec5d0565`.

## Delivered

- Installed package details and bounded read-only nested file browsing; rendered Markdown/source switching without HTML execution or remote image loading.
- Package tag inheritance, per-path personal overrides, reset, text/tag filtering and explicit selected-row bulk invocation changes with partial-failure reports.
- Separate catalog reload and current native conversation Skill refresh. Live refresh updates the SDK index/prompt without recreating the session, changing active tool names, or touching interpreters. Counts include subagent role aliases, which the status text identifies explicitly.
- Visible Files/Artifacts refresh actions, busy/error feedback, retained navigation and same-path preview content/scroll on refresh errors. Delivery catalogue polling tolerates slow responses and explicit-refresh races.
- Workbench protocol 8.38; existing online discovery and installation behavior retained.

## Verification performed

- `npm run typecheck`: passed.
- `npm run build`: passed. Existing direct-eval and chunk-size warnings remain.
- Focused Vitest run: 18 files, 248 tests passed. Coverage includes installed package access, FIFO rejection in a bounded child process, traversal/symlink guards, binary/size notices, tags and bulk failures, native live index/prompt/message/tool preservation and busy rejection, UI stale reads/filter changes, artifact/delivery refresh preservation, slow polling, protocol read-only restrictions, IPC, design contracts and i18n.
- `npx playwright test e2e/skills.spec.ts e2e/skill-discovery.spec.ts`: 14 passed. Real built Electron app with isolated temporary configuration and mock inference/GitHub services. The new scenario exercises details, nested resource browsing, personal tags without changing manifests, bulk manual mode, installing a local Skill after conversation start, explicit live refresh, the new name in the next model request, and both dock refresh controls.
- Visually inspected ordinary-width and compact detail screenshots, catalog and dock controls. Fixed a CSS class collision discovered during inspection and added a vertical-layout assertion.
- Independent spec and quality reviews passed after fixing optional tag metadata isolation, preview retention, FIFO blocking, vanished tag filters and slow polling.

This is local/mock validation, not a real-provider or remote-server acceptance claim. External agents continue managing their own Skills. Hidden/link resources and unsupported legacy layouts produce explicit inspection limitations without hiding the installed catalog. Refresh does not rewrite Skill instructions already present in historical conversation messages or discover unrecorded filesystem outputs as generated artifacts.

No push, release, installed-app replacement, user configuration cleanup or user data deletion was performed.
