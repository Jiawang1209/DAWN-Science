# Independent frozen-pilot audit

PASS

Checks: 115/115

PASS run IDs
PASS manifest fingerprint independently recomputed
PASS runtime frozen integrity
PASS manifest/report source identity
PASS frozen child fingerprint
PASS frozen execution SHA256 frozen-execution/current-api-20261108.mjs
PASS frozen execution SHA256 frozen-execution/subagent-child.js
PASS frozen execution SHA256 frozen-execution/run-frozen-pilot.mjs
PASS frozen execution SHA256 frozen-execution/helper-build.json
PASS helper launch/build identity
PASS 632 candidate source SHA records: 632
PASS candidate records cover src set used in report
PASS authorized model settings
PASS stage declarations consistent
PASS 30/15/11+4 allocation
PASS global gate settled 24/30
PASS before/after profile hash records unchanged
PASS pilot process exit 0
PASS frozen retry/compaction/cache-warm settings
PASS persisted trial settings carbon-missing-multi-iUeN2Q/.pi/settings.json
PASS persisted trial settings carbon-missing-multi-iUeN2Q/session/teams/research/members/review/agent/0/settings.json
PASS persisted trial settings carbon-missing-multi-iUeN2Q/session/teams/research/members/analyze/agent/0/settings.json
PASS persisted trial settings carbon-missing-multi-iUeN2Q/session/teams/research/members/check/agent/0/settings.json
PASS persisted trial settings carbon-missing-single-0pNKpj/single/settings.json
PASS persisted trial settings carbon-missing-single-0pNKpj/.pi/settings.json
PASS baselineUsage input/output-only code retained
PASS SDK session zeroes-unverified branch retained
PASS pipeline complete with actual review stage
PASS single exact input bytes preserved
PASS single input JSON fingerprint matches manifest
PASS single independently computed n mean unit
PASS single qualified accepted
PASS single output SHA and bytes results/analysis.py
PASS single output SHA and bytes results/result.json
PASS single output SHA and bytes results/report.md
PASS single script stdlib imports: ['__future__', 'csv', 'json', 'math', 'sys', 'decimal', 'pathlib']
PASS single/single all tool calls have ordered results
PASS single recorded bash cleanup observed
PASS single/single final write plus recorded cleanup results/analysis.py
PASS single/single final write plus recorded cleanup results/report.md
PASS single/single actual read payload results/report.md
PASS single/single actual read payload results/analysis.py
PASS single/single actual read payload results/result.json
PASS single/single positive observed input output; nonnegative SDK cacheRead
PASS single request count from raw assistant turns: {'single': 10}
PASS single visible input+output usage: {'input': 14010, 'output': 5893, 'cacheRead': 113152, 'cacheWrite': 0, 'reasoning': 1787, 'totalTokens': 133055}
PASS single per-arm settled partition
PASS single host accepted submission counts
PASS single no host rejected submission
PASS single SDK rejection raw count
PASS single formal submission n/mean equals file
PASS single exact elapsed aggregate
PASS multi exact input bytes preserved
PASS multi input JSON fingerprint matches manifest
PASS multi independently computed n mean unit
PASS multi qualified accepted
PASS multi output SHA and bytes results/analysis.py
PASS multi output SHA and bytes results/result.json
PASS multi output SHA and bytes results/report.md
PASS multi script stdlib imports: ['csv', 'json', 'math', 'os', 'sys']
PASS multi/review all tool calls have ordered results
PASS multi/review actual read payload results/analysis.py
PASS multi/review actual read payload results/result.json
PASS multi/review actual read payload results/report.md
PASS multi/review actual read payload input.csv
PASS multi/review positive observed input output; nonnegative SDK cacheRead
PASS multi/analyze all tool calls have ordered results
PASS multi/analyze actual read payload input.csv
PASS multi/analyze final write plus recorded cleanup results/analysis.py
PASS multi/analyze actual read payload results/result.json
PASS multi/analyze final write plus recorded cleanup results/report.md
PASS multi/analyze positive observed input output; nonnegative SDK cacheRead
PASS multi/check all tool calls have ordered results
PASS multi/check actual read payload input.csv
PASS multi/check positive observed input output; nonnegative SDK cacheRead
PASS multi request count from raw assistant turns: {'review': 4, 'analyze': 7, 'check': 3}
PASS multi visible input+output usage: {'input': 41691, 'output': 11389, 'cacheRead': 162432, 'cacheWrite': 0, 'reasoning': 3882, 'totalTokens': 215512}
PASS multi per-arm settled partition
PASS multi host accepted submission counts
PASS multi no host rejected submission
PASS multi SDK rejection raw count
PASS multi formal submission n/mean equals file
PASS multi exact elapsed aggregate
PASS work/review turns independent
PASS work isolated settled gate
PASS review isolated settled gate
PASS check accepted with one host attempt
PASS check receipt inputs input.csv
PASS check trace payload call_00_ET_yMbvtfyGuyJ3t9n0nxAD7352
PASS check trace payload call_00_6wCD2q6P71i4RbKSqQi76530
PASS check trace payload call_01_RvqHx3hJ1Jc5csizCmFY5537
PASS analyze accepted with one host attempt
PASS analyze receipt inputs input.csv
PASS analyze receipt outputs results/analysis.py
PASS analyze receipt outputs results/result.json
PASS analyze receipt outputs results/report.md
PASS analyze trace payload call_00_ET_pomNCufai9aIbWj5NIXD8851
PASS analyze trace payload call_00_epKmMxRAwOF5PjP3NEFP7727
PASS analyze trace payload call_00_ET_Nl29eDKkvCpEhYVYxua34898
PASS analyze trace payload call_00_TuVqfSLfZq2nrdoRrNVT1776
PASS analyze trace payload call_00_qcXAPg90iwQwf3z0w8to3972
PASS analyze trace payload call_00_OyohpcndtG9d7YWF5Psx2885
PASS review accepted with one host attempt
PASS review receipt inputs results/analysis.py
PASS review receipt inputs results/result.json
PASS review receipt inputs results/report.md
PASS review trace payload call_02_ET_egdnGhu6snrHoSFkKYk78048
PASS review trace payload call_00_ET_QxA7Ou1EiYStt9mVGgVY1993
PASS review trace payload call_01_ET_9nIZ2tjmgU7dgJaULXRn9720
PASS review trace payload call_00_9xzcPlm4oE3GpZpbNzQ44298
PASS formal review pass and exact reviewed paths
PASS review cited real completed reads before pass
PASS SDK rejection reason reviewedPaths schema
PASS gate total equals arm requests
PASS frozen evidence unchanged during audit

