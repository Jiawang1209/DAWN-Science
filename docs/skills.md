# Skills: discovery and GitHub installation

Open **Settings → Skills**. **Installed** keeps the existing local search, invocation modes, imports and removal. **Discover Skills** searches the listed public sources (Anthropic Skills and OpenAI curated Skills), or inspects a public GitHub link.

## Find one package

Enter keywords from a Skill's name or description, or leave the query empty to browse. The source selector can narrow subsequent searches. The page reports the actual search scope and individual source failures; it does not search all GitHub code. Source indexes are cached in memory for five minutes. A failed refresh is reported instead of returning an expired index as fresh.

GitHub links may identify a repository, a `tree` directory or a `blob/.../SKILL.md` file. A repository can return several packages; select one. The default branch and full commit URLs can be resolved directly. For another branch/tag, especially one containing `/`, enter the exact ref in **Branch or tag (optional)**. A URL whose branch/path boundary is ambiguous is rejected with guidance rather than guessed. Only public HTTPS GitHub sources are supported; no GitHub credential is requested or forwarded.

## Inspect before installing

Details show literal `SKILL.md`, the complete selected file inventory, bounded text previews, repository, original source URL, ref, full commit, package path, license and declared dependencies. Text is displayed without executing HTML or scripts. Binary files and text beyond the preview limit receive a notice.

**Format checks passed** means the existing pi Skill loader accepted the manifest without diagnostics. **Not runtime-verified in DAWN** remains independent: dependency declarations, compatibility claims and a valid manifest do not prove the workflow has run successfully. Local dependencies are not installed or checked automatically.

A preview pins its exact commit, bytes and safe executable modes for fifteen minutes. Installation uses that backend preview, not the current head of the branch. If it expires, preview again. Abandoning a pending UI request ignores/discards its late result; it cannot install anything. Retrieval itself is bounded by request timeouts, byte limits and a queue limit.

## Install and retain origin

Choose **Global Skills**, or **Current project** in a local project. The complete selected directory is installed, including scripts, references and assets. Existing names across the current visible project/global/builtin scopes block online installation; this path does not overwrite or update packages. Normal files are private and declared executable files retain owner-only execute permissions. Installation does not run code or dependency installers.

The installed directory contains `.dawn-source.json`: provider, repository, original URL, ref, complete commit, package path, deterministic package SHA-256 (paths, contents and executable declarations), installation timestamp and runtime verification status. **View installation origin** reads this local record and works after restart without consulting GitHub. It describes the installation, not the current integrity of locally edited files.

Installed Skills use the existing project > global > builtin precedence and three invocation modes. New conversations load installed Skills. To apply changes to an existing built-in conversation, use **Refresh conversation Skills** while it is idle. Global installation can be used while working remotely; this version does not install into a remote server's filesystem.

## Inspect and organize installed Skills

Select a Skill name to open its details, including disabled and bundled packages. The read-only file browser lists nested package resources; Markdown offers rendered and source views, while scripts remain source text. Previews do not execute scripts, render package HTML, or load images from the network. Hidden entries and symbolic links are excluded. Text previews are limited to 1 MiB, directory traversal to 2,000 entries and 32 nested levels; binary/non-UTF-8/oversized files show an explanation.

Tags initially come from `tags` or `metadata.dawn.tags` in the package frontmatter. Personal tag edits are stored on this device per manifest path and leave the package unchanged. An empty personal list clears its tags; **Restore package tags** removes the override. Search matches names, descriptions and tags, and tag filters combine with source and text filters.

Select individual rows, or **Select filtered results**, to change the selected Skills to automatic, manual-only or off. Filtering does not silently select anything; the selected count includes selections outside the current filter. **Deselect** clears them. Bulk changes report individual failures and retain those rows as selected for retry; there is no bulk delete.

