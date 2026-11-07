# Independent QUALITY review: isolated pilot policy guard

Result: PASS. No actionable P1 or P2 findings in the small fix.

Scope: only the pilot retry/background-request guard in scripts/evaluate-research.ts, src/evaluation/research-manifest.ts, tests/evaluation/research-runner.test.ts and tests/evaluation/research-manifest.test.ts. The branch has substantial earlier uncommitted A-D2 changes; this review does not approve the entire branch. Read-only repository review; evidence is written only in this unique /tmp directory. No real model API, credentials, formal configuration/database, build, commit, merge, push, or release was performed.

## Evidence and findings

- SDK path: subagent realSession passes spec.cwd and spec.agentDir to createAgentSession. Installed Pi SDK explicitly constructs SettingsManager.create(cwd,agentDir). SettingsManager.getCacheWarmingMode reads globalSettings only and defaults to streaming; the agent-level settings.json is therefore necessary and correctly supplied. Retry.enabled false/maxRetries 0 and provider.maxRetries 0 disable the agent and provider retry layers; compaction.enabled false and global cacheWarming off are correctly named for the installed SDK. SDK source references are in sdk-policy-evidence.txt.
- Isolation: evaluator writes with exclusive wx into a new mkdtemp trial root. Project policy is root/.pi/settings.json. Single agent policy uses the same root/single supplied to SubagentExecutor.agentDirOf. Multi policy derives from scheduler.dir(team.id), member.sessionDir and member.turns, matching scheduler agentDir exactly. Generic runtime defaults and formal profiles are outside this change.
- Later Team scopes: the fixed pipeline has maxRevisions:0; one initial agent directory is prepared for each of the three members. Existing scheduler rejects pipeline member team_send to non-captain recipients, preventing extra out-of-stage mailbox turns. This review supports the current fixed pipeline; future revisions or additional turns would require policy preparation for each actual new agentDir.
- Frozen ownership: manifest.execution.trialSettings exposes independently created project and agent policy objects in the stable fingerprinted structure. research-manifest.ts is in the candidate source freeze. Exact text of every written settings file is retained and checked before and after arms, with read/absence failures counted as trial-settings drift. Drift marks comparisonEligible false, zeroes qualifiedPairs and causes later arms to be not-run without rewriting the completed arm science verdict.
- Error paths: policy creation is exclusive and occurs before the corresponding child starts; failure cannot silently fall back to formal/default agent settings. Child failure is recorded as failed rather than correct blocking. Lease cleanup remains idempotent and drained before counters. No new retry loop was added.
- Quotas/concurrency: policy generation does not alter the hard gate or arm/stage partition logic. Gate reserves synchronously before its first await; every started attempt remains included in reserved/forwarded counters, and work/review quotas remain non-borrowing. Existing staged-run and gate concurrency/cancellation tests passed independently below.
- Maintainability: a small credential-free policy factory belongs in the already frozen manifest module; evaluator consumes the manifest itself when writing files, avoiding policy declaration/application duplication. Team path construction deliberately mirrors existing scheduler data rather than assuming member names or hard-coded session subpaths.

## Independently executed verification

1. Actual built-child runner and manifest files: 2 files / 15 tests passed, exit 0, duration 42.22 s. Includes localhost HTTP 500 producing exactly one request per failed single and multi/check arm; SDK SettingsManager load verifies all generated single and three multi agent directories; settings drift invalidates comparison and retains the first arm scientific acceptance; full paired offline execution, staged 11/4 quota reserve and cancellation/drained counters pass.
   Command: npx vitest run --project node tests/evaluation/research-runner.test.ts tests/evaluation/research-manifest.test.ts tests/evaluation/evaluation-request-gate.test.ts tests/evaluation/research-trial-budget.test.ts
   Note: the last two filter paths do not exist; Vitest executed exactly the first two files. The real request-gate file was explicitly executed separately in step 2.
   Full stdout/stderr: focused-tests.log; exit: focused-tests.exit.
2. Request gate: 1 file / 11 tests passed, exit 0, duration 543 ms.
   Command: npx vitest run --project node tests/evaluation/request-gate.test.ts
   Full stdout/stderr: request-gate.log; exit: request-gate.exit.
3. Pre/post SHA-256 of all four scoped source/test files and actual dist/electron/subagent-child.js match (diff exit 0). Evaluator 6f47e125f40df6efda09f4a93a34f0390307ae17b3e5c2ebfb954ebb622916f8; manifest 28b32c4fb945cbe28e979b281ae11f2f03fa90cc4c9748053f510f1d2bc4ef19; child 96b1f3e966c391d88fb45fa9524dbb61d4b0203da6ac4cbf69ae41f577d7063e.
4. git diff --check exit 0.

## Boundaries

26 independently executed tests validate the local built child, policy reading, integrity gating, request accounting and deterministic scientific execution. No live provider inference, real-model scientific quality, new Electron rendering/performance claim or whole-branch regression claim is made. Historical Electron 1500/4000-row 7.35s/20.69s observations remain OPEN; no timing budget was changed. Typecheck and the broader 114-test evaluation regression were not repeated here; their earlier evidence is separate from this independent run.
