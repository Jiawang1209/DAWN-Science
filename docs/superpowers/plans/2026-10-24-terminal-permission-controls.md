# Terminal Permission Controls Implementation Plan

> **For agentic workers:** Implement this approved scope task by task; use superpowers:requesting-code-review before delivery. Steps use checkbox syntax for tracking.

**Goal:** Terminal DAWN and conversation views display and edit the same session permission tier.

**Architecture:** Keep native DAWN gates and `dawn.permission` as the sole authority. Add a read-only effective-permission snapshot and a narrowly scoped CLI permission operation. Reuse PermissionPill in the terminal header; synchronize config events and bounded polling without sending a model prompt or approving pending tool requests.

**Tech Stack:** TypeScript, React, Pi TUI, Electron, Vitest, Playwright.

### Task 1: Canonical readback and transport
- [x] Write failing tests for inherited/default/explicit states, invalid sessions and CLI scope validation.
- [x] Add `getSessionPermission`, protocol schema/version, private CLI read/write restricted to the authenticated session and allowed tier values.
- [x] Verify errors propagate; generic desktop settings/config writes remain unavailable.

### Task 2: Terminal controls and synchronization
- [x] Write failing UI/controller/TUI tests for bidirectional changes, stale reads, failed writes, Normal mode and terminal/session switching.
- [x] Reuse PermissionPill in DAWN header with busy/error state; retain existing optional-default semantics.
- [x] Add `/permissions` help and tier arguments, live native status, config refresh and cleanup. Preserve input, pending approvals, pictures and usage layout.
- [x] Keep conversation inherited tier synchronized when defaults change from the terminal.

### Task 3: Verification and isolated preview
- [x] Run focused tests, typecheck, build, broad regressions and independent code review; repair findings.
- [x] Open a branch Electron preview with isolated data; verify GUI-to-terminal, terminal-to-GUI, default inheritance, Normal switching, history, close/reopen/return.
- [x] Record exact results and limitations. Leave branch unmerged, no push, no installed application changes.

Pi native CLI replacement is unnecessary: this slice uses existing DAWN guards, session history and image contexts.
