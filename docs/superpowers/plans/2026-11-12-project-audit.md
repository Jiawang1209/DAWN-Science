# Project audit and debugging plan

**Goal:** Inspect the current DAWN Science project, reproduce and resolve defects, verify fixes, and merge locally into main without pushing.

**Baseline:** main d7abccf3. Dedicated branch codex/project-audit-20261112. Existing source, user configuration, chats, installed application, and research worktrees are preserved.

**Architecture:** Audit the existing Electron/React, workbench/runtime, storage, orchestration, file/remote/kernel, CLI and packaging boundaries. Fix concrete failures at their owning source. Preserve established protocols and mock parity. Use isolated deterministic fixtures and synthetic kernel data.

**Execution:** Inline, as the repository roadmap reserves delegation for an explicit user request.

- [x] Inventory project entry points, configuration, test groups and environment assumptions; read current repository instructions.
- [x] Establish fresh baseline: full build, typecheck, full Vitest suite (node/UI/kernel groups), all normal Playwright specs, isolated kernel specs, and visual checks. Keep exact commands, failures, skips and diagnostics.
- [x] Inspect lifecycle, error propagation, persistence, cancellation/recovery and UI/runtime boundaries alongside failing tests. Categorize reproducible product defects, fixture defects, environment limitations and intended visual differences.
- [x] For each confirmed issue, record root cause, add a regression that fails, implement the narrow fix and verify affected behavior. No blanket timeout increases, skipped assertions or automatic snapshot acceptance.
- [x] Run relevant regressions after fixes; repeat broad checks only when changed shared behavior or unresolved failures justify them. Render/inspect affected visual diffs.
- [x] Review final diff and current evidence. Document checked areas and limits without claiming absolute absence of bugs, real-provider validation, or cross-platform validation from local mocks.
- [x] Commit scoped changes, merge into clean local main, verify integration, preserve source/history and worktree, and do not push or release.
