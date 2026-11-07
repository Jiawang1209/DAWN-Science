# Independent SPEC review: isolated trial retry/background guard

Verdict: SPEC PASS for the assigned four-file pilot-guard fix. No P1/P2 findings.

Reviewed workspace: /Users/liuyue/.codex/worktrees/dawn-research-collaboration-p1-p4-20261107/dawn-science
Review boundary: pilot-guard.md and its explicit four-file behavior; this is not approval of the entire uncommitted A-D2 branch.
No product source edits, rebuild, real provider calls, credential inspection, formal profile settings/database changes, commits, merges or pushes were performed. Writes were isolated under this unique /tmp evidence directory and disposable fixture roots created/removed by existing tests.

## Requirement checks

- scripts/evaluate-research.ts:45-55 stores exact expected JSON bytes, writes new policy files with wx, and records any changed/missing retained policy file as trial-settings.
- scripts/evaluate-research.ts:85-86 creates a fresh mkdtemp trial root and project .pi/settings.json. Single agent policy at :103 uses the same directory passed as agentDirOf at :106. Multi policies at :119 derive scheduler.dir(team.id), actual member.sessionDir and current member.turns; actual scheduler backend uses this exact composition at src/team/scheduler.ts:403-414.
- SDK FileSettingsStorage uses cwd/.pi/settings.json and agentDir/settings.json; createAgentSession calls SettingsManager.create(cwd,agentDir). Cache warming is global-only, default streaming. Empty-directory independent probe reproduced retry true/3, compaction true and warming streaming. Evidence in sdk-path-policy-evidence.txt and agent-drift-probe.log.
- research-manifest.ts:32-33 publishes retry.enabled false/maxRetries 0/provider.maxRetries 0, compaction.enabled false and cacheWarming off. :64-66 includes equal project/agent policies in stable fingerprint. Helper module is source-frozen by evaluator. Independent probe recomputed emitted fingerprint, then changed agent retry policy and confirmed fingerprint changes.
- Existing actual-built-child localhost HTTP500 test freshly passes: single failed with 1 request, multi failed with 1 request (failed check scope), server total 2. It loads SettingsManager against every emitted policy directory, checks both arms' effective retry false/0, provider retries0, compaction false and warming off. Full paired runner test exercises check/analyze/review for successful/blocked deterministic tasks.
- Project policy drift existing test preserves first arm accepted/success, makes comparisonEligible false, qualifiedPairs0 and later arm not-run. Additional independent agent-global MODIFY and DELETE probes each preserve first arm accepted/success/inputPreserved with 4 counted requests, later arm not-run/requests0, and trial-settings integrity failure. Exact output retained under modify-*/results and delete-*/results.
- Existing :65-69 checks integrity before/after each arm; changed state is monotonic. Scientific receipt/judge state is not rewritten by comparison invalidation. Fixed pipeline still maxRevisions0. No tool scope, permission tier, science contract, input preservation, request-gate or quota implementation was changed by this fix.
- Fresh gate/science tests include total30 cap, independent15/15, multi work11/review4 without borrowing, cancellation/drain, input preservation and deterministic task judging. Existing paired staged-runner test also passes.

## Fresh commands

1. npx vitest run --project node tests/evaluation/research-runner.test.ts tests/evaluation/research-manifest.test.ts: exit0, 2 files / 15 tests passed, 40.20s (focused-tests.log).
2. ./node_modules/.bin/vitest run --project node tests/evaluation/request-gate.test.ts tests/evaluation/research-tasks.test.ts: exit0, 2 files / 16 tests passed, 620ms (gate-science-tests.log).
3. ./node_modules/.bin/tsx /tmp/dawn-pilot-guard-spec-3LasiuLd/agent-drift-probe.mts: exit0 (agent-drift-probe.log).
4. npm run typecheck: exit0 (typecheck.log).
5. git diff --check: exit0 (diff-check.log/check-exits.txt).
6. Four scoped files plus actual dist/electron/subagent-child.js pre/post SHA256 comparison: exit0, unchanged (pre-sha256.txt/post-sha256.txt/check-exits.txt). Evaluator/manifest/child hashes match dispatch identities.

## Boundaries

All inference traffic in this review was loopback deterministic mock HTTP. This confirms the actual built child and installed SDK failure/config-loading behavior; it does not claim live-provider performance or scientific benefit. The HTTP500 actual-child test checks the first failed scope in each arm; successful full paired fixture execution covers downstream stages. Drift is checked at arm boundaries, as specified; this is not an in-arm continuously enforced file watcher. No full Kernel or Electron UI verification; historical 7.35s/20.69s timing limits remain OPEN. The original RED evidence was inspected as reported context; this reviewer did not revert source to independently recreate RED.
