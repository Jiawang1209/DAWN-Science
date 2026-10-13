/** Synchronous SQLite storage. No runtime or renderer state belongs here. */
import type Database from "better-sqlite3"
import { randomUUID } from "node:crypto"
import { realpathSync } from "node:fs"
import { basename, dirname, join, posix, resolve } from "node:path"
import {
  BotCreateSchema, BotUpdateSchema, BotProfileSchema, BotScopeSchema, BotSessionBindingSchema,
  BotDispatchInputSchema, BotDispatchPatchSchema, BotDispatchSchema, BotResultInputSchema, BotResultSchema,
} from "../bot/types.js"
import type {
  BotCreate, BotUpdate, BotProfile, BotScope, BotSessionBinding,
  BotDispatchInput, BotDispatchPatch, BotDispatch, BotResultInput, BotResult,
} from "../bot/types.js"

/** A not-yet-created scratch directory retains its real parent's identity. */
function canonicalLocalPath(path: string): string {
  const absolute = resolve(path)
  try { return realpathSync.native(absolute) } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
    const parent = dirname(absolute)
    if (parent === absolute) throw error
    return join(canonicalLocalPath(parent), basename(absolute))
  }
}

export function scopeKey(input: BotScope): string {
  const scope = BotScopeSchema.parse(input)
  return JSON.stringify([
    "bot-scope-v1", canonicalLocalPath(scope.workspace), scope.projectId ?? null,
    scope.connectionId ?? null, scope.remoteCwd ? posix.normalize(scope.remoteCwd).replace(/\/+$/, "") || "/" : null,
  ])
}

type Row = Record<string, unknown>
function optional(value: unknown, key: string): Record<string, unknown> {
  return value === null || value === undefined ? {} : { [key]: value }
}
function profile(row: Row): BotProfile {
  return BotProfileSchema.parse({
    id: row.id, name: row.name, role: row.role, instructions: row.instructions,
    ...optional(row.model ? JSON.parse(String(row.model)) : undefined, "model"),
    enabled: row.enabled === 1, createdAt: row.created_at, updatedAt: row.updated_at,
    ...optional(row.archived_at, "archivedAt"),
  })
}
function binding(row: Row): BotSessionBinding {
  return BotSessionBindingSchema.parse({
    botId: row.bot_id, scopeKey: row.scope_key, kind: row.kind, sessionId: row.session_id,
    ...optional(row.team_id || undefined, "teamId"), ...optional(row.owner_session_id, "ownerSessionId"),
  })
}
function dispatch(row: Row): BotDispatch {
  return BotDispatchSchema.parse({
    requestId: row.request_id, ownerSessionId: row.owner_session_id, botId: row.bot_id,
    scopeKey: row.scope_key, instruction: row.instruction, status: row.status,
    createdAt: row.created_at, updatedAt: row.updated_at,
    ...optional(row.team_id, "teamId"), ...optional(row.task_id, "taskId"),
    ...optional(row.member_session_id, "memberSessionId"), ...optional(row.error, "error"),
  })
}
function result(row: Row): BotResult {
  return BotResultSchema.parse({
    resultId: row.result_id, ownerSessionId: row.owner_session_id, botId: row.bot_id,
    teamId: row.team_id, taskId: row.task_id, attemptId: row.attempt_id,
    ...optional(row.member_session_id, "memberSessionId"), status: row.status, summary: row.summary,
    artifacts: JSON.parse(String(row.artifacts)), createdAt: row.created_at,
    ...optional(row.request_id, "requestId"), ...optional(row.delivered_at, "deliveredAt"),
  })
}
export type BotBindingKey = Pick<BotSessionBinding, "botId" | "scopeKey" | "kind"> & { teamId?: string }

export class BotStore {
  constructor(private readonly db: Database.Database) {}

  create(input: BotCreate): BotProfile {
    const data = BotCreateSchema.parse(input)
    const now = new Date().toISOString()
    const id = randomUUID()
    this.db.prepare(`INSERT INTO bots (id,name,role,instructions,model,enabled,created_at,updated_at)
      VALUES (@id,@name,@role,@instructions,@model,@enabled,@now,@now)`).run({
      ...data, id, model: data.model ? JSON.stringify(data.model) : null, enabled: data.enabled === false ? 0 : 1, now,
    })
    return this.get(id)!
  }

  get(id: string): BotProfile | undefined {
    const row = this.db.prepare("SELECT * FROM bots WHERE id = ?").get(id) as Row | undefined
    return row ? profile(row) : undefined
  }

