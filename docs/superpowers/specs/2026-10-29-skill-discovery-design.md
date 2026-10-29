# GitHub Skill discovery and installation

Approved scope: Settings → Skills gains Installed / Discover tabs, keyword search of declared public sources, GitHub repository/directory/SKILL.md links, full preview and origin records. Work stays on codex/skill-discovery; no push, local main merge, release or installed-app replacement.

## Interaction

Installed keeps the existing search, three invocation modes and local import. Discover searches listed sources (Anthropic Skills and OpenAI curated Skills), shows which sources were searched and any failures, and supports an arbitrary public GitHub link plus optional explicit ref. Search matches package names/descriptions, not all GitHub code. Repository results select one package at a time. Details show literal SKILL.md, complete package file inventory, bounded text-file previews, repository/ref/full commit/path, license, declared dependencies and format diagnostics. Dependency declarations are not dependency checks. Runtime verification is always not_verified for downloaded packages. Download/preview never runs package code or installs dependencies.

A user installs the inspected package globally or into the current local project. Preview locks the commit and bytes; install consumes a backend-owned expiring preview ID, never trusts frontend file contents or source paths. Name collisions across visible scopes block online installation and preserve existing files. Installed rows can reopen locally stored origin information offline. Existing skill precedence remains project > global > builtin; existing sessions retain their current resource snapshot.

## Source and package boundary

Only public https://github.com URLs are accepted. Resolve repository default branch or explicit ref to a complete commit before obtaining package bytes. Ambiguous URL ref/path boundaries require an explicit ref. Network endpoints are restricted to GitHub API and codeload; bounded time, response sizes, file counts and expanded package bytes apply. Reject traversal, symlinks, submodules/unsupported entries and reserved origin-file names. Preview and installation use the complete selected package including scripts, references and assets. SKILL.md format is checked against the existing pi loader, without executing it. Declared compatibility/dependency files remain visible even if not understood.

Installation stages outside discovery roots, preserves all existing names, writes source metadata with the package, and publishes atomically. Source metadata includes repository, original URL, ref, complete commit, package path, package SHA-256, installation timestamp and not_verified runtime status. A failed install cleans its own temporary files and never overwrites another package. Cancellation/stale UI responses cannot replace the active preview or trigger installation. Network failures and rate limits are shown with retry guidance; empty results never imply every GitHub Skill was searched.

## API and lifecycle

Protocol module src/protocol/skill-discovery.ts exports source, candidate, preview, origin and preview-file schemas/types. Operations: searchSkillCatalog({query,source?}); inspectGithubSkills({url,ref?}); previewGithubSkill({url,ref?,path}); readSkillPreviewFile({previewId,path}); discardSkillPreview({previewId}); installGithubSkill({previewId,to,projectId?}); getSkillOrigin({filePath}). Backend constructs one SkillDiscoveryService and reuses the existing authorized skill roots. Opaque preview IDs expire and memory is bounded. Read-only mode rejects installation. A project installation cannot treat a remote workspace as a local directory.

## Verification

Offline source fixtures cover ref pinning, nested packages, full companion files, malformed manifests, unsupported links, size/path/link rejection, partial source failures, dependency declarations, preview expiry, name conflicts and metadata integrity. Backend tests cover protocol/authorized roots/read-only behavior and origin read boundaries. UI tests cover tabs, source failures, stale requests, preview, file selection and install result. Real built Electron acceptance exercises search → preview → installation → installed origin against an isolated fake network and temporary user directories. Read-only live GitHub inspection confirms current source layouts without installing into the user's skill library.
