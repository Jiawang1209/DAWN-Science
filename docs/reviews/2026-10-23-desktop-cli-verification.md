# Desktop CLI Verification

- Branch: `codex/terminal-assistance`, worktree `/Users/liuyue/.codex/worktrees/terminal-assistance/dawn-science`.
- Desktop model and encrypted credential reuse: no model API key environment variables; an isolated Electron instance reads the existing configured credential source through a read-only port. Configuration and credential source SHA-256 comparisons both unchanged. CLI receives a private local connection token, not a provider key.
- Real DeepSeek `deepseek-flash` and owner-selected `deepseek-v4-pro` requests completed. Real read/write tools read `sample.txt` and wrote `REAL_DESKTOP_MODEL_OK` to `connection-proof.txt`. Current owner model inherited at CLI entry.
- Real ask-risky permission prompt displayed in CLI, `n` rejected the local diagnostic command and the model acknowledged the rejection. No second chat input or permission surface shown.
- Normal during real `sleep 30` stopped only the CLI scope; follow-up file absent. Original Shell PID `40955`, cwd and exported value `41` were byte-for-byte identical before/after. Original desktop owner and PTY both remained alive.
- A `/var` vs `/private/var` project duplication found during the initial preview was fixed. Final connected request retained one project. Private per-instance terminal descriptors also prevent a second desktop/test host from redirecting an existing terminal.
- Typecheck and complete build passed. Full regression: 469 files, 4982 passed, 10 skipped (101.08 s). 14 real Electron interaction checks passed (51.8 s); after the final input guard, the DAWN/Normal Electron check passed again (8.3 s); final terminal/protocol/backend/credential checks passed (68 tests, 1.64 s).
- Full regression initially caught design-token / Button primitive / translation contract violations; implementation was corrected and contracts passed in the final full run. Tests were not relaxed. Existing standalone CLI environment regression now explicitly unsets desktop connection variables so it continues testing the independent mode.
- Pending Shell input is tracked separately from prompt text, including a literal trailing `$`; clear with Ctrl-U before entry. xterm cursor/device/color replies are excluded from human editing. Real configured zsh initial entry and the deterministic pending-input scenario both verified.
- Light 1280×840, dark 1000×720 and Normal 1000×720 screenshots visually checked. Final real preview is left focused in DAWN mode.
- Existing build warnings about bundle size / browser eval and test-fixture Bot recovery notices remain. Windows transport launcher is provided, but this acceptance run is macOS only; no packaged installation claim.
- Evidence: `artifacts/dawn-desktop-cli/real-evidence.json`, screenshots and `checks/` logs. Model history / input cards / ownership remain handled by the existing Workbench.
- No merge, push, installed-app replacement, source-credential write, production database migration or global Shell configuration change.