  list({ includeArchived = false }: { includeArchived?: boolean } = {}): BotProfile[] {
    return (this.db.prepare(`SELECT * FROM bots ${includeArchived ? "" : "WHERE archived_at IS NULL"} ORDER BY created_at,id`).all() as Row[]).map(profile)
  }

  update(id: string, input: BotUpdate): BotProfile {
    const patch = BotUpdateSchema.parse(input)
    const previous = this.get(id)
    if (!previous) throw new Error(`Bot not found: ${id}`)
    if (previous.archivedAt) throw new Error(`Bot is archived: ${id}`)
    const data = { ...previous, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedAt: new Date().toISOString() }
    this.db.prepare(`UPDATE bots SET name=@name,role=@role,instructions=@instructions,model=@model,enabled=@enabled,updated_at=@updatedAt WHERE id=@id`).run({
      id, name: data.name, role: data.role, instructions: data.instructions,
      model: data.model ? JSON.stringify(data.model) : null, enabled: data.enabled ? 1 : 0, updatedAt: data.updatedAt,
    })
    return this.get(id)!
  }

  archive(id: string): BotProfile {
    const previous = this.get(id)
    if (!previous) throw new Error(`Bot not found: ${id}`)
    if (!previous.archivedAt) {
      const now = new Date().toISOString()
      this.db.prepare("UPDATE bots SET archived_at=?,updated_at=?,enabled=0 WHERE id=?").run(now, now, id)
    }
    return this.get(id)!
  }

  setBinding(input: BotSessionBinding): void {
    const data = BotSessionBindingSchema.parse(input)
    this.db.transaction(() => {
      const old = this.bindingOfSession(data.sessionId)
      if (old && JSON.stringify(old) !== JSON.stringify(data)) throw new Error(`Session already belongs to another Bot binding: ${data.sessionId}`)
      this.db.prepare("UPDATE bot_session_bindings SET current=0 WHERE bot_id=? AND scope_key=? AND kind=? AND team_id=?").run(data.botId, data.scopeKey, data.kind, data.teamId ?? "")
      this.db.prepare(`INSERT INTO bot_session_bindings (session_id,bot_id,scope_key,kind,team_id,owner_session_id,current,created_at)
        VALUES (?,?,?,?,?,?,1,?) ON CONFLICT(session_id) DO UPDATE SET current=1`).run(data.sessionId, data.botId, data.scopeKey, data.kind, data.teamId ?? "", data.ownerSessionId ?? null, new Date().toISOString())
    })()
  }

  getBinding(key: BotBindingKey): BotSessionBinding | undefined {
    const row = this.db.prepare("SELECT * FROM bot_session_bindings WHERE bot_id=? AND scope_key=? AND kind=? AND team_id=? AND current=1").get(key.botId, key.scopeKey, key.kind, key.teamId ?? "") as Row | undefined
    return row ? binding(row) : undefined
  }

  listBindings(filter: Partial<BotSessionBinding> = {}): BotSessionBinding[] {
    const columns = { botId: "bot_id", scopeKey: "scope_key", kind: "kind", teamId: "team_id", ownerSessionId: "owner_session_id", sessionId: "session_id" } as const
    const entries = Object.entries(filter).filter(([, v]) => v !== undefined) as [keyof typeof columns, string][]
    for (const [key] of entries) if (!(key in columns)) throw new Error(`Unknown Bot binding filter: ${key}`)
    const where = entries.length ? `WHERE ${entries.map(([key]) => `${columns[key]}=?`).join(" AND ")}` : ""
    return (this.db.prepare(`SELECT * FROM bot_session_bindings ${where} ORDER BY created_at DESC,rowid DESC`).all(...entries.map(([, value]) => value)) as Row[]).map(binding)
  }

  bindingOfSession(sessionId: string): BotSessionBinding | undefined {
    const row = this.db.prepare("SELECT * FROM bot_session_bindings WHERE session_id=?").get(sessionId) as Row | undefined
    return row ? binding(row) : undefined
  }

