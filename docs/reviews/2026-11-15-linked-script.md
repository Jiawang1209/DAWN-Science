# Continuous script connection verification

## Result and accepted behavior

User approved “打开哪个，关联哪个”: entering side-by-side script editing automatically connects that document to the current chat. Opening another script editor replaces the target while preserving old drafts. Read-only file previews do not retarget. Closing the editor keeps the connection; the compact composer strip reopens the exact document or ends connection and closes the editor. Other session/workspace/connection scopes remain independent. There is no extra association button.

Each ordinary primary native composer submission captures the current complete unsaved draft. Reply matching uses an exact immutable context envelope, independently of attachment path substitutions in the instruction. Source remains collapsed in the user turn. Existing one-shot selected edits take precedence. Code responses still require diff review and explicit application into the original draft, with one undo step and post-send stale protection. Saving and running remain manual.

## Review fixes

- Attachment token substitution operates only on the instruction; source literals cannot revive removed attachments.
- Linked replies match the exact snapshot envelope rather than instruction text that may be normalized by sending.
- Source U+2060 is preserved through echo, backend paste cleanup and reference expansion. Pasted instruction guards survive to backend scanning, so pasted `@R`/`@file` remain ordinary text.
- Mention and kernel shortcut scans ignore attached script source. File references are inserted before the immutable envelope.
- Pending file reads cannot reconnect/reopen after an explicit End: editor activation checks the captured binding identity, active document and current scope after awaiting.
- Literal marker examples are not mistaken for retained one-shot contexts; copied complete old linked contexts are rejected with refill guidance.

Independent spec and quality reviews approved after these fixes. Reviews were read-only.

## Validation

- Red → green recorded for association snapshots, whole-document review, automatic follow, ending during pending open, attachment rewriting/removal, pasted shortcut guards and source Unicode preservation.
- Focused 7-file final check: 191 tests passed, including UI/i18n/design contracts, state/helper and file mentions.
- Typecheck and complete build passed. Existing build chunk-size and evaluation warnings remain.
- Final serial editor/completion/composer/plot Electron verification: 16/16 passed, including real Python and R kernels and PNG/SVG export. Cloud replies are mocked in these tests.
- Final Node/UI suite, without concurrent Electron tests and with four workers: 756 files passed; 7,492 tests passed, 10 skipped. Earlier concurrent broad run had two timing-related failures (research-runner 60s timeout; run-overview elapsedMs 1→2); both passed in the complete final run.
- Cosmetic final pass shortens collapsed snapshot labels to the filename, retaining the full path as the accessible name. This prevents long paths filling the chat bubble. Focused tests, typecheck/UI build and two linked-script E2Es rechecked after that change.
- Visual evidence: `output/playwright/code-editor/linked-script-chat.png`. Existing unrelated generated screenshots are restored rather than committed as reference updates.

## Runtime boundaries

Association, pending request baselines and unsaved drafts are window-lifetime state. Restart persistence and cross-restart undo history are not claimed. Context is complete up to 128 KiB and is refused explicitly above that limit. At most 32 pending snapshots and 32 applied request records are retained.

The existing main experience window and its five draft documents (four dirty) remain untouched. An isolated branch profile was created from a consistent read-only SQLite backup. Real-model startup uses the existing read-only Electron credential source; no mock model override or credential gate bypass is enabled. The new process currently waits for the user's macOS keychain authorization, which the computer-use tool prohibits operating. No cloud response verification or automatic user-file save/run is claimed for the new branch.

No merge or push is authorized by this feature request; keep work on `codex/editor-linked-script`.
