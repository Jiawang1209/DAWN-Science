# Skill Retrieval and Read Evaluation Implementation Plan

> Follow TDD and use subagent-driven development for the independent shared catalog and transcript presentation tasks; review their results before integration.

**Goal:** Make installed Skills discoverable consistently and actual instruction reads observable, with reproducible bounded acceptance evidence.

**Architecture:** Shared catalog/ranking/controlled reads in `src/skills/catalog.ts`; native, ACP and child adapters reuse it. Typed read receipts flow through existing tool transcript metadata; actual manual expansion uses host-authored custom metadata. Large catalogs use bounded search rather than full description injection.

**Tech Stack:** TypeScript, pi SDK, TypeBox/Zod, React, SQLite settings, Vitest, Electron/Playwright.

- [x] Catalog: add failing precedence, invocation, tags, Chinese/English/synonym, paging, containment and stale-policy tests; implement shared discovery/ranking/controlled reads and adapt child resource search without changing memory matching.
- [x] Read records: define strict receipt schema; add failing live/history/transcript/UI tests; carry trusted metadata through existing tool events and history, render source and partial state without implying execution.
- [x] Integrate main native search/use tools, policy gates, direct read observation, actual manual expansion, snapshot refresh and small/large catalog prompt behavior; inject personal tags from existing settings.
- [x] Adapt ACP list/use compatibility and new search entry to the same catalog and mode checks; preserve gateway auditing and record successful controlled reads.
- [x] Add a fixed offline retrieval evaluation and prompt-size comparison, then mock-agent/Electron acceptance for user-visible records, resume and denied reads. Update `writing-skills`, user docs and a verification report.
- [x] Run focused regressions, typecheck/build, independent spec/code reviews; resolve findings, commit locally and keep the feature branch without pushing or merging.

Verification results: `docs/reviews/2026-11-01-skill-retrieval-read-verification.md`. The user-selected finish is a local feature-branch commit, with no merge or push.