  reserveDispatch(input: BotDispatchInput): { created: boolean; record: BotDispatch } {
    const data = BotDispatchInputSchema.parse(input)
    return this.db.transaction(() => {
      const existing = this.getDispatch(data.requestId)
      if (existing) {
        const sameRequest = (["ownerSessionId", "botId", "scopeKey", "instruction"] as const)
          .every((key) => existing[key] === data[key])
        // Omitted allocation fields may have been assigned since reservation;
        // explicitly supplied targets must still describe this same dispatch.
        const sameTargets = (["teamId", "taskId", "memberSessionId"] as const)
          .every((key) => data[key] === undefined || existing[key] === data[key])
        if (!sameRequest || !sameTargets) throw new Error(`Dispatch requestId conflict: ${data.requestId}`)
        return { created: false, record: existing }
      }
      const now = new Date().toISOString()
      this.db.prepare(`INSERT INTO bot_dispatches (request_id,owner_session_id,bot_id,scope_key,instruction,status,team_id,task_id,member_session_id,created_at,updated_at)
        VALUES (?,?,?,?,?,'pending',?,?,?,?,?)`).run(data.requestId, data.ownerSessionId, data.botId, data.scopeKey, data.instruction, data.teamId ?? null, data.taskId ?? null, data.memberSessionId ?? null, now, now)
      return { created: true, record: this.getDispatch(data.requestId)! }
    }).immediate()
  }

  getDispatch(requestId: string): BotDispatch | undefined {
    const row = this.db.prepare("SELECT * FROM bot_dispatches WHERE request_id=?").get(requestId) as Row | undefined
    return row ? dispatch(row) : undefined
  }

  listDispatches(ownerSessionId: string): BotDispatch[] {
    return (this.db.prepare("SELECT * FROM bot_dispatches WHERE owner_session_id=? ORDER BY created_at,rowid").all(ownerSessionId) as Row[]).map(dispatch)
  }

  dispatchForTask(teamId: string, taskId: string): BotDispatch | undefined {
    const row = this.db.prepare("SELECT * FROM bot_dispatches WHERE team_id=? AND task_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1").get(teamId, taskId) as Row | undefined
    return row ? dispatch(row) : undefined
  }

  updateDispatch(requestId: string, input: BotDispatchPatch): BotDispatch {
    const patch = BotDispatchPatchSchema.parse(input)
    const previous = this.getDispatch(requestId)
    if (!previous) throw new Error(`Dispatch not found: ${requestId}`)
    const data = { ...previous, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) }
    this.db.prepare("UPDATE bot_dispatches SET status=?,team_id=?,task_id=?,member_session_id=?,error=?,updated_at=? WHERE request_id=?").run(data.status, data.teamId ?? null, data.taskId ?? null, data.memberSessionId ?? null, data.error ?? null, new Date().toISOString(), requestId)
    return this.getDispatch(requestId)!
  }

  enqueueResult(input: BotResultInput | BotResult): boolean {
    // Verbatim restored retries never overwrite payload or acknowledgements.
    const parsed = BotResultSchema.safeParse(input)
    const data = parsed.success ? BotResultInputSchema.parse(Object.fromEntries(Object.entries(parsed.data).filter(([k]) => k !== "createdAt" && k !== "deliveredAt"))) : BotResultInputSchema.parse(input)
    return this.db.transaction(() => {
      const old = this.getResult(data.resultId)
      if (old) {
        const oldInput = Object.fromEntries(Object.entries(old).filter(([k]) => k !== "createdAt" && k !== "deliveredAt"))
        if (JSON.stringify(BotResultInputSchema.parse(oldInput)) !== JSON.stringify(data)) throw new Error(`Result id conflict: ${data.resultId}`)
        return false
      }
      this.db.prepare(`INSERT INTO bot_results (result_id,request_id,owner_session_id,bot_id,team_id,task_id,attempt_id,member_session_id,status,summary,artifacts,created_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(data.resultId, data.requestId ?? null, data.ownerSessionId, data.botId, data.teamId, data.taskId, data.attemptId, data.memberSessionId ?? null, data.status, data.summary, JSON.stringify(data.artifacts), new Date().toISOString())
      return true
    }).immediate()
  }

  pendingResults(ownerSessionId: string): BotResult[] {
    return (this.db.prepare("SELECT * FROM bot_results WHERE owner_session_id=? AND delivered_at IS NULL ORDER BY created_at,rowid").all(ownerSessionId) as Row[]).map(result)
  }

  getResult(resultId: string): BotResult | undefined {
    const row = this.db.prepare("SELECT * FROM bot_results WHERE result_id=?").get(resultId) as Row | undefined
    return row ? result(row) : undefined
  }

  markResultDelivered(resultId: string): void {
    if (!this.getResult(resultId)) throw new Error(`Bot result not found: ${resultId}`)
    this.db.prepare("UPDATE bot_results SET delivered_at=COALESCE(delivered_at,?) WHERE result_id=?").run(new Date().toISOString(), resultId)
  }
}
