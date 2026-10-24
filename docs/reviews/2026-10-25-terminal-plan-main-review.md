# Terminal planning integration review — 2026-10-25

Reviewed `codex/terminal-plan-mode` against local main `c9ee508f`. User authorized local integration after checks, followed by an actual main preview. No product-direction changes, remote push, packaging or installed application replacement.

## Final behavior reviewed

- Terminal `/plan` shares native planning, proposed versions, approval/discard and archived execution instructions with the conversation page. Only explicit current-plan approval starts execution. The private bridge stays scoped to its authenticated session; native permission, plan, lease and busy guards remain authoritative.
- Conversation entry, slash menu, status band and terminal use **先出方案**. The add-menu entry shows muted `/plan` and a selected check. No second planning implementation or store.
- Terminal questions preserve the earlier yellow numbered inline presentation. Choices within one question are consecutive rows; question blocks have one empty row; chosen/custom answers remain visible. Pending submission, accepted, cancelled and interrupted states stay distinct. Canonical history restores plans, questions and images.
- Return opens the actual Agent conversation. Empty terminal state, closing the last terminal, explicit reopen, legacy PTY navigation, and archived-owner recovery remain usable. Model and permission settings remain shared.

## Review findings

Reviewed production changes, exact session/plan identities, duplicate and stale operations, failed-write draft recovery, pending images, terminal-control sanitization, bounded rendering, protocol/mock contracts and history restoration. No production-code change was needed during this review.

One pre-existing Electron test still tried to open the hidden composer menu while the full-page terminal was active. Failure trace confirmed that obsolete interaction. Updated it to assert the approved flow: open from the menu, conversation input becomes hidden, return preserves its draft, reopen reuses the same terminal ID and a single tab. No timeout, visibility rule, screenshot baseline or product behavior was relaxed.

Added `e2e/terminal-plan-restore.spec.ts` to cover a pending proposal across closing the last terminal, history resume, return to the same conversation and explicit approval of that same version. It verifies planning remains read-only before approval, no early archive/output, one approved archive and the resulting real filesystem output.

## Verification

| Command/check | Result |
| --- | --- |
| `npm test` | 497 files; 5,238 passed, 10 existing skipped |
| `npm run typecheck` | Passed, including added/updated Electron cases |
| `npm run build` | Passed; existing bundle/eval warnings retained |
| All terminal suites plus planning, questions, composer, attachment, ACP and Bot interaction suites | Initial 129 cases: 128 passed; only the obsolete composer test failed |
| `npx playwright test e2e/composer-ready.spec.ts e2e/terminal-plan-restore.spec.ts` | 6 passed after correcting that test; 130 distinct Electron cases covered across these runs |
| `git diff --check` | Passed |

The real Electron cases exercise the shared deterministic inference server with the native backend, real shell/file operations, image transport and persisted history. Earlier real configured-model trials are documented in the plan/question verification records. No new live-model execution is required for integration.

## Local main handoff

Use fast-forward integration only, keep the feature checkout for recovery, rebuild from the primary main checkout and verify it there. Stop the preceding branch preview before reusing its isolated profile; back up profile and native `.dawn` session directories, and preserve the current draft/session baseline. The installed provider/credential source remains read-only.

Main preview entry, active commit, process, source renderer, original session/archive comparison, backups, screenshots and post-merge check logs are recorded under:

`/Volumes/RPython/DAWN-previews/main-20261025-plan-3yu1DQ`

`ready.json` and the task's `tmp/terminal-history-main-preview/active-profile.json` identify the final running preview after the handoff. The main launcher refuses any checkout whose actual branch is not main.
