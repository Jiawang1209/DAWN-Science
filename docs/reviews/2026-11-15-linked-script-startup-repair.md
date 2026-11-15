# Branch preview startup repair

The real preview exposed two independent failures. Its launch environment used `DAWN_CREDENTIAL_SOURCE`, a deliberately read-only adapter. Testing a newly typed key could succeed, but saving it raised the adapter's read-only error. The launcher REPL then timed out while macOS keychain authorization was pending; its pipes closed. Logging the credential error to stderr emitted `EPIPE`, reaching the desktop uncaught-exception dialog.

## Repair

- Install a narrow stdout/stderr error listener before startup work. It consumes only `EPIPE` from those two streams and records closure once in the existing file log. Other stream errors and network errors retain their reporting policy.
- Launch the preview independently of REPL ownership, with stdout/stderr directed to a persistent file opened with mode 0600.
- Use a profile-owned writable credential store. Copy only the existing encrypted DeepSeek entry into the isolated profile; no plaintext key is exported, and the original credential file remains unchanged. Remove `DAWN_CREDENTIAL_SOURCE` from this preview's environment.
- User completed the system keychain authorization for the repaired process. Credential metadata now reports DeepSeek configured, encrypted, no broken entries, verified true.

## Verification

- Five standard-pipe tests passed, including real child processes that continue writing after the parent closes stdout or stderr. Repeated writes survive; closure is recorded once; EIO and unrelated sockets remain errors.
- Credential and verification suites: 40 tests passed across three files. Typecheck and complete build passed.
- Two continuous-script Electron flows passed; first-run and model-error flows passed (four additional cases). Invalid model keys still produce their normal user-facing error.
- Independent startup review approved with no actionable findings.
- Actual DeepSeek generated an R/ggplot2 iris script. Two subsequent plain-chat requests produced reviewable diffs and applied back to the same file; a manual unsaved comment was preserved in the second round. The new demo was saved and run in a real R kernel, followed by a `print(p)` selection run. Three plot-history entries and an 840×840 output were observed without errors.
- Original main process remained untouched. The repaired process is PID 98714 with the isolated `DAWN-Branch-Linked-Script-Experience` profile. No merge or push.

## Input-area placement correction

The user rejected a permanent script-connection row inside the composer. All connection controls now live in the side editor below the file location. When the editor closes, the conversation header exposes one compact filename entry to reopen it. The composer contains no connection controls in either state; automatic linking and request preparation are unchanged.

Placement validation: 167 targeted UI/i18n/design tests, typecheck/UI build, and three Electron cases passed. Independent review approved. Live renderer refresh restored exact text, path, saved baseline, version, requests and association; the R kernel and plot history remained alive. Verified one editor control row while open, one header entry while closed, zero rows inside the composer, and working reopen.

## Repeated execution title removal

The user confirmed removing only the redundant lower “选区执行／脚本执行” heading, retaining graphs and actual output. The upper Run selection/script action stays unchanged; interruption remains available while running. Removed the now-unused translations and changed the real-R E2E to assert the heading is absent while selection execution still produces plot history.

Verification: 159 UI/i18n/design tests passed; after correcting a test-only role-query type, the 45 editor tests and typecheck passed again. UI build and all six original-script/real-R/plot gallery E2Es passed. Live refresh preserved the latest editor snapshot and same backend kernel, with zero repeated titles, one upper selection-run action, the current plot still present, and zero script controls inside the composer.