**Re-read Skill list** reloads the settings catalog. This is independent from **Refresh conversation Skills**, which refreshes the active built-in conversation's Skill index and prompt for the next turn. It preserves messages, current model, enabled tools, permission settings and Python/R interpreter state. A busy conversation must finish its current operation first. External agents manage their own Skill resources. Previously loaded Skill text remains in conversation history; refresh does not rewrite historical messages. Explicit Skill commands are expanded when they enter the SDK queue: changing a mode later does not erase an already authorized queued snapshot. Its receipt appears only when that snapshot is delivered; fresh reads and commands recheck the current mode.

## Retrieve workflows in a conversation

Native conversations expose `search_skills` and `use_skill`; ACP exposes `dawn_search_skills` and the compatible `dawn_list_skills` / `dawn_use_skill` names. Child tasks use `resource_search` / `resource_read`. They share project > global > builtin precedence, personal tags and the same lexical ranking for Skills. A remote project path is never scanned as a local project directory.

Search uses names, descriptions and tags, with Unicode normalization and a small Chinese/English scientific synonym list. Results include literal matching fields/terms and pagination; they are candidates, not evidence that a method fits the scientific question. Definition-only queries and unrelated chat need no workflow. Uncovered specialist paraphrases can still miss; try a concrete domain term or exact installed name. There are no embedding services or retrieval network calls.

Automatic search excludes manual-only and off Skills after resolving same-name precedence. In native conversations, `/skill:name` explicitly loads a manual Skill. Off Skills cannot be loaded through controlled read routes. Reads recheck policy and package containment; they do not execute a package's scripts or grant any execution permissions. With more than 20 automatic Skills, native conversations use retrieval instead of including every Skill description in the system prompt; slash command entries remain available.

## Instruction-read evidence

Successful controlled reads show **已读取技能 / Read Skill**, scope, relative resource and partial/full status even when tool rows are collapsed. Expand the row for the manifest path, read route and SHA-256 of the delivered text. Paged reads produce separate partial receipts; a search result, failed read or arbitrary JSON in a different tool's output does not create a receipt. Native direct `read` calls inside a known Skill package and actual explicit Skill expansion are also observed. Standalone Shell reads or files opened by an external agent outside DAWN's gateway are outside this guarantee.

Native and child history retain these receipts. ACP gateway reads also persist in the tool ledger. After restart DAWN can reopen ACP Skill receipts as an exited, read-only history view; this does not restore the external agent's full chat or resume its process. Reading instructions is distinct from executing code, applying a workflow successfully or validating scientific conclusions.

Run `npx tsx scripts/evaluate-skills.ts --json /tmp/skill-evaluation.json` for the bounded offline acceptance fixture. See [the evaluation report](superpowers/reports/2026-11-01-skill-retrieval-evaluation.md) for baseline, prompt metadata sizes and limitations; mock-provider integration tests verify the transport/UI rather than real model selection quality.

## Dock refresh

The **Files** panel exposes a visible refresh action that rereads the current folder and expanded branches, or reruns the current filename search, without collapsing navigation. The **Artifacts** panel exposes refresh in its file, delivery and preview views. It reloads the recorded inventory, delivery records and displayed file previews/thumbnails; it does not register arbitrary unrecorded files as generated artifacts. Refresh errors remain visible while preserving the last valid inventory and current selection.

## Bounded failures

Downloads are limited to 24 MiB compressed and 64 MiB expanded per repository archive, 8 MiB per file, and 10,000 archive entries. A selected package is limited to 16 MiB and 1,000 files. SKILL.md and text previews are limited to 256 KiB. Invalid paths, portable filename collisions, links, submodules and reserved origin metadata are rejected. Size, network, rate-limit, parse and name-conflict errors remain visible. Packages requiring unsupported formats or larger limits cannot be installed through this first version.

Default source listings are upstream packages, not a DAWN runtime compatibility endorsement. Their own licenses and dependencies still apply. Downloading a package never changes its license.
