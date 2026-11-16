# 舒展双栏首页与新建项目 Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this approved plan in this session; no delegation. Track each step below.

**Goal:** Deliver the approved homepage and working project creation without changing onboarding/workbench navigation.

**Architecture:** Extend the existing ProjectManager/ProjectStore and typed protocol. Keep filesystem initialization in a focused project module and dialog state in a separate React component; App connects completion to the current workspace flow. Reuse science layout constants, native picker, pi AGENTS resource loading, UI primitives and theme tokens.

**Tech Stack:** TypeScript, SQLite, Electron IPC, React, Vitest, Playwright.

## Task 1: Creation, metadata and protocol

Files: `src/project/create.ts`, `src/project/manager.ts`, `src/store/projects.ts`, `src/store/schema.ts`, `src/protocol/{entities,operations,version}.ts`, `src/workbench/backend.ts`; tests `tests/project/create.test.ts`, `tests/store/projects.test.ts`, `tests/workbench/backend.test.ts`.

- [x] Add failing tests for a real temp parent, creating a named child and round-tripping metadata; reject existing directory/symlink, invalid name and missing parent; test database failure rollback. Example assertion:
  ```ts
  const record = manager.create({ parentDirectory, name: '研究', description: 'UI only', agentContext: 'Use R', scienceLayout: true })
  expect(readFileSync(join(record.workspace, 'AGENTS.md'), 'utf8')).toContain('Use R')
  expect(readFileSync(join(record.workspace, 'AGENTS.md'), 'utf8')).not.toContain('UI only')
  ```
- [x] Run `node_modules/.bin/vitest run --project node tests/project/create.test.ts tests/store/projects.test.ts` and observe missing-feature failures.
- [x] Implement exclusive directory creation with tracked rollback; add metadata migration and update; expose strict typed operations with fault conversion and readonly checks. Increment protocol minor version.
- [x] Run node tests above plus `tests/project/manager.test.ts`, `tests/store/runs.test.ts`, `tests/workbench/backend.test.ts` and protocol tests; confirm old summary fields remain optional-compatible.

## Task 2: Project form and homepage

Files: `src/ui/project-dialog.tsx`, `src/ui/app-home.tsx`, `src/ui/App.tsx`, `src/ui/styles.css`, `src/ui/i18n/en.ts`; tests `tests/ui/project-dialog.test.tsx`, `tests/ui/app-home.test.tsx`.

- [x] Add failing component tests for exact creation payload, directory picker cancellation, failed save and retry; form completion only once while pending. Add homepage callbacks for creation, metadata edit and favorite persistence.
- [x] Run `node_modules/.bin/vitest run --project ui tests/ui/project-dialog.test.tsx tests/ui/app-home.test.tsx` to confirm feature failures.
- [x] Implement a native modal using existing Button/form primitives; show resolved target path; optional settings disclosure; preserve errors and inputs. Match approved brand, project cards, recent resume emphasis and constrained page width using DAWN tokens. Keep controls accessible in both languages.
- [x] Wire create success through `enterHomeProject`, retaining session-at-first-message semantics. Guard stale async completion against later page changes.
- [x] Run component tests, design-contract/i18n tests, app MVP navigation tests and `npm run typecheck`.

## Task 3: Real chain and review

Files: `scripts/mock-inference-server.mjs`, `e2e/app-home.spec.ts`, `e2e/project-create.spec.ts`, user-facing documentation.

- [x] Add deterministic shared fake inference branch that responds to a project-context marker found in the actual system prompt. Exercise native picker and backend rather than replacing protocol handlers.
- [x] Build with `npm run build`, then run `node_modules/.bin/playwright test e2e/app-home.spec.ts e2e/project-create.spec.ts e2e/composer-highlight.spec.ts e2e/session-tab-close.spec.ts`.
- [x] Inspect real Electron screenshots for the approved layout, expanded form, dark appearance and narrow width. Confirm the first new project message reads AGENTS context, description stays out of the prompt, and reopening home keeps saved projects/settings.
- [x] Review diff and execute relevant broader tests; record observed results and limitations. Commit implementation locally on `codex/home-project-create`; leave main untouched and do not push.
