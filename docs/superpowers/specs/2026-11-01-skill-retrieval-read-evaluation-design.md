# Skill retrieval, read records and evaluation

The user approved this scope after brainstorming, requested a new branch and local implementation without pushing. Base: `7c74045d`; branch: `codex/skill-retrieval-read-evaluation`.

## Behavior

1. Main native conversations gain `search_skills` and `use_skill`. Search returns a small paged metadata result with source, personal/package tags and literal match evidence. Ordinary concept/chat requests do not require a Skill search. Reading returns bounded text, never executes scripts and cannot grant tools or authorize analysis. Existing `/skill:name` remains available.
2. Native, ACP and child resources share discovery precedence and ranking: project > global > builtin, deduplication before invocation filtering. Automatic discovery excludes manual/off. Explicit user invocation may read manual Skills; off never becomes visible through an alternate catalog. Remote filesystem paths are never treated as local project roots. Existing ACP aliases remain supported with controlled reads.
3. Retrieval is local lexical matching with Unicode normalization, bounded Chinese terms and a small documented scientific synonym list. Personal tags use the same per-manifest setting as the installed catalog. No embeddings, external requests, broad automatic execution or new workflow engine.
4. To avoid an unbounded metadata prompt, large installed catalogs use the search tools instead of placing all installed descriptions in the prompt. Small catalogs retain their existing SDK hints. Manual invocation continues working in both cases. Refresh updates the catalog and prompt together without restarting sessions/kernels.
5. Successful reads carry a typed receipt: Skill name, manifest path, relative resource, scope, route (`use_skill`, `read`, `manual`, `acp`, `resource`), SHA-256 of delivered text and whether partial. Search results, failed/denied reads and arbitrary JSON in other tool output do not create receipts. Native direct `read` and explicit Skill expansion are recorded when observable. Receipts persist in transcript metadata and remain visible after resume. External standalone file/Shell reads remain outside this observability guarantee.
6. The transcript shows read receipts as “Skill instructions read”, with source, resource and partial/full status. It explicitly distinguishes instruction reading from code execution and scientific validation. Main, ACP gateway and observed child reads use the same shape.

## Acceptance

Use fixed real bundled Skill metadata plus synthetic collision/manual/off/package fixtures. Evaluate representative Chinese/English scientific requests, unrelated requests, tags, paging and literal reasons. Compare existing exact-phrase retrieval to new top-k ranking on this declared fixture set; report results without claiming general real-model trigger quality. Separately use mock-agent integration/Electron tests for search→read records, denial, resume and manual commands. Measure prompt characters/bytes for a large synthetic catalog; do not claim token/cost reductions without provider measurements.

Update `writing-skills` to describe catalog refresh and current native conversation refresh. Document compatibility, evaluation commands and limitations. Preserve existing memory retrieval behavior and scientific execution gates.
