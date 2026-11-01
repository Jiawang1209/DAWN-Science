# Installed Skills management and refresh

The user approved implementation on a new branch after the local Wisp comparison.

## User-visible behavior

- Installed Skills open a detail page with description, scope, invocation mode, personal tags, installation origin and a bounded read-only package file browser. Markdown defaults to a rendered view with a Source toggle. Package HTML and remote images must not execute/load. Disabled and bundled packages remain browsable.
- Tags default to package frontmatter (`tags` or `metadata.dawn.tags`). Personal edits live in local settings keyed by the package manifest path; bundled files and upstream content are untouched. An empty personal list intentionally clears tags; reset restores package tags.
- Catalog supports tag search/filter, selected-row bulk mode changes (automatic/manual/off), clear selection, and refresh. Bulk results report individual failures and preserve successful changes; no bulk deletion.
- A distinct “Refresh current conversation” action refreshes the native session's installed Skill index and prompt for its next turn. History, active tools, interpreter state, model and approvals remain intact. Busy sessions reject with a retryable user-facing explanation; unsupported external runtimes say so. Ordinary catalog refresh never implies the active runtime was refreshed.
- File and artifact dock panels expose visible refresh controls. Refresh preserves navigation, expanded folders, selection and existing preview. Artifacts refresh the recorded inventory and existing previews/thumbnails; it does not claim to discover unrecorded filesystem output.

## Implementation boundaries

Add typed protocol operations for installed-package inventory/read, tags, bulk invocation and session refresh. Package reads require a manifest discovered in configured roots, forbid path traversal/symlinks, and enforce file/depth/byte limits. Read-only inspection does not execute resources. Reuse existing mode writes and auditing. Refresh only Skill resources using pi's public resource extension API and rebuild its prompt with the current tool names; avoid broad session reload.

## Verification

Temporary-package tests cover content, binary/oversized files, traversal, symlinks, tags, read-only packages, partial bulk failures and precedence. Runtime checks use offline sessions to prove live index/prompt changes without restart, message/tool preservation and busy rejection. Component checks cover detail navigation, stale requests, filters/selection, refresh controls and failures. Run focused regressions, typecheck and build; inspect Electron UI where available.
