# C3 outcome workbench candidate

Candidate frozen 2026-11-07. C3 implementation and related verification are complete; independent SPEC/quality review and root full Node/UI checks are separate gates. No commit, merge, push, release, installed-app replacement, credential/config change, or formal database action was performed.

## Result

The conversation strip and workbench now project the same overall outcome. The dock shows the team goal (or an honest standalone-session label), explicit pipeline stage, outcome, blocker, inspection navigation, accepted stage/final artifacts and host version locators, then host budget facts. Inspection selection cannot replace the overall batch/pipeline outcome.

The expanded native dialog uses a compact outcome header with a closed version/inspection disclosure, so the network and roster are initially visible. Under 300px panel width the dock explicitly presents a condensed summary and the existing Expand action. The 900px default three-column layout is a condensed summary, not a claim of full detail readability; the native focus dialog is measured above 700px for its outcome content.

Artifact cards retain the exact selection/version data while showing short SHA/bytes by default. Full SHA and execution/attempt locators are in a separate disclosure; current-file previews remain explicitly current. Stage artifacts pending review, final acceptance, disk history, unverified results, stopping, cancelled/unverified drain, route-sync issues, and read failures have distinct presentation.

## Changes from the C2b source snapshot

Only these eight source paths differ (seven changed plus one new; 620 other prior source files are identical):

- `src/ui/collaboration-outcome-panel.tsx`: decomposed outcome presentation, artifact cards/disclosures, compact dialog header, narrow summary, host-only budget display.
- `src/ui/run-overview.tsx`: overall outcome projection, exact-target navigation, owner/unmount-safe queued focus, team/read alerts, explicit legacy separate-team hint; preserves existing four tabs, roster, workflow, history, budget controls and previews.
- `src/ui/collaboration-summary.tsx`: shared outcome selector for the conversation strip; ordinary admission blocking does not imply existing execution stopped.
- `src/ui/styles.css`: Dawn-token styles and bounded container-responsive summary, without a global minimum width or theme replacement.
- `src/ui/i18n/en.ts`: matching English catalog and removal of unused progress strings.
- `src/ui/collaboration-model.ts`: cancelled/drained wording requires positive matching epoch and drained phase; otherwise drain is unverified.
- `src/ui/collaboration-outcome.ts`: explicitly authorized navigation-only extension: final accepted pipeline CTA targets the exact proven analysis producer; accepted combinations prefer the first actual artifact producer. Acceptance proof/state logic is unchanged.
- `src/orchestration/service.ts`: explicitly authorized observation-only extension: active external cancellation invalidates its persistent observation after controller abort before the active early return. It does not advance the execution waiter generation or change cancellation, locking, accounting, refunds, or timeouts.

