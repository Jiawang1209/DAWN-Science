# A3 pilot: isolated retry and background-request guard

2026-11-08; implementation complete; independent SPEC and QUALITY reviews both PASS. No real model requests were made by this task.

The actual built child previously inherited Pi's `retry.enabled=true` and `maxRetries=3`. The localhost HTTP 500 RED probe recorded four requests for the single scope and four for the failed check scope in the multi arm. The evaluation trial was not restarted, but the SDK automatically repeated its failed scope.

The evaluator now writes this credential-free policy before either arm starts any child:

```json
{"retry":{"enabled":false,"maxRetries":0,"provider":{"maxRetries":0}},"compaction":{"enabled":false},"cacheWarming":"off"}
```

It writes only inside each newly created trial directory: `.pi/settings.json` plus the single child agent's `settings.json`, or the three Team members' current agent directories. Team paths derive from `scheduler.dir(team.id)`, the actual `member.sessionDir` and `member.turns`; the fixed pipeline retains `maxRevisions:0`. Pi reads cache warming from **global settings only**, so the project file alone would leave warming at its `streaming` default. Both project and agent policy values are explicitly included in `research-manifest.json` under `execution.trialSettings`, hence in its fingerprint. The helper lives in the already source-frozen research-manifest module.

The evaluator retains exact text for all policy files and checks it with the existing source/build/model integrity checks before and after arms. A changed or missing policy marks `trial-settings`, makes `comparisonEligible:false`, sets comparable qualified pairs to zero and prevents later arms from starting. It does not rewrite the completed arm's terminal or scientific acceptance. All attempted requests still count at the existing request gate; the 30 total / 15 each arm / multi work 11 and review 4 allocation and non-borrowing rules remain unchanged.

Changed implementation and tests:

- `scripts/evaluate-research.ts`: prepare isolated policy files and check their integrity.
- `src/evaluation/research-manifest.ts`: declare the shared trial policy and freeze both scopes.
- `tests/evaluation/research-runner.test.ts`: actual built-child localhost 500 probe, actual SDK settings loading for both arms, settings drift with preserved scientific acceptance.
- `tests/evaluation/research-manifest.test.ts`: explicit public frozen policy assertion.

Verification (all logs first written in unique `/tmp/dawn-pilot-guard-qOBaBI`, then copied into [evidence/pilot-guard](evidence/pilot-guard)):

| Command | Exit | Evidence |
|---|---:|---|
| `npx vitest run --project node tests/evaluation/research-runner.test.ts -t 'pins both arms\|invalidates settings drift'` before implementation | 1 | `red.log`: actual 500 probe failed on 4 versus 1 requests for each arm. The initial drift test also had a fixture ENOENT and timeout; that failure is retained, not treated as valid drift RED. |
| `npx vitest run --project node tests/evaluation/research-runner.test.ts -t 'invalidates settings drift'` after fixing only the fixture's absent-file handling | 1 | `red-drift.log`: clean assertion failure, comparison stayed eligible because policy drift was not checked. |
| `npx vitest run --project node tests/evaluation/research-manifest.test.ts` before implementation | 1 | `red-manifest.log`: frozen `trialSettings` missing, 1 failed / 4 passed. |
| `npx vitest run --project node tests/evaluation/research-runner.test.ts tests/evaluation/research-manifest.test.ts -t 'pins both arms\|invalidates settings drift\|freezes the actual'` | 0 | `green-focused.log`: 3 passed. 500 produced one request per failed arm, and actual `SettingsManager` loads retry false / zero, provider zero, compaction false, warming off in both arms. |
| `npm run typecheck` | 0 | `typecheck.log`. |
| `npx vitest run --project node tests/evaluation` | 0 | `node-evaluation.log`: 11 files / 114 tests passed, including full paired offline runner, staged quotas and request gate. |
| `git diff --check` | 0 | `diff-check.log`. |

No child/runtime source changed, so this task reused the existing actual child bundle rather than rebuilding it; [sha256.txt](evidence/pilot-guard/sha256.txt) records the exact bundle and source/test identities. This verifies localhost failure handling and deterministic execution, not live provider behavior or scientific model performance. No generic runtime setting, timeout, formal profile/database, old manifest, release, commit, merge or push was changed. Historical Electron 1500/4000 row timing limits remain OPEN (7.35s / 20.69s), outside this task.

Independent acceptance: SPEC 31 tests plus agent-setting mutation/deletion probes; QUALITY 26 tests (runner/manifest + request gate). Both verified actual SDK global warming policy and unchanged frozen file hashes. Complete reports and logs archived in evidence/pilot-guard/independent-spec and independent-quality. No real API was used by either review.
