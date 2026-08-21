> 读自 npm `@tencent-weixin/openclaw-weixin@2.4.6`（MIT, Tencent）源码，2026-08-21。设计文档在 `superpowers/specs/2026-08-21-远程助理-design.md`。文中 file:line 指向那个包。

---

# WeChat "ClawBot" (iLink) Protocol Report

All paths relative to `/private/tmp/claude-501/-Users-liuyue-Desktop-Github-repos-dawn-science/8ee623d1-7190-4d84-8cb0-85e2108df59e/scratchpad/wx/tencent-weixin-openclaw-weixin-2.4.6/package/` unless noted.

---

## 1. Endpoints & transport

### Base URLs

| Purpose | URL | Source |
|---|---|---|
| API (default + QR login, hardcoded) | `https://ilinkai.weixin.qq.com` | `src/auth/accounts.ts:11` (`DEFAULT_BASE_URL`), `src/auth/login-qr.ts:31` (`FIXED_BASE_URL`) |
| CDN (media up/download) | `https://novac2c.cdn.weixin.qq.com/c2c` | `src/auth/accounts.ts:12` (`CDN_BASE_URL`) |
| Per-account override | `baseurl` returned at login confirm, persisted; falls back to default | `src/auth/login-qr.ts:431`, `src/auth/accounts.ts:380-384` |
| IDC redirect during login only | `https://${redirect_host}` | `src/auth/login-qr.ts:400-403` |

The base URL is normalized to have a trailing slash and joined with the relative endpoint via `new URL(endpoint, base)` — `src/api/api.ts:217-219,302-303,383-384`.

### HTTP paths (all POST, JSON, except QR status)

| Function | Method | Path | Timeout | Source |
|---|---|---|---|---|
| `getUpdates` | POST | `ilink/bot/getupdates` | 35 000 ms default | `src/api/api.ts:446` |
| `getUploadUrl` | POST | `ilink/bot/getuploadurl` | 15 000 ms | `src/api/api.ts:479` |
| `sendMessage` | POST | `ilink/bot/sendmessage` | 15 000 ms | `src/api/api.ts:508` |
| `getConfig` | POST | `ilink/bot/getconfig` | 10 000 ms | `src/api/api.ts:531` |
| `sendTyping` | POST | `ilink/bot/sendtyping` | 10 000 ms | `src/api/api.ts:548` |
| `notifyStop` | POST | `ilink/bot/msg/notifystop` | 10 000 ms | `src/api/api.ts:564` |
| `notifyStart` | POST | `ilink/bot/msg/notifystart` | 10 000 ms | `src/api/api.ts:579` |
| `fetchQRCode` | POST | `ilink/bot/get_bot_qrcode?bot_type=<type>` | none | `src/auth/login-qr.ts:85` |
| `pollQRStatus` | **GET** | `ilink/bot/get_qrcode_status?qrcode=<qr>[&verify_code=<code>]` | 35 000 ms | `src/auth/login-qr.ts:115-117` |
| CDN upload | POST | `{cdnBaseUrl}/upload?encrypted_query_param=<upload_param>&filekey=<filekey>` | none | `src/cdn/cdn-url.ts:14-20` |
| CDN download | GET | `{cdnBaseUrl}/download?encrypted_query_param=<param>` | none | `src/cdn/cdn-url.ts:9-11` |

Timeout constants: `DEFAULT_LONG_POLL_TIMEOUT_MS = 35_000`, `DEFAULT_API_TIMEOUT_MS = 15_000`, `DEFAULT_CONFIG_TIMEOUT_MS = 10_000` — `src/api/api.ts:211-215`.

### Headers

POST requests (`buildHeaders`, `src/api/api.ts:240-254`):

```
Content-Type: application/json
AuthorizationType: ilink_bot_token          // fixed literal
X-WECHAT-UIN: <base64(decimal string of random uint32)>
iLink-App-Id: <package.json "ilink_appid">   // literally "bot" (package.json:66)
iLink-App-ClientVersion: <uint32 as decimal string>
Authorization: Bearer <token>                // only when token present
SKRouteTag: <routeTag>                       // optional, from config
```

- `X-WECHAT-UIN` derivation: `crypto.randomBytes(4).readUInt32BE(0)` → `String(uint32)` → base64 of that ASCII string — `src/api/api.ts:221-225`. Regenerated per request.
- `iLink-App-ClientVersion` encoding: `((major & 0xff) << 16) | ((minor & 0xff) << 8) | (patch & 0xff)`; e.g. `"1.0.11"` → `65547` — `src/api/api.ts:99-107`.
- GET requests carry **only** the common headers (`iLink-App-Id`, `iLink-App-ClientVersion`, optional `SKRouteTag`) — **no Authorization** — `src/api/api.ts:228-238,304`. This is why QR status polling is unauthenticated.
- Do **not** set `Content-Length` manually; Node 24's undici rejects it (`UND_ERR_INVALID_ARG`) — CHANGELOG 2.4.2.

