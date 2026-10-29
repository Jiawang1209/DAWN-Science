# GitHub Skill Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Install a single inspected GitHub Skill through Settings, retaining exact source identity and honest verification status.

**Architecture:** A Node-only source/package service owns immutable downloads and expiring previews. Strict protocol operations authorize existing skill roots; a React discovery component keeps network search separate from installed filters.

**Tech Stack:** TypeScript, fetch, existing JSZip/pi Skill loader, Zod, React, Vitest, built Electron/Playwright.

## Task 1: Strict contracts and source service

- [ ] Add tests in tests/protocol/skill-discovery.test.ts asserting `OPERATIONS.installGithubSkill.request.safeParse({previewId:'x',to:'global',body:'injected'}).success` is false and install is mutating. Run `npx vitest run tests/protocol/skill-discovery.test.ts`; observe missing operation failure.
- [ ] Add src/protocol/skill-discovery.ts schemas and integrate operations.ts. Origin fields: provider github, repository, sourceUrl, ref, commit, path, packageSha256, installedAt, runtimeVerification not_verified. Candidates additionally contain key, name, description, sourceLabel, format valid/invalid, issues, dependencies and license. Preview has previewId, skill, body, files [{path,bytes}], packageSha256 and expiresAt. File preview is {path,bytes,text?,notice?}.
- [ ] Implement SkillDiscoveryService in src/skills/discovery.ts with source transport helpers as needed. Tests first in tests/skills/discovery.test.ts use injected fetch. Public methods: search(query,source?), inspect(url,ref?), preview(url,ref?,path?), readFile(previewId,path), discard(previewId), install(previewId,root,existingNames), origin(filePath). Search returns {sources:[{id,label,url}],skills:Candidate[],problems:string[]}; inspect returns same catalog shape. Install returns {name,dest,origin}; origin returns Origin|undefined. Constructor options accept fetch for offline fixtures. No network request uses credentials.
- [ ] Run focused service/protocol tests and independently review source/package boundaries.

## Task 2: Backend integration

- [ ] Add failing backend tests for online installation, project authorization and offline origin records using a supplied SkillDiscoveryService fixture.
- [ ] Extend backend options with skillDiscovery; default constructs the service. Add operations, collect current visible names before install, reuse skill target authorization, reject remote project installs and preserve import audit callbacks. Expose origin only for actual listed skills under authorized roots. Run `npx vitest run tests/workbench/skill-ops.test.ts tests/protocol/skill-discovery.test.ts`.

## Task 3: Settings UI

- [ ] Add failing component tests in tests/ui/skill-discovery.test.tsx for Discover, results/details, full source identity, declared-vs-verified status, selected text files and stale response protection.
- [ ] Add src/ui/skill-discovery.tsx and source details view; integrate with src/ui/skills.tsx, App.tsx, i18n/en.ts and component-scoped styles. Connect protocol operations without giving renderer arbitrary filesystem/network access. After install refresh the installed list and sidebar count. Keep local imports available. Origin details must work after restart/offline. Run focused UI tests and existing skill UI tests.

## Task 4: Real application acceptance

- [ ] Add e2e/skill-discovery.spec.ts using e2e/fixtures.ts temporary profiles and an Electron main-process fetch fixture. Assert actual package companion files and origin on disk, displayed installation, conflict refusal and offline origin readback. Build with `npm run build`; run `npx playwright test e2e/skill-discovery.spec.ts e2e/skills.spec.ts`.
- [ ] Inspect screenshots of the actual discovery/detail screens. Run `npm run typecheck`, relevant protocol/runtime/workbench/UI regressions and `git diff --check`. Fix concrete findings with regressions.

## Task 5: Review and delivery

- [ ] Complete independent spec review followed by code review. Record exact local acceptance evidence and limits in docs/reviews/2026-10-29-skill-discovery-verification.md; update user docs and CLAUDE.md feature map.
- [ ] Commit completed work on codex/skill-discovery. Keep main and installed app untouched; do not push. Report branch, checks, real Electron evidence and any remaining limitations.
