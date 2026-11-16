# Optional local environment tools and onboarding navigation

Branch: `codex/local-environment-tools`. Homepage remains a design preview; no App-homepage routing is introduced by this change. The workbench's bottom status row has **导航栏** immediately before the version, reopening the existing four-step guide.

## Delivered behavior

- R then Python, preserving the existing interpreter picker/save callbacks in Settings → Kernel.
- Optional uv, pixi, Conda, Mamba, Node.js, npm and Git: automatic discovery, candidate selection, native file browsing, manual full paths, validation, save, clearing and restart persistence.
- Fourth guide step is a compact nine-row overview. One anchored native popover opens for the selected tool. It lists detected versions/kernel availability; full paths remain accessible there. Failed saves keep the editor and draft open. Browse cancellation or a late result from a dismissed editor does not replace a choice.
- Detection is read-only. Missing tools and interpreters do not block entering the app or AI chat. No installers or environment creation are invoked.
- Saved optional tools affect PATH-based AI local commands and newly opened local terminals. Existing terminals keep their launch snapshot. Absolute commands, remote execution, the bundled app runtime and built-in Git helpers keep their existing behavior.
- Guide reopening is an independent overlay. It preserves the current view, an unsent homepage message, active conversation drafts and an unfinished schedule form. Switching guide language updates memoized translations without remounting these editors.
- Overview Row margins are reset rather than letting full-width rows exceed their cells. Guide pages have no horizontal scrollbar; focus restoration uses `preventScroll`. Popover opening, Escape, deferred successful saves and outside dismissal restore focus without ending the guide.

## Runtime ownership

Version probes have four workers, a maximum of twelve candidates per tool, a three-second per-command deadline and a combined 32 KiB output budget. Probe child processes and descendants are owned and cleaned up on success, deadline, output overflow and application shutdown. Active probes participate in graceful shutdown; queued work and later probe admission stop after cancellation. Temporary aliases are app-owned, preserve each launch's choices and are disposed during shutdown.

## Verification evidence

- Frozen backend/initial UI baseline: `vitest run --project node --project ui --maxWorkers=2` passed 766 files, 7585 tests, with 10 existing skips. Final backend-focused lifecycle checks passed 182 tests with one existing skip.
- Refinement UI suite passed 238 files / 2315 tests before the final memoized-locale checks. Subsequent focused checks cover the final guide label, placement, read-only detection, failed-save drafts, stale file chooser results, Escape and deferred focus restoration.
- Final Electron checks use the built real application, real IPC and local mock inference: 15 cases passed. They cover native `:popover-open`, focus/viewport fit, no horizontal overflow before and after focus, selection/persistence/clear, narrow settings layout, missing-environment chat, guide reopening, language switching, unsent text/active conversation preservation, an unsaved schedule form and first-run model setup.
- Final full UI run: 239 files / 2317 tests passed. Full build and final `tsc --noEmit` completed successfully.
- Independent spec and code reviews found and resolved selected-Node npm probing, descendant cleanup, probe shutdown ownership, keyboard focus, deferred-save focus restoration and guide/view preservation issues. No remaining actionable P1/P2 findings were reported in the final narrow review.

## Verification notes and limits

An initial broad run overlapped deliberately failing lifecycle regressions during TDD; three unrelated timing-sensitive cases also failed under that load. Their isolated rerun passed. The frozen broad baseline above was run afterward. During UI refinement, one unrelated analysis-route timing failure passed in isolation and on the next full UI run. A preliminary Electron run overlapped a rebuild and lost a file during reload; final Electron verification was run only after the build completed. Old wizard selectors and a radio `check()` postcondition were updated for the intentional auto-closing popover; backend persistence assertions remain.

POSIX executable invocation and process-tree cleanup were exercised on macOS. Windows command construction was unit-tested and reviewed, but native Windows execution was not run here. Real cloud inference is not needed for these configuration checks; local mock inference tests verify the missing-environment chat path through the real backend.

Final navigation label is exactly **导航栏** (Navigation in English), immediately before the version button. Independent final UI re-review passed 19 targeted checks. The whole-shell locale remount was removed; localized memoized transcript controls, conversation navigation and subagent lists now subscribe to locale changes. New regressions verify translated controls update without discarding an open message edit.