### `base_info` — attached to every POST body

```json
{ "channel_version": "<plugin version>", "bot_agent": "OpenClaw" }
```

`src/api/api.ts:203-208`, type at `src/api/types.ts:7-22`. `bot_agent` is UA-style `Name/Version [(comment)]`, ASCII only, ≤ 256 bytes, sanitized by `sanitizeBotAgent` (`src/api/api.ts:132-200`). Explicitly documented as **observability only — not used for authentication or routing** (`src/api/types.ts:17-19`, README.zh_CN.md:106-108).

### Inbound delivery: HTTP long-polling (not websocket, not push)

`getUpdates` request body — `src/api/api.ts:447-450`:

```json
{ "get_updates_buf": "", "base_info": { ... } }
```

Response — `GetUpdatesResp`, `src/api/types.ts:207-219`:

```json
{
  "ret": 0,
  "errcode": 0,
  "errmsg": "",
  "msgs": [ /* WeixinMessage[] */ ],
  "get_updates_buf": "<new cursor>",
  "longpolling_timeout_ms": 35000,
  "sync_buf": "<deprecated>"
}
```

**Cursor semantics** (`get_updates_buf`; `sync_buf` is deprecated compat only, `src/api/types.ts:200-204,213-214`):
- Send `""` on the very first request or after a reset.
- Persist the returned value and echo it next request — but **only when non-empty**: `if (resp.get_updates_buf != null && resp.get_updates_buf !== "")` — `src/monitor/monitor.ts:152-156`. An empty returned buf leaves the previous cursor in place.
- Persisted to disk at `<stateDir>/openclaw-weixin/accounts/{accountId}.sync.json` as `{"get_updates_buf": "..."}` — `src/storage/sync-buf.ts:16-18,77-81`.
- Restored on startup so restarts resume from the last cursor — `src/monitor/monitor.ts:70-82`.

**Poll loop** (`src/monitor/monitor.ts:89-208`):
- Timeout starts at 35 000 ms; server may override via `longpolling_timeout_ms` on each response, which becomes `nextTimeoutMs` for the following poll — `src/monitor/monitor.ts:107-110`.
- Client-side timeout (`AbortError`) is **normal**: `getUpdates` swallows it and returns `{ ret: 0, msgs: [], get_updates_buf: <unchanged> }` so the loop simply re-polls — `src/api/api.ts:458-470`.
- An external `AbortSignal` can cancel an in-flight poll immediately (combined with the internal timeout controller via `combineAbortSignals`, `src/api/api.ts:342-363`).
- **Backoff**: `MAX_CONSECUTIVE_FAILURES = 3`, `BACKOFF_DELAY_MS = 30_000`, `RETRY_DELAY_MS = 2_000` — `src/monitor/monitor.ts:13-16`. After each failure sleep 2 s; on the 3rd consecutive failure sleep 30 s and reset the counter (`src/monitor/monitor.ts:129-149`, and identically for thrown fetch errors at `:189-206`).
- Error detection: `resp.ret !== 0 || resp.errcode !== 0` — `src/monitor/monitor.ts:111-113`. Note `ret` is checked only when `!== undefined`, so an absent `ret` is treated as success.
- No polling gap on success — the loop immediately re-issues `getUpdates`.

`notifyStart` / `notifyStop` bracket the session (`src/channel.ts:432-441`, `:478-484`); both send only `base_info` and their failures are logged and ignored.

---

## 2. QR login / pairing flow

Step by step (`src/auth/login-qr.ts`, driven by `src/channel.ts:322-398`):

**1. Request QR** — POST `https://ilinkai.weixin.qq.com/ilink/bot/get_bot_qrcode?bot_type=3` (`src/auth/login-qr.ts:85`, `DEFAULT_ILINK_BOT_TYPE = "3"` at `:28`). Note the base URL here is the **hardcoded** `FIXED_BASE_URL`, not the account's `baseUrl` (`:201,246`).

Body:
```json
{ "local_token_list": ["<up to 10 existing bot tokens, newest first>"] }
```
Built by `getLocalBotTokenList()` — walks the account index backwards, max 10 — `src/auth/login-qr.ts:64-77`. This is how the server recognizes "already bound to this OpenClaw" and returns `binded_redirect`.

Response (`QRCodeResponse`, `src/auth/login-qr.ts:35-38`):
```json
{ "qrcode": "<opaque handle used for polling>", "qrcode_img_content": "<URL the user scans/opens>" }
```
`qrcode_img_content` is a **URL string** rendered locally into a terminal QR by `qrcode-terminal`, and also printed as a clickable fallback link — `src/auth/login-qr.ts:142-152`. The user scans it in the mobile WeChat app.

