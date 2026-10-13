/** Bot uses a third independent transcript slot. Backend resolves every scope. */
import { atom } from "nanostores"
import { $sessionModels, setSessionModel } from "./catalog.js"
import { t } from "../i18n/index.js"
import { beginSessionRecovery } from "./session-recovery.js"
import { BotProfileSchema, type BotProfile, type SessionSummary, type SessionSnapshot, type SessionUpdate } from "../../protocol/index.js"
import { WorkbenchClientError, type WorkbenchClient } from "../client.js"
import { 创建转录槽 } from "./transcript-slot.js"

export const Bot槽 = 创建转录槽()
export const $bots = atom<readonly BotProfile[]>([])
export const $botSession = atom<SessionSummary | undefined>(undefined)
export const $selectedBot = atom<string | undefined>(undefined)
export const $botOwnerScope = atom<string | undefined>(undefined)
export const $botOwner = atom<string | undefined>(undefined)
export const $botMemberView = atom<{ownerSessionId: string; teamId: string; botId: string} | undefined>(undefined)
export const $botTask = atom<{ ownerSessionId: string; teamId: string; taskId: string } | undefined>(undefined)
let generation = 0
export function selectBotSession(session: SessionSummary, botId?: string): void {
  generation++
  $botMemberView.set(undefined)
  if ($botSession.get()?.sessionId !== session.sessionId) Bot槽.reset()
  $selectedBot.set(botId)
  $botSession.set(session)
}
export function clearBotSession(): void {
  generation++
  Bot槽.reset()
  $botSession.set(undefined)
  $selectedBot.set(undefined)
  $botTask.set(undefined)
  $botMemberView.set(undefined)
}
export async function loadBots(client: WorkbenchClient): Promise<void> {
  const r = await client.get<{ bots: BotProfile[] }>("listBots", { includeArchived: true })
  $bots.set(BotProfileSchema.array().parse(r.bots))
}
export async function resyncBot(client: WorkbenchClient, sessionId: string): Promise<void> {
  const turn = generation
  const finish = beginSessionRecovery(sessionId)
  let snap: SessionSnapshot
  try { snap = await client.get<SessionSnapshot>("subscribeSession", { sessionId }); finish() }
  catch (e) { finish(e instanceof Error ? e.message : String(e)); throw e }
  if (turn !== generation || $botSession.get()?.sessionId !== sessionId || snap.sessionId !== sessionId) return
  Bot槽.applySnapshot(snap)
  if (snap.state) $botSession.set({ ...$botSession.get()!, state: snap.state })
  client.expectRevision(sessionId, snap.revision)
  const cachedModel = $sessionModels.get()[sessionId]
  const usage = await client.get<import("../panels.js").ContextUsage>("getContextUsage", { sessionId })
  if (turn !== generation || $botSession.get()?.sessionId !== sessionId || !usage.model || $sessionModels.get()[sessionId] !== cachedModel) return
  setSessionModel(sessionId, usage.model, usage.provider ?? $sessionModels.get()[sessionId]?.provider)
}
export function receiveBotUpdate(u: SessionUpdate, resync: (id: string) => void): boolean {
  if (u.sessionId !== $botSession.get()?.sessionId) return false
  if (u.type === "item") Bot槽.upsertItem(u.item)
  if (u.type === "append" && !Bot槽.appendItem(u.id, u.field, u.delta)) resync(u.sessionId)
  if (u.type === "dropItem") Bot槽.dropItem(u.id)
  if (u.type === "snapshot") Bot槽.applySnapshot(u.snapshot)
  if (u.type === "queued") Bot槽.setQueued(u.queued)
  if (u.type === "state") $botSession.set({ ...$botSession.get()!, state: u.state })
  return true
}
export function parseBotCommand(text: string): { botId: string; instruction: string } | undefined {
  const m = /^\/bot:([^\s]+)(?:\s+([\s\S]*))?$/.exec(text)
  return m ? { botId: m[1]!, instruction: (m[2] ?? "").trim() } : undefined
}
type Dispatch = { requestId: string; ownerSessionId: string; botId: string; instruction: string }
type Result = { teamId: string; taskId: string; memberSessionId?: string }
/** Lost responses retry the same request; owner and full command are part of the key. */
export class BotDispatchQueue {
  private entries = new Map<string, { request: Dispatch; pending?: Promise<Result>; result?: Result }>()
  private readonly storageKey = "dawn.session.bot-dispatch-pending"
  constructor(private uuid: () => string = () => crypto.randomUUID()) {
    try {
      const saved: unknown = JSON.parse(localStorage.getItem(this.storageKey) ?? "[]")
      if (!Array.isArray(saved)) return
      for (const item of saved.slice(-100)) {
        if (!Array.isArray(item) || item.length !== 2 || typeof item[0] !== "string" || !item[1] || typeof item[1] !== "object") continue
        const request = item[1] as Record<string, unknown>
        if (!["requestId", "ownerSessionId", "botId", "instruction"].every(k => typeof request[k] === "string" && !!request[k])) continue
        const key: unknown = JSON.parse(item[0])
        if (!Array.isArray(key) || key[0] !== request.ownerSessionId || typeof key[1] !== "string") continue
        const parsed = parseBotCommand(key[1])
        if (!parsed || parsed.botId !== request.botId || parsed.instruction !== request.instruction) continue
        this.entries.set(item[0], { request: request as Dispatch })
      }
    } catch { /* Corrupt or inaccessible browser cache cannot dispatch anything. */ }
  }
  private persist(): void {
    try { localStorage.setItem(this.storageKey, JSON.stringify([...this.entries].map(([key, value]) => [key, value.request]))) }
    catch (e) { console.error("[Bot] 派单重试记录无法保存", e) }
  }
  send(ownerSessionId: string, draft: string, send: (input: Dispatch) => Promise<Result>): Promise<Result> {
    const command = parseBotCommand(draft)
    if (!command || !command.instruction) return Promise.reject(Error(t("请填写 Bot 的任务")))
    const key = JSON.stringify([ownerSessionId, draft])
    let entry = this.entries.get(key)
    if (!entry) { entry = { request: { requestId: this.uuid(), ownerSessionId, ...command } }; this.entries.set(key, entry); this.persist() }
    if (entry.pending) return entry.pending
    if (entry.result) return Promise.resolve(entry.result)
    const current = entry
    current.pending = send(current.request).then(result => { current.result = result; return result }).catch((error: unknown) => {
      if (error instanceof WorkbenchClientError && error.code === "invalid_request" && error.details && typeof error.details === "object" && "dispatchRejected" in error.details && error.details.dispatchRejected === true) {
        this.entries.delete(key)
        this.persist()
      }
      throw error
    }).finally(() => { delete current.pending })
    return current.pending
  }
  /** Once composer acknowledges success, the same text is allowed as a later intentional task. */
  acknowledge(ownerSessionId: string, draft: string): void { this.entries.delete(JSON.stringify([ownerSessionId, draft])); this.persist() }
}

/** Task-member input is a text mailbox; reject images so composer restores them on failure. */
export async function sendBotTaskSupplement(
  task: NonNullable<ReturnType<typeof $botTask.get>>,
  instruction: string,
  imageCount: number,
  send: (input: NonNullable<ReturnType<typeof $botTask.get>> & { instruction: string }) => Promise<unknown>,
): Promise<void> {
  if (imageCount) throw new Error(t("Bot 任务补充暂不支持图片，请引用工作区文件路径"))
  await send({ ...task, instruction })
}

/** Existing local previews take workspace-relative paths; SSH previews take absolute paths. */
export function botArtifactPreviewPath(path: string, workspace: string | undefined, remote: boolean): string {
  if (remote) return path
  const root = workspace?.replace(/\\/g, "/").replace(/\/+$/, "")
  const absolute = path.replace(/\\/g, "/")
  if (root === undefined || !absolute.startsWith(root + "/")) throw new Error(t("这个产物不属于当前会话的工作区"))
  const relative = absolute.slice(root.length + 1)
  if (!relative || relative.split("/").includes("..")) throw new Error(t("这个产物不属于当前会话的工作区"))
  return relative
}
