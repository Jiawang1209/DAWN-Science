# Terminal planning verification — 2026-10-25

Branch: `codex/terminal-plan-mode`, based on local main `c9ee508f`.

## Behavior

- `/plan` enables the original conversation planning flag; `/plan question` enables before submitting only the question. `/plan off` exits without approving or executing; `/plan status` reads canonical state.
- Plan Markdown, version, status and exact approve/discard commands appear in the terminal. Answering requires the current proposed plan ID. The existing native backend remains responsible for approval, archive, version, lease, busy and permission checks.
- Approval sends the original shared execution instruction. Private desktop requests expose only the authenticated session's planning operations, not arbitrary config or session fields. Execution preserves unrelated pending image drafts.
- Conversation and terminal share the same plan card and planning flag. History restores plans and images; updated plans supersede earlier versions. Returning to the conversation retains editing and approval controls.
- Local commands do not become model messages or history questions. In-flight mutations block duplicate actions; stale reads cannot overwrite a newer result. Failed commands preserve drafts; an approved but unsent instruction is offered for retry without another approval.
- Footer retains model first and context last, shows planning/read-only state, and reports unreadable state explicitly.

## Automated verification

All commands ran in the feature worktree against the final production code:

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run build` | Passed; existing bundle-size/eval warnings |
| `npm test` | 496 files passed; 5,232 tests passed, 10 skipped |
| `npx playwright test e2e/terminal-plan.spec.ts e2e/plan-mode.spec.ts e2e/terminal-permissions.spec.ts e2e/terminal-empty-return.spec.ts e2e/terminal-history-resume.spec.ts` | 23 passed |
| `git diff --check` | Passed |

New tests first failed on missing canonical readback/private transport, command handling, plan rendering, slash completion, stale reads and unknown-state display, then passed after implementation. Controller tests cover busy/question/permission states, duplicate mutation, failed enable, unsent execution and later-draft preservation. Bridge tests reject cross-session/config fields and retain pending image attachments during execution.

Real Electron tests use the shared deterministic inference server with the real native backend and filesystem tools. They verify proposal → explicit approval → archived plan → execution output, original image context in the execution request, GUI edited approval, stale ID rejection, discard, read-only planning even with full access, close-last-terminal → reopen → history resume → return to conversation. Existing GUI planning and terminal permission/navigation suites passed alongside the new cases. No snapshots, guards or timeouts were relaxed.

## Actual preview

- Window: `DAWN Science · 先出方案 · 分支预览`.
- Renderer: feature worktree `dist/ui/index.html`; no installed application packaging or replacement.
- Reused the isolated preview profile after stopping the preceding main preview. Backed up both profile and native session records before starting the branch.
- Created a separate `plan-demo` workspace and `终端方案 · 试用` session using the already configured `deepseek/deepseek-flash`. Demo input is explicitly synthetic: two groups, six observations each.
- Sent a real `/plan` question requesting description and a boxplot plan only. The model read the CSV and submitted a five-section proposal. Canonical state is planning enabled and proposal pending; no results directory or analysis execution was created.
- Returned to the conversation, confirmed the same proposed plan card, reopened the terminal and confirmed the same proposal and commands. Inspected screenshots at 1512×852 and 900×700; input, plan and footer wrap visibly.
- Live-model approval/execution is deliberately left for user trial. Approval/execution was verified in the deterministic real-Electron tests above.
- Original conversation records and their pre-existing archive state remain intact. Original provider/credential file hashes are unchanged.

Local evidence root: `/Volumes/RPython/DAWN-previews/terminal-plan-20261025-8xyFk9`, containing launch metadata, logs, backups and screenshots. No merge or push; local main remains `c9ee508f`.

## Follow-up: one name for the planning feature

User approved keeping both mouse and `/plan` entry points on this branch, with the shared name **先出方案**, a muted `/plan` hint in the add menu, and a check when enabled.

- Renamed the current feature labels, slash/command menu text, status bands, terminal state, runtime config display name, translated keys and associated explanations. The `dawn.plan` identifier, values, approval flow and persisted plans are unchanged; historical documents are retained.
- The add-menu item keeps its `menuitemcheckbox` semantics and plain accessible name. `/plan` is muted, does not shrink, and the selected check uses the accent color. Unsupported sessions stay disabled and do not display a selected check.
- Updated shared unit and Electron coverage before implementation; the initial run failed on the old names. Added assertions for the shortcut and selected/unselected check, plus real-browser color and width checks.
- Final checks: typecheck passed; full build passed, then UI build passed after the final check-color CSS change; 303 related tests passed across 8 files; 17 real Electron cases passed across `plan-mode`, `terminal-plan` and `composer-layout`; diff check passed.
- Actual branch preview restarted using the same isolated profile. Opened the existing demo conversation, verified selected → unselected → selected through normal menu clicks, and left its original proposal pending. No new model turn or plan execution was sent. Screenshots inspected at normal size and 900×700; the menu remains within the window with no horizontal overflow.
- Preview evidence: `plan-label-on.png`, `plan-label-off.png`, `plan-label-narrow.png` and `plan-label-final.png` in the existing evidence root. Original provider/credential hashes remain unchanged. Main is untouched; no merge, push or installed application replacement.
