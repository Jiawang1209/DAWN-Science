# Desktop CLI QA

Claims and checks:
- Existing desktop provider/key reused: launch real Electron with read-only encrypted credential source, no API_KEY environment variables, submit an actual model request; compare source configuration/credential hashes before and after.
- DAWN/Normal mode buttons control one PTY: enter via button, exit via button and `/exit`, manual `dawn` reflected in button; shell PID, exported value and cwd unchanged.
- Model follows owner: select current session model before entry, inspect CLI announced model and submit request.
- Tool execution: ask real model to read fixture and create one isolated proof file; inspect disk and terminal response.
- Permissions and questions retain CLI interaction: deterministic existing CLI regression, desktop protocol scoped tests, real permission test if tool asks.
- No duplicate chat input: full terminal occupies main, original composer hidden, button group single header.
- Busy shell/pending text/interpreter: refuse DAWN launch without injecting into program; user can clear/exit and retry.
- Disconnection and Normal while busy: stop only CLI scope and preserve original owner and Shell.
- Visual: light/dark 1280×840, smaller 1000×720; active modes, error placement and focus.
- Isolation: branch/worktree, production main clean, source hashes unchanged, installed application untouched; no push/merge.