**2. Poll for confirmation** — long-poll GET `ilink/bot/get_qrcode_status?qrcode=<qrcode>` every ~1 s (`await new Promise(r => setTimeout(r, 1000))`, `src/auth/login-qr.ts:447`), each request with a 35 000 ms client timeout (`QR_LONG_POLL_TIMEOUT_MS`, `:25,122`). Timeouts and gateway errors (e.g. Cloudflare 524) are coerced to `{ status: "wait" }` and retried — `src/auth/login-qr.ts:127-135`.

Overall wait deadline: 480 000 ms (8 min) — `src/channel.ts:349`, default at `src/auth/login-qr.ts:287`. Local QR TTL: `ACTIVE_LOGIN_TTL_MS = 5 * 60_000` (`:23`).

**3. Status machine** (`StatusResponse`, `src/auth/login-qr.ts:40-49`; switch at `:304-436`):

| `status` | Meaning / action |
|---|---|
| `wait` | keep polling |
| `scaned` | scanned, awaiting confirm; clears a pending verify code (means it was accepted) — `:310-320` |
| `need_verifycode` | server demands the pairing digits shown on the phone; read from stdin, stash as `pendingVerifyCode`, re-poll immediately with `&verify_code=<code>` — `:321-330,115-117` |
| `verify_code_blocked` | too many wrong codes; clears code, refreshes QR — `:357-388` |
| `expired` | refresh QR, up to `MAX_QR_REFRESH_COUNT = 3` (`:231`), then give up — `:331-356` |
| `scaned_but_redirect` | IDC redirect: switch polling host to `https://${redirect_host}` and continue — `:399-409` |
| `binded_redirect` | already bound to this client; **no new credentials issued**, existing ones stay valid; surfaced as `alreadyConnected: true` and treated as success — `:389-398` |
| `confirmed` | success — see below |

**4. Credentials returned on `confirmed`** (`src/auth/login-qr.ts:410-435`):

```json
{
  "status": "confirmed",
  "bot_token": "<bearer token>",
  "ilink_bot_id": "<e.g. b0f5860fdecb@im.bot>",
  "baseurl": "<per-account API base URL>",
  "ilink_user_id": "<the scanning WeChat user, e.g. xxx@im.wechat>"
}
```

`ilink_bot_id` is **mandatory** — login fails if absent (`:411-418`). There is **no expiry field and no refresh token** anywhere in the codebase; the token is used until the server reports `errcode -14` (stale token).

**5. Storage on disk.** State dir = `$OPENCLAW_STATE_DIR` || `$CLAWDBOT_STATE_DIR` || `~/.openclaw` — `src/storage/state-dir.ts:5-11`. All weixin files live under `<stateDir>/openclaw-weixin/` (`src/auth/accounts.ts:39-41`).

The raw `ilink_bot_id` is normalized to a filesystem-safe key before use (`b0f5860fdecb@im.bot` → `b0f5860fdecb-im-bot`) via `normalizeAccountId` — `src/channel.ts:362-364`; reverse mapping for legacy compat at `src/auth/accounts.ts:25-33`.

| File | Shape | Source |
|---|---|---|
| `<stateDir>/openclaw-weixin/accounts.json` | `["<accountId>", ...]` — the account index | `src/auth/accounts.ts:43-45,62-71` |
| `<stateDir>/openclaw-weixin/accounts/{accountId}.json` | `{ "token": "...", "savedAt": "<ISO>", "baseUrl": "...", "userId": "..." }`, chmod `0o600` | `src/auth/accounts.ts:113-119,198-210` |
| `<stateDir>/openclaw-weixin/accounts/{accountId}.sync.json` | `{ "get_updates_buf": "..." }` | `src/storage/sync-buf.ts:16-18,77-81` |
| `<stateDir>/openclaw-weixin/accounts/{accountId}.context-tokens.json` | `{ "<userId>": "<contextToken>", ... }` | `src/messaging/inbound.ts:29-55` |
| `<stateDir>/credentials/openclaw-weixin-{accountId}-allowFrom.json` | `{ "version": 1, "allowFrom": ["<userId>"] }` | `src/auth/pairing.ts:35-39,41-44,93` |
| `<stateDir>/openclaw-weixin/debug-mode.json` | `{ "accounts": { "<accountId>": true } }` | `src/messaging/debug-mode.ts:4-5` |

Legacy fallbacks read (never written): `<stateDir>/credentials/openclaw-weixin/credentials.json` (`{token}`) — `src/auth/accounts.ts:132-142`; `<stateDir>/agents/default/sessions/.openclaw-weixin-sync/default.json` — `src/storage/sync-buf.ts:21-30`.

**6. Post-login cleanup.** `clearStaleAccountsForUserId` deletes any other account sharing the same `userId` (files + index entry + context tokens) so `contextToken` lookups stay unambiguous — `src/auth/accounts.ts:89-106`, called at `src/channel.ts:372,528`.

