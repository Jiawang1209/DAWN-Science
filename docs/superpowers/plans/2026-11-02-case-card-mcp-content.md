# Case card MCP content repair

**Goal:** Restore case cards for multi-block MCP results and follow-up requests in the same conversation.

**Design:** Extract card fields from individual text blocks before flattening/truncating tool output. Accept the existing server prefix and the MCP structured-content label; merge and deduplicate by case ID. History restoration uses the same extraction path. Preserve single-string compatibility, output budgets, raw records, and gallery behavior. Match explicitly mentioned cases against this round's results first; if this round has no case data, use earlier tool results in this conversation. Never read later results or infer cases from assistant text.

**Scope:** Local branch `codex/fix-case-card-mcp-content`; no installed-app replacement, service changes, or unrelated document changes.

## Implementation and verification

- [x] Add failing tests in `tests/runtime/case-results.test.ts` for two-block results, structured-only results, malformed blocks, truncation, and history restoration (including orphan results).
- [x] Change `src/cases/results.ts` to extract individual text blocks; pass blocks from `src/runtime/native.ts` and `src/runtime/history.ts` before output flattening.
- [x] Add failing conversation tests in `tests/ui/case-cards-conversation.test.tsx` for follow-ups, current-round precedence, ambiguous history, future-result exclusion, and unmentioned cases; extend `tests/ui/case-cards.test.ts` for block merging.
- [x] Move the conversation matcher from `src/ui/views.tsx` to `src/ui/case-cards.ts` and allow history fallback only when this round has no case data.
- [x] Extend `scripts/mcp-test-server.mjs` and `e2e/case-cards.spec.ts` to cover text plus structured output, follow-up without another search, actual cover loading, full case-ID selection, and restart recovery.
- [x] Run targeted Vitest, typecheck, build, and targeted Electron tests. Replay the original session read-only through the changed extraction path. Review diff and record verified results.

Use test-driven development: run each regression before changing the corresponding production behavior, confirm the expected failure, then rerun after the fix. Commands: `npx vitest run tests/ui/case-cards.test.ts tests/runtime/case-results.test.ts`, `npm run typecheck`, `npm run build`, `npm run test:e2e:only -- e2e/case-cards.spec.ts e2e/session-resume.spec.ts`.
