# Remote terminal shared context validation — 2026-10-26

Branch: `codex/remote-terminal-shared-context`. No merge, push, release or installed-app replacement. Initial verification used loopback SSH; the subsequent user-authorized genek run was restricted to newly created temporary verification directories.

## Implemented

A terminal opened from a remote native conversation adds a PTY channel to its existing authenticated SSH client. Normal input, the conversation bash tool and DAWN presentation use the selected persistent Shell. The original native session, model, permissions, plan and transcript remain authoritative. Switching terminal instances is blocked throughout asynchronous input preparation and an active native turn. Closing presentation or returning directly to the conversation detaches without aborting its task. Closing a remote Shell never kills a local PID.

Remote cwd is distinct from the local session directory. Bash/zsh hooks report actual cwd/readiness and completion through nonce markers. UTF-8 fallback uses an installed server locale only; unsupported Shell/locale fails explicitly. Active output capture and closed-session resources are bounded. PTY stdout/stderr merge, and captured command output truncates explicitly after 1 Mi characters. No default command/session expiry is introduced; only startup has a 30-second readiness limit, and explicit command timeouts are respected.

File tools resolve relative paths through the shared remote cwd and existing connection. Remote filesystem image discovery is rejected by the local CLI image reader with a visible notice; byte/kernel pictures remain supported. This avoids reading a same-named local file; remote file-image preview is a documented limitation.

## Verification

- `npm run typecheck`: passed.
- `npm run build`: passed, with the existing large-chunk/direct-eval build warnings.
- Focused Vitest run (`--maxWorkers=3`): **30 files; 435 passed, 8 skipped**. Includes real loopback SSH/SFTP/PTTY, runtime, connection and tool adapters, native owner wiring, SessionManager, CLI lifecycle/images, protocol and UI state.
- `npx playwright test e2e/remote-terminal.spec.ts e2e/desktop-cli.spec.ts e2e/terminal-utf8.spec.ts`: **5 passed**. Real Electron, native agent loop and deterministic local model server.
- Remote Electron flow verifies previous conversation history/model, Chinese directory/input, manually exported environment, exact same sessionId, one SSH connection, no replacement task, /exit and continued GUI conversation.
- Active-task flow returns directly from DAWN while the remote bash task runs; presentation detaches, its output file completes, original native session and remote Shell remain alive.
- Node integration covers multiple Shell instances, same-server separate owners, two distinct SSH servers, disconnect isolation, no fallback from a dead selected Shell, creation/preprocessing races, and missing desktop presenter rejection.
- Runtime tests cover Bash/zsh, unavailable locale, pending input, abort, explicit timeout, bounded output/history, local presentation and cursor restoration.
- Spec and quality reviews completed; reported correctness/isolation issues were fixed and regression-tested.

All fixtures use fresh temporary databases/workspaces, independent Electron userData, in-memory test credentials and random loopback SSH endpoints. No test controlled or restarted the user's running preview or production sessions. The visible demo uses a new subdirectory under the standard development-preview root, a copied launcher with its own PREVIEW_ROOT, and a deterministic test model. The original launcher/profile are preserved.

## Initial loopback boundaries

This verifies the remote transport and application integration against isolated local SSH servers, including real shell and file channels. It does not claim acceptance against the user's production server, its custom shell startup configuration or network conditions. No real-server credentials were copied to the test profile.

## Visible preview acceptance

The isolated Electron preview was opened after verification from feature commit `4130db9a`. Its title identifies the feature branch; a new `remote-terminal-isolated-*` profile lives under the standard DAWN Science Dev Preview directory. It shows the original Chinese conversation and the remote DAWN terminal after manually entering a Chinese directory and exporting a variable. Preview verification records one authenticated SSH connection. The actual window and narrow-viewport test screenshots, logs and verification.json are retained in that separate profile. No original launcher/profile was edited or reused.

The primary checkout was rechecked: `main` remains at `ab9c1e18` (release 0.0.37), clean. The feature branch is retained separately; no merge or push was performed.

## Authorized real genek verification