---

## 3. Message model

### Envelope — `WeixinMessage` (`src/api/types.ts:180-196`)

```
seq, message_id, from_user_id, to_user_id, client_id,
create_time_ms, update_time_ms, delete_time_ms,
session_id, group_id, message_type, message_state,
item_list[], context_token, run_id
```

Enums:
- `MessageType`: `NONE=0, USER=1, BOT=2` — `src/api/types.ts:64-68`
- `MessageState`: `NEW=0, GENERATING=1, FINISH=2` — `:81-85`
- `MessageItemType`: `NONE=0, TEXT=1, IMAGE=2, VOICE=3, FILE=4, VIDEO=5, TOOL_CALL_START=11, TOOL_CALL_RESULT=12` — `:70-79`

`MessageItem` (`:163-177`): `type, create_time_ms, update_time_ms, is_completed, msg_id, ref_msg, text_item, image_item, voice_item, file_item, video_item, tool_call_start_item, tool_call_result_item`.

### Inbound types

- **text** — `text_item.text` (`:87-89`)
- **image** — `image_item` (`:101-114`): `media`, `thumb_media`, `aeskey` (raw AES-128 **hex** string, preferred over `media.aes_key` for inbound decryption), `url`, `mid_size`, `thumb_size`, `thumb_height`, `thumb_width`, `hd_size`
- **voice** — `voice_item` (`:116-127`): `media`, `encode_type` (1=pcm 2=adpcm 3=feature 4=speex 5=amr **6=silk** 7=mp3 8=ogg-speex), `bits_per_sample`, `sample_rate`, `playtime` (ms), `text` (server-side speech-to-text). **If `voice_item.text` is present it is used directly as the message body and no audio is downloaded** — `src/messaging/inbound.ts:191-194`, `src/messaging/process-message.ts:130-134`.
- **file** — `file_item` (`:129-134`): `media`, `file_name`, `md5`, `len` (string)
- **video** — `video_item` (`:136-145`): `media`, `video_size`, `play_length`, `video_md5`, `thumb_media`, `thumb_size`, `thumb_height`, `thumb_width`
- **quote/reply** — `ref_msg: { message_item, title }` (`:147-150`). Text quoting renders as `` `[引用: ${title} | ${refBody}]\n${text}` `` — `src/messaging/inbound.ts:176-190`. Quoted **media** is instead resolved and downloaded as if it were the message's own attachment — `src/messaging/process-message.ts:135-145`.

Media selection priority when several are present: **IMAGE > VIDEO > FILE > VOICE**, main `item_list` first then `ref_msg` fallback — `src/messaging/process-message.ts:115-145`, mirrored in `src/messaging/inbound.ts:242-254`.

### Outbound

`SendMessageReq` wraps exactly one message: `{ "msg": WeixinMessage }` — `src/api/types.ts:222-224`. Response `{ ret, errmsg }`; non-zero `ret` throws — `src/api/api.ts:514-519`.

Canonical outbound message (`src/messaging/send.ts:34-45,113-124`):

```json
{
  "msg": {
    "from_user_id": "",
    "to_user_id": "<recipient id, e.g. xxx@im.wechat>",
    "client_id": "openclaw-weixin:<epoch ms>-<8 hex>",
    "message_type": 2,
    "message_state": 2,
    "item_list": [ { "type": 1, "text_item": { "text": "..." } } ],
    "context_token": "<echoed from inbound>",
    "run_id": "<uuid>"
  },
  "base_info": { ... }
}
```

- `from_user_id` is always `""` on outbound.
- `client_id` format `{prefix}:{timestamp}-{8 hex}` — `src/util/random.ts:7-9`; it is returned as the local `messageId` (`src/messaging/send.ts:97`). The server does not return an ID.
- **`item_list` always carries exactly one item.** Text caption + media are sent as two *separate* requests, each with its own `client_id` — `src/messaging/send.ts:145-193` (text first, then media).
- Empty text yields `item_list: undefined` — `src/messaging/send.ts:31-41`.

**Capabilities** (`src/channel.ts:179-195`): `chatTypes: ["direct"]` (no groups), `media: true`, `blockStreaming: true`, coalescing defaults `minChars: 200 / idleMs: 3000`. Outbound `deliveryMode: "direct"`, **`textChunkLimit: 4000`** — `src/channel.ts:217-219`. This 4000-char chunk limit is the only outbound size limit in the code.

**Markdown**: there is no markdown message type. `StreamingMarkdownFilter` strips unsupported syntax before sending (`src/messaging/markdown-filter.ts:1-27`). Passed through: code fences, inline code, tables, horizontal rules, bold `**`, italic/bold-italic around non-CJK. Stripped (markers removed, content kept): italic/bold-italic around CJK, H5/H6 headings; **images `![alt](url)` are removed entirely**. Applied at `src/messaging/process-message.ts:331-334` and `src/channel.ts:126-128`.

