# Script connection, UI and startup main merge verification

## Integrated changes

- Previous local main: `3905202f`.
- Reviewed feature tip and fast-forward target: `51966ab39b7dfdce49bcb15a9a33db5bbe303f14` (`codex/editor-linked-script`).
- Local main fast-forwarded without conflicts. The source tree matched the feature tip immediately after merge. No push.
- Automatic scope-bound script connection and latest unsaved snapshots, explicit diff/apply into the original draft, and existing manual save/run behavior are retained.
- Connection controls stay in the IDE, with a compact header reopen entry when the IDE closes; no connection controls occupy the composer. Duplicate lower execution headings are removed while plots, text output and interruption remain.
- Standard-pipe handling consumes only stdout/stderr `EPIPE`, records it in the file log, and preserves other errors. Preview credential setup uses a separate encrypted profile store; no credentials/profile data are part of this Git merge.

## Premerge review and correction

Two independent read-only reviews covered state/context/reference processing and UI/startup/lifecycle. Review found a normal recovery regression: queue recall/stop/rewind restored the old full snapshot into the composer, then the copied-context guard refused resubmission. Historical Modify and arrow history also reused old generated context.

Corrected restoration to retain human instructions, existing input and session-specific images. Historical editing shows only the instruction; manual resend and arrow-recalled input capture the newest draft. Preparation/send failure appends the human edit back to the composer rather than losing it. Added six red-to-green unit/UI cases and an Electron case exercising queue recall → manual draft change → resend → diff/apply → historical Modify → fresh diff/apply. Streaming hold keeps that case busy without requesting code execution.

Both reviewers approved after correction. No remaining blocking findings.

## Validation evidence

- Pre-correction baseline: Node/UI 757 files, 7,500 tests passed, 10 skipped; typecheck/full build passed.
- Recovery correction: 149 tests across eight focused UI/state/design/i18n files passed; typecheck/UI build passed; three linked-script Electron cases passed, including the new recovery case.
- Post-merge main validation: typecheck and complete build passed. Node/UI: 758 files, 7,506 tests passed, 10 environment-dependent tests skipped. Real-kernel project: 12 files, 51 tests passed. Serial Electron: 26 cases passed, covering original-script diff/apply and undo, CRLF, wrapping, completion, single-row input controls, conversation switching, queue recall/stop, historical editing, startup, model failures, real Python/R execution, plot history/enlargement and PNG/SVG export.
- Commands: `npm run typecheck`; `npm run build`; `npx vitest run --project node --project ui --maxWorkers=4 --reporter=dot`; `npx vitest run --project kernel --reporter=dot`; serial Playwright selection of linked-script, code-editor-ai, code-editor-wrap, code-editor, code-completion, composer-single-row, plot-gallery, busy-gap, first-run-default and model-error specs.
- Test-generated screenshot changes were restored; reference images were not rebaselined.

Build reports the existing eval/chunk-size warnings; UI test fixtures retain expected diagnostics. Tests do not establish scientific validity or a production deployment. Real R/Python kernel checks validate execution and plot handling; cloud replies in automated Electron flows are mocked. Earlier real DeepSeek/R experience verification is recorded in `2026-11-15-linked-script-startup-repair.md`.

## Runtime and repository state

Existing main and branch experience processes were not restarted. Old hashed main UI assets were retained in ignored build output so the existing renderer can still load its dependencies. User drafts, kernel sessions, credential files and profile databases were not changed by this merge/review.

The feature branch/worktree is retained because the running experience app uses its build path. No branch deletion, push or release packaging performed. Association and unsaved draft state remain window-lifetime; complete context is capped at 128 KiB and pending/applied request histories are bounded.
