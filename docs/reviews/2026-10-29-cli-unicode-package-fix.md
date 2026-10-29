# v0.0.38 installed CLI missing Unicode addon — 2026-10-29

Branch: `codex/fix-cli-unicode-package`, based on local main `2a373dec`. Workspace: `/Users/liuyue/.codex/worktrees/cli-unicode-package-fix/dawn-science`.

## Root cause and scope

The installed v0.0.38 CLI imports `@xterm/addon-unicode11` through `src/terminal/screen.ts`. The CLI bundle leaves third-party packages external. The addon was a development dependency, so electron-builder omitted it from the installed application's production node_modules. The installed app had `@xterm/headless` but no Unicode addon. Running `node /Applications/DAWN Science.app/Contents/Resources/app/dist/cli/main.js --help` reproduced the reported ERR_MODULE_NOT_FOUND before CLI argument handling. Reproduction used Node 22.23.0; the user's same failure occurred on Node 24.18.1.

Move the existing addon constraint (`^0.9.0`, lock resolves 0.9.0) into production dependencies and update its lock classification. No dependency version, application version, runtime behavior or lockfile format changes. Other renderer-only xterm addons remain development dependencies because Vite bundles them.

## Prevention

- The packaging configuration test builds the CLI import graph with external packages, checks every non-builtin external against the production lock tree, and checks manifest/lock dependency-section consistency. Before the fix it failed specifically on `@xterm/addon-unicode11`; after the fix it passes.
- `scripts/test-packaged-cli.mjs [resources/app]` checks that both process-side xterm packages resolve within the actual packaged node_modules, then executes the packaged CLI with system Node and `--help` in a temporary working directory and isolated CLI home. Package-local resolution guards against accidentally using the checkout's development dependencies. It rejects the currently installed broken application and accepts the fixed package.
- The same CLI smoke check runs in full packaged acceptance and in release jobs after packaging and before artifact upload. Release publication policy is unchanged.
- Full packaged acceptance also needed test-fixture maintenance: bypass the setup wizard like the existing E2E fixture, use current composer/terminal controls, expand the settings column before selecting a category, and wait for the full streamed mock reply before asserting. Initial fixture timeouts and partial-text failures were investigated from actual screenshots; no product UI changed.

## Fresh evidence

- Baseline packaging/terminal model checks: 2 files, 6 tests passed.
- Regression red: packaging test failed with exactly the missing production addon; original installed CLI and new smoke script rejected the installed package.
- Related CLI/terminal/runtime/packaging regressions: **20 files, 191 tests passed**, exit 0. After adding manifest/lock consistency assertions, the packaging suite passed again: **3/3** tests.
- `npm run typecheck`, `npm run build`, script `node --check` and `git diff --check`: passed.
- `npx electron-builder --mac --arm64 --dir --publish never`: passed, including local ad-hoc signing. Fixed output: `release/mac-arm64/DAWN Science.app`. The package contains both `@xterm/headless` and `@xterm/addon-unicode11`.
- Packaged CLI `--help`: passed both in the actual built app and from a full resources/app copy outside every checkout. The temporary copy was removed after validation.
- A separate actual PTY process ran system Node against another isolated copy of the packaged CLI from a working directory containing Chinese characters and spaces: Agent startup → synthetic prompt → local mock inference reply → `/exit` → process exit 0. It used temporary providers, CLI home, models and synthetic credentials; no real model service or user database was used. The temporary copy was removed.
- `npm run test:packaged`: finally passed the CLI smoke plus **all 6** real packaged Electron checks (window/SQLite, builtin definitions, model subprocess reply, PTY echo, interpreter discovery, kernel settings).
- Independent read-only review and a follow-up review of fixture changes found no actionable defects.

Build notices remain for existing browser-tool eval and UI chunk size. The package is an ad-hoc signed local macOS ARM64 development build, without notarization. Windows, Linux, Intel Mac and the user-reported Node 24 runtime were not exercised locally. The new release checks will run on their native CI hosts when authorized changes are pushed.

No push, public release, local-main merge, PATH/launcher modification or replacement of `/Applications/DAWN Science.app` was performed. The installed v0.0.38 remains unchanged and will retain the reported failure until an approved repaired build is installed.