**Typing indicator**: `sendTyping` with `{ ilink_user_id, typing_ticket, status }`, `TypingStatus.TYPING = 1 / CANCEL = 2` — `src/api/types.ts:231-243`, `src/messaging/process-message.ts:292-320`. The `typing_ticket` comes from `getConfig` and typing is **skipped entirely when no ticket is available** (`hasTypingTicket` guard at `:291`). Keepalive interval 5000 ms (`:319`).

**Reply progress / tool-call messages** (`src/messaging/reply-progress-sender.ts`): items of type `TOOL_CALL_START (11)` with `tool_call_start_item: { tool_name, tool_call_id }` and `is_completed: false` (`:83-95`), and `TOOL_CALL_RESULT (12)` with `tool_call_result_item: { tool_name, tool_call_id, status }` and `is_completed: true` (`:98-110`). `status` is normalized to one of `"completed" | "failed" | "blocked" | "unknown"` — `:27-32`. Sends are serialized through a promise chain; failures are logged, never thrown (`:57-71`). Gated by config `replyProgressMessages` (default `true`) — `src/channel.ts:171-176`, `src/config/config-schema.ts:22`.

**Slash commands** are handled entirely client-side before the AI pipeline; there is no server-side command protocol — `src/messaging/slash-commands.ts:84-97`. Only `/echo <msg>` and `/toggle-debug` exist; unknown `/...` falls through to the AI (`:98-99`).

### Replying to a specific chat — `context_token`

This is the key routing primitive. It is **issued per-message by `getupdates` and must be echoed verbatim in every outbound send** — `src/messaging/inbound.ts:14-18`.

- Cached in memory keyed `` `${accountId}:${userId}` `` and mirrored to disk — `src/messaging/inbound.ts:19-21,98-103`.
- Restored on gateway start (`restoreContextTokens`, `:61-78`, called at `src/channel.ts:410`).
- Stored on each inbound message — `src/messaging/process-message.ts:272-275`.
- Retrieved for outbound via `getContextToken(accountId, to)` — `src/channel.ts:227,268,285`.
- Sending **without** it is allowed but only warns (`src/messaging/send.ts:75-77`), so it presumably degrades rather than fails.
- Also used to disambiguate which bot account owns a recipient when multiple accounts exist — `findAccountIdsByContextToken`, `src/messaging/inbound.ts:123-128`, consumed by `resolveOutboundAccountId` (`src/channel.ts:66-107`): 0 accounts → error; 1 account → use it; multiple matches → throws "ambiguous account".

Recipient IDs: WeChat user IDs end with **`@im.wechat`**; bot IDs end with `@im.bot` — `src/channel.ts:192-194`, `src/auth/accounts.ts:25-33`. The reply target is `from_user_id` of the inbound message (`ctx.To = ctx.From = from_user_id`, `src/messaging/inbound.ts:225-236`).

**No rate limits** are implemented or documented anywhere in the package.

---

## 4. Media

### Upload (outbound) — `src/cdn/upload.ts:63-122`

1. Read file → `plaintext`; `rawsize = plaintext.length`; `rawfilemd5 = md5(plaintext).hex`.
2. `filesize = aesEcbPaddedSize(rawsize)` = `Math.ceil((rawsize + 1) / 16) * 16` — `src/cdn/aes-ecb.ts:19-21`. Note the `+1`: PKCS7 always adds a full padding block on exact multiples.
3. `filekey = crypto.randomBytes(16).toString("hex")` (32 hex chars) — **client-generated**.
4. `aeskey = crypto.randomBytes(16)` — **client-generated**, 16 raw bytes.
5. POST `ilink/bot/getuploadurl` with (`src/api/api.ts:480-493`, req type `src/api/types.ts:32-53`):
   ```json
   { "filekey": "...", "media_type": 1, "to_user_id": "...", "rawsize": 0,
     "rawfilemd5": "...", "filesize": 0, "thumb_rawsize": 0, "thumb_rawfilemd5": "...",
     "thumb_filesize": 0, "no_need_thumb": true, "aeskey": "<hex>", "base_info": {...} }
   ```
   `UploadMediaType`: `IMAGE=1, VIDEO=2, FILE=3, VOICE=4` — `src/api/types.ts:25-30`. The code always sends `no_need_thumb: true` and never sends thumb fields (`src/cdn/upload.ts:92`), even though README claims thumbs are required for IMAGE/VIDEO. `aeskey` is sent as **hex** here.
