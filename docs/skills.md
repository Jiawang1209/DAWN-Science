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

Installed Skills use the existing project > global > builtin precedence and three invocation modes. New conversations load installed Skills; an active conversation retains its existing resource snapshot. Global installation can be used while working remotely; this version does not install into a remote server's filesystem.

## Bounded failures

Downloads are limited to 24 MiB compressed and 64 MiB expanded per repository archive, 8 MiB per file, and 10,000 archive entries. A selected package is limited to 16 MiB and 1,000 files. SKILL.md and text previews are limited to 256 KiB. Invalid paths, portable filename collisions, links, submodules and reserved origin metadata are rejected. Size, network, rate-limit, parse and name-conflict errors remain visible. Packages requiring unsupported formats or larger limits cannot be installed through this first version.

Default source listings are upstream packages, not a DAWN runtime compatibility endorsement. Their own licenses and dependencies still apply. Downloading a package never changes its license.
