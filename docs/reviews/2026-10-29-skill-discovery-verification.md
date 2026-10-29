# Skill discovery verification — 2026-10-29

Branch: `codex/skill-discovery`; isolated workspace: `/Users/liuyue/.codex/worktrees/skill-discovery/dawn-science`. Base: local `main` at `f9d0007d`. The initial implementation validation below preceded local integration; the pre-merge review and integration results are recorded at the end. No push, installed-app replacement or user-library installation.

## Delivered behavior

Settings → Skills retains local import/invocation management and adds Installed / Discover tabs. Discover searches the two declared public sources or inspects an arbitrary public GitHub repository/directory/SKILL.md URL. Details show the manifest, all selected files, bounded text previews, license and declared dependencies, original URL, ref and complete commit. Format checks and runtime verification are independent. Installation stages the complete selected package at its pinned commit, retains safe executable permissions and a local `.dawn-source.json`, refuses existing visible names, and allows origin readback after restart. A compact column uses stacked file inventory/content; selecting details moves focus and scrolls to them.

## Automated evidence

```sh
npx vitest run tests/ui tests/protocol tests/skills tests/workbench tests/electron tests/mcp tests/tools/mcp-tool.test.ts tests/runtime/skills-接线.test.ts tests/subagent
```

Result: **288 files passed; 2968 tests passed, 2 skipped**, exit 0. These are the existing skips, not newly excluded failures. After the final compact-layout adjustment, the relevant UI/i18n/design-contract suite was repeated: **3 files, 114 tests passed**, exit 0.

```sh
npm run typecheck
npm run build
git diff --check
npx playwright test e2e/skill-discovery.spec.ts e2e/skills.spec.ts
```

Typecheck, full Electron/CLI/UI build and diff check passed. **13 real Electron acceptance cases passed**. After the final compact-layout adjustment, all **3 discovery Electron cases passed again** against freshly rebuilt artifacts. The acceptance covers source search, many-result detail focus, companion-file preview, actual isolated package installation, exact origin fields, source readback after application restart, name-conflict preservation and compact-column layout. Source network responses in these application tests are explicit main-process fetch fixtures; packages and profiles are temporary and isolated.

The build retains the existing direct-eval warning in the browser tool and UI chunk-size warning. Some Electron fixtures log `ERR_ABORTED (-3)` during navigation/shutdown, plus debugger/color-environment notices; all assertions and process exits above passed. Broad jsdom tests emitted existing canvas getContext notices.

## Independent review and corrected findings

Spec review followed by code review, both read-only, found and rechecked fixes for:

- actual searched scope separated from available source choices;
- global installation checking the current visible project's names too;
- visible retry guidance and readable rate-limit reset timestamps;
- preserving safe executable modes and BOM/CR metadata declarations;
- platform-correct directory publication (Windows native absent-destination rename; POSIX reserved destination with ownership checks);
- bounded result lists and focus/scroll into selected details.

Package tests cover immutable commits despite moving branches, complete companion files, traversal/symlink/submodule/portable-name rejection, bounded streaming ZIP inflation, oversized responses, private origin metadata, preview expiry/discard, partial source failures, stale caches and atomic conflict protection. Windows publication is verified through an injected filesystem contract; there was no native Windows execution.

## Real source check

Read-only anonymous GitHub checks used the production service without installing into a formal library:

- Anthropic Skills: `pdf` search returned three matching packages at `ca45fc496a3436251f191354091d557da31c15b5`; a pinned `canvas-design` preview contained 83 files.
- OpenAI curated Skills: `pdf` search returned the PDF package at `49f948faa9258a0c61caceaf225e179651397431`; its pinned preview contained four files.

Both reported format-valid metadata and runtime `not_verified`. These are source snapshots, not claims about future upstream contents or scientific/runtime compatibility. Public API requests follow the [GitHub tree/blob model](https://docs.github.com/en/rest/git/blobs); actual package retrieval uses a bounded commit-pinned codeload archive.

## Startup defect found by real acceptance

The first real Electron launch failed before creating a window. An isolated diagnostic import and `node --check dist/electron/main.js` proved `SyntaxError: Identifier 'createRequire' has already been declared`: the earlier MCP image path imported `pi-tui`, which the Electron builder had not externalized with the rest of the pi family. This defect was also present in the base main's built bundle.

This branch externalizes the already-declared production `pi-tui` dependency and parses emitted main/child/preload files during every Electron build. Fresh built-application tests then passed. No dependency/package version or lockfile changed.

## Limits

Private repositories, authenticated GitHub-wide code search, automatic upgrades, dependency installation, remote-server installation and runtime certification of downloaded workflows are outside v1. Dependency information is a declaration, not an environment probe. Preview records expire after 15 minutes; source indexes cache for 5 minutes. Abandoning a UI request drops its result; it does not forcibly interrupt an already started fetch, which remains time/size/queue bounded.

Actual Windows/Linux hosts and a newly packaged installer were not exercised. POSIX publication protects ordinary competing installs and existing directories; portable Node filesystem APIs do not provide protection against a hostile external process replacing the reserved directory between its final ownership check and rename.

Actual Electron screenshots were visually inspected and retained locally under `/Users/liuyue/.codex/visualizations/2026/10/29/skill-discovery/` (`detail.png`, `compact.png`). They use synthetic package contents and commit IDs.


## Pre-merge review and regression

A fresh source/backend review and a separate UI review found and corrected four boundaries before local integration:

- Project installs now check the nearest existing ancestor against the canonical workspace before any mkdir or package publication. A `.dawn` ancestor pointing outside the project is rejected; missing directories and symlinks staying within the project remain supported. Configured global roots retain their existing semantics.
- Offline origin reads reject nonregular sidecars before opening, use no-follow/nonblocking flags plus descriptor validation, and read at most 16 KiB + 1 byte. FIFO metadata cannot block the main process, and growth after fstat cannot cause an unbounded read.
- Reserved `.dawn-source.json` components are checked with NFC/case normalization, including directory entries, so case variations cannot collide with generated origin metadata on case-insensitive filesystems.
- Discovery stays mounted across tab switches. A pending install still refreshes the installed list/sidebar counts, errors remain visible, and the preview remains available for retry. Successful completion also notifies the parent after panel unmount.

The new regressions failed against the previous implementation (six failures: project escape, FIFO/growth, portable reserved names, tab-switch success/failure) and passed after the fixes. The FIFO subprocess has a hard SIGKILL timeout so a regression cannot leave the runner blocked.

Fresh broad validation after these fixes: **288 files passed; 2975 tests passed, 2 existing skips**, exit 0. Typecheck and full Electron/CLI/UI build passed. Existing canvas/eval/chunk-size notices remain as described above.

Fresh built Electron acceptance passed **13/13** cases after these fixes. Detail and compact screenshots were visually inspected again. Two read-only reviewers rechecked source/backend and UI changes; no remaining confirmed merge blockers were found.