6. Response: `{ "upload_param": "...", "thumb_upload_param": "...", "upload_full_url": "..." }` — `src/api/types.ts:55-62`. Prefer `upload_full_url`; else build `{cdnBaseUrl}/upload?encrypted_query_param=<upload_param>&filekey=<filekey>`. Error if neither present — `src/cdn/upload.ts:96-103`, `src/cdn/cdn-upload.ts:26-34`.
7. Encrypt with **AES-128-ECB, PKCS7** (`createCipheriv("aes-128-ecb", key, null)`) — `src/cdn/aes-ecb.ts:7-10`.
8. **POST** ciphertext with `Content-Type: application/octet-stream` — `src/cdn/cdn-upload.ts:42-46`. (README.zh_CN.md:312 says "PUT"; the code uses POST — trust the code.)
9. Read the download param from the response header **`x-encrypted-param`**; missing → error — `src/cdn/cdn-upload.ts:61-67`. Retries: `UPLOAD_MAX_RETRIES = 3` on 5xx/network; any 4xx aborts immediately; error text from header `x-error-message` — `src/cdn/cdn-upload.ts:7,47-59,72`.
10. Reference it in the outbound `MessageItem`. Note the encoding switch: **`media.aes_key` is `base64(hex-string)` on outbound** — `Buffer.from(uploaded.aeskey /* hex string */).toString("base64")` — `src/messaging/send.ts:223,254,285`. `encrypt_type: 1` is always set.

Size fields per outbound type:
- image → `image_item.mid_size = fileSizeCiphertext` (`src/messaging/send.ts:226`)
- video → `video_item.video_size = fileSizeCiphertext` (`:257`)
- file → `file_item.len = String(fileSize)` — **plaintext** size, as a string (`:289`)

Routing by MIME (`src/messaging/send-media.ts:28-71`): `video/*` → VIDEO; `image/*` → IMAGE; everything else → FILE with `file_name = path.basename(filePath)`.

### Download (inbound) — `src/media/media-download.ts`, `src/cdn/pic-decrypt.ts`

`CDNMedia` (`src/api/types.ts:92-99`): `encrypt_query_param`, `aes_key`, `encrypt_type` (0 = only fileid encrypted, 1 = packed thumb/mid info), `full_url`.

URL: use `media.full_url` when present; else fall back to `{cdnBaseUrl}/download?encrypted_query_param=<param>` (`ENABLE_CDN_URL_FALLBACK = true`, `src/cdn/cdn-url.ts:6`, used at `src/cdn/pic-decrypt.ts:66-73`).

**Key sourcing — this is the subtle part:**

- **Images**: prefer `image_item.aeskey` (raw hex), converted via `Buffer.from(img.aeskey, "hex").toString("base64")`; fall back to `image_item.media.aes_key` — `src/media/media-download.ts:43-45`. If **no key at all**, the image is downloaded **plaintext** via `downloadPlainCdnBuffer` — `:58-63`.
- **voice / file / video**: use `media.aes_key` only, and the item is **skipped** if the key is missing — `src/media/media-download.ts:73-74,102-103,129-130`.

`parseAesKey` handles two wire encodings (`src/cdn/pic-decrypt.ts:30-52`):
- decodes to 16 bytes → use directly (images, `media.aes_key`)
- decodes to 32 ASCII hex chars → hex-decode to 16 bytes (file/voice/video, matching the outbound `base64(hex)` convention)
- anything else → throw.

Decrypt with AES-128-ECB/PKCS7 — `src/cdn/aes-ecb.ts:13-16`.

**Voice**: decrypted SILK → `silkToWav` via dynamic `import("silk-wasm")`, decoded at 24 000 Hz, wrapped in a hand-built mono 16-bit PCM WAV header — `src/media/silk-transcode.ts:4,57-74`, `pcmBytesToWav` at `:10-48`. On failure the raw `.silk` is saved with MIME `audio/silk` — `src/media/media-download.ts:90-95`.

**Inbound size cap**: `WEIXIN_MEDIA_MAX_BYTES = 100 * 1024 * 1024` (100 MB) — `src/media/media-download.ts:12`.

The plugin never passes the CDN URL upstream — only local decrypted paths, because "the upstream CDN URL is encrypted/auth-only" — `src/messaging/inbound.ts:216-218`.

---

## 5. Operational constraints

### Session guard / stale token (`src/api/session-guard.ts`)

- **`STALE_TOKEN_ERRCODE = -14`** — the server's code for a stale/expired bot token (`:6`). Named `SESSION_EXPIRED_ERRCODE` before 2.4.5; the changelog clarifies −14 means **token invalidated, not session timeout**.
- Checked as `resp.errcode === -14 || resp.ret === -14` — `src/monitor/monitor.ts:115-116`.
- On detection: `pauseSession(accountId)` sets a **1-hour cooldown** (`SESSION_PAUSE_DURATION_MS = 60 * 60 * 1000`, `:3`), the failure counter resets, and the monitor sleeps the full remaining pause before continuing — `src/monitor/monitor.ts:118-127`.
- `assertSessionActive(accountId)` throws before any outbound send while paused — `:43-50`, called at `src/channel.ts:118,235`.
- The pause map is **in-memory only** — a process restart clears it.