Observations:
- Only frozen pilot evidence was read. No model/provider invocation, generated-code execution, Electron/API startup, formal profile/DB access, source/report writes, or new quota consumption occurred.
- Two actual input byte streams match the CSV embedded in research.json; JSON-string inputHash is distinct from raw-byte SHA256 by design, and both were independently verified.
- Source integrity.changed=[] is the frozen runtime comparison result. The 632-file candidate SHA index is retained; source text cannot be reconstructed from hashes. Current working-tree source was deliberately not compared, because D3 edits started after pilot exit and are outside execution evidence.
- One SDK validation failure is retained at review transcript line 13, missing data.reviewedPaths. The following assistant turn line 14 supplies it and line 15 is host accepted. This is explicit model correction, not automatic HTTP/provider retry, and it consumed the fourth review request. No new retry run is proposed.
- Retry disabled/maxRetries=0/provider.maxRetries=0, compaction off and cacheWarming off are present in frozen declaration and every persisted trial settings file. Raw assistant-turn counts equal gate counts. Frozen evidence does not include raw HTTP exchanges; this audit does not claim packet-level absence of retries.
- VisibleTokens 19903/53080 means input+output only. Raw cacheRead is 113152/162432 and is excluded; raw totalTokens sums are 133055/215512. Neither number is a price. partialUsage=false/unknownUsageTasks=0 only covers presence of input/output; it is not a general all-usage-or-cost completeness statement.
- All 24 assistant messages have positive input/output. Single first assistant turn (JSONL line 6) has SDK cacheRead=0. Frozen sessionUsage(...,true) marks zeroes unverified, so its cacheRead aggregate is partial; baselineUsage ignores cacheRead partialness. Thus report partialUsage=false does not establish complete cache usage. Raw cacheWrite=0 and cost=0 are SDK/declaration fields without raw-provider evidence, not confirmed zero cache writes or zero money; this pilot report is not the D2 native usage ledger.
- Configured reasoning=false and thinking-level off are verified declarations; SDK usage still reports reasoning counters (single 1787, multi 3882). These counters alone do not establish provider execution mode. Reasoning is not added again to totalTokens.
- Single 10 requests/44529 ms and multi 14/73719 ms are one completed sequential pair on one self-made 48-row carbon task. Multi is slower here; no general speed, quality, reliability, or monetary advantage is established. The launch sampling noise and fixed arm order were not experimentally controlled.
- Profile unchanged is verified only by comparing retained parent before/after hashes; no formal profile files were reopened. postReportToOsCloseMs=23.8924 measures final report observation to OS close and includes cleanup, not pure app shutdown. Historical shutdown remains OPEN and has no root-cause conclusion.
- The single agent made two pre-submission generated-script cleanups via a successful recorded bash tool call (line 12): removing an unused overwritten result assignment and a NoReturn annotation. Independently applying only those literal replacements to the initial write yields the accepted final script; final read payload also matches it. These are task artifact edits, not DAWN source drift.
- Independent review actually read all three versioned analysis outputs and input.csv, with exact payload matches and bound trace SHA256. It submitted formal pass. The reviewer did not execute the script; this audit uses independent Decimal arithmetic and static AST/import inspection, not a rerun of model-generated code.
