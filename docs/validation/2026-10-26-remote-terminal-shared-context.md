# Remote terminal shared context validation — 2026-10-26

Branch: `codex/remote-terminal-shared-context`. No merge, push, release, installed-app replacement or production-server operation.

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

All fixtures use fresh temporary databases/workspaces, independent Electron userData, in-memory test credentials and random loopback SSH endpoints. No test controlled or restarted the user's running preview or production sessions. The visible demo will use a new subdirectory under the standard development-preview root, a copied launcher with its own PREVIEW_ROOT, and a deterministic test model. The original launcher/profile are preserved.

## Boundaries

This verifies the remote transport and application integration against isolated local SSH servers, including real shell and file channels. It does not claim acceptance against the user's production server, its custom shell startup configuration or network conditions. No real-server credentials were copied to the test profile.