**Same account logged in elsewhere**: there is no explicit "kicked" error code in this codebase. The mechanism is indirect — a new QR login for the same `ilink_user_id` issues a fresh `bot_token` and the old token starts returning `errcode -14`, at which point the old client pauses for an hour. Locally, `clearStaleAccountsForUserId` (`src/auth/accounts.ts:89-106`) deletes the superseded account's files. If the *same* client re-scans, the server returns `binded_redirect` (via `local_token_list`) and no new credentials are issued — the existing session keeps working (`src/auth/login-qr.ts:389-398`).

### Error codes to expect

| Code | Meaning | Source |
|---|---|---|
| `ret: 0` | success | `src/monitor/monitor.ts:111-113` |
| `ret != 0` or `errcode != 0` | generic API error → retry/backoff | same |
| `errcode: -14` / `ret: -14` | stale token → 1 h pause | `src/api/session-guard.ts:6` |
| HTTP non-2xx | thrown as `` `${label} ${status}: ${body}` `` | `src/api/api.ts:323-325,408-410` |
| CDN 4xx | abort, no retry, message from `x-error-message` | `src/cdn/cdn-upload.ts:47-53` |
| CDN non-200 | retry up to 3× | `:54-60` |
| QR `expired` / `verify_code_blocked` | refresh QR (max 3) | `src/auth/login-qr.ts:331-388` |

Fetch-level errors are classified into `dns | tcp | tls | timeout | unknown` by `classifyFetchError` matching `ENOTFOUND/EAI_AGAIN/getaddrinfo`, `ECONNREFUSED`, `UND_ERR_CONNECT_TIMEOUT/ETIMEDOUT/ENETUNREACH/EHOSTUNREACH`, `UND_ERR_SOCKET/SSL/TLS/CERT/...` — `src/api/api.ts:260-288`.

### Heartbeat / monitor behavior

There is **no separate heartbeat** — the long-poll itself is the liveness signal. `notifyStart` on channel start (`src/channel.ts:432-441`) and `notifyStop` on stop (`:478-484`) bracket the session; both failures are non-fatal. Status is refreshed on each successful poll (`lastEventAt`) and each inbound message (`lastInboundAt`) — `src/monitor/monitor.ts:151,163-164`.

`getConfig` acts as a slow per-user refresh: cached with a **random TTL uniform in [0, 24 h]** (`nextFetchAt = now + Math.random() * CONFIG_CACHE_TTL_MS`), retried with exponential backoff from 2 s doubling up to 1 h on failure; only `ret === 0` is treated as success — `src/api/config-cache.ts:8-10,31-78`. A failed `getConfig` is non-fatal: `typingTicket` is just `""` and typing is skipped.

### Allowlist / pairing

DM policy is hardcoded `"pairing"` with `configuredAllowFrom: []` — `src/messaging/process-message.ts:174-198`. Authorization source order (`readAllowFromStore`, `:184-190`):
1. `<stateDir>/credentials/openclaw-weixin-{accountId}-allowFrom.json` → `allowFrom[]`
2. fallback for legacy installs: the account file's own `userId` (the person who scanned the QR)

Match rule: `list.length === 0 || list.includes(id)` — **an empty list allows everyone** (`:183`). Outcome `"disabled"` or `"unauthorized"` drops the message silently — `:200-205`. Note the monitor deliberately does **not** filter (`src/monitor/monitor.ts:166-167`) — filtering is delegated here. The `allowFrom` file is written under a file lock (retries 3, factor 2, 100–2000 ms, stale 10 s) — `src/auth/pairing.ts:66-69,97-119`.

Filename sanitization: lowercased, `[\\/:*?"<>|]` and `..` replaced with `_` — `src/auth/pairing.ts:22-28`.

### Logging hygiene

`redactBody` masks `context_token|bot_token|token|authorization|Authorization` values and truncates to 200 chars; `redactUrl` strips query strings; `redactToken` shows 6 chars + length — `src/util/redact.ts:1-54`. Worth mirroring: `Authorization` is logged as `"Bearer ***"` in `buildHeaders` (`src/api/api.ts:250-252`).

---

## 6. Dependencies

Runtime `dependencies` (`package.json:30-33`): **`qrcode-terminal@0.12.0`**, **`zod@^4.3.6`**.
`peerDependencies`: `openclaw >=2026.5.12` (`:34-36`).
`devDependencies` include **`silk-wasm@^3.7.1`** (`:40`) — dynamically imported at runtime and failure-tolerant.
`engines.node: ">=22"` (`:27-29`).

For a standalone integration:

