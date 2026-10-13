import type { SessionRecord } from "../store/sessions.js"
import { BotStore, scopeKey } from "../store/bots.js"
import type { SessionSummary } from "../protocol/index.js"
import type { BotProfile } from "./types.js"
/** Only an explicit pre-allocation rejection permits a new request identity. */
export class BotDispatchRejected extends Error {
  constructor(error: unknown) {super(error instanceof Error ? error.message : String(error));this.name = "BotDispatchRejected"}
}

export interface BotServiceOptions {
  store: BotStore
  owner(id: string): SessionRecord | undefined
  create(bot: BotProfile, owner: SessionRecord): Promise<SessionSummary>
  open(id: string): Promise<SessionSummary | undefined>
  dispatch(owner: string, botId: string, instruction: string): Promise<{teamId: string; taskId: string; memberSessionId?: string}>
  validate?(bot: BotProfile, owner?: SessionRecord): void
  active?(botId: string): boolean
  busy?(sessionId: string): boolean
}
/** Coordinates effects only after a durable reservation. No model or renderer imports. */
export class BotService {
  private openings = new Map<string, Promise<SessionSummary>>()
  private requests = new Map<string, Promise<{teamId: string; taskId: string; memberSessionId?: string}>>()
  private owners = new Map<string, Promise<unknown>>()
  constructor(private readonly opts: BotServiceOptions) {}
  profile(id: string): BotProfile {
    const bot = this.opts.store.get(id)
    if (!bot || bot.archivedAt || !bot.enabled) throw new Error("Bot 不存在、已归档或已停用")
    return bot
  }
  scope(ownerId: string) {
    const owner = this.opts.owner(ownerId)
    if (!owner) throw new Error("主会话不存在")
    if (this.opts.store.bindingOfSession(ownerId)) throw new Error("Bot 会话不能创建嵌套团队")
    return {owner, key: scopeKey({workspace: owner.workspace, ...(owner.projectId ? {projectId: owner.projectId} : {}), ...(owner.connectionId ? {connectionId: owner.connectionId, remoteCwd: owner.remoteCwd} : {})})}
  }
  async open(botId: string, ownerId: string, newConversation = false): Promise<SessionSummary> {
    const bot = this.profile(botId), {owner, key} = this.scope(ownerId)
    this.opts.validate?.(bot, owner)
    const lock = `${botId}:${key}`
    const previous = this.openings.get(lock)
    if (previous) { if (!newConversation) return previous; await previous.catch(() => {}) }
    const work = (async () => {
      const binding = this.opts.store.getBinding({botId, scopeKey: key, kind: "direct"})
      if (binding && !newConversation) {
        const existing = await this.opts.open(binding.sessionId)
        if (existing) return existing
      }
      const session = await this.opts.create(bot, owner)
      this.opts.store.setBinding({botId, scopeKey: key, kind: "direct", sessionId: session.sessionId})
      return session
    })()
    this.openings.set(lock, work)
    try {return await work} finally {if (this.openings.get(lock) === work) this.openings.delete(lock)}
  }
  async history(botId: string, ownerId: string) {
    if (!this.opts.store.get(botId)) throw new Error("Bot 不存在")
    const {key} = this.scope(ownerId)
    return this.opts.store.listBindings({botId, scopeKey: key, kind: "direct"})
  }
  archive(botId: string) {
    if (this.opts.active?.(botId) || this.opts.store.listBindings({botId}).some(b => this.opts.busy?.(b.sessionId))) throw new Error("Bot 正在执行任务，请先停止当前任务")
    return this.opts.store.archive(botId)
  }
  async dispatch(input: {requestId: string; ownerSessionId: string; botId: string; instruction: string}) {
    const existing = this.opts.store.getDispatch(input.requestId)
    if (existing) {
      if (existing.ownerSessionId !== input.ownerSessionId || existing.botId !== input.botId || existing.instruction !== input.instruction.trim()) throw new Error("这条请求已经用于另一项任务")
      if (existing.teamId && existing.taskId) return {teamId: existing.teamId, taskId: existing.taskId, ...(existing.memberSessionId ? {memberSessionId: existing.memberSessionId} : {})}
      const pending = this.requests.get(input.requestId)
      if (pending) return pending
      // An existing reservation may already have caused runtime effects, even without a receipt.
      // Current profile/owner availability cannot turn that uncertainty into a safe rejection.
      throw new Error(existing.error || "这条派单已中断；请检查任务状态后使用新的请求重试")
    }
    let bot: BotProfile, scope: ReturnType<BotService["scope"]>
    try {bot = this.profile(input.botId);scope = this.scope(input.ownerSessionId);this.opts.validate?.(bot, scope.owner)}
    catch (error) {throw new BotDispatchRejected(error)}
    const {owner, key} = scope
    const reserved = this.opts.store.reserveDispatch({...input, scopeKey: key})
    const pending = this.requests.get(input.requestId)
    if (pending) return pending
    if (!reserved.created) {
      const row = reserved.record
      if (row.teamId && row.taskId) return {teamId: row.teamId, taskId: row.taskId, ...(row.memberSessionId ? {memberSessionId: row.memberSessionId} : {})}
      throw new Error(row.error || "这条派单已中断；请检查任务状态后使用新的请求重试")
    }
    const work = (async () => {
      const previous = this.owners.get(owner.id)
      await previous?.catch(() => {})
      try {
        const result = await this.opts.dispatch(owner.id, bot.id, input.instruction.trim())
        this.opts.store.updateDispatch(input.requestId, {...result, status: this.opts.store.getDispatch(input.requestId)?.status === "pending" ? "dispatched" : this.opts.store.getDispatch(input.requestId)!.status})
        return result
      } catch (error) {
        this.opts.store.updateDispatch(input.requestId, {status: "failed", error: error instanceof Error ? error.message : String(error)})
        throw error
      }
    })()
    this.owners.set(owner.id, work)
    this.requests.set(input.requestId, work)
    try {return await work} finally {
      this.requests.delete(input.requestId)
      if (this.owners.get(owner.id) === work) this.owners.delete(owner.id)
    }
  }
}
