# Remote Terminal Shared Context Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for isolated tasks and reviews. All tool and app mutations must stay in this worktree or independent test fixtures.

**Goal:** Open a real remote terminal from an existing remote conversation and switch DAWN/Normal while retaining the same SSH connection, AI session, directory, environment and history.

**Architecture:** Add interactive channels to RemoteExecutor, a remote terminal runtime with separate raw-shell and local presentation streams, and a scoped persistent-shell command adapter. Bind the CLI to the existing remote owner; detach it without stopping the owner. Keep local terminal behavior compatible.

**Tech Stack:** TypeScript, ssh2, node-pty, xterm, Electron, Vitest, Playwright.

### Task 1: SSH interactive channel
- [x] Write tests in `tests/remote/shell.test.ts` for one connection with multiple channels, Unicode chunks, resize, close and disconnect.
- [x] Run `npx vitest run tests/remote/shell.test.ts` and observe the missing openShell behavior.
- [x] Extend `src/remote/ssh.ts` with `openShell({cols,rows}): Promise<RemoteShell>` where RemoteShell has write, resize, close, onData and onExit. Use the already authenticated client, never reconnect; close only its channel. Retain old fake-client compatibility through an optional shell capability.
- [x] Rerun shell, SSH and connections tests and review.

### Task 2: Remote runtime and persistent execution
- [x] Write runtime tests against independent loopback SSH and a temporary Shell, covering Normal input, cd/export, command results, busy rejection and drop without local fallback.
- [x] Implement `src/runtime/remote-terminal.ts` with raw SSH screen state, exact terminal/owner/connection binding, local CLI presentation PTY, bounded command completion and directory synchronization. Remote PID must never enter local process-tree kill logic.
- [x] Extend the remote bash adapter in `src/remote/tools.ts` to use persistent execution when available. Do not send its existing `exit $rc` wrapper into the shared Shell.
- [x] Run runtime and remote tool tests, then typecheck.

### Task 3: Shared owner and view lifecycle
- [x] Add wiring tests asserting identical owner sessionId, connectionId, history, permissions and model; detaching or closing a terminal must leave the owner usable.
- [x] Update `src/cli/desktop-wire.ts`, `src/cli/desktop-host.ts`, `src/cli/agent.ts`, `src/electron/wiring.ts`, `src/runtime/native.ts`, `src/workbench/backend.ts` and the protocol schemas as necessary. Distinguish shared presentation close from dedicated CLI session shutdown. Bind each turn to the intended live terminal instance.
- [x] Update `src/session/manager.ts` remote PTY selection so terminal creation actually starts on the selected server; include connection identity checks and lifecycle cleanup.
- [x] Run terminal, desktop CLI and remote owner regression tests.

### Task 4: Existing UI entry and real application acceptance
- [x] Add an Electron regression with a temporary SSH server and test model: remote chat context → open terminal → manual cd/export → DAWN request uses the same session and environment → Normal → return to chat → further chat uses that Shell.
- [x] Update `src/ui/app.tsx` remote terminal creation/return path and `src/ui/dock.tsx` remote title while preserving layout and draft.
- [x] Validate two terminals/two servers, interrupted commands, dropped connections, UTF-8 and a narrow viewport. Use independent fixture data only.
- [x] Run focused tests, typecheck, build and Electron tests; request spec and quality review and address findings.
- [x] Save evidence and prepare an independent, visibly labeled test preview. Retain the branch/worktree; do not merge, push or replace installed software.