| Dependency | Needed for protocol? | Notes |
|---|---|---|
| `node:crypto` | **Yes, essential** | AES-128-ECB (`createCipheriv`/`createDecipheriv`), MD5, `randomBytes` for `aeskey`/`filekey`/`X-WECHAT-UIN`, `randomUUID` for `run_id` |
| `fetch` (built-in) | **Yes** | No HTTP library needed |
| `silk-wasm` | Yes, for inbound voice | Only if you want WAV; optional — raw `.silk` is a valid fallback. Skippable entirely when `voice_item.text` is present |
| `qrcode-terminal` | Only for terminal rendering | `qrcode_img_content` is a plain URL — a desktop app can render it with any QR library or just open the link |
| `zod` | **No** | OpenClaw config-schema plumbing only (`src/config/config-schema.ts`) |
| `openclaw/plugin-sdk/*` | **No** | Pure host plumbing: `normalizeAccountId`, `channel-runtime`, `command-auth`, `config-runtime`, `infra-runtime` (`withFileLock`, tmp dir), `reply-runtime` |

Everything in `src/api/`, `src/cdn/`, `src/storage/`, `src/media/`, `src/util/` is SDK-free except `src/storage/sync-buf.ts`/`state-dir.ts` (plain `node:fs`/`os`) and `src/auth/pairing.ts` (uses `withFileLock`, trivially replaceable). `src/auth/login-qr.ts` imports only `node:crypto` + the api module + `qrcode-terminal`. So the protocol core is essentially standalone.

---

## 7. License & terms of use

- **Plugin**: **MIT**. `package.json:5` (`"license": "MIT"`, `"author": "Tencent"`). LICENSE header: *"Tencent is pleased to support the open source community by making openclaw-weixin available. Copyright (C) 2026 Tencent. All rights reserved. openclaw-weixin is licensed under the MIT."* followed by the standard MIT text.
- **CLI package**: **MIT**, `Copyright (c) 2026 Tencent Inc.` — `tencent-weixin-openclaw-weixin-cli-2.1.4/package/LICENSE:1-3`.

**No terms of use, acceptable-use policy, rate-limit policy, or restriction on third-party clients appears anywhere** in `README.md`, `README.zh_CN.md`, `CHANGELOG.md`, or the LICENSE files. I grepped for `term|restrict|prohibit|licen|third.party|abuse|policy|不得|禁止|条款|授权` across all docs — the only hits are the word "授权" (authorize) describing the QR scan flow (README.zh_CN.md:5,50; README.md:51).

On the contrary, the README **explicitly invites third-party backend implementations**: README.zh_CN.md:110-112 — *"## 后端 API 协议 / 本插件通过 HTTP JSON API 与后端网关通信。二次开发者若需对接自有后端，需实现以下接口。"* ("Secondary developers who wish to connect their own backend need to implement the following interfaces"), followed by a full spec of `getupdates` / `sendmessage` / `getuploadurl` / `getconfig` / `sendtyping`, the header table (README.zh_CN.md:114-121), and the message structures (`:269-316`).

Caveat: this is the license of the *client plugin*. It says nothing about the terms governing use of the `ilinkai.weixin.qq.com` service itself, which are not distributed with the package.

---

## Discrepancies between README and code (trust the code)

1. README.zh_CN.md:125-131 lists paths as bare `getupdates` / `sendmessage` / etc.; the actual paths are prefixed **`ilink/bot/`** — `src/api/api.ts:446,479,508,531,548`. `notifyStart`/`notifyStop` (`ilink/bot/msg/notify*`) are undocumented in the README.
2. README.zh_CN.md:114-121 header table omits `iLink-App-Id` and `iLink-App-ClientVersion`, which are sent on **every** request including GETs — `src/api/api.ts:228-238`.
3. README.zh_CN.md:312 says "PUT 上传到 CDN URL"; the code uses **POST** with `Content-Type: application/octet-stream` — `src/cdn/cdn-upload.ts:42-46`.
4. README.zh_CN.md:216-218 marks `thumb_*` as required for IMAGE/VIDEO; the code always sends `no_need_thumb: true` and omits them — `src/cdn/upload.ts:92`.
5. README.zh_CN.md:222-227 omits **`upload_full_url`**, which the code prefers over client-side URL construction — `src/api/types.ts:60-61`, `src/cdn/upload.ts:96`.
6. README.zh_CN.md:304-305 describes `aes_key` as simply "base64-encoded AES-128 key"; in practice there are **two** encodings (`base64(raw16)` for images, `base64(hex32)` for file/voice/video) — `src/cdn/pic-decrypt.ts:30-52`.
7. `CDNMedia.full_url` and `image_item.aeskey` (hex, preferred inbound key) are undocumented in the README but load-bearing in the code.
8. The QR login endpoints (`get_bot_qrcode`, `get_qrcode_status`) are entirely absent from the README's protocol section.