The user selected genek for real-server acceptance. Existing authenticated application credentials were reused through selected encrypted copies in isolated preview profiles; plaintext credentials were never printed or retained. The original application database, launcher and profiles were not edited. Connecting a fresh profile uses its own installation ID, so the existing installation-scoped remote-kernel sweep does not target other installations' kernels.

The first real run exposed a late xterm device reply reaching the idle remote Shell after DAWN presentation detached. Its printable suffix (`1;2c`) prefixed the next Agent wrapper and prevented execution. The model's explicit command timeout then fired; this was not a session lifetime limit. Commit `774e55cb` filters complete known replies at the raw input boundary only while the Shell is idle, redrawing, or Agent-owned. The shared editing tracker uses the same parser. DA/DSR, focus, keyboard flags, DECRPM, DECRPSS and OSC color replies are covered; manual foreground remote programs and active presentation still receive protocol input intact.

Regression evidence for that fix:

- Extended the real PTY regression first: the missing DECRPM/DCS/OSC4 cases failed before the shared filter and passed afterwards.
- Runtime, terminal-control and Electron wiring: **87 passed, 1 skipped** across six files.
- Typecheck and build passed.
- Remote Electron integration: **2 passed**, including detach during an active task, late-reply injection and continued original conversation.
- Local desktop CLI and Chinese path/input Electron regressions: **3 passed**.
- Independent quality review found no remaining blocking issue in the revised filter.

The old preview was deliberately left running. A second copied launcher/profile under the standard development-preview root launched the fixed commit with the real Moonshot `kimi-k2.6` provider and a new genek native session. The real checks passed:

1. The GUI conversation stored an unpredictable verification code. DAWN terminal recalled it without the code being repeated in its prompt.
2. Manual Normal input created a fresh `dawn-fixed-verify.*` temporary directory, entered `中文目录`, exported a Chinese environment value and wrote `人工输入.txt` containing `中文输入正常`.
3. DAWN bash returned the exact environment value, remote Chinese cwd and file content with exit code 0. The terminal and GUI used the same original native session and connection IDs.
4. After submitting a `sleep 20` verification task, returning directly to the GUI detached presentation. The GUI showed the original bash task executing; it completed in about 20.3 seconds with exit code 0 and wrote the expected completion file.
5. After injecting the late DA/DECRPM/DCS/OSC4 reports into the idle raw terminal, a subsequent GUI bash call successfully read the same environment, cwd, Chinese file and completion content. Exit code was 0.
6. The isolated Electron main process had one established SSH TCP socket. Old preview sessions were re-read without mutation and remained `alive`; its process was not restarted.

The fixed preview root is `~/Library/Application Support/DAWN Science Dev Preview/genek-real-verified-2026-10-26T02-12-27-421Z`. Its `verification.json` and `evidence/GENEK_FIXED_mvomn0zk/` retain native tool results, identity/mode snapshots and window screenshots. Only the test profile's own extra terminal was closed while preparing the final preview; the retained terminal is in DAWN mode in the Chinese verification directory, attached to the same native conversation. Two small temporary test directories on genek are retained as acceptance evidence. No existing server files, workloads or sessions were modified by these checks.

This establishes the tested genek configuration and current connection behavior; it does not claim acceptance for every SSH server, shell or network interruption scenario.

## Local main integration

After explicit user approval, local `main` was fast-forwarded from `ab9c1e18` to the accepted branch tip `a0c2ab93`. No conflict resolution or implementation change was needed. Verification was then repeated from the primary main checkout:

- Focused regression suite: **26 files; 429 passed, 1 skipped**.
- Typecheck and production build passed.
- Remote terminal, desktop CLI and UTF-8 Electron flows: **5 passed**.
- Main working-tree diff checks passed. The remote-tracking `origin/main` reference remains at `ab9c1e18`; no push, release or installed-app replacement was performed.

Both existing preview processes were still running when integration was checked. Their profiles and server sessions were not restarted. The feature branch/worktree is retained because the live isolated previews still use its files.