Added UI regressions are in `tests/ui/collaboration-outcome-panel.test.tsx`; selector/model/service tests cover the narrow extensions. Existing legacy fixtures remain legacy; receipt summaries were not promoted into fabricated current proof. New actual cases are `e2e/collaboration-outcome.spec.ts` and `e2e/collaboration-stopping.spec.ts` (the latter's actual title explicitly claims cancellation/drain, not a stopping screenshot).

## Initial frozen actual-Electron verification (preserved)

- Focused UI: **114 passed / 6 files**, including catalog checks; `evidence/c3/c3-ui-freeze.log`.
- Focused orchestration service: **15 passed**, including gated cleanup, immediate stopping observation, unchanged waiter revision and later drained notification; `evidence/c3/c3-active-abort-final.log`.
- `npm run typecheck`: passed; `evidence/c3/c3-typecheck-freeze.log`.
- `npm run build`: Electron, CLI and UI passed; existing bundle-size warning remains; `evidence/c3/c3-build-freeze.log`.
- Final related built-Electron suite: **8 passed (1.0m)** on one frozen build; `evidence/c3/frozen-electron.log` and `evidence/c3/frozen/playwright/.last-run.json`.

The final eight cases comprise the two outcome cases (pass and blocked), actual owned CLI cancellation/drain, the existing collaboration workbench case, science pipeline pass/revise/blocked, and existing submission/evidence/preview case. They exercise real host tools, process ownership, files and receipts through deterministic localhost inference fixtures. They do not call a real model API and are not scientific validation.

The final run retains all original fixture isolation and strict shutdown checks. Eleven owned Electron processes all exited with OS code 0, and no application diagnostic recorded drain timeout/failure, async failure or fallback. Protocol close and OS exit are retained independently in `evidence/c3/frozen/exit/`; the parsed inventory is `evidence/c3/frozen-candidate/integrity-and-exit-summary.json`.

Source and build were hashed before the final run and verified unchanged afterward:

| Manifest | Files | Manifest SHA256 |
| --- | ---: | --- |
| `evidence/c3/frozen-candidate/src-sha256.json` | 628 | `4333f339434ecdc261560534e591d45ca8cd62ffe048be371da5d39de8fcf184` |
| `evidence/c3/frozen-candidate/build-sha256.json` | 624 | `a1515c1e0e246bfcd600dcfbe057e7f2480c5995adeead223a4481c3ca040b88` |

`tests-sha256.json` records the related test source. Every new outcome capture has metadata containing the persisted fixture checkpoint and the actual public `getRunOverview` response.

## Full-suite remediation candidate

The root full Node/UI run on the initial frozen candidate found **6 failures, 6721 passes and 10 skips across 662 files**. The untouched first output is preserved at `evidence/c3/full-suite-remediation/full-node-ui-first.log`.

- The design contract correctly rejected the two new literal font weights. They now use the existing `--dawn-weight-medium` and `--dawn-weight-semibold` tokens, whose existing values are 500 and 600. The contract was not weakened.
- The five App MVP event tests exposed a harness transport mismatch: its singleton callback was overwritten when the overview subscribed separately. Production `src/electron/preload.ts:129-134` creates one `ipcRenderer` listener per subscriber and independently removes that listener. Repository search found this as the only production `window.dawn.onEvent` adapter; dev-mock launches that same Electron/preload. Production transport therefore required no multiplexer or behavior change.
- `tests/ui/app-mvp.test.tsx` now models that real multicast contract with a listener Set and broadcast. A new regression first failed with no transcript delivery, then proved overview/transcript coexistence and independent removal in both directions. All original message, echo, revision-gap, repeated-resync and malformed-event assertions remain intact.

Focused App MVP/design/client/hook verification is **166 passed across 4 files**; typecheck and the full build pass. The root full Node/UI rerun then passed **662 files / 6728 tests, with 10 skipped**, exit 0, in 114.15s; its log is preserved at `evidence/c3/full-suite-remediation/full-node-ui-remediated.log`. No Electron process was active during that full rerun. The final eight related Electron cases were rerun on this rebuilt candidate and **all 8 passed (1.0m), exit 0**, with unchanged strict shutdown checks. This run is preserved in `evidence/c3/remediated-electron.log` and `evidence/c3/remediated/`.

The refreshed candidate is recorded in `evidence/c3/full-suite-remediation/`:

| Manifest | Files | Manifest SHA256 |
| --- | ---: | --- |
| `src-sha256.json` | 628 | `b8027076478637032512aeb3ecb8ce7a321ec88a0c2c8b68829698c2b0c79246` |
| `build-sha256.json` | 624 | `5a535e8bed7ab347f5e9e62733af8a18b494676d0de3769d844b296e6157fb19` |

Only `src/ui/styles.css` differs from the prior actual-Electron freeze, solely through those equivalent weight-token expressions; `changes-from-prior-freeze.json` records that comparison. The eight actual Electron cases and screenshots below now belong to this refreshed exact build. All 628 source and 624 build hashes remained unchanged after the final rerun. Eleven owned Electron processes each exited with OS code 0, and no application diagnostic recorded a drain timeout/failure, async failure or fallback. `integrity-and-exit-summary.json` in this remediation directory records both the inventory comparison and independent OS/protocol/application exit facts. The earlier freeze and all prior failures remain preserved.

## Actual screenshot entry points

All paths below are under `evidence/c3/remediated/outcome/`. Each normal main capture also has `-panel.png` and `.json` alongside it.

| Condition | Full app capture |
| --- | --- |
| Analysis stage accepted, independent review pending; CTA opens review process | `pass/review-pending-light.png` |
| Final accepted result; CTA and artifact card target analysis | `pass/main-light.png` |
| Compact expanded workflow, network and roster initially visible | `pass/expanded-light.png` |
| 900px default three columns, explicitly condensed summary | `pass/main-900-light.png` |
| 900px native focus dialog with full versions opened | `pass/focused-900-light.png` |
| 900px dark condensed summary | `pass/main-900-dark.png` |
| Real retired disk snapshot, unknown run phases, historical UI | `pass/retired-disk-history-dark.png` |
| Real blocked current task and feedback navigation | `blocked/main-light.png` |
| Real cancelled and host-verified drained CLI process tree | `cancellation/actual-cancelled-drained.png` |

Existing entry, exact graph/card focus return, raw tool evidence, relative image/script preview, owner isolation, session restoration, and current version preview captures are preserved under `remediated/collaboration/` and `remediated/submission/`. No visual golden was updated.

## Preserved first failures and boundaries

All earlier run directories/logs and failure traces remain under `evidence/c3/`; they are superseded by the frozen candidate and are not interchangeable with final source proof. Expired local inspector endpoints in durable `.log` files are redacted; process diagnostics retain their independent facts.

1. Initial result UI tests failed because the outcome panel was absent; later red regressions exposed blocked-review headline precedence, acceptance wording on unverified inspection, compact expansion, policy-off held/recovery reservations, queued owner focus, cancellation proof wording, and review-task navigation. Matching red/green logs are retained.
2. The first added outcome E2E wrongly expected analysis from the old review-target CTA. The product decision was then explicitly changed via selector-only navigation logic. Another capture incorrectly assumed reload preserves selection; the test now reselects its fixture owner.
3. Restarted selected sessions remain **live** and can retain exact current accepted receipts. A failed assumption expected history. Actual history proof now retires the isolated selected owner using the existing `stopSession` operation, confirms actual `source: disk` plus unknown run phases, and captures the historical UI without reopening that owner.
4. The first stopping fixture assumed a Python descendant could perform ~600ms cleanup. Direct local SDK execution confirmed ~677ms cleanup, but actual desktop delegation has a separate CLI-child boundary: `SubagentExecutor` cancellation kills the entire owned descendant/process-group tree with SIGKILL. That fixture therefore could not create a durable stopping frame. Its original source, repeated failures, traces and diagnosis remain preserved; no timing threshold, host termination policy or shutdown budget was relaxed.
5. Investigation also exposed a real active-external-abort observation gap, separately proved by a meaningful failing gated service test and fixed through persistent invalidation only. The service test proves stopping before gated cleanup and drained afterward without changing waiter semantics.

**Coverage limit:** the final actual cancellation case proves the owned CLI worker/process tree exited and its positive current epoch was host-settled as cancelled/drained. It does **not** claim a visually captured stopping frame. Stopping presentation is covered by focused UI tests and actual service gated-cleanup tests; a longer-lived real Bot/MCP drain path was not exercised. No kernel or cross-platform run was performed for C3. No real-model quota/API trial was performed; phase D was not started.

The historical Electron shutdown investigation remains **OPEN** (previous 7.35s / 20.69s observations). Current strict bounded passes do not close it. The 1500ms / 4000ms budgets were not raised.
