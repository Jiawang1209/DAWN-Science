# Terminal Plan Mode Implementation Plan

> **For agentic workers:** Follow the approved scope task by task using test-driven-development and verification-before-completion. Repository instructions reserve delegation for an explicit user request; review locally without spawning agents.

**Goal:** Connect terminal `/plan` to the conversation page's existing planning and approval workflow.

**Architecture:** Native `dawn.plan`, the persisted plan book, `plan` events and `answerPlan` remain authoritative. Add a read-only session planning snapshot and narrowly scoped desktop CLI bridge. Render plan Markdown and version/status in the existing transcript; approve/discard requires the displayed plan ID, and approval sends the existing shared `执行那句` through normal user input.

**Tech Stack:** TypeScript, Pi TUI, Electron, Vitest, Playwright. No dependency changes.

## Approved interaction and boundaries

- `/plan` enables planning; `/plan question` enables before sending the question, matching the conversation page. `/plan off` exits without approval or execution; `/plan status` reads the current state.
- `/plan approve <planId>` and `/plan discard <planId>` answer that version through the same backend. New proposals supersede old versions. Editing remains available in the original conversation plan card; ordinary terminal follow-ups request revisions while planning stays enabled.
- Plan Markdown is visible in terminal history; status changes update the original entry. Footer shows planning state, synchronized with GUI config and plan events plus bounded polling. Restoring history restores plans and images without new model turns.
- Busy/pending-question or approval state rejects plan mutations clearly. Duplicate approval is locked; backend lease/busy/version checks stay active. Failure preserves user draft and offers retry of the actual unsent execution instruction, never a second approval.
- No new permission gate or plan store, no unrestricted config bridge, no automatic approval. Shell, image, search and return behavior remain intact.

## Tasks

- [x] Baseline focused CLI/native planning tests; add failing backend snapshot, scoped bridge and command/controller tests.
- [x] Implement canonical readback, strict private transport, protocol/version and deterministic mock coverage using the shared inference fixture.
- [x] Add failing terminal Markdown/version/status/history/input tests; implement `/plan` commands, completion, footer and live sync with stale-result protection.
- [x] Verify approve → archived plan → shared execution instruction → real tool, discard, stale versions, busy/duplicate/error handling, GUI-to-terminal and return-to-GUI.
- [x] Run typecheck, build, full tests, real Electron regressions, local diff review and actual isolated branch preview. Preserve current user session/data; no merge, push or installed app replacement.

Verification: `docs/reviews/2026-10-25-terminal-plan-verification.md`.
